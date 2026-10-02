<script lang="ts">
  import { formatSI, formatSIInput, parseSI } from "../../lib/electronics.js";

  type Quantity = "voltage" | "current" | "resistance" | "power";

  interface QuantityDef {
    id: Quantity;
    label: string;
    symbol: string;
    unit: string;
    placeholder: string;
  }

  const QUANTITIES: QuantityDef[] = [
    { id: "voltage", label: "Voltage", symbol: "V", unit: "V", placeholder: "e.g. 12 or 3.3" },
    { id: "current", label: "Current", symbol: "I", unit: "A", placeholder: "e.g. 20m or 1.5" },
    { id: "resistance", label: "Resistance", symbol: "R", unit: "Ω", placeholder: "e.g. 4.7k or 220" },
    { id: "power", label: "Power", symbol: "P", unit: "W", placeholder: "e.g. 250m or 5" },
  ];

  const FORMULAS: Record<Quantity, string[]> = {
    voltage: ["V = I × R", "V = P / I", "V = √(P × R)"],
    current: ["I = V / R", "I = P / V", "I = √(P / R)"],
    resistance: ["R = V / I", "R = V² / P", "R = P / I²"],
    power: ["P = V × I", "P = I² × R", "P = V² / R"],
  };

  let inputs = $state<Record<Quantity, string>>({ voltage: "12", current: "", resistance: "470", power: "" });
  let order = $state<Quantity[]>(["voltage", "resistance"]);

  const parsedValue = (id: Quantity): number | null => {
    const value = parseSI(inputs[id]);
    return value !== null && value > 0 ? value : null;
  };

  let known = $derived(order.filter((id) => parsedValue(id) !== null).slice(-2));

  let solution = $derived.by((): { values: Record<Quantity, number> | null; error: string } => {
    if (known.length < 2) return { values: null, error: "" };
    const v = known.includes("voltage") ? parsedValue("voltage")! : NaN;
    const i = known.includes("current") ? parsedValue("current")! : NaN;
    const r = known.includes("resistance") ? parsedValue("resistance")! : NaN;
    const p = known.includes("power") ? parsedValue("power")! : NaN;
    const key = [...known].sort().join("+");

    let values: Record<Quantity, number>;
    switch (key) {
      case "current+voltage":
        values = { voltage: v, current: i, resistance: v / i, power: v * i };
        break;
      case "resistance+voltage":
        values = { voltage: v, current: v / r, resistance: r, power: (v * v) / r };
        break;
      case "power+voltage":
        values = { voltage: v, current: p / v, resistance: (v * v) / p, power: p };
        break;
      case "current+resistance":
        values = { voltage: i * r, current: i, resistance: r, power: i * i * r };
        break;
      case "current+power":
        values = { voltage: p / i, current: i, resistance: p / (i * i), power: p };
        break;
      case "power+resistance":
        values = { voltage: Math.sqrt(p * r), current: Math.sqrt(p / r), resistance: r, power: p };
        break;
      default:
        return { values: null, error: "Unsupported combination" };
    }
    return { values, error: "" };
  });

  const handleInput = (id: Quantity, value: string): void => {
    inputs[id] = value;
    order = [...order.filter((item) => item !== id), id];
  };

  const handleClear = (): void => {
    inputs = { voltage: "", current: "", resistance: "", power: "" };
    order = [];
  };

  const isComputed = (id: Quantity): boolean => solution.values !== null && !known.includes(id);
</script>

<div class="h-full flex flex-col max-w-4xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Enter any two of voltage, current, resistance, or power to calculate the other two. Accepts SI prefixes like 4.7k, 20m, 100µ, and 4k7. The two most recently edited fields are used as inputs.
    </p>
  </header>

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
    {#each QUANTITIES as quantity (quantity.id)}
      {@const computed = isComputed(quantity.id)}
      {@const isInput = known.includes(quantity.id)}
      <div
        class="border p-4 transition-colors {computed
          ? 'border-(--color-text) bg-(--color-bg-alt)'
          : isInput
            ? 'border-(--color-text-light) bg-(--color-bg-alt)'
            : 'border-(--color-border) bg-(--color-bg-alt)'}"
      >
        <div class="flex items-baseline justify-between mb-2">
          <label for="ohm-{quantity.id}" class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            {quantity.label} <span class="font-mono normal-case">({quantity.symbol}, {quantity.unit})</span>
          </label>
          <span class="text-xs text-(--color-text-light)">
            {computed ? "calculated" : isInput ? "input" : ""}
          </span>
        </div>
        {#if computed && solution.values}
          <div class="flex items-baseline gap-3">
            <span class="text-2xl font-mono text-(--color-text)">{formatSI(solution.values[quantity.id], quantity.unit)}</span>
            <button
              onclick={() => handleInput(quantity.id, formatSIInput(solution.values![quantity.id], 6))}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              title="Use this value as an input"
            >
              Use as input
            </button>
          </div>
          <p class="mt-1 text-xs font-mono text-(--color-text-light)">
            {FORMULAS[quantity.id].find((formula) =>
              known.every((id) => formula.includes(QUANTITIES.find((q) => q.id === id)!.symbol)),
            )}
          </p>
        {:else}
          <input
            id="ohm-{quantity.id}"
            type="text"
            value={inputs[quantity.id]}
            oninput={(event) => handleInput(quantity.id, (event.target as HTMLInputElement).value)}
            placeholder={quantity.placeholder}
            spellcheck="false"
            class="w-full px-3 py-2 text-lg font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) outline-none focus:border-(--color-text-light)"
          />
          {#if inputs[quantity.id].trim() && parsedValue(quantity.id) === null}
            <p class="mt-1 text-xs text-(--color-error-text)">Enter a positive number (SI prefixes allowed)</p>
          {:else if parsedValue(quantity.id) !== null}
            <p class="mt-1 text-xs text-(--color-text-light)">= {formatSI(parsedValue(quantity.id)!, quantity.unit)}</p>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex gap-3 mb-6">
    <button
      onclick={handleClear}
      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
    >
      Clear all
    </button>
    {#if known.length < 2}
      <span class="text-xs text-(--color-text-light)">Enter {2 - known.length} more value{known.length === 1 ? "" : "s"} to calculate.</span>
    {/if}
  </div>

  <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Formula Reference</h2>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
    {#each QUANTITIES as quantity (quantity.id)}
      <div class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
        <div class="text-xs font-medium text-(--color-text) mb-1">{quantity.label}</div>
        {#each FORMULAS[quantity.id] as formula (formula)}
          <div class="text-xs font-mono text-(--color-text-muted)">{formula}</div>
        {/each}
      </div>
    {/each}
  </div>
</div>
