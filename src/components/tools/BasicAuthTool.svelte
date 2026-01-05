<script lang="ts">
  let mode = $state<"encode" | "decode">("encode");
  let username = $state("");
  let password = $state("");
  let encodedValue = $state("");
  let error = $state("");
  let copied = $state(false);

  // Decoded values for decode mode
  let decodedUsername = $state("");
  let decodedPassword = $state("");

  const encodeBasicAuth = (user: string, pass: string): string => {
    const credentials = `${user}:${pass}`;
    const bytes = new TextEncoder().encode(credentials);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte)
    ).join("");
    return btoa(binString);
  };

  const decodeBasicAuth = (encoded: string): { username: string; password: string } => {
    // Remove "Basic " prefix if present
    const base64 = encoded.replace(/^Basic\s+/i, "").trim();
    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
    const decoded = new TextDecoder().decode(bytes);
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      throw new Error("Invalid Basic Auth format: missing colon separator");
    }
    return {
      username: decoded.substring(0, colonIndex),
      password: decoded.substring(colonIndex + 1),
    };
  };

  // Effect for encoding
  $effect(() => {
    if (mode === "encode") {
      error = "";
      if (!username && !password) {
        encodedValue = "";
        return;
      }
      try {
        const encoded = encodeBasicAuth(username, password);
        encodedValue = `Basic ${encoded}`;
      } catch (e) {
        error = "Failed to encode credentials";
        encodedValue = "";
      }
    }
  });

  // Effect for decoding
  $effect(() => {
    if (mode === "decode") {
      error = "";
      decodedUsername = "";
      decodedPassword = "";
      if (!encodedValue.trim()) {
        return;
      }
      try {
        const { username: u, password: p } = decodeBasicAuth(encodedValue);
        decodedUsername = u;
        decodedPassword = p;
      } catch (e) {
        error = e instanceof Error ? e.message : "Invalid Basic Auth string";
      }
    }
  });

  const handleClear = () => {
    username = "";
    password = "";
    encodedValue = "";
    decodedUsername = "";
    decodedPassword = "";
    error = "";
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    if (mode === "decode") {
      encodedValue = text;
    }
  };

  const handleSwap = () => {
    if (mode === "encode" && encodedValue) {
      mode = "decode";
    } else if (mode === "decode" && decodedUsername) {
      username = decodedUsername;
      password = decodedPassword;
      mode = "encode";
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Encode username and password to HTTP Basic Authentication header format, or decode existing Basic Auth strings.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-4 flex items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'encode'
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
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'decode'
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
  </div>

  <!-- Error -->
  {#if error}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {error}
    </div>
  {/if}

  {#if mode === "encode"}
    <!-- Encode Mode -->
    <div class="space-y-4">
      <div>
        <div class="flex justify-between items-center mb-2">
          <label for="username" class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Username
          </label>
          <button
            onclick={handleClear}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
        <input
          id="username"
          type="text"
          bind:value={username}
          placeholder="Enter username..."
          class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <div>
        <label for="password" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Password
        </label>
        <input
          id="password"
          type="text"
          bind:value={password}
          placeholder="Enter password..."
          class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <div>
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Authorization Header
          </span>
          <div class="flex gap-3">
            <button
              onclick={handleSwap}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              title="Decode this value"
            >
              Swap
            </button>
            <button
              onclick={() => handleCopy(encodedValue)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono break-all min-h-[42px]">
          {encodedValue || "Result will appear here..."}
        </div>
      </div>
    </div>
  {:else}
    <!-- Decode Mode -->
    <div class="space-y-4">
      <div>
        <div class="flex justify-between items-center mb-2">
          <label for="encoded" class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Authorization Header
          </label>
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
          id="encoded"
          type="text"
          bind:value={encodedValue}
          placeholder="Enter Basic Auth string (e.g., Basic dXNlcjpwYXNz)..."
          class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent) font-mono"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Username
            </span>
            <button
              onclick={() => handleCopy(decodedUsername)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Copy
            </button>
          </div>
          <div class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) min-h-[42px]">
            {decodedUsername || "-"}
          </div>
        </div>

        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Password
            </span>
            <button
              onclick={() => handleCopy(decodedPassword)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Copy
            </button>
          </div>
          <div class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) min-h-[42px]">
            {decodedPassword || "-"}
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button
          onclick={handleSwap}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Use decoded values for encoding"
        >
          Swap to Encode
        </button>
      </div>
    </div>
  {/if}
</div>
