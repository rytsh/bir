<script lang="ts">
  import { formatSI } from "../../../lib/electronics.js";

  type SimMode = "astable" | "monostable";

  interface Props {
    mode: SimMode;
    tauCharge: number;
    tauDischarge?: number;
    useDiode?: boolean;
  }

  interface SimState {
    v: number;
    out: boolean;
    charging: boolean;
    cycle: number;
  }

  let { mode, tauCharge, tauDischarge = 0, useDiode = false }: Props = $props();

  const LN2 = Math.LN2;
  const LN3 = Math.log(3);
  const SAMPLES = 300;
  const SCOPE_WIDTH = 600;
  const BASE_SECONDS_PER_CYCLE = 1.5;
  const SPEEDS: number[] = [0.25, 0.5, 1, 2, 4];
  const COLOR_VC = "#facc15";
  const COLOR_OUT = "#22d3ee";
  const COLOR_CURRENT = "#f59e0b";
  const COLOR_LED = "#ef4444";

  let playing = $state(true);
  let simTime = $state(0);
  let clock = $state(0);
  let speedFactor = $state(1);
  let realTime = $state(false);
  let autoTrigger = $state(true);
  let vcc = $state(9);
  let triggers = $state.raw<number[]>([]);
  let lastManualTrigger = $state(-1);

  let tHigh = $derived(tauCharge * LN2);
  let tLow = $derived(tauDischarge * LN2);
  let period = $derived(tHigh + tLow);
  let startup = $derived(tauCharge * LN3);
  let pulseWidth = $derived(tauCharge * LN3);
  let cycleTime = $derived(mode === "astable" ? period : pulseWidth);
  let realTimeAllowed = $derived(cycleTime >= 1 / 30);
  let useRealTime = $derived(realTime && realTimeAllowed);
  let speed = $derived(useRealTime ? 1 : (cycleTime / BASE_SECONDS_PER_CYCLE) * speedFactor);
  let windowSpan = $derived(mode === "astable" ? period * 3 : pulseWidth * 4);

  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

  let playbackLabel = $derived.by(() => {
    if (useRealTime || Math.abs(speed - 1) < 1e-9) return "Real time";
    return speed < 1 ? `${compact.format(1 / speed)}× slower than real` : `${compact.format(speed)}× faster than real`;
  });

  const astableAt = (t: number): SimState => {
    if (t < startup) return { v: 1 - Math.exp(-t / tauCharge), out: true, charging: true, cycle: 0 };
    const elapsed = t - startup;
    const cycle = Math.floor(elapsed / period);
    const phase = elapsed - cycle * period;
    if (phase < tLow) {
      return { v: (2 / 3) * Math.exp(-phase / tauDischarge), out: false, charging: false, cycle: cycle + 1 };
    }
    return { v: 1 - (2 / 3) * Math.exp(-(phase - tLow) / tauCharge), out: true, charging: true, cycle: cycle + 1 };
  };

  const monostableAt = (t: number, list: number[]): SimState => {
    let start: number | undefined;
    for (let index = list.length - 1; index >= 0; index--) {
      if (list[index] <= t) {
        start = list[index];
        break;
      }
    }
    if (start === undefined || t - start >= pulseWidth) return { v: 0, out: false, charging: false, cycle: list.length };
    return { v: 1 - Math.exp(-(t - start) / tauCharge), out: true, charging: true, cycle: list.length };
  };

  const stateAt = (t: number): SimState => (mode === "astable" ? astableAt(t) : monostableAt(t, triggers));

  let current = $derived(stateAt(simTime));

  const yVc = (v: number): number => 135 - v * 120;
  const yOut = (out: boolean): number => (out ? 165 : 215);

  let traces = $derived.by(() => {
    let vc = "";
    let out = "";
    let previousOut: boolean | null = null;
    for (let index = 0; index <= SAMPLES; index++) {
      const t = simTime - windowSpan + (index / SAMPLES) * windowSpan;
      if (t < 0) continue;
      const x = ((index / SAMPLES) * SCOPE_WIDTH).toFixed(1);
      const sample = stateAt(t);
      const y = yVc(sample.v).toFixed(1);
      vc += vc ? ` L ${x} ${y}` : `M ${x} ${y}`;
      if (previousOut === null) out = `M ${x} ${yOut(sample.out)}`;
      else if (previousOut !== sample.out) out += ` L ${x} ${yOut(previousOut)} L ${x} ${yOut(sample.out)}`;
      else out += ` L ${x} ${yOut(sample.out)}`;
      previousOut = sample.out;
    }
    return { vc, out };
  });

  let triggerMarkers = $derived(
    mode === "monostable"
      ? triggers
          .filter((t) => t >= simTime - windowSpan && t <= simTime)
          .map((t) => ((t - (simTime - windowSpan)) / windowSpan) * SCOPE_WIDTH)
      : [],
  );

  let flowOffset = $derived(-clock * 30);
  let triggerPressed = $derived(lastManualTrigger >= 0 && clock - lastManualTrigger < 0.15);

  const fireTrigger = (manual: boolean): void => {
    const last = triggers.at(-1);
    if (last !== undefined && simTime - last < pulseWidth) return;
    triggers = [...triggers.filter((t) => t > simTime - windowSpan - pulseWidth), simTime];
    if (manual) lastManualTrigger = clock;
  };

  const restart = (): void => {
    simTime = 0;
    triggers = [];
  };

  $effect(() => {
    void [mode, tauCharge, tauDischarge];
    simTime = 0;
    triggers = [];
  });

  $effect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      playing = false;
    }
  });

  $effect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const dt = Math.min(Math.max(now - last, 0) / 1000, 0.1);
      last = now;
      simTime += dt * speed;
      clock += dt;
      if (mode === "monostable" && autoTrigger) {
        const lastTrigger = triggers.at(-1);
        const due = lastTrigger === undefined ? simTime > pulseWidth * 0.3 : simTime - lastTrigger >= pulseWidth * 2.2;
        if (due) fireTrigger(false);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  const buttonClass =
    "px-3 py-1 text-sm font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors";
</script>

<div class="border border-(--color-border) bg-(--color-bg-alt) mb-4">
  <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-(--color-border)">
    <div class="flex items-center gap-2">
      <span class="inline-block w-2 h-2 rounded-full {playing ? 'bg-green-500 animate-pulse' : 'bg-(--color-text-light)'}"></span>
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Live Simulation</span>
    </div>
    <span class="text-xs font-mono text-(--color-text-muted)">{playbackLabel}</span>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4 p-4">
    <svg viewBox="0 0 360 260" class="w-full max-h-80 text-(--color-text)" aria-label="555 circuit schematic">
      <defs>
        <filter id="led-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">
        <line x1="30" y1="20" x2="330" y2="20" />
        <line x1="30" y1="240" x2="330" y2="240" />
        <line x1="180" y1="20" x2="180" y2="70" />
        <line x1="220" y1="20" x2="220" y2="70" />
        <line x1="200" y1="190" x2="200" y2="240" />
        <polyline points="250,130 300,130 300,140" />
        <rect x="294" y="140" width="12" height="28" />
        <line x1="300" y1="168" x2="300" y2="190" />
        <line x1="300" y1="210" x2="300" y2="240" />

        {#if mode === "astable"}
          <line x1="80" y1="20" x2="80" y2="38" />
          <rect x="74" y="38" width="12" height="40" />
          <line x1="80" y1="78" x2="80" y2="105" />
          <line x1="80" y1="95" x2="150" y2="95" />
          <rect x="74" y="105" width="12" height="35" />
          <polyline points="80,140 80,150 120,150" />
          <line x1="120" y1="130" x2="120" y2="165" />
          <line x1="120" y1="130" x2="150" y2="130" />
          <line x1="120" y1="165" x2="150" y2="165" />
          <line x1="80" y1="150" x2="80" y2="190" />
          <line x1="64" y1="190" x2="96" y2="190" />
          <line x1="64" y1="198" x2="96" y2="198" />
          <line x1="80" y1="198" x2="80" y2="240" />
          {#if useDiode}
            <polyline points="80,95 45,95 45,112" />
            <polygon points="38,112 52,112 45,124" />
            <line x1="38" y1="124" x2="52" y2="124" />
            <polyline points="45,124 45,150 80,150" />
          {/if}
        {:else}
          <line x1="80" y1="20" x2="80" y2="40" />
          <rect x="74" y="40" width="12" height="45" />
          <line x1="80" y1="85" x2="80" y2="175" />
          <polyline points="80,115 120,115" />
          <line x1="120" y1="95" x2="120" y2="130" />
          <line x1="120" y1="95" x2="150" y2="95" />
          <line x1="120" y1="130" x2="150" y2="130" />
          <line x1="64" y1="175" x2="96" y2="175" />
          <line x1="64" y1="183" x2="96" y2="183" />
          <line x1="80" y1="183" x2="80" y2="240" />
          <polyline points="150,165 135,165 135,188" />
          <line x1="135" y1="222" x2="135" y2="240" />
        {/if}
      </g>

      <g fill="currentColor">
        {#if mode === "astable"}
          <circle cx="80" cy="95" r="2.5" />
          <circle cx="80" cy="150" r="2.5" />
          <circle cx="120" cy="150" r="2.5" />
        {:else}
          <circle cx="80" cy="115" r="2.5" />
          <circle cx="120" cy="115" r="2.5" />
        {/if}
      </g>

      {#if mode === "astable"}
        <rect x="64" y="190.5" width={32 * current.v} height="7" fill={COLOR_VC} opacity="0.75" />
      {:else}
        <rect x="64" y="175.5" width={32 * current.v} height="7" fill={COLOR_VC} opacity="0.75" />
      {/if}

      <g stroke={COLOR_CURRENT} stroke-width="3" fill="none" stroke-dasharray="3 9" stroke-dashoffset={flowOffset} stroke-linecap="round" opacity="0.9">
        {#if playing}
          {#if mode === "astable"}
            {#if current.charging}
              <path d={useDiode ? "M80,20 V95 H45 V150 H80 V190" : "M80,20 V190"} />
            {:else}
              <path d="M80,20 V95 H150" />
              <path d="M80,190 V95" />
            {/if}
          {:else if current.out}
            <path d="M80,20 V175" />
          {/if}
          {#if current.out}
            <path d="M250,130 H300 V240" />
          {/if}
        {/if}
      </g>

      <rect x="150" y="70" width="100" height="120" class="fill-(--color-bg-alt)" stroke="currentColor" stroke-width="2" />
      <g font-size="9" font-family="ui-monospace, monospace" fill="currentColor">
        <text x="200" y="117" text-anchor="middle" font-size="13" font-weight="bold">NE555</text>
        <text x="156" y="98" fill={!current.out ? COLOR_CURRENT : "currentColor"}>7 DIS</text>
        <text x="156" y="133">6 THR</text>
        <text x="156" y="168">2 TRIG</text>
        <text x="244" y="133" text-anchor="end" fill={current.out ? COLOR_OUT : "currentColor"}>OUT 3</text>
        <text x="180" y="82" text-anchor="middle">8</text>
        <text x="220" y="82" text-anchor="middle">4</text>
        <text x="200" y="184" text-anchor="middle">1</text>
        <text x="34" y="14">+{vcc} V</text>
        <text x="34" y="254">GND</text>
        {#if mode === "astable"}
          <text x="92" y="62">R1</text>
          <text x="92" y="127">R2</text>
          <text x="100" y="198">C</text>
          {#if useDiode}<text x="24" y="122">D</text>{/if}
        {:else}
          <text x="92" y="66">R</text>
          <text x="100" y="183">C</text>
        {/if}
        <text x="312" y="158">R</text>
      </g>

      <circle cx="300" cy="200" r="16" fill={COLOR_LED} filter="url(#led-glow)" opacity={current.out ? 0.9 : 0} />
      <circle cx="300" cy="200" r="10" fill={COLOR_LED} opacity={current.out ? 1 : 0.18} stroke={COLOR_LED} stroke-width="1.5" />
      <circle cx="296" cy="196" r="3" fill="white" opacity={current.out ? 0.7 : 0.15} />

      {#if mode === "monostable"}
        <g
          role="button"
          tabindex="0"
          aria-label="Trigger"
          class="cursor-pointer"
          onclick={() => fireTrigger(true)}
          onkeydown={(event) => (event.key === "Enter" || event.key === " ") && fireTrigger(true)}
        >
          <rect x="110" y="186" width="40" height="40" fill="transparent" />
          <circle cx="135" cy="190" r="2.5" fill="currentColor" />
          <circle cx="135" cy="220" r="2.5" fill="currentColor" />
          <line x1={triggerPressed ? 133 : 125} y1="186" x2={triggerPressed ? 133 : 125} y2="224" stroke={COLOR_CURRENT} stroke-width="2.5" stroke-linecap="round" />
          <line x1={triggerPressed ? 133 : 125} y1="205" x2="114" y2="205" stroke={COLOR_CURRENT} stroke-width="2.5" stroke-linecap="round" />
          <text x="104" y="234" font-size="8" font-family="ui-monospace, monospace" fill={COLOR_CURRENT}>PUSH</text>
        </g>
      {/if}
    </svg>

    <div class="flex md:flex-col gap-4">
      <div class="flex gap-3">
        <div class="relative w-6 h-40 border border-(--color-border) bg-(--color-bg)">
          <div class="absolute bottom-0 left-0 right-0" style="height: {current.v * 100}%; background: {COLOR_VC}; opacity: 0.8;"></div>
          <div class="absolute left-0 right-0 border-t border-dashed border-(--color-text-muted)" style="bottom: 66.67%;"></div>
          <div class="absolute left-0 right-0 border-t border-dashed border-(--color-text-muted)" style="bottom: 33.33%;"></div>
        </div>
        <div class="relative h-40 w-12 text-[10px] font-mono whitespace-nowrap text-(--color-text-light)">
          <span class="absolute" style="bottom: calc(66.67% - 6px);">⅔ Vcc</span>
          <span class="absolute" style="bottom: calc(33.33% - 6px);">⅓ Vcc</span>
        </div>
      </div>
      <div class="flex-1 space-y-2 text-sm">
        <div>
          <div class="text-xs uppercase tracking-wider text-(--color-text-light)">Vc</div>
          <div class="font-mono text-lg" style="color: {COLOR_VC};">{(current.v * vcc).toFixed(2)} V</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider text-(--color-text-light)">Output</div>
          <div class="font-mono text-lg" style="color: {current.out ? COLOR_OUT : 'var(--color-text-muted)'};">{current.out ? "HIGH" : "LOW"}</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider text-(--color-text-light)">{mode === "astable" ? "State" : "Pulses"}</div>
          <div class="font-mono text-(--color-text)">
            {#if mode === "astable"}
              {current.charging ? "Charging" : "Discharging"} · #{current.cycle}
            {:else}
              {current.out ? "Timing…" : "Idle"} · {current.cycle}
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="px-4">
    <svg viewBox="0 0 {SCOPE_WIDTH} 240" class="w-full bg-[#07110c] border border-[#1c3326]" aria-label="Oscilloscope">
      {#each Array.from({ length: 11 }, (_, index) => index) as index (index)}
        <line x1={index * 60} y1="0" x2={index * 60} y2="240" stroke="#1c3326" stroke-width="1" />
      {/each}
      {#each Array.from({ length: 9 }, (_, index) => index) as index (index)}
        <line x1="0" y1={index * 30} x2={SCOPE_WIDTH} y2={index * 30} stroke="#1c3326" stroke-width="1" />
      {/each}
      <line x1="0" y1={yVc(2 / 3)} x2={SCOPE_WIDTH} y2={yVc(2 / 3)} stroke={COLOR_VC} stroke-dasharray="4 6" opacity="0.35" />
      <line x1="0" y1={yVc(1 / 3)} x2={SCOPE_WIDTH} y2={yVc(1 / 3)} stroke={COLOR_VC} stroke-dasharray="4 6" opacity="0.35" />

      {#each triggerMarkers as x, index (index)}
        <line x1={x} y1="0" x2={x} y2="240" stroke={COLOR_CURRENT} stroke-dasharray="2 4" opacity="0.7" />
        <text x={x + 3} y="236" font-size="9" font-family="ui-monospace, monospace" fill={COLOR_CURRENT}>TRIG</text>
      {/each}

      <path d={traces.vc} stroke={COLOR_VC} stroke-width="2" fill="none" style="filter: drop-shadow(0 0 3px {COLOR_VC});" />
      <path d={traces.out} stroke={COLOR_OUT} stroke-width="2" fill="none" style="filter: drop-shadow(0 0 3px {COLOR_OUT});" />
      <circle cx={SCOPE_WIDTH} cy={yVc(current.v)} r="4" fill={COLOR_VC} />
      <circle cx={SCOPE_WIDTH} cy={yOut(current.out)} r="4" fill={COLOR_OUT} />

      <g font-size="10" font-family="ui-monospace, monospace">
        <text x="6" y="14" fill={COLOR_VC}>CH1 Vc</text>
        <text x="6" y="157" fill={COLOR_OUT}>CH2 OUT</text>
        <text x="540" y={yVc(2 / 3) - 4} fill={COLOR_VC} opacity="0.6">⅔</text>
        <text x="540" y={yVc(1 / 3) - 4} fill={COLOR_VC} opacity="0.6">⅓</text>
        <text x={SCOPE_WIDTH - 6} y="14" text-anchor="end" fill="#6b8f7a">{formatSI(windowSpan / 10, "s", 3)}/div</text>
      </g>
    </svg>
  </div>

  <div class="flex flex-wrap items-center gap-3 p-4">
    <button class={buttonClass} onclick={() => (playing = !playing)}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
    <button class={buttonClass} onclick={restart}>↺ Restart</button>
    {#if mode === "monostable"}
      <button class="px-3 py-1 text-sm font-medium bg-(--color-text) text-(--color-btn-text) hover:opacity-90" onclick={() => fireTrigger(true)}>
        ⚡ Trigger
      </button>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={autoTrigger} class="w-4 h-4 accent-(--color-text)" />
        <span class="text-sm text-(--color-text-muted)">Auto</span>
      </label>
    {/if}
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each SPEEDS as item (item)}
        <button
          class="px-2 py-0.5 text-xs font-mono transition-colors {!useRealTime && speedFactor === item
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => {
            speedFactor = item;
            realTime = false;
          }}
        >
          {item}×
        </button>
      {/each}
      <button
        class="px-2 py-0.5 text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed {useRealTime
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        disabled={!realTimeAllowed}
        title={realTimeAllowed ? "Run at the actual circuit speed" : "Too fast to see in real time (> 30 Hz)"}
        onclick={() => (realTime = true)}
      >
        Real
      </button>
    </div>
    <label class="flex items-center gap-2 text-sm text-(--color-text-muted)">
      Vcc
      <input type="range" min="5" max="15" step="0.5" bind:value={vcc} class="w-24 accent-(--color-text)" />
      <span class="font-mono text-(--color-text) w-12">{vcc} V</span>
    </label>
  </div>
</div>
