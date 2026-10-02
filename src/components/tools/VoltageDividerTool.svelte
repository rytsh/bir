<script lang="ts">
  import { E_SERIES, formatSI, nearestStandard, parseSI, seriesValues, type ESeries } from "../../lib/electronics.js";

  type Mode = "output" | "r2" | "pair";

  interface PairSuggestion {
    r1: number;
    r2: number;
    vout: number;
    errorPct: number;
    current: number;
  }

  let mode = $state<Mode>("output");
  let vinInput = $state("12");
  let voutInput = $state("3.3");
  let r1Input = $state("10k");
  let r2Input = $state("3.9k");
  let loadInput = $state("");
  let series = $state<ESeries>("E24");
  let minTotalInput = $state("1k");
  let maxTotalInput = $state("1M");

  let vin = $derived(parseSI(vinInput));
  let vout = $derived(parseSI(voutInput));
  let r1 = $derived(parseSI(r1Input));
  let r2 = $derived(parseSI(r2Input));
  let load = $derived(parseSI(loadInput));

  const parallel = (a: number, b: number): number => (a * b) / (a + b);

  let outputResult = $derived.by(() => {
    if (vin === null || r1 === null || r2 === null || r1 <= 0 || r2 <= 0) return null;
    const effectiveR2 = load !== null && load > 0 ? parallel(r2, load) : r2;
    const voutCalc = (vin * effectiveR2) / (r1 + effectiveR2);
    const current = vin / (r1 + effectiveR2);
    return {
      vout: voutCalc,
      unloaded: (vin * r2) / (r1 + r2),
      ratio: effectiveR2 / (r1 + effectiveR2),
      current,
      p1: current * current * r1,
      p2: (voutCalc * voutCalc) / r2,
      outputImpedance: parallel(r1, r2),
    };
  });

  let r2Result = $derived.by(() => {
    if (vin === null || vout === null || r1 === null || r1 <= 0) return { error: "" };
    if (vout <= 0 || vout >= vin) return { error: "Vout must be between 0 and Vin" };
    const exact = (vout * r1) / (vin - vout);
    const standard = nearestStandard(exact, series) ?? exact;
    const actual = (vin * standard) / (r1 + standard);
    return { error: "", exact, standard, actual, errorPct: ((actual - vout) / vout) * 100 };
  });

  let pairResult = $derived.by((): { error: string; pairs: PairSuggestion[] } => {
    if (vin === null || vout === null) return { error: "", pairs: [] };
    if (vout <= 0 || vout >= vin) return { error: "Vout must be between 0 and Vin", pairs: [] };
    const minTotal = parseSI(minTotalInput) ?? 1e3;
    const maxTotal = parseSI(maxTotalInput) ?? 1e6;
    const values = seriesValues(series, 0, 7);
    const ratio = vout / vin;
    const pairs: PairSuggestion[] = [];
    for (const candidateR2 of values) {
      const idealR1 = (candidateR2 * (1 - ratio)) / ratio;
      const candidateR1 = nearestStandard(idealR1, series);
      if (!candidateR1) continue;
      const total = candidateR1 + candidateR2;
      if (total < minTotal || total > maxTotal) continue;
      const actual = (vin * candidateR2) / total;
      pairs.push({
        r1: candidateR1,
        r2: candidateR2,
        vout: actual,
        errorPct: ((actual - vout) / vout) * 100,
        current: vin / total,
      });
    }
    pairs.sort((a, b) => Math.abs(a.errorPct) - Math.abs(b.errorPct) || a.current - b.current);
    const unique = pairs.filter(
      (pair, index) => pairs.findIndex((other) => other.r1 === pair.r1 && other.r2 === pair.r2) === index,
    );
    return { error: "", pairs: unique.slice(0, 12) };
  });

  const useSuggestion = (pair: PairSuggestion): void => {
    r1Input = formatSI(pair.r1, "").replace(" ", "");
    r2Input = formatSI(pair.r2, "").replace(" ", "");
    mode = "output";
  };

  const MODES: { id: Mode; label: string }[] = [
    { id: "output", label: "Find Vout" },
    { id: "r2", label: "Find R2" },
    { id: "pair", label: "Suggest R1/R2 Pairs" },
  ];

  const inputClass =
    "w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
</script>

<div class="h-full flex flex-col max-w-5xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate resistive voltage divider output, solve for a missing resistor, or find the best standard E-series resistor pairs for a target voltage. Includes optional load resistance and power dissipation.
    </p>
  </header>

  <div class="mb-4 p-1 bg-(--color-border) inline-flex gap-1 self-start">
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

  <div class="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
    <div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <label class="block">
          <span class={labelClass}>Vin (V)</span>
          <input type="text" bind:value={vinInput} class={inputClass} />
        </label>
        {#if mode !== "output"}
          <label class="block">
            <span class={labelClass}>Target Vout (V)</span>
            <input type="text" bind:value={voutInput} class={inputClass} />
          </label>
        {/if}
        {#if mode !== "pair"}
          <label class="block">
            <span class={labelClass}>R1 (Ω) — top</span>
            <input type="text" bind:value={r1Input} class={inputClass} />
          </label>
        {/if}
        {#if mode === "output"}
          <label class="block">
            <span class={labelClass}>R2 (Ω) — bottom</span>
            <input type="text" bind:value={r2Input} class={inputClass} />
          </label>
          <label class="block">
            <span class={labelClass}>Load (Ω, optional)</span>
            <input type="text" bind:value={loadInput} placeholder="∞ (no load)" class={inputClass} />
          </label>
        {/if}
        {#if mode !== "output"}
          <label class="block">
            <span class={labelClass}>E-Series</span>
            <select bind:value={series} class={inputClass}>
              {#each E_SERIES as item (item)}
                <option value={item}>{item}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if mode === "pair"}
          <label class="block">
            <span class={labelClass}>Min R1 + R2 (Ω)</span>
            <input type="text" bind:value={minTotalInput} class={inputClass} />
          </label>
          <label class="block">
            <span class={labelClass}>Max R1 + R2 (Ω)</span>
            <input type="text" bind:value={maxTotalInput} class={inputClass} />
          </label>
        {/if}
      </div>

      {#if mode === "output"}
        {#if outputResult}
          <div class="border border-(--color-text) bg-(--color-bg-alt) p-4 mb-4">
            <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Vout</div>
            <div class="text-3xl font-mono text-(--color-text)">{formatSI(outputResult.vout, "V")}</div>
            {#if load !== null && load > 0}
              <div class="mt-1 text-xs text-(--color-text-muted)">
                Unloaded: {formatSI(outputResult.unloaded, "V")} · Drop due to load: {(
                  ((outputResult.unloaded - outputResult.vout) / outputResult.unloaded) *
                  100
                ).toFixed(2)} %
              </div>
            {/if}
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) divide-y divide-(--color-border)">
            {#each [
              { label: "Ratio (Vout / Vin)", value: outputResult.ratio.toFixed(5) },
              { label: "Divider current", value: formatSI(outputResult.current, "A") },
              { label: "Power in R1", value: formatSI(outputResult.p1, "W") },
              { label: "Power in R2", value: formatSI(outputResult.p2, "W") },
              { label: "Output impedance (R1 ∥ R2)", value: formatSI(outputResult.outputImpedance, "Ω") },
            ] as row (row.label)}
              <div class="flex justify-between px-4 py-2 text-sm">
                <span class="text-(--color-text-muted)">{row.label}</span>
                <span class="font-mono text-(--color-text)">{row.value}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-(--color-text-muted)">Enter Vin, R1, and R2 to calculate.</p>
        {/if}
      {:else if mode === "r2"}
        {#if r2Result.error}
          <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
            {r2Result.error}
          </div>
        {:else if r2Result.exact !== undefined}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
              <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Exact R2</div>
              <div class="text-2xl font-mono text-(--color-text)">{formatSI(r2Result.exact, "Ω")}</div>
            </div>
            <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
              <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Nearest {series}</div>
              <div class="text-2xl font-mono text-(--color-text)">{formatSI(r2Result.standard!, "Ω", 3)}</div>
              <div class="mt-1 text-xs text-(--color-text-muted)">
                Vout = {formatSI(r2Result.actual!, "V")} ({r2Result.errorPct! >= 0 ? "+" : ""}{r2Result.errorPct!.toFixed(2)} %)
              </div>
            </div>
          </div>
        {/if}
      {:else}
        {#if pairResult.error}
          <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
            {pairResult.error}
          </div>
        {:else if pairResult.pairs.length > 0}
          <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-(--color-border) text-xs uppercase tracking-wider text-(--color-text-light)">
                  <th class="px-3 py-2 text-left font-medium">R1</th>
                  <th class="px-3 py-2 text-left font-medium">R2</th>
                  <th class="px-3 py-2 text-left font-medium">Vout</th>
                  <th class="px-3 py-2 text-left font-medium">Error</th>
                  <th class="px-3 py-2 text-left font-medium">Current</th>
                  <th class="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {#each pairResult.pairs as pair (`${pair.r1}-${pair.r2}`)}
                  <tr class="border-b border-(--color-border) last:border-b-0">
                    <td class="px-3 py-1.5 font-mono text-(--color-text)">{formatSI(pair.r1, "Ω", 3)}</td>
                    <td class="px-3 py-1.5 font-mono text-(--color-text)">{formatSI(pair.r2, "Ω", 3)}</td>
                    <td class="px-3 py-1.5 font-mono text-(--color-text)">{formatSI(pair.vout, "V")}</td>
                    <td class="px-3 py-1.5 font-mono text-(--color-text-muted)">
                      {pair.errorPct >= 0 ? "+" : ""}{pair.errorPct.toFixed(3)} %
                    </td>
                    <td class="px-3 py-1.5 font-mono text-(--color-text-muted)">{formatSI(pair.current, "A", 3)}</td>
                    <td class="px-3 py-1.5 text-right">
                      <button
                        onclick={() => useSuggestion(pair)}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                      >
                        Use
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="text-sm text-(--color-text-muted)">No pairs found in the given total resistance range.</p>
        {/if}
      {/if}
    </div>

    <!-- Schematic -->
    <div class="hidden lg:block">
      <svg viewBox="0 0 200 300" class="w-full text-(--color-text)" aria-label="Voltage divider schematic">
        <g stroke="currentColor" stroke-width="2" fill="none">
          <line x1="100" y1="20" x2="100" y2="60" />
          <rect x="85" y="60" width="30" height="70" />
          <line x1="100" y1="130" x2="100" y2="170" />
          <rect x="85" y="170" width="30" height="70" />
          <line x1="100" y1="240" x2="100" y2="270" />
          <line x1="80" y1="270" x2="120" y2="270" />
          <line x1="88" y1="278" x2="112" y2="278" />
          <line x1="96" y1="286" x2="104" y2="286" />
          <line x1="100" y1="150" x2="160" y2="150" />
        </g>
        <circle cx="100" cy="20" r="4" fill="currentColor" />
        <circle cx="100" cy="150" r="4" fill="currentColor" />
        <circle cx="160" cy="150" r="4" fill="currentColor" />
        <g fill="currentColor" font-family="monospace" font-size="13">
          <text x="110" y="24">Vin</text>
          <text x="40" y="100">R1</text>
          <text x="40" y="210">R2</text>
          <text x="140" y="140">Vout</text>
        </g>
      </svg>
      <p class="text-xs font-mono text-center text-(--color-text-muted) mt-2">Vout = Vin × R2 / (R1 + R2)</p>
    </div>
  </div>
</div>
