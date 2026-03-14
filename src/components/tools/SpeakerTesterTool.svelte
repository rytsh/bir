<script lang="ts">
  type WaveType = "sine" | "square" | "sawtooth" | "triangle";
  type NoiseType = "white" | "pink";

  let audioCtx = $state<AudioContext | null>(null);
  let oscillator = $state<OscillatorNode | null>(null);
  let noiseSource = $state<AudioBufferSourceNode | null>(null);
  let gainNode = $state<GainNode | null>(null);
  let pannerNode = $state<StereoPannerNode | null>(null);

  let isPlaying = $state(false);
  let isSweeping = $state(false);
  let sweepInterval = $state<ReturnType<typeof setInterval> | null>(null);

  let frequency = $state(440);
  let volume = $state(0.3);
  let waveType = $state<WaveType>("sine");
  let pan = $state<"center" | "left" | "right">("center");
  let activeMode = $state<"tone" | "white" | "pink" | "sweep" | null>(null);

  const presets = [
    { label: "Sub Bass", freq: 60 },
    { label: "Bass", freq: 100 },
    { label: "Low Mid", freq: 250 },
    { label: "Mid", freq: 1000 },
    { label: "High Mid", freq: 4000 },
    { label: "Treble", freq: 10000 },
    { label: "A4 (440 Hz)", freq: 440 },
    { label: "Middle C", freq: 261.63 },
  ];

  function getOrCreateContext(): AudioContext {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  }

  function stopAll() {
    if (oscillator) {
      try { oscillator.stop(); } catch { /* ignore */ }
      oscillator.disconnect();
      oscillator = null;
    }
    if (noiseSource) {
      try { noiseSource.stop(); } catch { /* ignore */ }
      noiseSource.disconnect();
      noiseSource = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (pannerNode) {
      pannerNode.disconnect();
      pannerNode = null;
    }
    if (sweepInterval) {
      clearInterval(sweepInterval);
      sweepInterval = null;
    }
    isPlaying = false;
    isSweeping = false;
    activeMode = null;
  }

  function getPanValue(): number {
    if (pan === "left") return -1;
    if (pan === "right") return 1;
    return 0;
  }

  function playTone() {
    stopAll();
    const ctx = getOrCreateContext();

    gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = getPanValue();

    oscillator = ctx.createOscillator();
    oscillator.type = waveType;
    oscillator.frequency.value = frequency;

    oscillator.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(ctx.destination);

    oscillator.start();
    isPlaying = true;
    activeMode = "tone";
  }

  function playNoise(type: NoiseType) {
    stopAll();
    const ctx = getOrCreateContext();
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      if (type === "white") {
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } else {
        // Pink noise using Voss-McCartney algorithm (simplified)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
      }
    }

    gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = getPanValue();

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    noiseSource.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(ctx.destination);

    noiseSource.start();
    isPlaying = true;
    activeMode = type;
  }

  function startSweep() {
    stopAll();
    const ctx = getOrCreateContext();

    gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    pannerNode = ctx.createStereoPanner();
    pannerNode.pan.value = getPanValue();

    oscillator = ctx.createOscillator();
    oscillator.type = waveType;
    oscillator.frequency.value = 20;

    oscillator.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(ctx.destination);

    oscillator.start();
    isPlaying = true;
    isSweeping = true;
    activeMode = "sweep";

    let currentFreq = 20;
    const targetFreq = 20000;
    const duration = 10; // 10 seconds
    const steps = 200;
    const stepTime = (duration * 1000) / steps;
    const logStart = Math.log10(20);
    const logEnd = Math.log10(targetFreq);
    let step = 0;

    sweepInterval = setInterval(() => {
      step++;
      if (step >= steps) {
        stopAll();
        return;
      }
      const logFreq = logStart + (logEnd - logStart) * (step / steps);
      currentFreq = Math.pow(10, logFreq);
      frequency = Math.round(currentFreq);
      if (oscillator) {
        oscillator.frequency.value = currentFreq;
      }
    }, stepTime);
  }

  // Update live parameters when sliders change
  $effect(() => {
    if (oscillator && activeMode === "tone") {
      oscillator.frequency.value = frequency;
    }
  });

  $effect(() => {
    if (gainNode) {
      gainNode.gain.value = volume;
    }
  });

  $effect(() => {
    if (pannerNode) {
      pannerNode.pan.value = getPanValue();
    }
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      stopAll();
      if (audioCtx) {
        audioCtx.close();
      }
    };
  });
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Test your speakers and headphones with tone generation, frequency sweep, and noise playback. Use channel isolation to verify left and right speakers independently.
    </p>
  </header>

  <div class="flex-1 flex flex-col gap-5 overflow-auto min-h-0">
    <!-- Tone Generator -->
    <section class="flex flex-col gap-3 p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Tone Generator</h2>

      <!-- Wave type -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-(--color-text-muted)">Waveform</label>
        <div class="flex gap-2">
          {#each ["sine", "square", "sawtooth", "triangle"] as wt}
            <button
              onclick={() => { waveType = wt as WaveType; }}
              class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors border {waveType === wt
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
            >
              {wt.charAt(0).toUpperCase() + wt.slice(1)}
            </button>
          {/each}
        </div>
      </div>

      <!-- Frequency -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs text-(--color-text-muted)">Frequency</label>
          <span class="text-sm font-mono text-(--color-text)">{frequency} Hz</span>
        </div>
        <input
          type="range"
          min="20"
          max="20000"
          step="1"
          bind:value={frequency}
          class="w-full accent-(--color-accent)"
        />
        <div class="flex flex-wrap gap-1.5">
          {#each presets as preset}
            <button
              onclick={() => { frequency = preset.freq; }}
              class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {preset.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Play/Stop tone -->
      <button
        onclick={() => { if (activeMode === "tone") { stopAll(); } else { playTone(); } }}
        class="px-4 py-2 font-medium transition-colors {activeMode === 'tone'
          ? 'bg-(--color-error-text) text-white'
          : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
      >
        {activeMode === "tone" ? "Stop Tone" : "Play Tone"}
      </button>
    </section>

    <!-- Volume & Pan -->
    <section class="flex flex-col gap-3 p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Volume & Channel</h2>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs text-(--color-text-muted)">Volume</label>
          <span class="text-sm font-mono text-(--color-text)">{Math.round(volume * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={volume}
          class="w-full accent-(--color-accent)"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-(--color-text-muted)">Channel</label>
        <div class="flex gap-2">
          {#each [["left", "Left Only"], ["center", "Both"], ["right", "Right Only"]] as [val, label]}
            <button
              onclick={() => { pan = val as "left" | "center" | "right"; }}
              class="flex-1 px-3 py-1.5 text-sm font-medium transition-colors border {pan === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- Noise & Sweep -->
    <section class="flex flex-col gap-3 p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <h2 class="text-sm font-medium text-(--color-text) uppercase tracking-wide">Noise & Sweep</h2>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onclick={() => { if (activeMode === "white") { stopAll(); } else { playNoise("white"); } }}
          class="px-3 py-2 text-sm font-medium transition-colors border {activeMode === 'white'
            ? 'bg-(--color-error-text) text-white border-(--color-error-text)'
            : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
        >
          White Noise
        </button>
        <button
          onclick={() => { if (activeMode === "pink") { stopAll(); } else { playNoise("pink"); } }}
          class="px-3 py-2 text-sm font-medium transition-colors border {activeMode === 'pink'
            ? 'bg-(--color-error-text) text-white border-(--color-error-text)'
            : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
        >
          Pink Noise
        </button>
        <button
          onclick={() => { if (isSweeping) { stopAll(); } else { startSweep(); } }}
          class="px-3 py-2 text-sm font-medium transition-colors border {isSweeping
            ? 'bg-(--color-error-text) text-white border-(--color-error-text)'
            : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
        >
          {isSweeping ? `Sweeping ${frequency} Hz` : "Frequency Sweep (20-20k Hz)"}
        </button>
      </div>
    </section>

    <!-- Status indicator -->
    {#if isPlaying}
      <div class="flex-none flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
        <div class="w-2 h-2 bg-green-500 animate-pulse"></div>
        <span class="text-sm text-green-700 dark:text-green-300">
          Playing: {activeMode === "tone" ? `${waveType} wave at ${frequency} Hz` : activeMode === "sweep" ? `Sweep at ${frequency} Hz` : activeMode === "white" ? "White noise" : "Pink noise"} — {pan === "center" ? "Both channels" : pan === "left" ? "Left channel" : "Right channel"}
        </span>
        <button
          onclick={stopAll}
          class="ml-auto text-xs text-green-700 dark:text-green-300 underline hover:no-underline"
        >
          Stop
        </button>
      </div>
    {/if}
  </div>
</div>
