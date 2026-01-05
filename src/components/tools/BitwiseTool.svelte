<script lang="ts">
  type BitWidth = 8 | 16 | 32;
  type InputFormat = "dec" | "hex" | "bin";
  type Operation = "and" | "or" | "xor" | "not" | "lshift" | "rshift";

  let bitWidth = $state<BitWidth>(32);
  let inputFormat = $state<InputFormat>("dec");
  let inputA = $state("");
  let inputB = $state("");
  let operation = $state<Operation>("and");
  let shiftAmount = $state(1);
  let copied = $state<string | null>(null);

  const operations: { id: Operation; name: string; symbol: string; unary?: boolean }[] = [
    { id: "and", name: "AND", symbol: "&" },
    { id: "or", name: "OR", symbol: "|" },
    { id: "xor", name: "XOR", symbol: "^" },
    { id: "not", name: "NOT", symbol: "~", unary: true },
    { id: "lshift", name: "Left Shift", symbol: "<<", unary: true },
    { id: "rshift", name: "Right Shift", symbol: ">>", unary: true },
  ];

  const maxValues: Record<BitWidth, bigint> = {
    8: 0xFFn,
    16: 0xFFFFn,
    32: 0xFFFFFFFFn,
  };

  const parseInput = (value: string, format: InputFormat): bigint | null => {
    if (!value.trim()) return null;
    try {
      let num: bigint;
      switch (format) {
        case "dec":
          num = BigInt(value.trim());
          break;
        case "hex": {
          const hexVal = value.trim().toLowerCase().replace(/^0x/, "");
          num = BigInt("0x" + hexVal);
          break;
        }
        case "bin": {
          const binVal = value.trim().replace(/^0b/, "").replace(/\s/g, "");
          num = BigInt("0b" + binVal);
          break;
        }
      }
      return num;
    } catch {
      return null;
    }
  };

  const maskValue = (value: bigint): bigint => {
    return value & maxValues[bitWidth];
  };

  const formatResult = (value: bigint, format: InputFormat): string => {
    const masked = maskValue(value);
    switch (format) {
      case "dec":
        return masked.toString(10);
      case "hex":
        return "0x" + masked.toString(16).toUpperCase().padStart(bitWidth / 4, "0");
      case "bin":
        return masked.toString(2).padStart(bitWidth, "0");
    }
  };

  const formatBinary = (value: bigint): string => {
    const masked = maskValue(value);
    const binary = masked.toString(2).padStart(bitWidth, "0");
    // Group by 8 bits for readability
    const groups: string[] = [];
    for (let i = 0; i < binary.length; i += 8) {
      groups.push(binary.slice(i, i + 8));
    }
    return groups.join(" ");
  };

  const computeResult = $derived.by(() => {
    const a = parseInput(inputA, inputFormat);
    
    if (a === null && inputA.trim()) {
      return { value: null, error: "Invalid input A" };
    }
    
    if (a === null) return { value: null, error: "" };

    const isUnary = operations.find(op => op.id === operation)?.unary;
    
    if (!isUnary) {
      const b = parseInput(inputB, inputFormat);
      if (b === null && inputB.trim()) {
        return { value: null, error: "Invalid input B" };
      }
      if (b === null) return { value: null, error: "" };

      switch (operation) {
        case "and":
          return { value: maskValue(a & b), error: "" };
        case "or":
          return { value: maskValue(a | b), error: "" };
        case "xor":
          return { value: maskValue(a ^ b), error: "" };
        default:
          return { value: null, error: "" };
      }
    } else {
      switch (operation) {
        case "not":
          return { value: maskValue(~a), error: "" };
        case "lshift":
          return { value: maskValue(a << BigInt(shiftAmount)), error: "" };
        case "rshift":
          return { value: maskValue(a >> BigInt(shiftAmount)), error: "" };
        default:
          return { value: null, error: "" };
      }
    }
  });

  const result = $derived(computeResult.value);
  const error = $derived(computeResult.error);

  const valueA = $derived(parseInput(inputA, inputFormat));
  const valueB = $derived(parseInput(inputB, inputFormat));
  const isUnaryOp = $derived(operations.find(op => op.id === operation)?.unary ?? false);
  const currentOp = $derived(operations.find(op => op.id === operation)!);

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    copied = label;
    setTimeout(() => { copied = null; }, 1500);
  };

  const handleClear = () => {
    inputA = "";
    inputB = "";
  };

  const getPlaceholder = (format: InputFormat): string => {
    switch (format) {
      case "dec": return "e.g. 255";
      case "hex": return "e.g. FF or 0xFF";
      case "bin": return "e.g. 11111111";
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Perform bitwise operations (AND, OR, XOR, NOT, shifts) on numbers with visual bit representation.
    </p>
  </header>

  <!-- Settings -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="flex items-center gap-2">
      <span class="text-xs text-(--color-text-muted)">Bit Width:</span>
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        {#each [8, 16, 32] as width}
          <button
            class="px-2 py-1 text-xs font-medium transition-colors {bitWidth === width
              ? 'bg-(--color-text) text-(--color-btn-text)'
              : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            onclick={() => { bitWidth = width as BitWidth; }}
          >
            {width}
          </button>
        {/each}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-xs text-(--color-text-muted)">Input Format:</span>
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        {#each [{ id: "dec", label: "Dec" }, { id: "hex", label: "Hex" }, { id: "bin", label: "Bin" }] as fmt}
          <button
            class="px-2 py-1 text-xs font-medium transition-colors {inputFormat === fmt.id
              ? 'bg-(--color-text) text-(--color-btn-text)'
              : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            onclick={() => { inputFormat = fmt.id as InputFormat; }}
          >
            {fmt.label}
          </button>
        {/each}
      </div>
    </div>

    <button
      onclick={handleClear}
      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
    >
      Clear
    </button>
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Inputs and Operation -->
  <div class="mb-6 space-y-4">
    <!-- Input A -->
    <div>
      <label for="inputA" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
        Value A
      </label>
      <input
        id="inputA"
        type="text"
        bind:value={inputA}
        placeholder={getPlaceholder(inputFormat)}
        class="w-full px-3 py-2 text-sm font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      />
      {#if valueA !== null}
        <div class="mt-1 text-xs font-mono text-(--color-text-muted)">
          {formatBinary(valueA)}
        </div>
      {/if}
    </div>

    <!-- Operation Selector -->
    <div>
      <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
        Operation
      </label>
      <div class="flex flex-wrap gap-2">
        {#each operations as op}
          <button
            class="px-3 py-1.5 text-sm font-mono border transition-colors {operation === op.id
              ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
              : 'border-(--color-border) text-(--color-text) hover:border-(--color-accent)'}"
            onclick={() => { operation = op.id; }}
          >
            {op.symbol} {op.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- Input B or Shift Amount -->
    {#if isUnaryOp}
      {#if operation === "lshift" || operation === "rshift"}
        <div>
          <label for="shiftAmount" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Shift Amount
          </label>
          <input
            id="shiftAmount"
            type="number"
            bind:value={shiftAmount}
            min="0"
            max={bitWidth}
            class="w-32 px-3 py-2 text-sm font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      {/if}
    {:else}
      <div>
        <label for="inputB" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Value B
        </label>
        <input
          id="inputB"
          type="text"
          bind:value={inputB}
          placeholder={getPlaceholder(inputFormat)}
          class="w-full px-3 py-2 text-sm font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
        {#if valueB !== null}
          <div class="mt-1 text-xs font-mono text-(--color-text-muted)">
            {formatBinary(valueB)}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Result -->
  {#if result !== null}
    <div class="py-2 border-b border-t border-(--color-border)">
      <div class="flex justify-between items-center mb-3">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Result</span>
        <span class="text-xs text-(--color-text-muted) font-mono">
          {#if isUnaryOp}
            {currentOp.symbol}{operation === "lshift" || operation === "rshift" ? ` ${shiftAmount}` : ""} A
          {:else}
            A {currentOp.symbol} B
          {/if}
        </span>
      </div>
      
      <!-- Binary representation -->
      <div class="mb-4 p-3 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-xs text-(--color-text-muted) mb-1">Binary</div>
        <div class="font-mono text-lg text-(--color-text) tracking-wider">
          {formatBinary(result)}
        </div>
      </div>

      <!-- All formats -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="p-3 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex justify-between items-center">
            <span class="text-xs text-(--color-text-muted)">Decimal</span>
            <button
              onclick={() => handleCopy(formatResult(result, "dec"), "dec")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "dec" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div class="font-mono text-sm text-(--color-text) mt-1">
            {formatResult(result, "dec")}
          </div>
        </div>

        <div class="p-3 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex justify-between items-center">
            <span class="text-xs text-(--color-text-muted)">Hexadecimal</span>
            <button
              onclick={() => handleCopy(formatResult(result, "hex"), "hex")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "hex" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div class="font-mono text-sm text-(--color-text) mt-1">
            {formatResult(result, "hex")}
          </div>
        </div>

        <div class="p-3 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex justify-between items-center">
            <span class="text-xs text-(--color-text-muted)">Binary</span>
            <button
              onclick={() => handleCopy(formatResult(result, "bin"), "bin")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "bin" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div class="font-mono text-sm text-(--color-text) mt-1 break-all">
            {formatResult(result, "bin")}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Bit visualization -->
  {#if result !== null && valueA !== null}
    <div class="mt-4">
      <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3">Bit Visualization</div>
      <div class="overflow-x-auto">
        <div class="space-y-2">
          <!-- Value A -->
          <div class="flex items-center gap-3">
            <span class="text-xs text-(--color-text-muted) w-16 shrink-0">A</span>
            <div class="inline-flex gap-px">
              {#each formatResult(valueA, "bin").split("") as bit, i}
                <div
                  class="w-5 h-5 flex items-center justify-center text-xs font-mono {bit === '1'
                    ? 'bg-(--color-text) text-(--color-btn-text)'
                    : 'bg-(--color-bg-alt) text-(--color-text-muted)'}"
                  title="Bit {bitWidth - 1 - i}"
                >
                  {bit}
                </div>
              {/each}
            </div>
          </div>

          <!-- Value B (only for binary operations) -->
          {#if !isUnaryOp && valueB !== null}
            <div class="flex items-center gap-3">
              <span class="text-xs text-(--color-text-muted) w-16 shrink-0">B</span>
              <div class="inline-flex gap-px">
                {#each formatResult(valueB, "bin").split("") as bit, i}
                  <div
                    class="w-5 h-5 flex items-center justify-center text-xs font-mono {bit === '1'
                      ? 'bg-(--color-text) text-(--color-btn-text)'
                      : 'bg-(--color-bg-alt) text-(--color-text-muted)'}"
                    title="Bit {bitWidth - 1 - i}"
                  >
                    {bit}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Operation indicator -->
          <div class="flex items-center gap-3">
            <span class="text-xs text-(--color-text-muted) w-16 shrink-0 font-mono">{currentOp.symbol}{operation === "lshift" || operation === "rshift" ? ` ${shiftAmount}` : ""}</span>
            <div class="border-t border-(--color-border)" style="width: {bitWidth * 20 + (bitWidth - 1)}px;"></div>
          </div>

          <!-- Result -->
          <div class="flex items-center gap-3">
            <span class="text-xs text-(--color-text-muted) w-16 shrink-0">Result</span>
            <div class="inline-flex gap-px">
              {#each formatResult(result, "bin").split("") as bit, i}
                <div
                  class="w-5 h-5 flex items-center justify-center text-xs font-mono {bit === '1'
                    ? 'bg-(--color-accent) text-(--color-btn-text)'
                    : 'bg-(--color-bg-alt) text-(--color-text-muted)'}"
                  title="Bit {bitWidth - 1 - i}"
                >
                  {bit}
                </div>
              {/each}
            </div>
          </div>

          <!-- Bit positions -->
          <div class="flex items-center gap-3">
            <span class="w-16 shrink-0"></span>
            <div class="inline-flex gap-px">
              {#each Array(bitWidth) as _, i}
                <div class="w-5 text-center text-[9px] text-(--color-text-muted)">
                  {bitWidth - 1 - i}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
