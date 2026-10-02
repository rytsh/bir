<script lang="ts">
  import { E_SERIES, formatSI, nearestStandard, parseSI, type ESeries } from "../../../lib/electronics.js";
  import Timer555Simulation from "./Timer555Simulation.svelte";

  type Mode = "astable" | "monostable" | "design";

  const LN2 = Math.LN2;

  let mode = $state<Mode>("astable");
  let r1Input = $state("1k");
  let r2Input = $state("10k");
  let cInput = $state("10µ");
  let rMonoInput = $state("100k");
  let cMonoInput = $state("10µ");
  let targetFreqInput = $state("1k");
  let targetDutyInput = $state("60");
  let designCInput = $state("10n");
  let series = $state<ESeries>("E12");
  let useDiode = $state(false);

  let r1 = $derived(parseSI(r1Input));
  let r2 = $derived(parseSI(r2Input));
  let c = $derived(parseSI(cInput));
  let rMono = $derived(parseSI(rMonoInput));
  let cMono = $derived(parseSI(cMonoInput));

  const formatTime = (seconds: number): string => formatSI(seconds, "s");

  let astable = $derived.by(() => {
    if (r1 === null || r2 === null || c === null || r1 <= 0 || r2 <= 0 || c <= 0) return null;
    const high = LN2 * (useDiode ? r1 : r1 + r2) * c;
    const low = LN2 * r2 * c;
    const period = high + low;
    return {
      high,
      low,
      period,
      frequency: 1 / period,
      duty: (high / period) * 100,
    };
  });

  let monostable = $derived.by(() => {
    if (rMono === null || cMono === null || rMono <= 0 || cMono <= 0) return null;
    return { width: 1.1 * rMono * cMono };
  });

  let design = $derived.by(() => {
    const frequency = parseSI(targetFreqInput);
    const duty = parseFloat(targetDutyInput);
    const capacitor = parseSI(designCInput);
    if (frequency === null || capacitor === null || !(frequency > 0) || !(capacitor > 0) || isNaN(duty)) return null;
    if (duty <= 0 || duty >= 100) return { error: "Duty cycle must be between 0 and 100 %" };
    if (!useDiode && duty <= 50) {
      return { error: "Without a bypass diode, the 555 astable duty cycle must be above 50 %. Enable the diode option for ≤ 50 %." };
    }
    const period = 1 / frequency;
    const high = period * (duty / 100);
    const low = period - high;
    const r2Exact = low / (LN2 * capacitor);
    const r1Exact = useDiode ? high / (LN2 * capacitor) : high / (LN2 * capacitor) - r2Exact;
    if (r1Exact <= 0) return { error: "Cannot reach this duty cycle with the given values" };
    const r1Std = nearestStandard(r1Exact, series) ?? r1Exact;
    const r2Std = nearestStandard(r2Exact, series) ?? r2Exact;
    const actualHigh = LN2 * (useDiode ? r1Std : r1Std + r2Std) * capacitor;
    const actualLow = LN2 * r2Std * capacitor;
    const actualPeriod = actualHigh + actualLow;
    const warnings: string[] = [];
    if (r1Std < 1e3) warnings.push("R1 below 1 kΩ draws high discharge current; choose a smaller capacitor.");
    if (r1Std + r2Std > 10e6) warnings.push("Total resistance above ~10 MΩ is unreliable; choose a larger capacitor.");
    return {
      error: "",
      r1Exact,
      r2Exact,
      r1Std,
      r2Std,
      frequency: 1 / actualPeriod,
      duty: (actualHigh / actualPeriod) * 100,
      warnings,
    };
  });

  const useDesign = (): void => {
    if (!design || design.error || design.r1Std === undefined) return;
    r1Input = formatSI(design.r1Std, "").replace(" ", "");
    r2Input = formatSI(design.r2Std!, "").replace(" ", "");
    cInput = designCInput;
    mode = "astable";
  };

  const MODES: { id: Mode; label: string }[] = [
    { id: "astable", label: "Astable" },
    { id: "monostable", label: "Monostable" },
    { id: "design", label: "Design from Frequency" },
  ];

  const inputClass =
    "w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
</script>

<div class="h-full flex flex-col max-w-4xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate NE555 timer frequency, period, and duty cycle in astable mode, pulse width in monostable mode, or design R1/R2 from a target frequency and duty cycle with standard E-series values.
    </p>
  </header>

  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each MODES as item (item.id)}
        <button
          class="px-3 py-1 text-sm font-medium transition-colors {mode === item.id
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (mode = item.id)}
        >
          {item.label}
        </button>
      {/each}
    </div>
    {#if mode !== "monostable"}
      <label class="flex items-center gap-2 cursor-pointer" title="A diode across R2 bypasses it during charging, allowing duty cycles ≤ 50 %">
        <input type="checkbox" bind:checked={useDiode} class="w-4 h-4 accent-(--color-text)" />
        <span class="text-sm text-(--color-text-muted)">Bypass diode across R2</span>
      </label>
    {/if}
  </div>

  {#if mode === "astable"}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <label class="block">
        <span class={labelClass}>R1 (Ω)</span>
        <input type="text" bind:value={r1Input} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>R2 (Ω)</span>
        <input type="text" bind:value={r2Input} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>C (F)</span>
        <input type="text" bind:value={cInput} class={inputClass} />
      </label>
    </div>

    {#if astable}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Frequency</div>
          <div class="text-3xl font-mono text-(--color-text)">{formatSI(astable.frequency, "Hz")}</div>
        </div>
        <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Duty Cycle</div>
          <div class="text-3xl font-mono text-(--color-text)">{astable.duty.toFixed(2)} %</div>
        </div>
      </div>
      <div class="border border-(--color-border) bg-(--color-bg-alt) divide-y divide-(--color-border) mb-4">
        {#each [
          { label: "Period (T)", value: formatTime(astable.period) },
          { label: "High time (t₁)", value: formatTime(astable.high) },
          { label: "Low time (t₂)", value: formatTime(astable.low) },
        ] as row (row.label)}
          <div class="flex justify-between px-4 py-2 text-sm">
            <span class="text-(--color-text-muted)">{row.label}</span>
            <span class="font-mono text-(--color-text)">{row.value}</span>
          </div>
        {/each}
      </div>
      <Timer555Simulation mode="astable" tauCharge={(useDiode ? r1! : r1! + r2!) * c!} tauDischarge={r2! * c!} {useDiode} />
      <p class="text-xs font-mono text-(--color-text-light)">
        t₁ = 0.693 × ({useDiode ? "R1" : "R1 + R2"}) × C · t₂ = 0.693 × R2 × C · f = 1 / (t₁ + t₂)
      </p>
    {:else}
      <p class="text-sm text-(--color-text-muted)">Enter R1, R2, and C (e.g. 1k, 10k, 10µ).</p>
    {/if}
  {:else if mode === "monostable"}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <label class="block">
        <span class={labelClass}>R (Ω)</span>
        <input type="text" bind:value={rMonoInput} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>C (F)</span>
        <input type="text" bind:value={cMonoInput} class={inputClass} />
      </label>
    </div>
    {#if monostable}
      <div class="border border-(--color-text) bg-(--color-bg-alt) p-4 mb-3">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Output Pulse Width</div>
        <div class="text-3xl font-mono text-(--color-text)">{formatTime(monostable.width)}</div>
      </div>
      <Timer555Simulation mode="monostable" tauCharge={rMono! * cMono!} />
      <p class="text-xs font-mono text-(--color-text-light)">t = 1.1 × R × C</p>
    {:else}
      <p class="text-sm text-(--color-text-muted)">Enter R and C.</p>
    {/if}
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
      <label class="block">
        <span class={labelClass}>Frequency (Hz)</span>
        <input type="text" bind:value={targetFreqInput} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>Duty (%)</span>
        <input type="text" bind:value={targetDutyInput} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>C (F)</span>
        <input type="text" bind:value={designCInput} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>E-Series</span>
        <select bind:value={series} class={inputClass}>
          {#each E_SERIES as item (item)}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if design?.error}
      <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
        {design.error}
      </div>
    {:else if design && design.r1Std !== undefined}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">R1 ({series})</div>
          <div class="text-3xl font-mono text-(--color-text)">{formatSI(design.r1Std, "Ω", 3)}</div>
          <div class="mt-1 text-xs text-(--color-text-muted)">Exact: {formatSI(design.r1Exact!, "Ω")}</div>
        </div>
        <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">R2 ({series})</div>
          <div class="text-3xl font-mono text-(--color-text)">{formatSI(design.r2Std!, "Ω", 3)}</div>
          <div class="mt-1 text-xs text-(--color-text-muted)">Exact: {formatSI(design.r2Exact!, "Ω")}</div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4 mb-3 text-sm">
        <span class="text-(--color-text-muted)">
          With standard values: <span class="font-mono text-(--color-text)">{formatSI(design.frequency!, "Hz")}</span>,
          <span class="font-mono text-(--color-text)">{design.duty!.toFixed(2)} %</span> duty
        </span>
        <button
          onclick={useDesign}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Open in Astable →
        </button>
      </div>
      {#each design.warnings ?? [] as warning (warning)}
        <p class="text-xs text-(--color-error-text)">⚠ {warning}</p>
      {/each}
    {:else}
      <p class="text-sm text-(--color-text-muted)">Enter the target frequency, duty cycle, and a capacitor value.</p>
    {/if}
  {/if}
</div>
