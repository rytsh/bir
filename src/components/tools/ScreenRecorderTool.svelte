<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { FFmpeg } from "@ffmpeg/ffmpeg";
  import { Download, Flag, FlagOff, Mic, Monitor, Pause, Play, Square, Volume2, Wand, X } from "@lucide/svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { downloadBlob, errorMessage, formatBytes, isEditing } from "../../lib/workbench.ts";

  type CaptureState = "idle" | "requesting" | "recording" | "paused" | "ready";
  let captureState = $state<CaptureState>("idle");
  let supported = $state<boolean | null>(null);
  let microphone = $state<boolean>(false);
  let systemAudio = $state<boolean>(false);
  let resolution = $state<number>(1080);
  let fps = $state<number>(30);
  let bitrate = $state<number>(4);
  let seconds = $state<number>(0);
  let size = $state<number>(0);
  let recording = $state<Blob | null>(null);
  let recordingUrl = $state<string>("");
  let nativeExtension = $state<string>("webm");
  let preview = $state<HTMLVideoElement>();
  let liveStream = $state<MediaStream | null>(null);
  let error = $state<string>("");
  let note = $state<string>("");
  let exportFormat = $state<"gif" | "mp4">("gif");
  let exportWidth = $state<number>(640);
  let exportFps = $state<number>(10);
  let exportQuality = $state<number>(30);
  let trimStart = $state<number>(0);
  let trimDuration = $state<number>(10);
  let converting = $state<boolean>(false);
  let progress = $state<number>(0);
  let conversionStatus = $state<string>("");
  let convertedUrl = $state<string>("");
  let converted = $state<Blob | null>(null);
  let convertedName = $state<string>("");
  let recorder: MediaRecorder | null = null;
  let sourceStream: MediaStream | null = null;
  let micStream: MediaStream | null = null;
  let captureStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceVideo: HTMLVideoElement | null = null;
  let frameRequest: number = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let chunks: Blob[] = [];
  let ffmpeg: FFmpeg | null = null;
  let disposed: boolean = false;
  const active = $derived(captureState === "recording" || captureState === "paused");
  const locked = $derived(active || captureState === "requesting" || converting);
  const presets: { id: string; label: string; hint: string; resolution: number; fps: number; bitrate: number }[] = [
    { id: "small", label: "Small file", hint: "720p · 15 FPS · 1 Mbps", resolution: 720, fps: 15, bitrate: 1 },
    { id: "balanced", label: "Balanced", hint: "1080p · 30 FPS · 4 Mbps", resolution: 1080, fps: 30, bitrate: 4 },
    { id: "high", label: "High quality", hint: "1080p · 60 FPS · 8 Mbps", resolution: 1080, fps: 60, bitrate: 8 },
  ];
  const activePreset = $derived(presets.find((preset) => preset.resolution === resolution && preset.fps === fps && preset.bitrate === bitrate)?.id ?? "custom");
  const exportPresets: { id: string; label: string; format: "gif" | "mp4"; width: number; fps: number; quality: number }[] = [
    { id: "gif-small", label: "Small GIF", format: "gif", width: 480, fps: 10, quality: 30 },
    { id: "gif-sharp", label: "Sharp GIF", format: "gif", width: 960, fps: 15, quality: 30 },
    { id: "mp4-light", label: "Light MP4", format: "mp4", width: 960, fps: 24, quality: 36 },
    { id: "mp4-share", label: "Shareable MP4", format: "mp4", width: 1280, fps: 30, quality: 30 },
  ];
  const activeExportPreset = $derived(exportPresets.find((preset) => preset.format === exportFormat && preset.width === exportWidth && preset.fps === exportFps && (preset.format === "gif" || preset.quality === exportQuality))?.id ?? "custom");
  const clipLimit = $derived(exportFormat === "gif" ? 30 : 60);
  const clipEnd = $derived(Math.min(seconds, Number(trimStart) + Number(trimDuration)));
  let playback = $state<HTMLVideoElement>();

  function clock(value: number): string { const safe: number = Math.max(0, value || 0); return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toFixed(1).padStart(4, "0")}`; }
  function setClipStart(): void { if (!playback) return; trimStart = Math.round(playback.currentTime * 10) / 10; trimDuration = Math.max(.1, Math.min(clipLimit, Math.round((seconds - trimStart) * 10) / 10, trimDuration)); }
  function setClipEnd(): void { if (!playback) return; const end: number = Math.round(playback.currentTime * 10) / 10; if (end > trimStart) trimDuration = Math.min(clipLimit, Math.round((end - trimStart) * 10) / 10); }
  function wholeRecording(): void { trimStart = 0; trimDuration = Math.min(clipLimit, Math.max(.1, Math.round(seconds * 10) / 10)); }

  onMount(() => { supported = window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === "function" && typeof window.MediaRecorder === "function" && typeof HTMLCanvasElement.prototype.captureStream === "function"; });
  $effect(() => { if (preview && liveStream) { preview.srcObject = liveStream; void preview.play().catch(() => {}); } });

  function cleanCapture(): void {
    clearInterval(timer); if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(frameRequest);
    sourceStream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    micStream?.getTracks().forEach((track) => track.stop());
    captureStream?.getTracks().forEach((track) => track.stop());
    sourceStream = null; micStream = null; captureStream = null;
    if (sourceVideo) { sourceVideo.pause(); sourceVideo.srcObject = null; sourceVideo = null; }
    if (audioContext) { void audioContext.close(); audioContext = null; }
    liveStream = null;
  }

  function stop(): void { if (recorder && recorder.state !== "inactive") recorder.stop(); }

  async function start(): Promise<void> {
    if (locked || !supported) return;
    captureState = "requesting"; error = ""; note = "";
    try {
      sourceStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: fps, max: fps } }, audio: systemAudio });
      if (disposed) { cleanCapture(); return; }
      if (microphone) micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) { cleanCapture(); return; }
      if (systemAudio && !sourceStream.getAudioTracks().length) note = "This source did not provide system audio. Choose a supported browser tab and enable audio sharing next time.";
      sourceVideo = document.createElement("video"); sourceVideo.muted = true; sourceVideo.playsInline = true; sourceVideo.srcObject = sourceStream;
      await sourceVideo.play();
      if (disposed) { cleanCapture(); return; }
      const width: number = sourceVideo.videoWidth; const height: number = sourceVideo.videoHeight;
      if (!width || !height) throw new Error("No video frames received. Try sharing another window or tab.");
      const scale: number = Math.min(1, resolution / height);
      const canvas: HTMLCanvasElement = document.createElement("canvas"); canvas.width = Math.max(2, Math.round(width * scale / 2) * 2); canvas.height = Math.max(2, Math.round(height * scale / 2) * 2);
      const ctx: CanvasRenderingContext2D = canvas.getContext("2d", { alpha: false })!;
      const draw = (): void => { if (!sourceVideo) return; ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height); frameRequest = requestAnimationFrame(draw); };
      draw(); captureStream = canvas.captureStream(fps);
      const audioSources: MediaStream[] = [sourceStream, ...(micStream ? [micStream] : [])].filter((stream) => stream.getAudioTracks().length > 0);
      if (audioSources.length) {
        audioContext = new AudioContext(); await audioContext.resume();
        const destination: MediaStreamAudioDestinationNode = audioContext.createMediaStreamDestination();
        audioSources.forEach((stream) => audioContext!.createMediaStreamSource(stream).connect(destination));
        destination.stream.getAudioTracks().forEach((track) => captureStream!.addTrack(track));
      }
      const mimeType: string | undefined = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("No supported recording format. Try the latest Chrome, Edge, or Firefox on desktop.");
      const sessionRecorder: MediaRecorder = new MediaRecorder(captureStream, { mimeType, videoBitsPerSecond: bitrate * 1_000_000 });
      recorder = sessionRecorder; chunks = []; size = 0; seconds = 0;
      sessionRecorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size) { chunks.push(event.data); size += event.data.size; }
        if (size > 128 * 1024 * 1024) { note = "Recording stopped at the 128 MB memory limit. Your captured video is available below."; stop(); }
      };
      sessionRecorder.onerror = (): void => { error = "The browser stopped recording unexpectedly. Any available captured data will be kept."; stop(); cleanCapture(); };
      sessionRecorder.onstop = (): void => {
        cleanCapture();
        if (disposed) { chunks = []; return; }
        const blob: Blob = new Blob(chunks, { type: sessionRecorder.mimeType }); chunks = [];
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        recording = blob; recordingUrl = URL.createObjectURL(blob); nativeExtension = sessionRecorder.mimeType.includes("mp4") ? "mp4" : "webm";
        size = blob.size; captureState = "ready"; trimStart = 0; trimDuration = Math.min(10, Math.max(.1, seconds));
        if (convertedUrl) URL.revokeObjectURL(convertedUrl); convertedUrl = ""; converted = null;
      };
      sourceStream.getVideoTracks()[0].onended = stop;
      liveStream = captureStream; sessionRecorder.start(1000); captureState = "recording";
      let previous: number = performance.now();
      timer = setInterval(() => { const now: number = performance.now(); if (recorder?.state === "recording") seconds += (now - previous) / 1000; previous = now; if (seconds >= 600) { note = "Recording stopped at the 10-minute safety limit."; stop(); } }, 250);
    } catch (issue) {
      cleanCapture(); captureState = recording ? "ready" : "idle";
      error = issue instanceof DOMException && issue.name === "NotAllowedError" ? "Screen or microphone permission was not granted. Start again and choose a source; disable microphone if it is not needed." : errorMessage(issue);
    }
  }

  function togglePause(): void {
    if (recorder?.state === "recording") { recorder.pause(); captureState = "paused"; }
    else if (recorder?.state === "paused") { recorder.resume(); captureState = "recording"; }
  }

  async function convert(): Promise<void> {
    if (!recording || converting || active) return;
    const duration: number = Number(trimDuration); const startTime: number = Number(trimStart);
    const limit: number = exportFormat === "gif" ? 30 : 60;
    if (!Number.isFinite(duration) || duration <= 0 || duration > limit || !Number.isFinite(startTime) || startTime < 0 || startTime >= seconds || startTime + duration > seconds + .5) { error = `Choose a valid clip within your recording, up to ${limit} seconds.`; return; }
    if (![320, 480, 640, 960, 1280].includes(Number(exportWidth)) || ![5, 10, 15, 24, 30].includes(Number(exportFps))) { error = "Choose a supported output width and frame rate."; return; }
    converting = true; progress = 0; error = ""; conversionStatus = "Loading local FFmpeg engine (about 32 MB on first use)…";
    try {
      if (!ffmpeg) {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const engine: FFmpeg = new FFmpeg(); ffmpeg = engine;
        engine.on("progress", (event) => { progress = Math.min(99, Math.max(0, Math.round(event.progress * 100))); });
        await engine.load({ coreURL: `${window.location.origin}/wasm/ffmpeg-core.js`, wasmURL: `${window.location.origin}/wasm/ffmpeg-core.wasm` });
      }
      if (disposed) return;
      conversionStatus = "Converting locally. Keep this tab open…";
      const inputName: string = `input.${nativeExtension}`; const outputName: string = `recording.${exportFormat}`;
      await ffmpeg.writeFile(inputName, new Uint8Array(await recording.arrayBuffer()));
      const common: string[] = ["-ss", String(startTime), "-i", inputName, "-t", String(duration)];
      let args: string[];
      if (exportFormat === "gif") {
        args = [...common, "-filter_complex", `fps=${exportFps},scale=${exportWidth}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`, "-an", "-loop", "0", outputName];
      } else {
        args = [...common, "-vf", `scale=${exportWidth}:-2:flags=lanczos,fps=${exportFps}`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", String(exportQuality), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outputName];
      }
      const code: number = await ffmpeg.exec(args);
      if (code !== 0) throw new Error("Conversion failed. Try a shorter clip, smaller width, or lower frame rate. The original recording is still available.");
      const result = await ffmpeg.readFile(outputName);
      if (!(result instanceof Uint8Array)) throw new Error("Unexpected encoder output.");
      const blob: Blob = new Blob([new Uint8Array(result)], { type: exportFormat === "gif" ? "image/gif" : "video/mp4" });
      if (convertedUrl) URL.revokeObjectURL(convertedUrl);
      converted = blob; convertedUrl = URL.createObjectURL(blob); convertedName = outputName; progress = 100;
      conversionStatus = `Ready · ${formatBytes(blob.size)} · ${exportFormat.toUpperCase()}. ${exportFormat === "gif" ? "GIF has no audio and may be larger than video." : "Smaller dimensions and higher CRF reduce size; output is not guaranteed smaller."}`;
      await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName);
    } catch (issue) { error = errorMessage(issue); ffmpeg?.terminate(); ffmpeg = null; conversionStatus = ""; }
    finally { converting = false; }
  }

  function cancelConversion(): void { ffmpeg?.terminate(); ffmpeg = null; converting = false; conversionStatus = "Conversion cancelled. The original recording is unchanged."; }
  function shortcut(event: KeyboardEvent): void {
    if (isEditing(event)) return;
    if (event.key.toLowerCase() === "p" && active) { event.preventDefault(); togglePause(); }
    if (event.key.toLowerCase() === "s" && active) stop();
    if (event.key.toLowerCase() === "d" && recording && !active) downloadBlob(recording, `screen-recording.${nativeExtension}`);
  }
  onDestroy(() => { disposed = true; if (recorder?.state !== "inactive") recorder?.stop(); cleanCapture(); ffmpeg?.terminate(); if (recordingUrl) URL.revokeObjectURL(recordingUrl); if (convertedUrl) URL.revokeObjectURL(convertedUrl); });
</script>

<svelte:window onkeydown={shortcut} />
<ToolWorkbench description="Record a screen, window, or browser tab, then download the original or export a short GIF / lighter MP4 clip. Everything stays on your device.">
  {#if supported === false}<p class="wb-error" role="alert">Screen recording needs HTTPS and a desktop browser with screen sharing (latest Chrome, Edge, or Firefox). Most mobile browsers cannot record the screen.</p>{/if}

  <section class="wb-panel capture" class:live={active}>
    <div class="capture-bar">
      {#if !active}
        <button class="primary record-button" onclick={start} disabled={locked || !supported}><span class="rec-dot" aria-hidden="true"></span>{captureState === "requesting" ? "Choose a source in your browser…" : recording ? "Record again" : "Start recording"}</button>
      {:else}
        <button onclick={togglePause}>{#if captureState === "paused"}<Play size={16} /> Resume{:else}<Pause size={16} /> Pause{/if}</button>
        <button class="primary" onclick={stop}><Square size={16} /> Stop</button>
      {/if}
      <span class="capture-status" role="status" aria-live="polite"><span class:recording={captureState === "recording"} class:paused={captureState === "paused"} class="status-dot"></span><strong>{captureState === "paused" ? "Paused" : active ? "Recording" : recording ? "Recorded" : "Ready"}</strong><span class="wb-mono">{Math.floor(seconds / 60).toString().padStart(2, "0")}:{Math.floor(seconds % 60).toString().padStart(2, "0")}</span><span class="wb-muted">{formatBytes(size)}</span></span>
      <span class="wb-spacer"></span>
      <div class="audio-toggles">
        <label class="wb-check"><input type="checkbox" bind:checked={microphone} disabled={locked} /> <Mic size={15} aria-hidden="true" /> Microphone</label>
        <label class="wb-check"><input type="checkbox" bind:checked={systemAudio} disabled={locked} /> <Volume2 size={15} aria-hidden="true" /> Tab / system audio</label>
      </div>
    </div>
    <div class="quality-row">
      <span class="wb-small wb-muted">Quality</span>
      <div class="segmented" role="group" aria-label="Recording quality">
        {#each presets as preset}<button aria-pressed={activePreset === preset.id} disabled={locked} title={preset.hint} onclick={() => { resolution = preset.resolution; fps = preset.fps; bitrate = preset.bitrate; }}>{preset.label}<small>{preset.hint}</small></button>{/each}
      </div>
      <details class="custom">
        <summary class="wb-small">Custom{activePreset === "custom" ? ` · ${resolution}p · ${fps} FPS · ${bitrate} Mbps` : ""}</summary>
        <div class="wb-toolbar custom-fields">
          <label class="wb-field">Max height<select bind:value={resolution} disabled={locked}><option value={480}>480p</option><option value={720}>720p</option><option value={1080}>1080p</option><option value={1440}>1440p</option><option value={2160}>2160p</option></select></label>
          <label class="wb-field">Frame rate<select bind:value={fps} disabled={locked}><option value={15}>15 FPS</option><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label>
          <label class="wb-field">Bitrate<select bind:value={bitrate} disabled={locked}><option value={1}>1 Mbps</option><option value={2}>2 Mbps</option><option value={4}>4 Mbps</option><option value={8}>8 Mbps</option><option value={12}>12 Mbps</option></select></label>
        </div>
      </details>
    </div>
  </section>

  {#if error}<p class="wb-error" role="alert">{error}</p>{/if}
  {#if note}<p class="wb-note">{note}</p>{/if}

  {#if active}<div class="wb-panel preview"><video bind:this={preview} autoplay muted playsinline aria-label="Live screen recording preview"><track kind="captions" /></video></div>
  {:else if recordingUrl}<div class="wb-panel preview"><video bind:this={playback} src={recordingUrl} controls playsinline aria-label="Recorded screen preview"><track kind="captions" /></video></div>
  {:else}
    <div class="wb-panel empty-state">
      <Monitor size={32} strokeWidth={1.25} aria-hidden="true" />
      <ol>
        <li>Pick a quality and audio options above.</li>
        <li>Press <strong>Start recording</strong> and choose a screen, window, or tab in the browser dialog.</li>
        <li>Stop when done — then download, or trim and export a GIF / smaller MP4.</li>
      </ol>
      <p class="wb-small wb-muted">Tip: share a browser tab to include its audio. Keep this page visible (a separate window works best) so capture is not throttled. Max 10 minutes.</p>
    </div>
  {/if}

  {#if recording && !active}
    <div class="wb-toolbar">
      <button class="primary" onclick={() => downloadBlob(recording!, `screen-recording.${nativeExtension}`)}><Download size={16} /> Download original · {nativeExtension.toUpperCase()} · {formatBytes(recording.size)}</button>
      <span class="wb-small wb-muted">{clock(seconds)} long</span>
    </div>
    <section class="wb-panel">
      <h2 class="wb-panel-heading">Export a clip <span class="wb-small wb-muted">GIF or lighter MP4 · converted locally with FFmpeg</span></h2>
      <div class="wb-padded export-body">
        <div class="export-group">
          <span class="wb-small wb-muted group-label">Preset</span>
          <div class="segmented" role="group" aria-label="Export preset">
            {#each exportPresets as preset}<button aria-pressed={activeExportPreset === preset.id} disabled={converting} onclick={() => { exportFormat = preset.format; exportWidth = preset.width; exportFps = preset.fps; exportQuality = preset.quality; if (trimDuration > (preset.format === "gif" ? 30 : 60)) trimDuration = preset.format === "gif" ? 30 : 60; }}>{preset.label}<small>{preset.width}px · {preset.fps} FPS</small></button>{/each}
          </div>
        </div>
        <div class="export-group">
          <span class="wb-small wb-muted group-label">Clip</span>
          <div class="wb-toolbar">
            <button disabled={converting} onclick={setClipStart} title="Use the video's current position as clip start"><Flag size={14} /> Start at playhead</button>
            <button disabled={converting} onclick={setClipEnd} title="Use the video's current position as clip end"><FlagOff size={14} /> End at playhead</button>
            <button disabled={converting} onclick={wholeRecording}>Whole recording</button>
            <span class="clip-readout wb-mono" aria-live="polite">{clock(Number(trimStart))} → {clock(clipEnd)} <span class="wb-muted">({Number(trimDuration).toFixed(1)} s, max {clipLimit} s)</span></span>
          </div>
          <div class="clip-track" aria-hidden="true"><span style:left={`${seconds ? Number(trimStart) / seconds * 100 : 0}%`} style:width={`${seconds ? Math.max(.5, (clipEnd - Number(trimStart)) / seconds * 100) : 0}%`}></span></div>
        </div>
        <details>
          <summary class="wb-small">Fine-tune ({exportFormat.toUpperCase()} · {exportWidth}px · {exportFps} FPS{exportFormat === "mp4" ? ` · CRF ${exportQuality}` : ""})</summary>
          <div class="wb-toolbar custom-fields">
            <label class="wb-field">Format<select bind:value={exportFormat} disabled={converting}><option value="gif">Animated GIF · no audio</option><option value="mp4">MP4 · H.264 + audio</option></select></label>
            <label class="wb-field">Start (s)<input type="number" min="0" step="0.1" bind:value={trimStart} disabled={converting} /></label>
            <label class="wb-field">Duration (s)<input type="number" min="0.1" max={clipLimit} step="0.1" bind:value={trimDuration} disabled={converting} /></label>
            <label class="wb-field">Width<select bind:value={exportWidth} disabled={converting}>{#each [320, 480, 640, 960, 1280] as width}<option value={width}>{width} px</option>{/each}</select></label>
            <label class="wb-field">FPS<select bind:value={exportFps} disabled={converting}>{#each [5, 10, 15, 24, 30] as rate}<option value={rate}>{rate} FPS</option>{/each}</select></label>
            {#if exportFormat === "mp4"}<label class="wb-field">Compression<select bind:value={exportQuality} disabled={converting}><option value={23}>Higher quality</option><option value={30}>Balanced</option><option value={36}>Smaller file</option></select></label>{/if}
          </div>
        </details>
        <div class="wb-toolbar">
          {#if converting}<button onclick={cancelConversion}><X size={15} /> Cancel</button><progress value={progress} max="100" aria-label="Conversion progress" style="flex: 1; min-width: 8rem;"></progress><span class="wb-small wb-mono">{progress}%</span>
          {:else}<button class="primary" onclick={convert}><Wand size={15} /> Convert to {exportFormat.toUpperCase()}</button>{/if}
          <span class="wb-small wb-muted" role="status">{conversionStatus || "First conversion loads the FFmpeg engine (~32 MB)."}</span>
        </div>
        {#if converted && convertedUrl}
          <div class="converted">
            {#if converted.type === "image/gif"}<img src={convertedUrl} alt="Converted screen recording GIF" />{:else}<video src={convertedUrl} controls playsinline><track kind="captions" /></video>{/if}
            <div class="wb-toolbar"><button class="primary" onclick={() => downloadBlob(converted!, convertedName)}><Download size={15} /> Download {convertedName}</button><span class="wb-small">{formatBytes(converted.size)}{recording ? ` · ${Math.round(converted.size / recording.size * 100)}% of original` : ""}</span></div>
          </div>
        {/if}
      </div>
    </section>
  {/if}
  <div class="wb-shortcuts"><span><kbd>P</kbd> Pause / resume</span><span><kbd>S</kbd> Stop</span><span><kbd>D</kbd> Download original</span></div>
</ToolWorkbench>

<style>
  .capture { overflow: hidden; }
  .capture.live { border-color: var(--color-error-border); }
  .capture-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1rem; padding: 1rem; }
  :global(.workbench) button.record-button { min-height: 2.75rem; padding-inline: 1.1rem; font-size: .95rem; }
  .rec-dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; }
  .capture-status { display: flex; align-items: center; gap: .6rem; font-variant-numeric: tabular-nums; }
  .status-dot { width: 9px; height: 9px; background: var(--color-text-muted); border-radius: 50%; }
  .status-dot.recording { background: #ef4444; animation: pulse 1.2s ease-in-out infinite; }
  .status-dot.paused { background: #d48a20; }
  @keyframes pulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .status-dot.recording { animation: none; } }
  .audio-toggles { display: flex; flex-wrap: wrap; gap: .5rem 1.1rem; }
  .quality-row { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1rem; padding: .75rem 1rem; border-top: 1px solid var(--color-border); background: var(--color-bg); }
  .segmented { display: flex; flex-wrap: wrap; }
  :global(.workbench) .segmented button { flex-direction: column; align-items: flex-start; gap: 0; margin-right: -1px; }
  .segmented small { font-size: .68rem; font-weight: 400; opacity: .75; }
  .custom summary { cursor: pointer; color: var(--color-text-muted); }
  .custom-fields { margin-top: .75rem; }
  .preview { background: #111; }
  .preview video { display: block; width: 100%; max-height: 60vh; }
  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 2rem 1.25rem; color: var(--color-text-muted); }
  .empty-state ol { list-style: decimal; padding-left: 1.25rem; color: var(--color-text); line-height: 1.8; max-width: 60ch; }
  .empty-state p { max-width: 60ch; text-align: center; }
  .export-body { display: flex; flex-direction: column; gap: 1.1rem; }
  .export-group { display: flex; flex-direction: column; gap: .5rem; }
  .group-label { text-transform: none; }
  .clip-readout { font-size: .8rem; }
  .clip-track { position: relative; height: 6px; background: var(--color-border); }
  .clip-track span { position: absolute; top: 0; bottom: 0; background: var(--color-accent); }
  .converted { display: flex; flex-direction: column; align-items: start; gap: .75rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
  .converted :is(img, video) { max-width: 100%; max-height: 22rem; }
</style>
