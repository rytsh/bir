<script lang="ts">
  let supported = $state<boolean | null>(null);
  let log = $state<string[]>([]);
  let customPattern = $state("200, 100, 200, 100, 400");
  let singleDuration = $state(200);

  $effect(() => {
    supported = "vibrate" in navigator;
  });

  function vibrate(pattern: number | number[]) {
    if (!supported) return;
    try {
      const ok = navigator.vibrate(pattern);
      const desc = Array.isArray(pattern) ? `[${pattern.join(", ")}]` : `${pattern}ms`;
      log = [`${new Date().toLocaleTimeString()} — vibrate(${desc}) → ${ok}`, ...log].slice(0, 30);
    } catch (e) {
      log = [`${new Date().toLocaleTimeString()} — error: ${(e as Error).message}`, ...log].slice(0, 30);
    }
  }

  function stop() {
    if (!supported) return;
    navigator.vibrate(0);
    log = [`${new Date().toLocaleTimeString()} — stopped`, ...log].slice(0, 30);
  }

  function runCustom() {
    const arr = customPattern
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (arr.length === 0) return;
    vibrate(arr);
  }

  const presets: { label: string; pattern: number[] }[] = [
    { label: "Short pulse", pattern: [100] },
    { label: "Long pulse", pattern: [500] },
    { label: "Double tap", pattern: [100, 80, 100] },
    { label: "Triple tap", pattern: [80, 60, 80, 60, 80] },
    { label: "SOS (· · · — — — · · ·)", pattern: [100, 60, 100, 60, 100, 200, 300, 60, 300, 60, 300, 200, 100, 60, 100, 60, 100] },
    { label: "Heartbeat", pattern: [80, 80, 80, 800, 80, 80, 80, 800] },
    { label: "Notification", pattern: [200, 100, 200] },
    { label: "Alarm", pattern: [400, 200, 400, 200, 400, 200, 400] },
  ];
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-3xl mx-auto space-y-6">

    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <h2 class="font-medium mb-2">Support</h2>
      {#if supported === null}
        <div class="text-sm text-(--color-text-light)">Checking…</div>
      {:else if supported}
        <div class="text-sm text-green-500">✓ Vibration API is available on this device.</div>
        <p class="text-xs text-(--color-text-light) mt-1">Note: most desktop browsers report support but produce no haptic output. Test on a phone/tablet.</p>
      {:else}
        <div class="text-sm text-red-500">✗ Vibration API not available in this browser.</div>
      {/if}
    </section>

    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <h2 class="font-medium mb-3">Single pulse</h2>
      <div class="flex items-center gap-3">
        <input
          type="number"
          min="0"
          max="5000"
          bind:value={singleDuration}
          class="w-32 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text)"
        />
        <span class="text-xs text-(--color-text-light)">ms</span>
        <button
          onclick={() => vibrate(singleDuration)}
          disabled={!supported}
          class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40"
        >Vibrate</button>
        <button
          onclick={stop}
          disabled={!supported}
          class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg) disabled:opacity-40"
        >Stop</button>
      </div>
    </section>

    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <h2 class="font-medium mb-3">Presets</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        {#each presets as p}
          <button
            onclick={() => vibrate(p.pattern)}
            disabled={!supported}
            class="px-3 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg) disabled:opacity-40 text-left"
          >{p.label}</button>
        {/each}
      </div>
    </section>

    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <h2 class="font-medium mb-3">Custom pattern</h2>
      <p class="text-xs text-(--color-text-light) mb-2">Comma-separated milliseconds: ON, OFF, ON, OFF, …</p>
      <input
        type="text"
        bind:value={customPattern}
        class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm"
      />
      <div class="mt-3 flex gap-2">
        <button
          onclick={runCustom}
          disabled={!supported}
          class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40"
        >Play</button>
        <button
          onclick={stop}
          disabled={!supported}
          class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg) disabled:opacity-40"
        >Stop</button>
      </div>
    </section>

    <section class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between">
        <h2 class="font-medium">Log</h2>
        <button onclick={() => (log = [])} class="text-xs text-(--color-text-light) hover:text-(--color-text)">Clear</button>
      </div>
      <div class="p-3 font-mono text-xs space-y-0.5 max-h-64 overflow-auto">
        {#if log.length === 0}<div class="text-(--color-text-light)">No events yet</div>{/if}
        {#each log as line}<div>{line}</div>{/each}
      </div>
    </section>

  </div>
</div>
