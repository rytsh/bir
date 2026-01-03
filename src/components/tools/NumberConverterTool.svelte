<script lang="ts">
  let inputValue = $state("");
  let sourceBase = $state(10);
  let targetBase = $state(16);
  let customSourceBase = $state(10);
  let customTargetBase = $state(16);
  let sourceMode = $state<"preset" | "custom">("preset");
  let targetMode = $state<"preset" | "custom">("preset");
  let romanMode = $state<"none" | "toRoman" | "fromRoman">("none");
  let groupDigits = $state(true);
  let uppercase = $state(true);
  let copied = $state(false);

  const presetBases = [
    { value: 2, label: "Binary (2)" },
    { value: 8, label: "Octal (8)" },
    { value: 10, label: "Decimal (10)" },
    { value: 16, label: "Hexadecimal (16)" },
  ];

  // Roman numeral mappings
  const romanNumerals: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  const romanRegex = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;

  const toRoman = (num: number): string => {
    if (num < 1 || num > 3999) {
      throw new Error("Roman numerals only support numbers 1-3999");
    }
    let result = "";
    for (const [value, symbol] of romanNumerals) {
      while (num >= value) {
        result += symbol;
        num -= value;
      }
    }
    return result;
  };

  const fromRoman = (roman: string): bigint => {
    const upperRoman = roman.toUpperCase().trim();
    if (!upperRoman || !romanRegex.test(upperRoman)) {
      throw new Error("Invalid Roman numeral");
    }

    const romanValues: Record<string, number> = {
      I: 1,
      V: 5,
      X: 10,
      L: 50,
      C: 100,
      D: 500,
      M: 1000,
    };

    let result = 0;
    for (let i = 0; i < upperRoman.length; i++) {
      const current = romanValues[upperRoman[i]];
      const next = romanValues[upperRoman[i + 1]] || 0;
      if (current < next) {
        result -= current;
      } else {
        result += current;
      }
    }
    return BigInt(result);
  };

  const parseNumber = (value: string, base: number): bigint => {
    const cleaned = value.replace(/[\s_]/g, "").toUpperCase();
    if (!cleaned) throw new Error("Empty input");

    // Validate characters for the base
    const validChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, base);
    const regex = new RegExp(`^[${validChars}]+$`, "i");
    if (!regex.test(cleaned)) {
      throw new Error(`Invalid character for base ${base}`);
    }

    // Parse using BigInt
    let result = 0n;
    const bigBase = BigInt(base);
    for (const char of cleaned) {
      const digit = parseInt(char, 36);
      result = result * bigBase + BigInt(digit);
    }
    return result;
  };

  const formatNumber = (num: bigint, base: number): string => {
    if (num === 0n) return "0";

    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    const bigBase = BigInt(base);
    let n = num;

    while (n > 0n) {
      const digit = Number(n % bigBase);
      result = chars[digit] + result;
      n = n / bigBase;
    }

    return uppercase ? result : result.toLowerCase();
  };

  const groupNumber = (str: string, base: number): string => {
    if (!groupDigits) return str;

    // Determine group size based on base
    let groupSize: number;
    if (base === 2) groupSize = 4;
    else if (base === 8) groupSize = 3;
    else if (base === 16) groupSize = 4;
    else if (base === 10) groupSize = 3;
    else groupSize = 4;

    // Group from right to left
    const chars = str.split("");
    const groups: string[] = [];
    while (chars.length > 0) {
      groups.unshift(chars.splice(-groupSize).join(""));
    }
    return groups.join(" ");
  };

  const effectiveSourceBase = $derived(
    sourceMode === "custom" ? customSourceBase : sourceBase
  );

  const effectiveTargetBase = $derived(
    targetMode === "custom" ? customTargetBase : targetBase
  );

  // Compute result and error together to avoid mutating state in derived
  const computedResult = $derived.by(() => {
    if (!inputValue.trim()) return { value: "", error: "" };

    try {
      let decimalValue: bigint;

      // Parse input
      if (romanMode === "fromRoman") {
        decimalValue = fromRoman(inputValue);
      } else {
        decimalValue = parseNumber(inputValue, effectiveSourceBase);
      }

      // Convert to output
      if (romanMode === "toRoman") {
        const num = Number(decimalValue);
        if (num < 1 || num > 3999) {
          throw new Error("Roman numerals only support numbers 1-3999");
        }
        return { value: toRoman(num), error: "" };
      } else {
        const formatted = formatNumber(decimalValue, effectiveTargetBase);
        return { value: groupNumber(formatted, effectiveTargetBase), error: "" };
      }
    } catch (e) {
      return { value: "", error: e instanceof Error ? e.message : "Conversion error" };
    }
  });

  const result = $derived(computedResult.value);
  const computedError = $derived(computedResult.error);

  // Additional outputs for display
  const allConversions = $derived.by(() => {
    if (!inputValue.trim() || computedError) return null;

    try {
      let decimalValue: bigint;

      if (romanMode === "fromRoman") {
        decimalValue = fromRoman(inputValue);
      } else {
        decimalValue = parseNumber(inputValue, effectiveSourceBase);
      }

      const conversions: { label: string; value: string; base: number }[] = [];

      // Binary
      conversions.push({
        label: "Binary",
        value: groupNumber(formatNumber(decimalValue, 2), 2),
        base: 2,
      });

      // Octal
      conversions.push({
        label: "Octal",
        value: groupNumber(formatNumber(decimalValue, 8), 8),
        base: 8,
      });

      // Decimal
      conversions.push({
        label: "Decimal",
        value: groupNumber(formatNumber(decimalValue, 10), 10),
        base: 10,
      });

      // Hexadecimal
      conversions.push({
        label: "Hexadecimal",
        value: groupNumber(formatNumber(decimalValue, 16), 16),
        base: 16,
      });

      // Roman (only if in valid range)
      const num = Number(decimalValue);
      if (num >= 1 && num <= 3999) {
        conversions.push({
          label: "Roman",
          value: toRoman(num),
          base: 0,
        });
      }

      return conversions;
    } catch {
      return null;
    }
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ""));
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  };

  const handleClear = () => {
    inputValue = "";
  };

  let clipboardError = $state("");

  const handlePaste = async () => {
    clipboardError = "";
    try {
      const text = await navigator.clipboard.readText();
      inputValue = text;
    } catch {
      clipboardError = "Failed to read clipboard";
    }
  };

  const handleSwap = () => {
    if (romanMode === "none") {
      // Swap bases
      const tempBase = effectiveSourceBase;
      const tempMode = sourceMode;

      if (targetMode === "custom") {
        sourceMode = "custom";
        customSourceBase = customTargetBase;
      } else {
        sourceMode = "preset";
        sourceBase = targetBase;
      }

      if (tempMode === "custom") {
        targetMode = "custom";
        customTargetBase = tempBase;
      } else {
        targetMode = "preset";
        targetBase = tempBase;
      }
    } else if (romanMode === "toRoman") {
      romanMode = "fromRoman";
    } else {
      romanMode = "toRoman";
    }

    // Use result as new input (without spaces)
    if (result) {
      inputValue = result.replace(/\s/g, "");
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert numbers between different bases (binary, octal, decimal, hex, custom)
      and Roman numerals. Supports large numbers with BigInt.
    </p>
  </header>

  <!-- Configuration -->
  <div class="mb-4 py-2 px-3 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap items-center gap-4">
      <!-- Roman Mode Toggle -->
      <div class="flex items-center gap-2">
        <label
          for="roman-mode"
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          Mode
        </label>
        <select
          id="roman-mode"
          bind:value={romanMode}
          class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
        >
          <option value="none">Base to Base</option>
          <option value="toRoman">To Roman</option>
          <option value="fromRoman">From Roman</option>
        </select>
      </div>

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      <!-- Source Base (hidden when fromRoman) -->
      {#if romanMode !== "fromRoman"}
        <div class="flex items-center gap-2">
          <label
            for="source-base"
            class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
          >
            From
          </label>
          <select
            id="source-base"
            bind:value={sourceBase}
            onchange={() => (sourceMode = "preset")}
            class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
          >
            {#each presetBases as base}
              <option value={base.value}>{base.label}</option>
            {/each}
            <option value={-1}>Custom</option>
          </select>
          {#if sourceBase === -1 || sourceMode === "custom"}
            <input
              type="number"
              min="2"
              max="36"
              bind:value={customSourceBase}
              onfocus={() => (sourceMode = "custom")}
              class="w-16 px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
              placeholder="2-36"
            />
          {/if}
        </div>
      {/if}

      <!-- Target Base (hidden when toRoman) -->
      {#if romanMode !== "toRoman"}
        {#if romanMode !== "fromRoman"}
          <span class="text-(--color-text-light)">→</span>
        {/if}
        <div class="flex items-center gap-2">
          <label
            for="target-base"
            class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
          >
            To
          </label>
          <select
            id="target-base"
            bind:value={targetBase}
            onchange={() => (targetMode = "preset")}
            class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
          >
            {#each presetBases as base}
              <option value={base.value}>{base.label}</option>
            {/each}
            <option value={-1}>Custom</option>
          </select>
          {#if targetBase === -1 || targetMode === "custom"}
            <input
              type="number"
              min="2"
              max="36"
              bind:value={customTargetBase}
              onfocus={() => (targetMode = "custom")}
              class="w-16 px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
              placeholder="2-36"
            />
          {/if}
        </div>
      {/if}

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      <!-- Options -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={groupDigits}
          class="w-4 h-4 accent-(--color-text) hover:cursor-pointer"
        />
        <span class="text-sm text-(--color-text-muted)">Group digits</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={uppercase}
          class="w-4 h-4 accent-(--color-text) hover:cursor-pointer"
        />
        <span class="text-sm text-(--color-text-muted)">Uppercase</span>
      </label>
    </div>
  </div>

  <!-- Error -->
  {#if computedError || clipboardError}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {computedError || clipboardError}
    </div>
  {/if}

  <!-- Input/Output -->
  <div class="flex-1 flex flex-col gap-4">
    <!-- Input -->
    <div class="flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          {#if romanMode === "fromRoman"}
            Roman Numeral
          {:else}
            Input (Base {effectiveSourceBase})
          {/if}
        </span>
        <div class="flex gap-3">
          <button
            onclick={handlePaste}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
          <button
            onclick={handleClear}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <input
        type="text"
        bind:value={inputValue}
        placeholder={romanMode === "fromRoman"
          ? "Enter Roman numeral (e.g., MCMXCIV)..."
          : `Enter number in base ${effectiveSourceBase}...`}
        class="w-full px-4 py-3 text-lg font-mono bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
      />
    </div>

    <!-- Primary Result -->
    <div class="flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          {#if romanMode === "toRoman"}
            Roman Numeral
          {:else if romanMode === "fromRoman"}
            Result (Base {effectiveTargetBase})
          {:else}
            Result (Base {effectiveTargetBase})
          {/if}
        </span>
        <div class="flex gap-3">
          <button
            onclick={handleSwap}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            title="Swap input and output"
          >
            Swap
          </button>
          <button
            onclick={() => handleCopy(result)}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div
        class="w-full px-4 py-3 text-lg font-mono bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) min-h-[52px] break-all"
      >
        {result || "—"}
      </div>
    </div>

    <!-- All Conversions -->
    {#if allConversions && allConversions.length > 0}
      <div class="mt-2">
        <span
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-3"
        >
          All Conversions
        </span>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each allConversions as conversion}
            <div
              class="p-3 bg-(--color-bg-alt) border border-(--color-border) flex flex-col gap-1"
            >
              <div class="flex justify-between items-center">
                <span class="text-xs text-(--color-text-muted)">
                  {conversion.label}
                  {#if conversion.base > 0}
                    <span class="opacity-60">(base {conversion.base})</span>
                  {/if}
                </span>
                <button
                  onclick={() => handleCopy(conversion.value)}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  Copy
                </button>
              </div>
              <div
                class="font-mono text-sm text-(--color-text) break-all select-all"
              >
                {conversion.value}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
