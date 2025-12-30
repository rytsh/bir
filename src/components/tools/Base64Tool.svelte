<script lang="ts">
  let input = $state("");
  let output = $state("");
  let mode = $state<"encode" | "decode">("encode");
  let error = $state("");
  let copied = $state(false);

  const utf8ToBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte),
    ).join("");
    return btoa(binString);
  };

  const base64ToUtf8 = (base64: string): string => {
    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  };

  const handleConvert = () => {
    error = "";
    try {
      if (mode === "encode") {
        output = utf8ToBase64(input);
      } else {
        output = base64ToUtf8(input);
      }
    } catch (e) {
      error =
        mode === "decode" ? "Invalid Base64 string" : "Failed to encode string";
      output = "";
    }
  };

  const handleSwap = () => {
    const temp = input;
    input = output;
    output = temp;
    mode = mode === "encode" ? "decode" : "encode";
    error = "";
  };

  const handleClear = () => {
    input = "";
    output = "";
    error = "";
  };

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      input = text;
    });
  };
</script>

<div>
  <header class="mb-6 lg:mb-8">
    <h1 class="text-xl lg:text-2xl font-medium text-(--color-text) mb-2">
      Base64 Encoder / Decoder
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Encode text to Base64 or decode Base64 strings back to text.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-5 lg:mb-6 p-1 bg-(--color-border) inline-flex gap-1">
    <button
      class="px-3 lg:px-4 py-1.5 text-sm font-medium transition-colors {mode === 'encode'
        ? 'bg-(--color-text) text-(--color-btn-text)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      onclick={() => {
        mode = "encode";
        error = "";
      }}
    >
      Encoder
    </button>
    <button
      class="px-3 lg:px-4 py-1.5 text-sm font-medium transition-colors {mode === 'decode'
        ? 'bg-(--color-text) text-(--color-btn-text)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      onclick={() => {
        mode = "decode";
        error = "";
      }}
    >
      Decoder
    </button>
  </div>

  <div class="grid gap-4 lg:gap-5">
    <!-- Input -->
    <div>
      <div class="flex justify-between items-center mb-2">
        <label
          for="input"
          class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          {mode === "encode" ? "Text to Encode" : "Base64 to Decode"}
        </label>
        <button
          onclick={handlePaste}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste
        </button>
      </div>
      <textarea
        id="input"
        bind:value={input}
        placeholder={mode === "encode"
          ? "Enter text to encode..."
          : "Enter Base64 string to decode..."}
        class="w-full h-32 lg:h-36 p-3 lg:p-4 border border-(--color-border) bg-(--color-bg-alt) font-mono text-sm resize-none focus:border-(--color-text-light) outline-none transition-colors placeholder:text-(--color-text-light)"
      ></textarea>
    </div>

    <!-- Actions -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        onclick={handleConvert}
        class="flex-1 sm:flex-none px-5 py-2.5 lg:py-2 bg-(--color-text) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) active:opacity-80 transition-colors"
      >
        {mode === "encode" ? "Encode" : "Decode"}
      </button>
      <button
        onclick={handleSwap}
        class="px-4 py-2.5 lg:py-2 border border-(--color-border) text-(--color-text-muted) text-sm font-medium hover:border-(--color-text-light) hover:text-(--color-text) active:bg-(--color-border) transition-colors"
        title="Swap input and output"
      >
        Swap
      </button>
      <button
        onclick={handleClear}
        class="px-4 py-2.5 lg:py-2 border border-(--color-border) text-(--color-text-muted) text-sm font-medium hover:border-(--color-text-light) hover:text-(--color-text) active:bg-(--color-border) transition-colors"
      >
        Clear
      </button>
    </div>

    <!-- Error -->
    {#if error}
      <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
        {error}
      </div>
    {/if}

    <!-- Output -->
    <div>
      <div class="flex justify-between items-center mb-2">
        <label
          for="output"
          class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          {mode === "encode" ? "Encoded Base64" : "Decoded Text"}
        </label>
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:text-(--color-text-light) disabled:cursor-not-allowed"
          disabled={!output}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        id="output"
        value={output}
        readonly
        placeholder="Result will appear here..."
        class="w-full h-32 lg:h-36 p-3 lg:p-4 border border-(--color-border) bg-(--color-bg) font-mono text-sm resize-none placeholder:text-(--color-text-light)"
      ></textarea>
    </div>
  </div>

  <!-- Info -->
  <div class="mt-6 lg:mt-8 p-3 lg:p-4 border border-(--color-border) bg-(--color-bg-alt)">
    <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
      About Base64
    </h3>
    <p class="text-sm text-(--color-text-muted)">
      Base64 is a binary-to-text encoding scheme that represents binary data in
      an ASCII string format. It's commonly used to encode data that needs to be
      stored or transferred over media that only supports text.
    </p>
  </div>
</div>
