<script lang="ts">
  import {
    CAPACITOR_TOLERANCE_CODES,
    CAPACITOR_VOLTAGE_CODES,
    decodeCapacitorCode,
    encodeCapacitorCode,
    formatSI,
    parseSI,
  } from "../../lib/electronics.js";

  const COMMON_VALUES = [
    "10p", "22p", "33p", "47p", "100p", "220p", "330p", "470p", "1n", "2.2n", "4.7n", "10n", "22n", "47n", "100n",
    "220n", "470n", "1u", "2.2u", "4.7u", "10u",
  ];

  let codeInput = $state("104K");
  let valueInput = $state("4.7n");
  let copiedKey = $state("");

  let decoded = $derived(decodeCapacitorCode(codeInput));
  let valueFarads = $derived.by(() => {
    const text = valueInput.trim().replace(/F$/i, "");
    return parseSI(text);
  });
  let encoded = $derived(valueFarads ? encodeCapacitorCode(valueFarads) : null);

  const unitsFor = (farads: number): { label: string; value: string }[] => [
    { label: "pF", value: Number((farads / 1e-12).toPrecision(6)).toLocaleString() },
    { label: "nF", value: Number((farads / 1e-9).toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 6 }) },
    { label: "µF", value: Number((farads / 1e-6).toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 9 }) },
  ];

  const handleCopy = (value: string, key: string): void => {
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
  const inputClass =
    "w-full px-3 py-2 text-2xl font-mono tracking-wider border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
</script>

<div class="h-full flex flex-col max-w-5xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Decode ceramic and film capacitor markings (104, 4R7, 2n2, 2A104J) into pF / nF / µF with tolerance and voltage codes, or encode a capacitance into its 3-digit EIA code.
    </p>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <div>
      <label for="cap-code" class={labelClass}>Code → Value</label>
      <input id="cap-code" type="text" bind:value={codeInput} spellcheck="false" placeholder="104" class={inputClass} />
      <div class="mt-3 border bg-(--color-bg-alt) {decoded ? 'border-(--color-text)' : 'border-(--color-border)'} p-4">
        {#if decoded}
          <div class="text-3xl font-mono text-(--color-text)">{formatSI(decoded.farads, "F")}</div>
          <div class="mt-2 grid grid-cols-3 gap-2">
            {#each unitsFor(decoded.farads) as unit (unit.label)}
              <button onclick={() => handleCopy(unit.value, `d-${unit.label}`)} class="text-left px-2 py-1 border border-(--color-border) hover:border-(--color-text-light) transition-colors">
                <div class="text-[10px] text-(--color-text-light)">{copiedKey === `d-${unit.label}` ? "Copied!" : unit.label}</div>
                <div class="font-mono text-sm text-(--color-text) truncate">{unit.value}</div>
              </button>
            {/each}
          </div>
          <div class="mt-3 flex flex-wrap gap-4 text-sm">
            <span class="text-(--color-text-muted)">Tolerance: <span class="text-(--color-text)">{decoded.tolerance ?? "not marked"}</span></span>
            <span class="text-(--color-text-muted)">Voltage: <span class="text-(--color-text)">{decoded.voltage ?? "not marked"}</span></span>
          </div>
        {:else if codeInput.trim()}
          <p class="text-sm text-(--color-error-text)">Unrecognized code. Try formats like 104, 104K, 4R7, 2n2, or 2A104J.</p>
        {:else}
          <p class="text-sm text-(--color-text-muted)">Enter the code printed on the capacitor.</p>
        {/if}
      </div>
    </div>

    <div>
      <label for="cap-value" class={labelClass}>Value → Code</label>
      <input id="cap-value" type="text" bind:value={valueInput} spellcheck="false" placeholder="100n or 0.1u" class={inputClass} />
      <div class="mt-3 border bg-(--color-bg-alt) {encoded ? 'border-(--color-text)' : 'border-(--color-border)'} p-4">
        {#if encoded && valueFarads}
          <div class="flex items-baseline gap-3">
            <div class="text-3xl font-mono text-(--color-text) tracking-widest">{encoded}</div>
            <button onclick={() => handleCopy(encoded!, "code")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
              {copiedKey === "code" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div class="mt-1 text-sm text-(--color-text-muted)">{formatSI(valueFarads, "F")}</div>
          {#if decodeCapacitorCode(encoded) && Math.abs(decodeCapacitorCode(encoded)!.farads - valueFarads) / valueFarads > 0.001}
            <p class="mt-1 text-xs text-(--color-error-text)">Rounded to {formatSI(decodeCapacitorCode(encoded)!.farads, "F")} (2 significant digits).</p>
          {/if}
        {:else if valueInput.trim()}
          <p class="text-sm text-(--color-error-text)">Enter a value between 0.1 pF and 9.9 mF, e.g. 100n, 4.7u, 22p.</p>
        {:else}
          <p class="text-sm text-(--color-text-muted)">Enter a capacitance.</p>
        {/if}
      </div>
    </div>
  </div>

  <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Common Values</h2>
  <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-x-auto mb-6">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-(--color-border) text-xs uppercase tracking-wider text-(--color-text-light)">
          <th class="px-3 py-2 text-left font-medium">Code</th>
          <th class="px-3 py-2 text-left font-medium">pF</th>
          <th class="px-3 py-2 text-left font-medium">nF</th>
          <th class="px-3 py-2 text-left font-medium">µF</th>
        </tr>
      </thead>
      <tbody>
        {#each COMMON_VALUES as value (value)}
          {@const farads = parseSI(value)!}
          {@const units = unitsFor(farads)}
          <tr
            class="border-b border-(--color-border) last:border-b-0 cursor-pointer hover:bg-(--color-bg) {decoded && Math.abs(decoded.farads - farads) < farads * 0.001 ? 'bg-(--color-border)' : ''}"
            onclick={() => (codeInput = encodeCapacitorCode(farads) ?? "")}
          >
            <td class="px-3 py-1 font-mono font-semibold text-(--color-text)">{encodeCapacitorCode(farads)}</td>
            {#each units as unit (unit.label)}
              <td class="px-3 py-1 font-mono text-(--color-text-muted)">{unit.value}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Tolerance Letters</h2>
      <div class="grid grid-cols-3 gap-1">
        {#each Object.entries(CAPACITOR_TOLERANCE_CODES) as [letter, tolerance] (letter)}
          <div class="flex gap-2 px-2 py-1 border border-(--color-border) bg-(--color-bg-alt) text-xs">
            <span class="font-mono font-semibold text-(--color-text)">{letter}</span>
            <span class="text-(--color-text-muted)">{tolerance}</span>
          </div>
        {/each}
      </div>
    </div>
    <div>
      <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Voltage Codes (EIA)</h2>
      <div class="grid grid-cols-4 gap-1">
        {#each Object.entries(CAPACITOR_VOLTAGE_CODES) as [code, volts] (code)}
          <div class="flex gap-2 px-2 py-1 border border-(--color-border) bg-(--color-bg-alt) text-xs">
            <span class="font-mono font-semibold text-(--color-text)">{code}</span>
            <span class="text-(--color-text-muted)">{volts} V</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <p class="mt-4 text-xs text-(--color-text-light)">
    3-digit code = two significant digits × 10^third digit, in picofarads (104 = 10 × 10⁴ pF = 100 nF). "R" marks the decimal point (4R7 = 4.7 pF). Third digit 8 or 9 means ×0.01 / ×0.1.
  </p>
</div>
