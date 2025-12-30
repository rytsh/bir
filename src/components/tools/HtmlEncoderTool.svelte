<script lang="ts">
  let input = $state("");
  let output = $state("");
  let mode = $state<"encode" | "decode">("encode");
  let encodeAllChars = $state(false);
  let error = $state("");
  let copied = $state(false);

  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  const reverseHtmlEntities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };

  const encodeHtml = (str: string): string => {
    if (encodeAllChars) {
      // Encode all non-ASCII and special characters
      return str
        .split("")
        .map((char) => {
          if (htmlEntities[char]) {
            return htmlEntities[char];
          }
          const code = char.charCodeAt(0);
          if (code > 127) {
            return `&#${code};`;
          }
          return char;
        })
        .join("");
    }

    // Only encode special HTML characters
    return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
  };

  const decodeHtml = (str: string): string => {
    // First replace named entities
    let result = str;
    for (const [entity, char] of Object.entries(reverseHtmlEntities)) {
      result = result.split(entity).join(char);
    }

    // Then replace numeric entities (decimal)
    result = result.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );

    // Then replace numeric entities (hexadecimal)
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );

    return result;
  };

  const handleConvert = () => {
    error = "";
    try {
      if (mode === "encode") {
        output = encodeHtml(input);
      } else {
        output = decodeHtml(input);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Conversion failed";
      output = "";
    }
  };

  // Auto-convert on input change
  $effect(() => {
    input;
    mode;
    encodeAllChars;
    if (input) {
      handleConvert();
    } else {
      output = "";
      error = "";
    }
  });

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
      HTML Encoder / Decoder
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Encode special characters to HTML entities or decode HTML entities back to text.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-5 lg:mb-6 flex flex-wrap items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 lg:px-4 py-1.5 text-sm font-medium transition-colors {mode === 'encode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "encode";
          error = "";
        }}
      >
        Encode
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
        Decode
      </button>
    </div>

    {#if mode === "encode"}
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={encodeAllChars}
          class="w-4 h-4 accent-(--color-text)"
        />
        <span class="text-sm text-(--color-text-muted)">Encode all non-ASCII characters</span>
      </label>
    {/if}
  </div>

  <div class="grid gap-4 lg:gap-5">
    <!-- Input -->
    <div>
      <div class="flex justify-between items-center mb-2">
        <label
          for="input"
          class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          {mode === "encode" ? "Text to Encode" : "HTML to Decode"}
        </label>
        <div class="flex gap-2">
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
        id="input"
        bind:value={input}
        placeholder={mode === "encode"
          ? "Enter text with special characters like <div>, \"quotes\", & ampersands..."
          : "Enter HTML entities like &lt;div&gt;, &quot;quotes&quot;, &amp; ampersands..."}
        class="w-full h-32 lg:h-40 p-3 lg:p-4 border border-(--color-border) bg-(--color-bg-alt) font-mono text-sm resize-none focus:border-(--color-text-light) outline-none transition-colors placeholder:text-(--color-text-light)"
        spellcheck="false"
      ></textarea>
    </div>

    <!-- Actions -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        onclick={handleSwap}
        class="px-4 py-2.5 lg:py-2 border border-(--color-border) text-(--color-text-muted) text-sm font-medium hover:border-(--color-text-light) hover:text-(--color-text) active:bg-(--color-border) transition-colors"
        title="Swap input and output"
      >
        Swap
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
          {mode === "encode" ? "Encoded HTML" : "Decoded Text"}
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
        class="w-full h-32 lg:h-40 p-3 lg:p-4 border border-(--color-border) bg-(--color-bg) font-mono text-sm resize-none placeholder:text-(--color-text-light)"
        spellcheck="false"
      ></textarea>
    </div>
  </div>

  <!-- Info -->
  <div class="mt-6 lg:mt-8 p-3 lg:p-4 border border-(--color-border) bg-(--color-bg-alt)">
    <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
      Common HTML Entities
    </h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-sm text-(--color-text-muted) font-mono">
      <div><span class="text-(--color-text)">&lt;</span> → &amp;lt;</div>
      <div><span class="text-(--color-text)">&gt;</span> → &amp;gt;</div>
      <div><span class="text-(--color-text)">&amp;</span> → &amp;amp;</div>
      <div><span class="text-(--color-text)">"</span> → &amp;quot;</div>
      <div><span class="text-(--color-text)">'</span> → &amp;#39;</div>
    </div>
  </div>
</div>
