<script lang="ts">
  let videoEl = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;

  let devices = $state<MediaDeviceInfo[]>([]);
  let selectedDeviceId = $state("");
  let error = $state("");

  let resolution = $state<{ w: number; h: number; fps: number } | null>(null);
  let trackInfo = $state<MediaTrackSettings | null>(null);
  let capabilities = $state<MediaTrackCapabilities | null>(null);

  // Test resolutions to probe what the camera supports
  const testResolutions = [
    { label: "QQVGA 160x120", w: 160, h: 120 },
    { label: "QVGA 320x240", w: 320, h: 240 },
    { label: "VGA 640x480", w: 640, h: 480 },
    { label: "HD 1280x720", w: 1280, h: 720 },
    { label: "FHD 1920x1080", w: 1920, h: 1080 },
    { label: "QHD 2560x1440", w: 2560, h: 1440 },
    { label: "4K 3840x2160", w: 3840, h: 2160 },
  ];

  let probeResults = $state<{ label: string; ok: boolean; actual?: string }[]>([]);
  let probing = $state(false);

  let isStarted = $state(false);

  async function listDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      devices = list.filter((d) => d.kind === "videoinput");
      if (!selectedDeviceId && devices.length > 0) {
        selectedDeviceId = devices[0].deviceId;
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function start(constraints?: MediaStreamConstraints) {
    error = "";
    stop();
    try {
      const c: MediaStreamConstraints = constraints ?? {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };
      stream = await navigator.mediaDevices.getUserMedia(c);
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        trackInfo = settings;
        capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : null;
        resolution = {
          w: settings.width ?? 0,
          h: settings.height ?? 0,
          fps: Math.round(settings.frameRate ?? 0),
        };
      }
      isStarted = true;
      // After permission granted, device labels become available
      await listDevices();
    } catch (e) {
      error = (e as Error).message;
      isStarted = false;
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
      stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
    isStarted = false;
    resolution = null;
    trackInfo = null;
    capabilities = null;
  }

  async function probe() {
    probing = true;
    probeResults = [];
    for (const r of testResolutions) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            width: { exact: r.w },
            height: { exact: r.h },
          },
        });
        const settings = s.getVideoTracks()[0]?.getSettings();
        probeResults = [...probeResults, { label: r.label, ok: true, actual: `${settings?.width}x${settings?.height}` }];
        s.getTracks().forEach((t) => {
          t.stop();
        });
      } catch {
        probeResults = [...probeResults, { label: r.label, ok: false }];
      }
    }
    probing = false;
    // Restart preview after probe
    if (isStarted) await start();
  }

  function takeSnapshot() {
    if (!videoEl || !resolution) return;
    const canvas = document.createElement("canvas");
    canvas.width = resolution.w;
    canvas.height = resolution.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `webcam-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  $effect(() => {
    listDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", listDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", listDevices);
      stop();
    };
  });

  function fmtCap(cap: unknown): string {
    if (cap === undefined || cap === null) return "—";
    if (typeof cap === "object") {
      const o = cap as { min?: number; max?: number; step?: number };
      if (o.min !== undefined || o.max !== undefined) {
        return `${o.min ?? "?"} – ${o.max ?? "?"}${o.step ? ` (step ${o.step})` : ""}`;
      }
      return JSON.stringify(cap);
    }
    return String(cap);
  }
</script>

<div class="flex-1 flex flex-col bg-(--color-bg) text-(--color-text) overflow-auto">
  <div class="p-4 border-b border-(--color-border) bg-(--color-bg-alt) flex flex-wrap items-center gap-3">
    <select
      bind:value={selectedDeviceId}
      class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm"
    >
      {#if devices.length === 0}
        <option value="">No cameras detected</option>
      {/if}
      {#each devices as d, i}
        <option value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
      {/each}
    </select>

    {#if !isStarted}
      <button onclick={() => start()} class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Start</button>
    {:else}
      <button onclick={stop} class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg)">Stop</button>
      <button onclick={takeSnapshot} class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg)">📸 Snapshot</button>
    {/if}

    <button
      onclick={probe}
      disabled={probing || !selectedDeviceId}
      class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg) disabled:opacity-40"
    >{probing ? "Probing…" : "Probe resolutions"}</button>

    {#if resolution}
      <span class="text-sm text-(--color-text-light) ml-auto">
        {resolution.w}×{resolution.h} @ {resolution.fps} fps
      </span>
    {/if}
  </div>

  {#if error}
    <div class="p-3 text-red-500 text-sm bg-red-500/10 border-b border-red-500/30">Error: {error}</div>
  {/if}

  <div class="flex-1 flex flex-col lg:flex-row min-h-0">
    <div class="flex-1 flex items-center justify-center bg-black p-4 min-h-[300px]">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} autoplay playsinline muted class="max-w-full max-h-full"></video>
    </div>

    <div class="w-full lg:w-96 border-l border-(--color-border) bg-(--color-bg-alt) overflow-auto">

      {#if trackInfo}
        <section class="p-3 border-b border-(--color-border)">
          <h3 class="text-sm font-medium mb-2">Active settings</h3>
          <div class="text-xs font-mono space-y-1">
            <div><span class="text-(--color-text-light)">Width:</span> {trackInfo.width}</div>
            <div><span class="text-(--color-text-light)">Height:</span> {trackInfo.height}</div>
            <div><span class="text-(--color-text-light)">FPS:</span> {trackInfo.frameRate}</div>
            <div><span class="text-(--color-text-light)">Aspect:</span> {trackInfo.aspectRatio?.toFixed(3) ?? "—"}</div>
            <div><span class="text-(--color-text-light)">Facing:</span> {trackInfo.facingMode ?? "—"}</div>
            <div><span class="text-(--color-text-light)">Device:</span> <span class="break-all">{trackInfo.deviceId?.slice(0, 16)}…</span></div>
          </div>
        </section>
      {/if}

      {#if capabilities}
        <section class="p-3 border-b border-(--color-border)">
          <h3 class="text-sm font-medium mb-2">Capabilities</h3>
          <div class="text-xs font-mono space-y-1">
            <div><span class="text-(--color-text-light)">Width:</span> {fmtCap(capabilities.width)}</div>
            <div><span class="text-(--color-text-light)">Height:</span> {fmtCap(capabilities.height)}</div>
            <div><span class="text-(--color-text-light)">FPS:</span> {fmtCap(capabilities.frameRate)}</div>
            {#if capabilities.facingMode}
              <div><span class="text-(--color-text-light)">Facing:</span> {Array.isArray(capabilities.facingMode) ? capabilities.facingMode.join(", ") : capabilities.facingMode}</div>
            {/if}
          </div>
        </section>
      {/if}

      {#if probeResults.length > 0}
        <section class="p-3">
          <h3 class="text-sm font-medium mb-2">Resolution support</h3>
          <div class="text-xs font-mono space-y-1">
            {#each probeResults as r}
              <div class="flex items-center justify-between">
                <span>{r.ok ? "✓" : "✗"} {r.label}</span>
                {#if r.actual}<span class="text-(--color-text-light)">{r.actual}</span>{/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>
