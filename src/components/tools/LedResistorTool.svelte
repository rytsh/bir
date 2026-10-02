<script lang="ts">
  import {
    E_SERIES,
    formatPowerRating,
    formatSI,
    nearestStandard,
    parseSI,
    recommendedPowerRating,
    type ESeries,
  } from "../../lib/electronics.js";

  type Wiring = "series" | "parallel";

  interface LedPreset {
    name: string;
    color: string;
    forwardVoltage: string;
    current: string;
  }

  const LED_PRESETS: LedPreset[] = [
    { name: "Infrared", color: "#7f1d1d", forwardVoltage: "1.2", current: "20m" },
    { name: "Red", color: "#ef4444", forwardVoltage: "2.0", current: "20m" },
    { name: "Orange", color: "#f97316", forwardVoltage: "2.1", current: "20m" },
    { name: "Yellow", color: "#eab308", forwardVoltage: "2.1", current: "20m" },
    { name: "Green", color: "#22c55e", forwardVoltage: "2.2", current: "20m" },
    { name: "Bright Green", color: "#4ade80", forwardVoltage: "3.0", current: "20m" },
    { name: "Blue", color: "#3b82f6", forwardVoltage: "3.2", current: "20m" },
    { name: "White", color: "#e5e7eb", forwardVoltage: "3.2", current: "20m" },
    { name: "UV", color: "#8b5cf6", forwardVoltage: "3.4", current: "20m" },
    { name: "1W Power LED", color: "#f8fafc", forwardVoltage: "3.3", current: "350m" },
  ];

  let supplyInput = $state("5");
  let forwardInput = $state("2.0");
  let currentInput = $state("20m");
  let ledCount = $state(1);
  let wiring = $state<Wiring>("series");
  let series = $state<ESeries>("E12");
  let selectedPreset = $state("Red");

  let supply = $derived(parseSI(supplyInput));
  let forward = $derived(parseSI(forwardInput));
  let current = $derived(parseSI(currentInput));

  let result = $derived.by(() => {
    if (supply === null || forward === null || current === null) return { error: "Enter valid numbers for all fields" };
    if (supply <= 0 || forward <= 0 || current <= 0) return { error: "All values must be positive" };
    const count = Math.max(1, Math.floor(ledCount || 1));
    const ledDrop = wiring === "series" ? forward * count : forward;
    const totalCurrent = wiring === "series" ? current : current * count;
    const resistorDrop = supply - ledDrop;
    if (resistorDrop <= 0) {
      return {
        error: `Supply voltage (${formatSI(supply, "V")}) must be higher than the LED forward voltage drop (${formatSI(ledDrop, "V")}).${wiring === "series" && count > 1 ? " Use fewer LEDs in series or wire them in parallel." : ""}`,
      };
    }

    const exact = resistorDrop / current;
    const standard = nearestStandard(exact, series, "up") ?? exact;
    const actualCurrent = resistorDrop / standard;
    const resistorPower = resistorDrop * actualCurrent;
    const ledPower = forward * actualCurrent * count;
    const totalPower = supply * actualCurrent * (wiring === "series" ? 1 : count);
    const efficiency = (ledPower / totalPower) * 100;

    return {
      error: "",
      count,
      exact,
      standard,
      actualCurrent,
      resistorDrop,
      resistorPower,
      recommendedRating: recommendedPowerRating(resistorPower),
      ledPower,
      totalPower,
      totalCurrent: wiring === "series" ? actualCurrent : actualCurrent * count,
      efficiency,
      resistorCount: wiring === "series" ? 1 : count,
    };
  });

  const applyPreset = (preset: LedPreset): void => {
    selectedPreset = preset.name;
    forwardInput = preset.forwardVoltage;
    currentInput = preset.current;
  };
</script>

<div class="h-full flex flex-col max-w-4xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate the current-limiting resistor for one or more LEDs. Picks the next higher standard E-series value so the LED is never overdriven, and recommends a resistor power rating with a 2× safety margin.
    </p>
  </header>

  <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">LED Type</h2>
  <div class="flex flex-wrap gap-2 mb-4">
    {#each LED_PRESETS as preset (preset.name)}
      <button
        onclick={() => applyPreset(preset)}
        class="flex items-center gap-2 px-2.5 py-1 text-xs border transition-colors {selectedPreset === preset.name
          ? 'border-(--color-text) text-(--color-text)'
          : 'border-(--color-border) text-(--color-text-muted) hover:border-(--color-text-light)'}"
      >
        <span class="w-3 h-3 rounded-full border border-black/20" style="background: {preset.color}"></span>
        {preset.name}
        <span class="font-mono text-(--color-text-light)">{preset.forwardVoltage}V</span>
      </button>
    {/each}
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
    <label class="block">
      <span class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Supply Voltage (V)</span>
      <input
        type="text"
        bind:value={supplyInput}
        class="w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)"
      />
    </label>
    <label class="block">
      <span class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">LED Forward Voltage (V)</span>
      <input
        type="text"
        bind:value={forwardInput}
        oninput={() => (selectedPreset = "")}
        class="w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)"
      />
    </label>
    <label class="block">
      <span class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">LED Current (A)</span>
      <input
        type="text"
        bind:value={currentInput}
        oninput={() => (selectedPreset = "")}
        placeholder="20m"
        class="w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)"
      />
      {#if current !== null}
        <span class="mt-1 block text-xs text-(--color-text-light)">= {formatSI(current, "A")}</span>
      {/if}
    </label>
  </div>

  <div class="flex flex-wrap items-center gap-4 mb-6">
    <label class="flex items-center gap-2">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">LEDs</span>
      <input
        type="number"
        min="1"
        max="100"
        bind:value={ledCount}
        class="w-20 px-2 py-1 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)"
      />
    </label>
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each [{ id: "series", label: "Series" }, { id: "parallel", label: "Parallel (1 resistor each)" }] as option (option.id)}
        <button
          class="px-3 py-1 text-sm font-medium transition-colors {wiring === option.id
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (wiring = option.id as Wiring)}
        >
          {option.label}
        </button>
      {/each}
    </div>
    <label class="flex items-center gap-2">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Series</span>
      <select
        bind:value={series}
        class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none"
      >
        {#each E_SERIES as item (item)}
          <option value={item}>{item}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if result.error}
    <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {result.error}
    </div>
  {:else if result.standard !== undefined}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <div class="border border-(--color-text) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">
          Standard Resistor ({series}){result.resistorCount! > 1 ? ` × ${result.resistorCount}` : ""}
        </div>
        <div class="text-3xl font-mono text-(--color-text)">{formatSI(result.standard, "Ω", 3)}</div>
        <div class="mt-1 text-xs text-(--color-text-muted)">
          Exact: {formatSI(result.exact!, "Ω")} · Rating: {result.recommendedRating
            ? formatPowerRating(result.recommendedRating)
            : `> ${formatSI(result.resistorPower! * 2, "W")}`} or higher
        </div>
      </div>
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Actual LED Current</div>
        <div class="text-3xl font-mono text-(--color-text)">{formatSI(result.actualCurrent!, "A", 3)}</div>
        <div class="mt-1 text-xs text-(--color-text-muted)">With the standard resistor value</div>
      </div>
    </div>

    <div class="border border-(--color-border) bg-(--color-bg-alt) divide-y divide-(--color-border)">
      {#each [
        { label: "Voltage across resistor", value: formatSI(result.resistorDrop!, "V") },
        { label: "Power in each resistor", value: formatSI(result.resistorPower!, "W") },
        { label: "Power in LEDs (total)", value: formatSI(result.ledPower!, "W") },
        { label: "Total current from supply", value: formatSI(result.totalCurrent!, "A") },
        { label: "Total power from supply", value: formatSI(result.totalPower!, "W") },
        { label: "Efficiency", value: `${result.efficiency!.toFixed(1)} %` },
      ] as row (row.label)}
        <div class="flex justify-between px-4 py-2 text-sm">
          <span class="text-(--color-text-muted)">{row.label}</span>
          <span class="font-mono text-(--color-text)">{row.value}</span>
        </div>
      {/each}
    </div>

    <p class="mt-3 text-xs text-(--color-text-light) font-mono">
      R = (Vs − {wiring === "series" && result.count! > 1 ? `${result.count} × ` : ""}Vf) / I = ({formatSI(supply!, "V")} − {formatSI(
        wiring === "series" ? forward! * result.count! : forward!,
        "V",
      )}) / {formatSI(current!, "A")} = {formatSI(result.exact!, "Ω")}
    </p>
  {/if}
</div>
