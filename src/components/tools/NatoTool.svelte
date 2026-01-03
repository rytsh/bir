<script lang="ts">
  let input = $state("");
  let copied = $state(false);

  const natoAlphabet: Record<string, string> = {
    A: "Alfa",
    B: "Bravo",
    C: "Charlie",
    D: "Delta",
    E: "Echo",
    F: "Foxtrot",
    G: "Golf",
    H: "Hotel",
    I: "India",
    J: "Juliet",
    K: "Kilo",
    L: "Lima",
    M: "Mike",
    N: "November",
    O: "Oscar",
    P: "Papa",
    Q: "Quebec",
    R: "Romeo",
    S: "Sierra",
    T: "Tango",
    U: "Uniform",
    V: "Victor",
    W: "Whiskey",
    X: "X-ray",
    Y: "Yankee",
    Z: "Zulu",
    "0": "Zero",
    "1": "One",
    "2": "Two",
    "3": "Three",
    "4": "Four",
    "5": "Five",
    "6": "Six",
    "7": "Seven",
    "8": "Eight",
    "9": "Nine",
  };

  const convertToNato = (text: string): string => {
    return text
      .toUpperCase()
      .split("")
      .map((char) => {
        if (natoAlphabet[char]) {
          return natoAlphabet[char];
        } else if (char === " ") {
          return "(space)";
        } else if (char === "\n") {
          return "(newline)";
        } else {
          return char;
        }
      })
      .join(" ");
  };

  const output = $derived(convertToNato(input));

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

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      input = text;
    });
  };

  const alphabetEntries = Object.entries(natoAlphabet);
  const letters = alphabetEntries.filter(([key]) => /[A-Z]/.test(key));
  const numbers = alphabetEntries.filter(([key]) => /[0-9]/.test(key));
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert text to NATO phonetic alphabet. Type a word or phrase and see it spelled out using the standardized phonetic alphabet.
    </p>
  </header>

  <!-- Input Section -->
  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Input Text</span>
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
      placeholder="Enter text to convert..."
      class="w-full h-24 p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
    ></textarea>
  </div>

  <!-- Output Section -->
  <div class="mb-6">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">NATO Phonetic</span>
      <button
        onclick={handleCopy}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
    <div
      class="w-full min-h-24 p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm whitespace-pre-wrap break-words"
    >
      {#if output}
        {output}
      {:else}
        <span class="text-(--color-text-muted)">Result will appear here...</span>
      {/if}
    </div>
  </div>

  <!-- NATO Alphabet Reference -->
  <div class="border-t border-(--color-border) pt-6">
    <h2 class="text-sm font-medium text-(--color-text) mb-4">NATO Phonetic Alphabet Reference</h2>

    <!-- Letters -->
    <div class="mb-4">
      <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">Letters</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {#each letters as [letter, word]}
          <div class="flex items-center gap-2 p-2 bg-(--color-bg-alt) border border-(--color-border)">
            <span class="font-mono font-bold text-(--color-accent)">{letter}</span>
            <span class="text-sm text-(--color-text)">{word}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Numbers -->
    <div>
      <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">Numbers</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {#each numbers as [num, word]}
          <div class="flex items-center gap-2 p-2 bg-(--color-bg-alt) border border-(--color-border)">
            <span class="font-mono font-bold text-(--color-accent)">{num}</span>
            <span class="text-sm text-(--color-text)">{word}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
