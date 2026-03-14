<script lang="ts">
  let audioCtx = $state<AudioContext | null>(null);
  let analyser = $state<AnalyserNode | null>(null);
  let stream = $state<MediaStream | null>(null);
  let animFrameId = $state(0);

  let devices = $state<MediaDeviceInfo[]>([]);
  let selectedDeviceId = $state("");
  let isListening = $state(false);
  let permissionDenied = $state(false);
  let volume = $state(0);
  let peakVolume = $state(0);

  // Recording
  let mediaRecorder = $state<MediaRecorder | null>(null);
  let isRecording = $state(false);
  let recordedUrl = $state("");
  let recordedChunks: Blob[] = [];

  // Canvas refs
  let waveformCanvas = $state<HTMLCanvasElement | null>(null);
  let spectrumCanvas = $state<HTMLCanvasElement | null>(null);

  // Device info
  let sampleRate = $state(0);
  let channelCount = $state(0);

  async function loadDevices() {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      devices = allDevices.filter((d) => d.kind === "audioinput");
      if (devices.length > 0 && !selectedDeviceId) {
        selectedDeviceId = devices[0].deviceId;
      }
    } catch {
      // Unable to enumerate
    }
  }

  async function startListening() {
    permissionDenied = false;
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);

      // After getting permission, re-enumerate to get labels
      await loadDevices();

      audioCtx = new AudioContext();
      sampleRate = audioCtx.sampleRate;

      const source = audioCtx.createMediaStreamSource(stream);
      channelCount = source.channelCount;

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      isListening = true;
      peakVolume = 0;
      drawVisualizations();
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        permissionDenied = true;
      }
      console.error("Microphone error:", err);
    }
  }

  function stopListening() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = 0;
    }
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    analyser = null;
    isListening = false;
    volume = 0;
  }

  function drawVisualizations() {
    if (!analyser) return;

    const waveData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!analyser) return;
      animFrameId = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(waveData);
      analyser.getByteFrequencyData(freqData);

      // Compute volume (RMS)
      let sum = 0;
      for (let i = 0; i < waveData.length; i++) {
        const v = (waveData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / waveData.length);
      volume = Math.min(1, rms * 3); // Scale up for visual
      if (volume > peakVolume) peakVolume = volume;

      // Draw waveform
      if (waveformCanvas) {
        const ctx = waveformCanvas.getContext("2d");
        if (ctx) {
          const w = waveformCanvas.width;
          const h = waveformCanvas.height;
          ctx.clearRect(0, 0, w, h);

          // Get computed style for colors
          const style = getComputedStyle(waveformCanvas);
          const accentColor = style.getPropertyValue("--color-accent").trim() || "#1a1a1a";

          ctx.lineWidth = 2;
          ctx.strokeStyle = accentColor;
          ctx.beginPath();
          const sliceWidth = w / waveData.length;
          let x = 0;
          for (let i = 0; i < waveData.length; i++) {
            const v = waveData[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
        }
      }

      // Draw spectrum
      if (spectrumCanvas) {
        const ctx = spectrumCanvas.getContext("2d");
        if (ctx) {
          const w = spectrumCanvas.width;
          const h = spectrumCanvas.height;
          ctx.clearRect(0, 0, w, h);

          const style = getComputedStyle(spectrumCanvas);
          const accentColor = style.getPropertyValue("--color-accent").trim() || "#1a1a1a";

          const barCount = 64;
          const barWidth = w / barCount;
          const step = Math.floor(freqData.length / barCount);

          for (let i = 0; i < barCount; i++) {
            const value = freqData[i * step] / 255;
            const barHeight = value * h;
            ctx.fillStyle = accentColor;
            ctx.globalAlpha = 0.3 + value * 0.7;
            ctx.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    draw();
  }

  function startRecording() {
    if (!stream) return;
    recordedChunks = [];
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = "";
    }

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      recordedUrl = URL.createObjectURL(blob);
    };
    mediaRecorder.start();
    isRecording = true;

    // Auto-stop after 10 seconds
    setTimeout(() => {
      if (isRecording) stopRecording();
    }, 10000);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    isRecording = false;
  }

  // Cleanup on unmount
  $effect(() => {
    loadDevices();
    return () => {
      stopListening();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  });
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Test your microphone with live audio visualization, volume metering, and test recording. All audio is processed locally in your browser.
    </p>
  </header>

  {#if permissionDenied}
    <div class="flex-none px-4 py-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      Microphone access was denied. Please allow microphone access in your browser settings and try again.
    </div>
  {/if}

  <div class="flex-1 flex flex-col gap-4 overflow-auto min-h-0">
    <!-- Device selector & controls -->
    <section class="flex flex-col gap-3 p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex items-end gap-3 flex-wrap">
        <div class="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Microphone</label>
          <select
            bind:value={selectedDeviceId}
            disabled={isListening}
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
          >
            {#each devices as device}
              <option value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 8)}`}</option>
            {/each}
            {#if devices.length === 0}
              <option value="">No devices found (grant permission first)</option>
            {/if}
          </select>
        </div>

        <button
          onclick={() => { if (isListening) { stopListening(); } else { startListening(); } }}
          class="px-5 py-2 font-medium transition-colors {isListening
            ? 'bg-(--color-error-text) text-white'
            : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
        >
          {isListening ? "Stop" : "Start Listening"}
        </button>
      </div>

      <!-- Device info -->
      {#if isListening}
        <div class="flex gap-4 text-xs text-(--color-text-muted)">
          <span>Sample Rate: <span class="font-mono text-(--color-text)">{sampleRate} Hz</span></span>
          <span>Channels: <span class="font-mono text-(--color-text)">{channelCount}</span></span>
        </div>
      {/if}
    </section>

    {#if isListening}
      <!-- Volume Meter -->
      <section class="flex flex-col gap-2 p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Volume</h2>
          <span class="text-xs text-(--color-text-muted)">Peak: {Math.round(peakVolume * 100)}%</span>
        </div>
        <div class="h-6 bg-(--color-bg) overflow-hidden border border-(--color-border)">
          <div
            class="h-full transition-all duration-75 {volume > 0.8 ? 'bg-red-500' : volume > 0.5 ? 'bg-yellow-500' : 'bg-green-500'}"
            style="width: {Math.round(volume * 100)}%"
          ></div>
        </div>
        <div class="text-center text-2xl font-mono font-bold text-(--color-text)">{Math.round(volume * 100)}%</div>
      </section>

      <!-- Waveform -->
      <section class="flex flex-col gap-2 p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Waveform</h2>
        <canvas
          bind:this={waveformCanvas}
          width="800"
          height="150"
          class="w-full h-24 bg-(--color-bg) border border-(--color-border)"
        ></canvas>
      </section>

      <!-- Frequency Spectrum -->
      <section class="flex flex-col gap-2 p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Frequency Spectrum</h2>
        <canvas
          bind:this={spectrumCanvas}
          width="800"
          height="150"
          class="w-full h-24 bg-(--color-bg) border border-(--color-border)"
        ></canvas>
      </section>

      <!-- Recording -->
      <section class="flex flex-col gap-3 p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Test Recording</h2>
        <p class="text-xs text-(--color-text-muted)">Record a short clip (max 10s) to verify your microphone works.</p>

        <div class="flex items-center gap-3">
          <button
            onclick={() => { if (isRecording) { stopRecording(); } else { startRecording(); } }}
            class="px-4 py-2 text-sm font-medium transition-colors {isRecording
              ? 'bg-(--color-error-text) text-white'
              : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
          >
            {isRecording ? "Stop Recording" : "Record Clip"}
          </button>

          {#if isRecording}
            <div class="flex items-center gap-1.5 text-sm text-(--color-error-text)">
              <div class="w-2 h-2 bg-(--color-error-text) animate-pulse"></div>
              Recording...
            </div>
          {/if}
        </div>

        {#if recordedUrl}
          <div class="flex flex-col gap-2">
            <label class="text-xs text-(--color-text-muted)">Playback</label>
            <!-- svelte-ignore element_invalid_self_closing_tag -->
            <audio controls src={recordedUrl} class="w-full" />
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>
