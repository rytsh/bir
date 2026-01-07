<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import { createDarkModeObserver, getInitialDarkMode, createTheme, editorHeightExtension } from "../../lib/codemirror.js";
  import { onMount } from "svelte";

  type EncodingType = "base64" | "base62" | "base32" | "base58" | "base85";

  let encodingType = $state<EncodingType>("base64");
  let mode = $state<"encode" | "decode">("encode");
  let urlSafe = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());
  let urlInput = $state("");
  let urlLoading = $state(false);
  let showUrlInput = $state(false);
  let downloadFilename = $state("decoded-file");
  let fileMode = $state(false);

  let inputValue = $state("");
  let outputValue = $state("");
  let fileInput: HTMLInputElement;

  // CodeMirror extensions based on dark mode
  let inputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
  ]);

  let outputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-readonly": "true" }),
  ]);

  // ==================== Base64 ====================
  const toUrlSafe = (base64: string): string => {
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const fromUrlSafe = (urlSafeBase64: string): string => {
    let base64 = urlSafeBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;
    if (padding) {
      base64 += "=".repeat(4 - padding);
    }
    return base64;
  };

  const utf8ToBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte),
    ).join("");
    const base64 = btoa(binString);
    return urlSafe ? toUrlSafe(base64) : base64;
  };

  const base64ToUtf8 = (base64: string): string => {
    const standardBase64 = urlSafe ? fromUrlSafe(base64) : base64;
    const binString = atob(standardBase64);
    const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte),
    ).join("");
    const base64 = btoa(binString);
    return urlSafe ? toUrlSafe(base64) : base64;
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const standardBase64 = urlSafe ? fromUrlSafe(base64) : base64;
    const binString = atob(standardBase64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // ==================== Base32 ====================
  const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const BASE32_PAD = "=";

  const utf8ToBase32 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    return bytesToBase32(bytes);
  };

  const bytesToBase32 = (bytes: Uint8Array): string => {
    let result = "";
    let bits = 0;
    let value = 0;

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        bits -= 5;
        result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
      }
    }

    if (bits > 0) {
      result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    }

    // Add padding
    while (result.length % 8 !== 0) {
      result += BASE32_PAD;
    }

    return result;
  };

  const base32ToUtf8 = (base32: string): string => {
    const bytes = base32ToBytes(base32);
    return new TextDecoder().decode(bytes);
  };

  const base32ToBytes = (base32: string): Uint8Array => {
    const input = base32.toUpperCase().replace(/=+$/, "");
    const result: number[] = [];
    let bits = 0;
    let value = 0;

    for (const char of input) {
      const idx = BASE32_ALPHABET.indexOf(char);
      if (idx === -1) {
        throw new Error(`Invalid Base32 character: ${char}`);
      }
      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bits -= 8;
        result.push((value >>> bits) & 0xff);
      }
    }

    return new Uint8Array(result);
  };

  const arrayBufferToBase32 = (buffer: ArrayBuffer): string => {
    return bytesToBase32(new Uint8Array(buffer));
  };

  const base32ToArrayBuffer = (base32: string): ArrayBuffer => {
    return base32ToBytes(base32).buffer as ArrayBuffer;
  };

  // ==================== Base62 ====================
  const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  const utf8ToBase62 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    return bytesToBase62(bytes);
  };

  const bytesToBase62 = (bytes: Uint8Array): string => {
    if (bytes.length === 0) return "";

    // Count leading zeros
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) {
      zeros++;
    }

    // Convert to base62
    const size = Math.ceil(bytes.length * 138 / 100) + 1;
    const b62 = new Uint8Array(size);

    let length = 0;
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      let j = 0;

      for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
        carry += 256 * b62[k];
        b62[k] = carry % 62;
        carry = Math.floor(carry / 62);
      }

      length = j;
    }

    // Skip leading zeros in base62 result
    let start = size - length;
    while (start < size && b62[start] === 0) {
      start++;
    }

    // Build result string (use '0' for leading zeros since it's the first char in alphabet)
    let result = "0".repeat(zeros);
    for (let i = start; i < size; i++) {
      result += BASE62_ALPHABET[b62[i]];
    }

    return result;
  };

  const base62ToUtf8 = (base62: string): string => {
    const bytes = base62ToBytes(base62);
    return new TextDecoder().decode(bytes);
  };

  const base62ToBytes = (base62: string): Uint8Array => {
    if (base62.length === 0) return new Uint8Array(0);

    // Count leading '0's (zeros in decoded form)
    let zeros = 0;
    while (zeros < base62.length && base62[zeros] === "0") {
      zeros++;
    }

    // Allocate enough space
    const size = Math.ceil(base62.length * 733 / 1000) + 1;
    const b256 = new Uint8Array(size);

    let length = 0;
    for (let i = zeros; i < base62.length; i++) {
      const idx = BASE62_ALPHABET.indexOf(base62[i]);
      if (idx === -1) {
        throw new Error(`Invalid Base62 character: ${base62[i]}`);
      }

      let carry = idx;
      let j = 0;

      for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
        carry += 62 * b256[k];
        b256[k] = carry % 256;
        carry = Math.floor(carry / 256);
      }

      length = j;
    }

    // Skip leading zeros in byte array
    let start = size - length;
    while (start < size && b256[start] === 0) {
      start++;
    }

    // Build result with leading zeros
    const result = new Uint8Array(zeros + (size - start));
    for (let i = 0; i < zeros; i++) {
      result[i] = 0;
    }
    for (let i = start; i < size; i++) {
      result[zeros + i - start] = b256[i];
    }

    return result;
  };

  const arrayBufferToBase62 = (buffer: ArrayBuffer): string => {
    return bytesToBase62(new Uint8Array(buffer));
  };

  const base62ToArrayBuffer = (base62: string): ArrayBuffer => {
    return base62ToBytes(base62).buffer as ArrayBuffer;
  };

  // ==================== Base58 ====================
  const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  const utf8ToBase58 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    return bytesToBase58(bytes);
  };

  const bytesToBase58 = (bytes: Uint8Array): string => {
    if (bytes.length === 0) return "";

    // Count leading zeros
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) {
      zeros++;
    }

    // Convert to base58
    const size = Math.ceil(bytes.length * 138 / 100) + 1;
    const b58 = new Uint8Array(size);

    let length = 0;
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      let j = 0;

      for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
        carry += 256 * b58[k];
        b58[k] = carry % 58;
        carry = Math.floor(carry / 58);
      }

      length = j;
    }

    // Skip leading zeros in base58 result
    let start = size - length;
    while (start < size && b58[start] === 0) {
      start++;
    }

    // Build result string
    let result = "1".repeat(zeros);
    for (let i = start; i < size; i++) {
      result += BASE58_ALPHABET[b58[i]];
    }

    return result;
  };

  const base58ToUtf8 = (base58: string): string => {
    const bytes = base58ToBytes(base58);
    return new TextDecoder().decode(bytes);
  };

  const base58ToBytes = (base58: string): Uint8Array => {
    if (base58.length === 0) return new Uint8Array(0);

    // Count leading '1's (zeros in decoded form)
    let zeros = 0;
    while (zeros < base58.length && base58[zeros] === "1") {
      zeros++;
    }

    // Allocate enough space
    const size = Math.ceil(base58.length * 733 / 1000) + 1;
    const b256 = new Uint8Array(size);

    let length = 0;
    for (let i = zeros; i < base58.length; i++) {
      const idx = BASE58_ALPHABET.indexOf(base58[i]);
      if (idx === -1) {
        throw new Error(`Invalid Base58 character: ${base58[i]}`);
      }

      let carry = idx;
      let j = 0;

      for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
        carry += 58 * b256[k];
        b256[k] = carry % 256;
        carry = Math.floor(carry / 256);
      }

      length = j;
    }

    // Skip leading zeros in byte array
    let start = size - length;
    while (start < size && b256[start] === 0) {
      start++;
    }

    // Build result with leading zeros
    const result = new Uint8Array(zeros + (size - start));
    for (let i = 0; i < zeros; i++) {
      result[i] = 0;
    }
    for (let i = start; i < size; i++) {
      result[zeros + i - start] = b256[i];
    }

    return result;
  };

  const arrayBufferToBase58 = (buffer: ArrayBuffer): string => {
    return bytesToBase58(new Uint8Array(buffer));
  };

  const base58ToArrayBuffer = (base58: string): ArrayBuffer => {
    return base58ToBytes(base58).buffer as ArrayBuffer;
  };

  // ==================== Base85 (Ascii85) ====================
  const utf8ToBase85 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    return bytesToBase85(bytes);
  };

  const bytesToBase85 = (bytes: Uint8Array): string => {
    if (bytes.length === 0) return "";

    let result = "<~";
    const padding = (4 - (bytes.length % 4)) % 4;
    const padded = new Uint8Array(bytes.length + padding);
    padded.set(bytes);

    for (let i = 0; i < padded.length; i += 4) {
      let value = (padded[i] << 24) | (padded[i + 1] << 16) | (padded[i + 2] << 8) | padded[i + 3];
      value = value >>> 0; // Convert to unsigned

      // Special case for all zeros
      if (value === 0 && i + 4 <= bytes.length) {
        result += "z";
        continue;
      }

      const encoded = [];
      for (let j = 0; j < 5; j++) {
        encoded.unshift(String.fromCharCode((value % 85) + 33));
        value = Math.floor(value / 85);
      }

      // Only include necessary characters for last block
      if (i + 4 > bytes.length) {
        result += encoded.slice(0, 5 - padding).join("");
      } else {
        result += encoded.join("");
      }
    }

    result += "~>";
    return result;
  };

  const base85ToUtf8 = (base85: string): string => {
    const bytes = base85ToBytes(base85);
    return new TextDecoder().decode(bytes);
  };

  const base85ToBytes = (base85: string): Uint8Array => {
    // Remove <~ and ~> delimiters if present
    let input = base85.trim();
    if (input.startsWith("<~")) {
      input = input.slice(2);
    }
    if (input.endsWith("~>")) {
      input = input.slice(0, -2);
    }

    // Remove whitespace
    input = input.replace(/\s/g, "");

    if (input.length === 0) return new Uint8Array(0);

    const result: number[] = [];
    let i = 0;

    while (i < input.length) {
      // Handle 'z' shortcut for all zeros
      if (input[i] === "z") {
        result.push(0, 0, 0, 0);
        i++;
        continue;
      }

      // Get up to 5 characters
      const chunk = input.slice(i, i + 5);
      const chunkLen = chunk.length;
      i += chunkLen;

      // Pad short chunks for decoding
      let paddedChunk = chunk;
      while (paddedChunk.length < 5) {
        paddedChunk += "u"; // 'u' = 117, which is 84 + 33, the max value
      }

      // Decode chunk
      let value = 0;
      for (const char of paddedChunk) {
        const code = char.charCodeAt(0) - 33;
        if (code < 0 || code > 84) {
          throw new Error(`Invalid Base85 character: ${char}`);
        }
        value = value * 85 + code;
      }

      // Convert to bytes
      const bytes = [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
      ];

      // Only include necessary bytes for last chunk
      const bytesToAdd = chunkLen === 5 ? 4 : chunkLen - 1;
      for (let j = 0; j < bytesToAdd; j++) {
        result.push(bytes[j]);
      }
    }

    return new Uint8Array(result);
  };

  const arrayBufferToBase85 = (buffer: ArrayBuffer): string => {
    return bytesToBase85(new Uint8Array(buffer));
  };

  const base85ToArrayBuffer = (base85: string): ArrayBuffer => {
    return base85ToBytes(base85).buffer as ArrayBuffer;
  };

  // ==================== Generic Encoding/Decoding ====================
  const encode = (str: string): string => {
    switch (encodingType) {
      case "base64":
        return utf8ToBase64(str);
      case "base62":
        return utf8ToBase62(str);
      case "base32":
        return utf8ToBase32(str);
      case "base58":
        return utf8ToBase58(str);
      case "base85":
        return utf8ToBase85(str);
    }
  };

  const decode = (str: string): string => {
    switch (encodingType) {
      case "base64":
        return base64ToUtf8(str);
      case "base62":
        return base62ToUtf8(str);
      case "base32":
        return base32ToUtf8(str);
      case "base58":
        return base58ToUtf8(str);
      case "base85":
        return base85ToUtf8(str);
    }
  };

  const encodeBuffer = (buffer: ArrayBuffer): string => {
    switch (encodingType) {
      case "base64":
        return arrayBufferToBase64(buffer);
      case "base62":
        return arrayBufferToBase62(buffer);
      case "base32":
        return arrayBufferToBase32(buffer);
      case "base58":
        return arrayBufferToBase58(buffer);
      case "base85":
        return arrayBufferToBase85(buffer);
    }
  };

  const decodeToBuffer = (str: string): ArrayBuffer => {
    switch (encodingType) {
      case "base64":
        return base64ToArrayBuffer(str);
      case "base62":
        return base62ToArrayBuffer(str);
      case "base32":
        return base32ToArrayBuffer(str);
      case "base58":
        return base58ToArrayBuffer(str);
      case "base85":
        return base85ToArrayBuffer(str);
    }
  };

  const getEncodingLabel = (): string => {
    switch (encodingType) {
      case "base64":
        return "Base64";
      case "base62":
        return "Base62";
      case "base32":
        return "Base32";
      case "base58":
        return "Base58";
      case "base85":
        return "Base85 (Ascii85)";
    }
  };

  const convert = () => {
    error = "";

    if (!inputValue.trim()) {
      outputValue = "";
      return;
    }

    // Skip text conversion in file mode (decode mode)
    if (mode === "decode" && fileMode) {
      outputValue = "";
      return;
    }

    try {
      let result: string;
      if (mode === "encode") {
        result = encode(inputValue);
      } else {
        result = decode(inputValue);
      }
      outputValue = result;
    } catch (e) {
      error =
        mode === "decode" ? `Invalid ${getEncodingLabel()} string` : "Failed to encode string";
      outputValue = "";
    }
  };

  $effect(() => {
    // Re-check on mount in case SSR value was wrong
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
      }
    });

    return cleanup;
  });

  // Re-convert when input changes
  $effect(() => {
    inputValue;
    convert();
  });

  // Re-convert when mode changes
  $effect(() => {
    mode;
    convert();
  });

  // Re-convert when urlSafe changes
  $effect(() => {
    urlSafe;
    convert();
  });

  // Re-convert when fileMode changes
  $effect(() => {
    fileMode;
    convert();
  });

  // Re-convert when encodingType changes
  $effect(() => {
    encodingType;
    convert();
  });

  const handleSwap = () => {
    if (outputValue) {
      inputValue = outputValue;
      mode = mode === "encode" ? "decode" : "encode";
      error = "";
    }
  };

  const handleClear = () => {
    inputValue = "";
    error = "";
  };

  const handleCopy = () => {
    if (outputValue) {
      navigator.clipboard.writeText(outputValue);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      inputValue = text;
    });
  };

  const handleFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Set suggested filename for download
    downloadFilename = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as ArrayBuffer;
      const encoded = encodeBuffer(result);

      // When loading a file, switch to encode mode and show the encoded output
      mode = "encode";
      inputValue = `[Binary file: ${file.name}]`;
      outputValue = encoded;
      error = "";
    };
    reader.onerror = () => {
      error = "Failed to read file";
    };
    reader.readAsArrayBuffer(file);

    // Reset file input
    input.value = "";
  };

  const handleFromFile = () => {
    fileInput?.click();
  };

  const handleFromUrl = async () => {
    if (!urlInput.trim()) {
      error = "Please enter a URL";
      return;
    }

    urlLoading = true;
    error = "";

    try {
      const response = await fetch(urlInput);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const encoded = encodeBuffer(buffer);

      // Extract filename from URL
      const urlPath = new URL(urlInput).pathname;
      const filename = urlPath.split("/").pop() || "downloaded-file";
      downloadFilename = filename;

      mode = "encode";
      inputValue = `[Content from URL: ${urlInput}]`;
      outputValue = encoded;
      showUrlInput = false;
      urlInput = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch URL";
    } finally {
      urlLoading = false;
    }
  };

  const handleDownloadAsFile = () => {
    if (!inputValue.trim()) {
      error = `No ${getEncodingLabel()} content to decode`;
      return;
    }

    try {
      const buffer = decodeToBuffer(inputValue);
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename || "decoded-file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      error = `Invalid ${getEncodingLabel()} string - cannot decode to file`;
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Encode text or files to Base64/Base62/Base58/Base32/Base85, decode encoded strings, or download decoded
      content as a file.
    </p>
  </header>

  <!-- Hidden file input -->
  <input
    type="file"
    bind:this={fileInput}
    onchange={handleFileSelect}
    class="hidden"
  />

  <!-- Encoding Type Selector -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1 flex-wrap">
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {encodingType === 'base64'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          encodingType = "base64";
          error = "";
        }}
      >
        Base64
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {encodingType === 'base62'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          encodingType = "base62";
          error = "";
        }}
      >
        Base62
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {encodingType === 'base58'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          encodingType = "base58";
          error = "";
        }}
      >
        Base58
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {encodingType === 'base32'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          encodingType = "base32";
          error = "";
        }}
      >
        Base32
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {encodingType === 'base85'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          encodingType = "base85";
          error = "";
        }}
      >
        Base85
      </button>
    </div>
  </div>

  <!-- Mode Toggle -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
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
    {#if encodingType === "base64"}
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={urlSafe}
          class="w-4 h-4 accent-(--color-accent)"
        />
        <span class="text-sm text-(--color-text)">URL-safe</span>
      </label>
    {/if}
  </div>

  <!-- URL Input -->
  {#if showUrlInput}
    <div class="mb-4 flex gap-2 items-center">
      <input
        type="url"
        bind:value={urlInput}
        placeholder="Enter URL to fetch..."
        class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        onkeydown={(e) => e.key === "Enter" && handleFromUrl()}
      />
      <button
        onclick={handleFromUrl}
        disabled={urlLoading}
        class="px-3 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {urlLoading ? "Loading..." : "Fetch"}
      </button>
      <button
        onclick={() => {
          showUrlInput = false;
          urlInput = "";
        }}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Cancel
      </button>
    </div>
  {/if}

  <!-- Download filename input (shown in decode mode) -->
  {#if mode === "decode"}
    <div class="mb-4 flex flex-wrap gap-4 items-center">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={fileMode}
          class="w-4 h-4 accent-(--color-accent)"
        />
        <span class="text-sm text-(--color-text)">File mode</span>
      </label>
      <div class={`flex gap-2 items-center ${fileMode ? "" : "invisible"}`}>
        <span class="text-xs text-(--color-text-muted)">Filename:</span>
        <input
          type="text"
          bind:value={downloadFilename}
          placeholder="filename"
          class="px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
        <button
          onclick={handleDownloadAsFile}
          class="px-3 py-1 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
        >
          Download
        </button>
      </div>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {error}
    </div>
  {/if}

  <!-- Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Input Editor -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          {mode === "encode" ? "Text to Encode" : `${getEncodingLabel()} to Decode`}
        </span>
        <div class="flex gap-3">
          {#if mode === "encode"}
            <button
              onclick={handleFromFile}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              From File
            </button>
            <button
              onclick={() => {
                showUrlInput = !showUrlInput;
              }}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              From URL
            </button>
          {/if}
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
      <div class="flex-1 border border-(--color-border) overflow-hidden">
        <CodeMirror
          bind:value={inputValue}
          placeholder={mode === "encode"
            ? "Enter text to encode..."
            : `Enter ${getEncodingLabel()} string to decode...`}
          extensions={inputExtensions}
        />
      </div>
    </div>

    <!-- Output Editor -->
    {#if !(mode === "decode" && fileMode)}
      <div class="flex-1 flex flex-col min-h-[200px]">
        <div class="flex justify-between items-center mb-2">
          <span
            class="text-xs tracking-wider text-(--color-text-light) font-medium"
          >
            {mode === "encode" ? `Encoded ${getEncodingLabel()}` : "Decoded Text"}
          </span>
          <div class="flex gap-3">
            <button
              onclick={handleSwap}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              title="Use output as new input"
            >
              Swap
            </button>
            <button
              onclick={handleCopy}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)">
          <CodeMirror
            bind:value={outputValue}
            placeholder="Result will appear here..."
            extensions={outputExtensions}
          />
        </div>
      </div>
    {/if}
  </div>
</div>
