<script lang="ts">
  import { formatSI, parseSI } from "../../lib/electronics.js";

  type Layer = "external" | "internal";
  type Mode = "width" | "current";

  const COPPER_RESISTIVITY = 1.72e-8;
  const COPPER_TEMP_COEFF = 0.00393;
  const MIL_TO_MM = 0.0254;
  const OZ_TO_MIL = 1.378;

  let mode = $state<Mode>("width");
  let currentInput = $state("1");
  let widthInput = $state("0.3");
  let widthUnit = $state<"mm" | "mil">("mm");
  let thickness = $state(1);
  let tempRise = $state(10);
  let ambient = $state(25);
  let lengthInput = $state("50");
  let lengthUnit = $state<"mm" | "mil" | "in">("mm");

  const kFor = (layer: Layer): number => (layer === "external" ? 0.048 : 0.024);

  const widthMilFor = (current: number, layer: Layer): number => {
    const areaMil2 = Math.pow(current / (kFor(layer) * Math.pow(tempRise, 0.44)), 1 / 0.725);
    return areaMil2 / (thickness * OZ_TO_MIL);
  };

  const currentFor = (widthMil: number, layer: Layer): number => {
    const areaMil2 = widthMil * thickness * OZ_TO_MIL;
    return kFor(layer) * Math.pow(tempRise, 0.44) * Math.pow(areaMil2, 0.725);
  };

  let current = $derived(parseSI(currentInput));
  let widthValue = $derived(parseSI(widthInput));
  let widthMilInput = $derived(widthValue === null ? null : widthUnit === "mm" ? widthValue / MIL_TO_MM : widthValue);
  let lengthMm = $derived.by(() => {
    const value = parseSI(lengthInput);
    if (value === null) return null;
    return lengthUnit === "mm" ? value : lengthUnit === "mil" ? value * MIL_TO_MM : value * 25.4;
  });

  const electrical = (widthMil: number, amps: number) => {
    if (!lengthMm) return null;
    const widthM = widthMil * MIL_TO_MM * 1e-3;
    const thicknessM = thickness * OZ_TO_MIL * MIL_TO_MM * 1e-3;
    const resistivity = COPPER_RESISTIVITY * (1 + COPPER_TEMP_COEFF * (ambient + tempRise - 20));
    const resistance = (resistivity * (lengthMm * 1e-3)) / (widthM * thicknessM);
    return { resistance, drop: resistance * amps, loss: amps * amps * resistance };
  };

  let results = $derived.by(() => {
    if (mode === "width") {
      if (!current || current <= 0 || tempRise <= 0 || thickness <= 0) return null;
      return (["external", "internal"] as Layer[]).map((layer) => {
        const widthMil = widthMilFor(current, layer);
        return { layer, widthMil, current, electrical: electrical(widthMil, current) };
      });
    }
    if (!widthMilInput || widthMilInput <= 0 || tempRise <= 0 || thickness <= 0) return null;
    return (["external", "internal"] as Layer[]).map((layer) => {
      const amps = currentFor(widthMilInput, layer);
      return { layer, widthMil: widthMilInput, current: amps, electrical: electrical(widthMilInput, amps) };
    });
  });

  const COPPER_WEIGHTS = [0.5, 1, 2, 3, 4];
  const inputClass =
    "w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
</script>

<div class="h-full flex flex-col max-w-5xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate the minimum PCB trace width for a given current (or the maximum current for a given width) using the IPC-2221 standard, for external and internal layers. Also shows trace resistance, voltage drop, and power loss.
    </p>
  </header>

  <div class="mb-4 p-1 bg-(--color-border) inline-flex gap-1 self-start">
    {#each [{ id: "width", label: "Find width" }, { id: "current", label: "Find max current" }] as item (item.id)}
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === item.id
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => (mode = item.id as Mode)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
    {#if mode === "width"}
      <label class="block">
        <span class={labelClass}>Current (A)</span>
        <input type="text" bind:value={currentInput} class={inputClass} />
      </label>
    {:else}
      <div>
        <span class={labelClass}>Trace width</span>
        <div class="flex">
          <input type="text" bind:value={widthInput} aria-label="Trace width" class="{inputClass} border-r-0" />
          <select bind:value={widthUnit} aria-label="Width unit" class="px-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm outline-none">
            <option value="mm">mm</option>
            <option value="mil">mil</option>
          </select>
        </div>
      </div>
    {/if}
    <label class="block">
      <span class={labelClass}>Copper weight</span>
      <select bind:value={thickness} class={inputClass}>
        {#each COPPER_WEIGHTS as weight (weight)}
          <option value={weight}>{weight} oz/ft² ({(weight * OZ_TO_MIL * MIL_TO_MM * 1000).toFixed(0)} µm)</option>
        {/each}
      </select>
    </label>
    <label class="block">
      <span class={labelClass}>Temp rise (°C)</span>
      <input type="number" min="1" max="100" bind:value={tempRise} class={inputClass} />
    </label>
    <label class="block">
      <span class={labelClass}>Ambient (°C)</span>
      <input type="number" bind:value={ambient} class={inputClass} />
    </label>
    <div>
      <span class={labelClass}>Trace length (optional)</span>
      <div class="flex">
        <input type="text" bind:value={lengthInput} aria-label="Trace length" class="{inputClass} border-r-0" />
        <select bind:value={lengthUnit} aria-label="Length unit" class="px-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm outline-none">
          <option value="mm">mm</option>
          <option value="mil">mil</option>
          <option value="in">in</option>
        </select>
      </div>
    </div>
  </div>

  {#if results}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      {#each results as result (result.layer)}
        <div class="border bg-(--color-bg-alt) {result.layer === 'external' ? 'border-(--color-text)' : 'border-(--color-border)'}">
          <div class="px-4 py-2 border-b border-(--color-border) text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            {result.layer === "external" ? "External layer (top / bottom)" : "Internal layer"}
          </div>
          <div class="p-4">
            {#if mode === "width"}
              <div class="text-3xl font-mono text-(--color-text)">{(result.widthMil * MIL_TO_MM).toFixed(3)} mm</div>
              <div class="text-sm font-mono text-(--color-text-muted)">{result.widthMil.toFixed(2)} mil</div>
            {:else}
              <div class="text-3xl font-mono text-(--color-text)">{formatSI(result.current, "A")}</div>
              <div class="text-sm text-(--color-text-muted)">max at {tempRise} °C rise</div>
            {/if}
          </div>
          {#if result.electrical}
            <div class="divide-y divide-(--color-border) border-t border-(--color-border)">
              {#each [
                { label: "Resistance", value: formatSI(result.electrical.resistance, "Ω") },
                { label: "Voltage drop", value: formatSI(result.electrical.drop, "V") },
                { label: "Power loss", value: formatSI(result.electrical.loss, "W") },
                { label: "Cross-section", value: `${(result.widthMil * thickness * OZ_TO_MIL).toFixed(1)} mil²` },
              ] as row (row.label)}
                <div class="flex justify-between px-4 py-1.5 text-sm">
                  <span class="text-(--color-text-muted)">{row.label}</span>
                  <span class="font-mono text-(--color-text)">{row.value}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {#if results[0].current > 35}
      <p class="mb-3 text-xs text-(--color-error-text)">⚠ IPC-2221 charts are extrapolated above 35 A; verify with IPC-2152 or thermal simulation.</p>
    {/if}
  {:else}
    <p class="mb-4 text-sm text-(--color-text-muted)">Enter positive values to calculate.</p>
  {/if}

  <p class="text-xs text-(--color-text-light)">
    IPC-2221: I = k · ΔT<sup>0.44</sup> · A<sup>0.725</sup> (A in mil², k = 0.048 external, 0.024 internal). Internal layers need wider traces because heat dissipates less. IPC-2152 is more accurate for modern boards; treat these results as a conservative starting point.
  </p>
</div>
