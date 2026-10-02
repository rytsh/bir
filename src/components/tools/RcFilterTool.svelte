<script lang="ts">
  import { E_SERIES, formatSI, nearestStandard, parseSI, type ESeries } from "../../lib/electronics.js";

  type FilterType = "rc" | "rl" | "lc";
  type Mode = "frequency" | "component";
  type Response = "lowpass" | "highpass";

  let filterType = $state<FilterType>("rc");
  let response = $state<Response>("lowpass");
  let mode = $state<Mode>("frequency");
  let rInput = $state("10k");
  let cInput = $state("10n");
  let lInput = $state("10m");
  let targetFreqInput = $state("1k");
  let solveFor = $state<"r" | "c" | "l">("c");
  let series = $state<ESeries>("E12");

  let r = $derived(parseSI(rInput));
  let c = $derived(parseSI(cInput));
  let l = $derived(parseSI(lInput));
  let targetFreq = $derived(parseSI(targetFreqInput));

  const TWO_PI = 2 * Math.PI;

  let cutoff = $derived.by((): number | null => {
    if (filterType === "rc") return r && c && r > 0 && c > 0 ? 1 / (TWO_PI * r * c) : null;
    if (filterType === "rl") return r && l && r > 0 && l > 0 ? r / (TWO_PI * l) : null;
    return l && c && l > 0 && c > 0 ? 1 / (TWO_PI * Math.sqrt(l * c)) : null;
  });

  let timeConstant = $derived.by((): number | null => {
    if (filterType === "rc" && r && c) return r * c;
    if (filterType === "rl" && r && l) return l / r;
    return null;
  });

  let solved = $derived.by(() => {
    if (!targetFreq || targetFreq <= 0) return null;
    if (filterType === "rc") {
      if (solveFor === "c" && r && r > 0) {
        const exact = 1 / (TWO_PI * targetFreq * r);
        const standard = nearestStandard(exact * 1e12, series)! * 1e-12;
        return { label: "C", unit: "F", exact, standard, actualFreq: 1 / (TWO_PI * r * standard) };
      }
      if (solveFor === "r" && c && c > 0) {
        const exact = 1 / (TWO_PI * targetFreq * c);
        const standard = nearestStandard(exact, series)!;
        return { label: "R", unit: "Ω", exact, standard, actualFreq: 1 / (TWO_PI * standard * c) };
      }
    }
    if (filterType === "rl") {
      if (solveFor === "l" && r && r > 0) {
        const exact = r / (TWO_PI * targetFreq);
        return { label: "L", unit: "H", exact, standard: exact, actualFreq: targetFreq };
      }
      if (solveFor === "r" && l && l > 0) {
        const exact = TWO_PI * targetFreq * l;
        const standard = nearestStandard(exact, series)!;
        return { label: "R", unit: "Ω", exact, standard, actualFreq: standard / (TWO_PI * l) };
      }
    }
    if (filterType === "lc") {
      if (solveFor === "c" && l && l > 0) {
        const exact = 1 / (Math.pow(TWO_PI * targetFreq, 2) * l);
        const standard = nearestStandard(exact * 1e12, series)! * 1e-12;
        return { label: "C", unit: "F", exact, standard, actualFreq: 1 / (TWO_PI * Math.sqrt(l * standard)) };
      }
      if (solveFor === "l" && c && c > 0) {
        const exact = 1 / (Math.pow(TWO_PI * targetFreq, 2) * c);
        return { label: "L", unit: "H", exact, standard: exact, actualFreq: targetFreq };
      }
    }
    return null;
  });

  $effect(() => {
    const allowed: Record<FilterType, ("r" | "c" | "l")[]> = { rc: ["r", "c"], rl: ["r", "l"], lc: ["l", "c"] };
    if (!allowed[filterType].includes(solveFor)) solveFor = allowed[filterType][1];
  });

  let displayCutoff = $derived(mode === "frequency" ? cutoff : solved?.actualFreq ?? null);

  const gainDb = (frequency: number, fc: number): number => {
    const ratio = frequency / fc;
    if (filterType === "lc") {
      const q = 0.707;
      const real = 1 - ratio * ratio;
      const imag = ratio / q;
      const magnitude = response === "lowpass" ? 1 / Math.hypot(real, imag) : (ratio * ratio) / Math.hypot(real, imag);
      return 20 * Math.log10(magnitude);
    }
    const magnitude = response === "lowpass" ? 1 / Math.sqrt(1 + ratio * ratio) : ratio / Math.sqrt(1 + ratio * ratio);
    return 20 * Math.log10(magnitude);
  };

  const phaseDeg = (frequency: number, fc: number): number => {
    const ratio = frequency / fc;
    if (filterType === "lc") {
      const phase = -Math.atan2(ratio / 0.707, 1 - ratio * ratio) * (180 / Math.PI);
      return response === "lowpass" ? phase : phase + 180;
    }
    const phase = -Math.atan(ratio) * (180 / Math.PI);
    return response === "lowpass" ? phase : phase + 90;
  };

  const PLOT_WIDTH = 560;
  const PLOT_HEIGHT = 220;

  let plot = $derived.by(() => {
    if (!displayCutoff) return null;
    const fc = displayCutoff;
    const minExp = Math.floor(Math.log10(fc)) - 2;
    const maxExp = minExp + 5;
    const points: string[] = [];
    const steps = 200;
    const dbMin = -60;
    for (let index = 0; index <= steps; index++) {
      const exponent = minExp + ((maxExp - minExp) * index) / steps;
      const frequency = Math.pow(10, exponent);
      const db = Math.max(dbMin, Math.min(6, gainDb(frequency, fc)));
      const x = (index / steps) * PLOT_WIDTH;
      const y = ((6 - db) / (6 - dbMin)) * PLOT_HEIGHT;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const decades = Array.from({ length: maxExp - minExp + 1 }, (_, index) => minExp + index);
    const fcX = ((Math.log10(fc) - minExp) / (maxExp - minExp)) * PLOT_WIDTH;
    const gridDb = [0, -10, -20, -30, -40, -50, -60].filter((db) => db >= dbMin);
    return { path: points.join(" "), decades, minExp, maxExp, fcX, gridDb, dbMin };
  });

  let table = $derived.by(() => {
    if (!displayCutoff) return [];
    return [0.1, 0.5, 1, 2, 10, 100].map((multiple) => ({
      frequency: displayCutoff! * multiple,
      gain: gainDb(displayCutoff! * multiple, displayCutoff!),
      phase: phaseDeg(displayCutoff! * multiple, displayCutoff!),
    }));
  });

  const inputClass =
    "w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
  const segmentClass = (active: boolean): string =>
    `px-3 py-1 text-sm font-medium transition-colors ${active ? "bg-(--color-text) text-(--color-btn-text)" : "text-(--color-text-muted) hover:text-(--color-text)"}`;
</script>

<div class="h-full flex flex-col max-w-5xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate the cutoff frequency of first-order RC and RL filters and second-order LC filters, or pick a component for a target frequency with standard E-series values. Includes a Bode magnitude plot and attenuation table.
    </p>
  </header>

  <div class="flex flex-wrap gap-3 mb-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each [{ id: "rc", label: "RC" }, { id: "rl", label: "RL" }, { id: "lc", label: "LC" }] as item (item.id)}
        <button class={segmentClass(filterType === item.id)} onclick={() => (filterType = item.id as FilterType)}>{item.label}</button>
      {/each}
    </div>
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each [{ id: "lowpass", label: "Low-pass" }, { id: "highpass", label: "High-pass" }] as item (item.id)}
        <button class={segmentClass(response === item.id)} onclick={() => (response = item.id as Response)}>{item.label}</button>
      {/each}
    </div>
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each [{ id: "frequency", label: "Find fc" }, { id: "component", label: "Find component" }] as item (item.id)}
        <button class={segmentClass(mode === item.id)} onclick={() => (mode = item.id as Mode)}>{item.label}</button>
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
    {#if mode === "component"}
      <label class="block">
        <span class={labelClass}>Target fc (Hz)</span>
        <input type="text" bind:value={targetFreqInput} class={inputClass} />
      </label>
      <label class="block">
        <span class={labelClass}>Solve for</span>
        <select bind:value={solveFor} class={inputClass}>
          {#if filterType !== "lc"}<option value="r">R</option>{/if}
          {#if filterType !== "rl"}<option value="c">C</option>{/if}
          {#if filterType !== "rc"}<option value="l">L</option>{/if}
        </select>
      </label>
    {/if}
    {#if filterType !== "lc" && !(mode === "component" && solveFor === "r")}
      <label class="block">
        <span class={labelClass}>R (Ω)</span>
        <input type="text" bind:value={rInput} class={inputClass} />
      </label>
    {/if}
    {#if filterType !== "rl" && !(mode === "component" && solveFor === "c")}
      <label class="block">
        <span class={labelClass}>C (F)</span>
        <input type="text" bind:value={cInput} class={inputClass} />
      </label>
    {/if}
    {#if filterType !== "rc" && !(mode === "component" && solveFor === "l")}
      <label class="block">
        <span class={labelClass}>L (H)</span>
        <input type="text" bind:value={lInput} class={inputClass} />
      </label>
    {/if}
    {#if mode === "component" && solveFor !== "l"}
      <label class="block">
        <span class={labelClass}>E-Series</span>
        <select bind:value={series} class={inputClass}>
          {#each E_SERIES as item (item)}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  {#if mode === "frequency" && cutoff}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">
          {filterType === "lc" ? "Resonant / cutoff frequency" : "Cutoff frequency (−3 dB)"}
        </div>
        <div class="text-3xl font-mono text-(--color-text)">{formatSI(cutoff, "Hz")}</div>
      </div>
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Angular frequency ω</div>
        <div class="text-2xl font-mono text-(--color-text)">{formatSI(cutoff * TWO_PI, "rad/s")}</div>
      </div>
      {#if timeConstant}
        <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Time constant τ</div>
          <div class="text-2xl font-mono text-(--color-text)">{formatSI(timeConstant, "s")}</div>
          <div class="text-xs text-(--color-text-muted)">5τ (99.3 % settled) = {formatSI(timeConstant * 5, "s")}</div>
        </div>
      {/if}
    </div>
  {:else if mode === "component" && solved}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Exact {solved.label}</div>
        <div class="text-2xl font-mono text-(--color-text)">{formatSI(solved.exact, solved.unit)}</div>
      </div>
      {#if solved.label !== "L"}
        <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Nearest {series}</div>
          <div class="text-2xl font-mono text-(--color-text)">{formatSI(solved.standard, solved.unit, 3)}</div>
          <div class="text-xs text-(--color-text-muted)">
            fc = {formatSI(solved.actualFreq, "Hz")} ({(((solved.actualFreq - targetFreq!) / targetFreq!) * 100).toFixed(2)} %)
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <p class="mb-4 text-sm text-(--color-text-muted)">Enter positive component values (SI prefixes like 10k, 100n, 4.7µ are accepted).</p>
  {/if}

  {#if plot}
    <div class="border border-(--color-border) bg-(--color-bg-alt) p-3 mb-4">
      <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Magnitude Response</div>
      <svg viewBox="-36 -8 {PLOT_WIDTH + 64} {PLOT_HEIGHT + 30}" class="w-full text-(--color-text)" aria-label="Bode magnitude plot">
        {#each plot.gridDb as db (db)}
          {@const y = ((6 - db) / (6 - plot.dbMin)) * PLOT_HEIGHT}
          <line x1="0" x2={PLOT_WIDTH} y1={y} y2={y} stroke="currentColor" stroke-opacity={db === 0 ? 0.35 : 0.1} />
          <text x="-6" y={y + 3} text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.6">{db}</text>
        {/each}
        {#each plot.decades as exponent (exponent)}
          {@const x = ((exponent - plot.minExp) / (plot.maxExp - plot.minExp)) * PLOT_WIDTH}
          <line x1={x} x2={x} y1="0" y2={PLOT_HEIGHT} stroke="currentColor" stroke-opacity="0.1" />
          <text x={x} y={PLOT_HEIGHT + 14} text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.6">
            {formatSI(Math.pow(10, exponent), "Hz", 2).replace(" ", "")}
          </text>
        {/each}
        <line x1={plot.fcX} x2={plot.fcX} y1="0" y2={PLOT_HEIGHT} stroke="currentColor" stroke-dasharray="4 3" stroke-opacity="0.5" />
        <line x1="0" x2={PLOT_WIDTH} y1={((6 + 3) / (6 - plot.dbMin)) * PLOT_HEIGHT} y2={((6 + 3) / (6 - plot.dbMin)) * PLOT_HEIGHT} stroke="#dc2626" stroke-dasharray="2 3" stroke-opacity="0.6" />
        <polyline points={plot.path} fill="none" stroke="currentColor" stroke-width="2" />
        <text x={plot.fcX + 4} y="10" font-size="10" fill="currentColor">fc</text>
        <text x={PLOT_WIDTH} y={((6 + 3) / (6 - plot.dbMin)) * PLOT_HEIGHT - 3} text-anchor="end" font-size="9" fill="#dc2626">−3 dB</text>
      </svg>
      <p class="text-xs text-(--color-text-light) mt-1">
        Rolloff: {filterType === "lc" ? "−40 dB/decade (2nd order, Q ≈ 0.707 shown)" : "−20 dB/decade (1st order)"}
      </p>
    </div>

    <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-(--color-border) text-xs uppercase tracking-wider text-(--color-text-light)">
            <th class="px-3 py-2 text-left font-medium">Frequency</th>
            <th class="px-3 py-2 text-left font-medium">Gain</th>
            <th class="px-3 py-2 text-left font-medium">Vout / Vin</th>
            <th class="px-3 py-2 text-left font-medium">Phase</th>
          </tr>
        </thead>
        <tbody>
          {#each table as row (row.frequency)}
            <tr class="border-b border-(--color-border) last:border-b-0">
              <td class="px-3 py-1.5 font-mono text-(--color-text)">{formatSI(row.frequency, "Hz")}</td>
              <td class="px-3 py-1.5 font-mono text-(--color-text)">{row.gain.toFixed(2)} dB</td>
              <td class="px-3 py-1.5 font-mono text-(--color-text-muted)">{Math.pow(10, row.gain / 20).toFixed(4)}</td>
              <td class="px-3 py-1.5 font-mono text-(--color-text-muted)">{row.phase.toFixed(1)}°</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <p class="mt-3 text-xs font-mono text-(--color-text-light)">
    {filterType === "rc" ? "fc = 1 / (2π R C)" : filterType === "rl" ? "fc = R / (2π L)" : "f₀ = 1 / (2π √(L C))"}
  </p>
</div>
