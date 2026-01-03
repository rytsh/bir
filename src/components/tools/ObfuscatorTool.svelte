<script lang="ts">
  import { random } from "../../lib/random";

  type ObfuscationMethod =
    | "asterisk"
    | "hash"
    | "dots"
    | "custom"
    | "random"
    | "reverse"
    | "rot13"
    | "leetspeak"
    | "unicode";

  interface MethodOption {
    id: ObfuscationMethod;
    name: string;
    description: string;
  }

  const methods: MethodOption[] = [
    {
      id: "asterisk",
      name: "Asterisks (*)",
      description: "Replace characters with asterisks (*)",
    },
    {
      id: "hash",
      name: "Hash (#)",
      description: "Replace characters with hash symbols (#)",
    },
    {
      id: "dots",
      name: "Dots (•)",
      description: "Replace characters with dots (•)",
    },
    {
      id: "custom",
      name: "Custom Character",
      description: "Replace with your own character",
    },
    {
      id: "random",
      name: "Random Characters",
      description: "Replace with random characters",
    },
    { id: "reverse", name: "Reverse", description: "Reverse the text" },
    {
      id: "rot13",
      name: "ROT13",
      description: "Caesar cipher with 13-character rotation",
    },
    {
      id: "leetspeak",
      name: "Leetspeak",
      description: "Convert to 1337 speak (a→4, e→3, etc.)",
    },
    {
      id: "unicode",
      name: "Unicode Alternatives",
      description: "Replace with similar-looking Unicode characters",
    },
  ];

  let input = $state("");
  let method = $state<ObfuscationMethod>("asterisk");
  let customChar = $state("X");
  let keepSpaces = $state(true);
  let keepNumbers = $state(false);
  let keepPunctuation = $state(false);
  let partialObfuscate = $state(true);
  let keepFirstN = $state(4);
  let keepLastN = $state(4);
  let partialFixedLengthCount = $state(0);
  let fixedLength = $state(false);
  let fixedLengthCount = $state(8);
  let copied = $state(false);

  const leetMap: Record<string, string> = {
    a: "4",
    A: "4",
    b: "8",
    B: "8",
    e: "3",
    E: "3",
    g: "6",
    G: "6",
    i: "1",
    I: "1",
    l: "1",
    L: "1",
    o: "0",
    O: "0",
    s: "5",
    S: "5",
    t: "7",
    T: "7",
    z: "2",
    Z: "2",
  };

  const unicodeMap: Record<string, string> = {
    a: "а",
    A: "А", // Cyrillic
    c: "ϲ",
    C: "Ϲ", // Greek
    e: "е",
    E: "Е", // Cyrillic
    o: "о",
    O: "О", // Cyrillic
    p: "р",
    P: "Р", // Cyrillic
    s: "ѕ",
    S: "Ѕ", // Cyrillic
    x: "х",
    X: "Х", // Cyrillic
    y: "у",
    Y: "У", // Cyrillic
    i: "і",
    I: "І", // Cyrillic
    j: "ј",
    J: "Ј", // Cyrillic
  };

  const randomChars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

  const shouldObfuscate = (char: string): boolean => {
    if (keepSpaces && /\s/.test(char)) return false;
    if (keepNumbers && /\d/.test(char)) return false;
    if (keepPunctuation && /[.,!?;:'"()\-]/.test(char)) return false;
    return true;
  };

  const getReplacementChar = (methodType: ObfuscationMethod): string => {
    switch (methodType) {
      case "asterisk":
        return "*";
      case "hash":
        return "#";
      case "dots":
        return "•";
      case "custom":
        return customChar || "*";
      default:
        return "*";
    }
  };

  const obfuscateChar = (
    char: string,
    methodType: ObfuscationMethod,
  ): string => {
    if (!shouldObfuscate(char)) return char;

    switch (methodType) {
      case "asterisk":
        return "*";
      case "hash":
        return "#";
      case "dots":
        return "•";
      case "custom":
        return customChar || "*";
      case "random":
        return randomChars[Math.floor(random() * randomChars.length)];
      case "rot13":
        if (/[a-zA-Z]/.test(char)) {
          const base = char <= "Z" ? 65 : 97;
          return String.fromCharCode(
            ((char.charCodeAt(0) - base + 13) % 26) + base,
          );
        }
        return char;
      case "leetspeak":
        return leetMap[char] || char;
      case "unicode":
        return unicodeMap[char] || char;
      default:
        return "*";
    }
  };

  const obfuscate = (text: string): string => {
    if (!text) return "";

    // Fixed length mode - replace entire text with N characters
    if (
      fixedLength &&
      (method === "asterisk" ||
        method === "hash" ||
        method === "dots" ||
        method === "custom")
    ) {
      const char = getReplacementChar(method);
      return char.repeat(fixedLengthCount);
    }

    // Handle reverse separately as it works on the whole string
    if (method === "reverse") {
      if (partialObfuscate) {
        // Reverse only the middle part of entire text
        if (text.length <= keepFirstN + keepLastN) return text;
        const first = text.slice(0, keepFirstN);
        const middle = text.slice(keepFirstN, text.length - keepLastN);
        const last = text.slice(text.length - keepLastN);
        return first + middle.split("").reverse().join("") + last;
      }
      return text.split("").reverse().join("");
    }

    // For partial obfuscation, work on entire text (not per word)
    if (partialObfuscate) {
      if (text.length <= keepFirstN + keepLastN) return text;

      const first = text.slice(0, keepFirstN);
      const last = keepLastN > 0 ? text.slice(-keepLastN) : "";

      // Fixed length middle section
      if (
        partialFixedLengthCount > 0 &&
        (method === "asterisk" ||
          method === "hash" ||
          method === "dots" ||
          method === "custom")
      ) {
        const char = getReplacementChar(method);
        return first + char.repeat(partialFixedLengthCount) + last;
      }

      const middle =
        keepLastN > 0
          ? text.slice(keepFirstN, -keepLastN)
          : text.slice(keepFirstN);

      const obfuscatedMiddle = middle
        .split("")
        .map((char) => obfuscateChar(char, method))
        .join("");

      return first + obfuscatedMiddle + last;
    }

    // Full obfuscation
    return text
      .split("")
      .map((char) => obfuscateChar(char, method))
      .join("");
  };

  const output = $derived(obfuscate(input));

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  const handleClear = () => {
    input = "";
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    input = text;
  };

  const currentMethod = $derived(methods.find((m) => m.id === method));
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Obfuscate text by replacing characters with symbols, random characters, or
      applying transformations like ROT13 and leetspeak.
    </p>
  </header>

  <!-- Method Selection -->
  <div class="mb-4 flex flex-wrap gap-4 items-start">
    <div class="flex-1 min-w-[200px]">
      <label
        for="method-select"
        class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
      >
        Obfuscation Method
      </label>
      <select
        id="method-select"
        bind:value={method}
        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
      >
        {#each methods as m}
          <option value={m.id}>{m.name}</option>
        {/each}
      </select>
      {#if currentMethod}
        <p class="mt-1 text-xs text-(--color-text-muted)">
          {currentMethod.description}
        </p>
      {/if}
    </div>

    {#if method === "custom"}
      <div>
        <label
          for="custom-char"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Custom Character
        </label>
        <input
          id="custom-char"
          type="text"
          maxlength="1"
          bind:value={customChar}
          class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm font-mono text-center focus:outline-none focus:border-(--color-accent)"
        />
      </div>
    {/if}
  </div>

  <!-- Options -->
  <div
    class="mb-4 px-4 py-3 border border-(--color-border) bg-(--color-bg-alt)"
  >
    <div
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
    >
      Options
    </div>

    <div class="flex flex-wrap gap-x-6 gap-y-3 mb-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={keepSpaces}
          disabled={fixedLength}
          class="w-4 h-4 accent-(--color-accent) disabled:opacity-50"
        />
        <span
          class="text-sm text-(--color-text) {fixedLength ? 'opacity-50' : ''}"
          >Keep spaces</span
        >
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={keepNumbers}
          disabled={fixedLength}
          class="w-4 h-4 accent-(--color-accent) disabled:opacity-50"
        />
        <span
          class="text-sm text-(--color-text) {fixedLength ? 'opacity-50' : ''}"
          >Keep numbers</span
        >
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={keepPunctuation}
          disabled={fixedLength}
          class="w-4 h-4 accent-(--color-accent) disabled:opacity-50"
        />
        <span
          class="text-sm text-(--color-text) {fixedLength ? 'opacity-50' : ''}"
          >Keep punctuation</span
        >
      </label>
    </div>

    <div class="flex flex-row gap-4 border-t border-(--color-border) pt-3">
      <!-- Partial Obfuscation -->
      <div>
        <label class="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            bind:checked={partialObfuscate}
            disabled={fixedLength}
            class="w-4 h-4 accent-(--color-accent) disabled:opacity-50"
          />
          <span
            class="text-sm text-(--color-text) {fixedLength
              ? 'opacity-50'
              : ''}">Partial obfuscation (keep first/last characters)</span
          >
        </label>

        <div
          class={`flex flex-wrap gap-4 ml-6 ${partialObfuscate && !fixedLength ? "" : "invisible"}`}
        >
          <div>
            <label
              for="keep-first"
              class="block text-xs text-(--color-text-light) mb-1"
              >Keep first N</label
            >
            <input
              id="keep-first"
              type="number"
              min="0"
              max="50"
              bind:value={keepFirstN}
              class="w-20 px-3 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div>
            <label
              for="keep-last"
              class="block text-xs text-(--color-text-light) mb-1"
              >Keep last N</label
            >
            <input
              id="keep-last"
              type="number"
              min="0"
              max="50"
              bind:value={keepLastN}
              class="w-20 px-3 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          {#if method === "asterisk" || method === "hash" || method === "dots" || method === "custom"}
            <div>
              <label
                for="partial-fixed-count"
                class="block text-xs text-(--color-text-light) mb-1"
                >Fixed middle (0=auto)</label
              >
              <input
                id="partial-fixed-count"
                type="number"
                min="0"
                max="100"
                bind:value={partialFixedLengthCount}
                class="w-20 px-3 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          {/if}
        </div>
      </div>
      <!-- Fixed Length -->
      {#if method === "asterisk" || method === "hash" || method === "dots" || method === "custom"}
        <div>
          <label class="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              bind:checked={fixedLength}
              class="w-4 h-4 accent-(--color-accent)"
            />
            <span class="text-sm text-(--color-text)"
              >Fixed length (replace all text with N characters)</span
            >
          </label>

          <div class={`ml-6 ${fixedLength ? "" : "invisible"}`}>
            <label
              for="fixed-count"
              class="block text-xs text-(--color-text-light) mb-1"
              >Number of characters</label
            >
            <input
              id="fixed-count"
              type="number"
              min="1"
              max="100"
              bind:value={fixedLengthCount}
              class="w-24 px-3 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Input/Output -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-[200px]">
    <!-- Input -->
    <div class="flex-1 flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
          >Input Text</span
        >
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
      <textarea
        bind:value={input}
        placeholder="Enter text to obfuscate..."
        class="flex-1 p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
      ></textarea>
    </div>

    <!-- Output -->
    <div class="flex-1 flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
          >Obfuscated Text</span
        >
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div
        class="flex-1 p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm overflow-auto whitespace-pre-wrap break-all"
      >
        {#if output}
          {output}
        {:else}
          <span class="text-(--color-text-muted)"
            >Result will appear here...</span
          >
        {/if}
      </div>
    </div>
  </div>

  <!-- Examples Section -->
  <div class="mt-6 border-t border-(--color-border) pt-4">
    <h2 class="text-sm font-medium text-(--color-text) mb-3">Examples</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Asterisks</div>
        <div class="font-mono text-(--color-text)">Hello → *****</div>
      </div>
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Hash</div>
        <div class="font-mono text-(--color-text)">Hello → #####</div>
      </div>
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Partial (4,4)</div>
        <div class="font-mono text-(--color-text)">
          SecretPassword → Secr******word
        </div>
      </div>
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Partial Fixed (8)</div>
        <div class="font-mono text-(--color-text)">
          SecretPassword → Secr********word
        </div>
      </div>
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">ROT13</div>
        <div class="font-mono text-(--color-text)">Hello → Uryyb</div>
      </div>
    </div>
  </div>
</div>
