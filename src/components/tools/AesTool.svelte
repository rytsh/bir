<script lang="ts">
  import CryptoJS from "crypto-js";

  type Tab = "encrypt" | "decrypt";
  type AesMode = "aes-256-cbc" | "aes-256-ctr" | "aes-256-gcm";
  type KeyMode = "password" | "openssl" | "raw";
  type OutputFormat = "base64" | "hex";

  let activeTab = $state<Tab>("encrypt");

  // Shared config
  let aesMode = $state<AesMode>("aes-256-cbc");
  let keyMode = $state<KeyMode>("password");
  let outputFormat = $state<OutputFormat>("base64");

  // Password-based key input
  let passphrase = $state("");
  let iterations = $state(10000);

  // Raw key input
  let rawKey = $state("");
  let rawIv = $state("");

  // GCM-specific
  let aad = $state("");

  // Encrypt tab state
  let encryptInput = $state("");
  let encryptOutput = $state("");
  let encryptIvDisplay = $state("");
  let encryptSaltDisplay = $state("");
  let encryptTagDisplay = $state("");
  let encrypting = $state(false);

  // Decrypt tab state
  let decryptInput = $state("");
  let decryptOutput = $state("");
  let decrypting = $state(false);
  let decryptIvInput = $state("");
  let decryptSaltInput = $state("");
  let decryptTagInput = $state("");

  // Shared state
  let error = $state("");
  let copiedField = $state("");

  const tabs: { id: Tab; label: string }[] = [
    { id: "encrypt", label: "Encrypt" },
    { id: "decrypt", label: "Decrypt" },
  ];

  const modes: { id: AesMode; label: string }[] = [
    { id: "aes-256-cbc", label: "AES-256-CBC" },
    { id: "aes-256-ctr", label: "AES-256-CTR" },
    { id: "aes-256-gcm", label: "AES-256-GCM" },
  ];

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = "";
    }, 2000);
  };

  const handleTabSwitch = (tab: Tab) => {
    activeTab = tab;
    error = "";
  };

  const hexToBytes = (hex: string): Uint8Array => {
    const clean = hex.replace(/\s/g, "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
  };

  const bytesToHex = (bytes: Uint8Array): string => {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const generateRandom = (byteLength: number): Uint8Array => {
    return crypto.getRandomValues(new Uint8Array(byteLength));
  };

  const wordArrayToUint8Array = (wordArray: CryptoJS.lib.WordArray): Uint8Array => {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const bytes = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
      bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return bytes;
  };

  const uint8ArrayToWordArray = (bytes: Uint8Array): CryptoJS.lib.WordArray => {
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      let word = 0;
      for (let j = 0; j < 4 && i + j < bytes.length; j++) {
        word |= bytes[i + j] << (24 - j * 8);
      }
      words.push(word);
    }
    return CryptoJS.lib.WordArray.create(words, bytes.length);
  };

  const deriveKeyAndIv = (passphrase: string, salt: Uint8Array, iterations: number): { key: CryptoJS.lib.WordArray; iv: CryptoJS.lib.WordArray } => {
    const saltWA = uint8ArrayToWordArray(salt);
    const keySize = 256 / 32; // 8 words = 256 bits
    const ivSize = 128 / 32; // 4 words = 128 bits
    const derived = CryptoJS.PBKDF2(passphrase, saltWA, {
      keySize: keySize + ivSize,
      iterations: iterations,
      hasher: CryptoJS.algo.SHA256,
    });
    const derivedBytes = wordArrayToUint8Array(derived);
    const key = uint8ArrayToWordArray(derivedBytes.slice(0, 32));
    const iv = uint8ArrayToWordArray(derivedBytes.slice(32, 48));
    return { key, iv };
  };

  const encryptCbcCtr = (plaintext: string, mode: AesMode): void => {
    const cryptoMode = mode === "aes-256-cbc" ? CryptoJS.mode.CBC : CryptoJS.mode.CTR;

    if (keyMode === "openssl") {
      // OpenSSL/CryptoJS mode: pass passphrase as string, CryptoJS handles
      // EVP_BytesToKey derivation, salt generation, and OpenSSL format output
      if (!passphrase) {
        error = "Please enter a passphrase.";
        return;
      }
      const encrypted = CryptoJS.AES.encrypt(plaintext, passphrase, {
        mode: cryptoMode,
        padding: CryptoJS.pad.Pkcs7,
      });
      // .toString() returns Base64 with embedded "Salted__" + salt + ciphertext
      encryptOutput = encrypted.toString();
      // No separate salt/IV to display — they're embedded in the output
      encryptSaltDisplay = "";
      encryptIvDisplay = "";
      encryptTagDisplay = "";
      return;
    }

    let key: CryptoJS.lib.WordArray;
    let iv: CryptoJS.lib.WordArray;

    if (keyMode === "password") {
      if (!passphrase) {
        error = "Please enter a passphrase.";
        return;
      }
      const salt = generateRandom(16);
      const derived = deriveKeyAndIv(passphrase, salt, iterations);
      key = derived.key;
      iv = derived.iv;
      encryptSaltDisplay = bytesToHex(salt);
      encryptIvDisplay = bytesToHex(wordArrayToUint8Array(iv));
    } else {
      const cleanKey = rawKey.replace(/\s/g, "");
      const cleanIv = rawIv.replace(/\s/g, "");
      if (cleanKey.length !== 64) {
        error = "Key must be exactly 64 hex characters (256 bits).";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
        error = "Key must contain only hexadecimal characters.";
        return;
      }
      if (cleanIv.length === 0) {
        const ivBytes = generateRandom(16);
        iv = uint8ArrayToWordArray(ivBytes);
        encryptIvDisplay = bytesToHex(ivBytes);
      } else if (cleanIv.length !== 32) {
        error = "IV must be exactly 32 hex characters (128 bits).";
        return;
      } else {
        if (!/^[0-9a-fA-F]+$/.test(cleanIv)) {
          error = "IV must contain only hexadecimal characters.";
          return;
        }
        iv = uint8ArrayToWordArray(hexToBytes(cleanIv));
        encryptIvDisplay = cleanIv.toLowerCase();
      }
      key = uint8ArrayToWordArray(hexToBytes(cleanKey));
      encryptSaltDisplay = "";
    }

    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
      iv: iv,
      mode: cryptoMode,
      padding: CryptoJS.pad.Pkcs7,
    });

    const ciphertextBytes = wordArrayToUint8Array(encrypted.ciphertext);
    if (outputFormat === "base64") {
      encryptOutput = btoa(String.fromCharCode(...ciphertextBytes));
    } else {
      encryptOutput = bytesToHex(ciphertextBytes);
    }
    encryptTagDisplay = "";
  };

  const decryptCbcCtr = (ciphertext: string, mode: AesMode): void => {
    const cryptoMode = mode === "aes-256-cbc" ? CryptoJS.mode.CBC : CryptoJS.mode.CTR;

    if (keyMode === "openssl") {
      // OpenSSL/CryptoJS mode: pass ciphertext (Base64 with embedded Salted__ header)
      // and passphrase as string — CryptoJS extracts salt, derives key+IV, decrypts
      if (!passphrase) {
        error = "Please enter a passphrase.";
        return;
      }
      const decrypted = CryptoJS.AES.decrypt(ciphertext.trim(), passphrase, {
        mode: cryptoMode,
        padding: CryptoJS.pad.Pkcs7,
      });
      const result = decrypted.toString(CryptoJS.enc.Utf8);
      if (!result) {
        error = "Decryption failed. Check your passphrase and ciphertext.";
        return;
      }
      decryptOutput = result;
      return;
    }

    let key: CryptoJS.lib.WordArray;
    let iv: CryptoJS.lib.WordArray;

    let ciphertextBytes: Uint8Array;
    try {
      ciphertextBytes = decodeCiphertext(ciphertext);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to decode ciphertext.";
      return;
    }

    if (keyMode === "password") {
      if (!passphrase) {
        error = "Please enter a passphrase.";
        return;
      }
      const cleanSalt = decryptSaltInput.replace(/\s/g, "");
      if (cleanSalt.length !== 32) {
        error = "Salt must be exactly 32 hex characters (128 bits). Use the salt from encryption.";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanSalt)) {
        error = "Salt must contain only hexadecimal characters.";
        return;
      }
      const salt = hexToBytes(cleanSalt);
      const derived = deriveKeyAndIv(passphrase, salt, iterations);
      key = derived.key;
      iv = derived.iv;
    } else {
      const cleanKey = rawKey.replace(/\s/g, "");
      const cleanIv = decryptIvInput.replace(/\s/g, "");
      if (cleanKey.length !== 64) {
        error = "Key must be exactly 64 hex characters (256 bits).";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
        error = "Key must contain only hexadecimal characters.";
        return;
      }
      if (cleanIv.length !== 32) {
        error = "IV must be exactly 32 hex characters (128 bits). Use the IV from encryption.";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanIv)) {
        error = "IV must contain only hexadecimal characters.";
        return;
      }
      key = uint8ArrayToWordArray(hexToBytes(cleanKey));
      iv = uint8ArrayToWordArray(hexToBytes(cleanIv));
    }

    const ciphertextWA = uint8ArrayToWordArray(ciphertextBytes);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertextWA,
    });

    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: iv,
      mode: cryptoMode,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) {
      error = "Decryption failed. Check your key, IV, and ciphertext.";
      return;
    }
    decryptOutput = result;
  };

  const encryptGcm = async (plaintext: string): Promise<void> => {
    if (keyMode === "openssl") {
      error = "OpenSSL/CryptoJS password mode is not supported with GCM. Use PBKDF2 or Raw Key + IV instead.";
      return;
    }

    let keyBytes: Uint8Array;
    let ivBytes: Uint8Array;

    if (keyMode === "password") {
      if (!passphrase) {
        error = "Please enter a passphrase.";
        return;
      }
      const salt = generateRandom(16);
      const derived = deriveKeyAndIv(passphrase, salt, iterations);
      keyBytes = wordArrayToUint8Array(derived.key);
      // GCM typically uses 12-byte IV for best performance
      ivBytes = generateRandom(12);
      encryptSaltDisplay = bytesToHex(salt);
      encryptIvDisplay = bytesToHex(ivBytes);
    } else {
      const cleanKey = rawKey.replace(/\s/g, "");
      if (cleanKey.length !== 64) {
        error = "Key must be exactly 64 hex characters (256 bits).";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
        error = "Key must contain only hexadecimal characters.";
        return;
      }
      keyBytes = hexToBytes(cleanKey);

      const cleanIv = rawIv.replace(/\s/g, "");
      if (cleanIv.length === 0) {
        ivBytes = generateRandom(12);
        encryptIvDisplay = bytesToHex(ivBytes);
      } else if (cleanIv.length !== 24) {
        error = "IV for GCM must be exactly 24 hex characters (96 bits / 12 bytes).";
        return;
      } else {
        if (!/^[0-9a-fA-F]+$/.test(cleanIv)) {
          error = "IV must contain only hexadecimal characters.";
          return;
        }
        ivBytes = hexToBytes(cleanIv);
        encryptIvDisplay = cleanIv.toLowerCase();
      }
      encryptSaltDisplay = "";
    }

    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    const algParams: AesGcmParams = {
      name: "AES-GCM",
      iv: ivBytes.buffer as ArrayBuffer,
      tagLength: 128,
    };
    if (aad.trim()) {
      algParams.additionalData = encoder.encode(aad.trim());
    }

    const encryptedBuffer = await crypto.subtle.encrypt(algParams, cryptoKey, plaintextBytes);
    const encryptedBytes = new Uint8Array(encryptedBuffer);

    // Web Crypto appends the tag to the ciphertext
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
    const tag = encryptedBytes.slice(encryptedBytes.length - 16);

    if (outputFormat === "base64") {
      encryptOutput = btoa(String.fromCharCode(...ciphertext));
    } else {
      encryptOutput = bytesToHex(ciphertext);
    }
    encryptTagDisplay = bytesToHex(tag);
  };

  const decryptGcm = async (ciphertext: string): Promise<void> => {
    if (keyMode === "openssl") {
      error = "OpenSSL/CryptoJS password mode is not supported with GCM. Use PBKDF2 or Raw Key + IV instead.";
      return;
    }

    let keyBytes: Uint8Array;
    let ivBytes: Uint8Array;

    let ciphertextBytes: Uint8Array;
    try {
      ciphertextBytes = decodeCiphertext(ciphertext);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to decode ciphertext.";
      return;
    }

    // Parse tag
    const cleanTag = decryptTagInput.replace(/\s/g, "");
    if (cleanTag.length !== 32) {
      error = "Auth tag must be exactly 32 hex characters (128 bits). Use the tag from encryption.";
      return;
    }
    if (!/^[0-9a-fA-F]+$/.test(cleanTag)) {
      error = "Auth tag must contain only hexadecimal characters.";
      return;
    }
    const tagBytes = hexToBytes(cleanTag);

    if (keyMode === "password") {
      if (!passphrase) {
        error = "Please enter a passphrase.";
        return;
      }
      const cleanSalt = decryptSaltInput.replace(/\s/g, "");
      if (cleanSalt.length !== 32) {
        error = "Salt must be exactly 32 hex characters (128 bits). Use the salt from encryption.";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanSalt)) {
        error = "Salt must contain only hexadecimal characters.";
        return;
      }
      const salt = hexToBytes(cleanSalt);
      const derived = deriveKeyAndIv(passphrase, salt, iterations);
      keyBytes = wordArrayToUint8Array(derived.key);

      // Need IV for GCM decrypt
      const cleanIv = decryptIvInput.replace(/\s/g, "");
      if (cleanIv.length !== 24) {
        error = "IV for GCM must be exactly 24 hex characters (96 bits / 12 bytes). Use the IV from encryption.";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanIv)) {
        error = "IV must contain only hexadecimal characters.";
        return;
      }
      ivBytes = hexToBytes(cleanIv);
    } else {
      const cleanKey = rawKey.replace(/\s/g, "");
      if (cleanKey.length !== 64) {
        error = "Key must be exactly 64 hex characters (256 bits).";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
        error = "Key must contain only hexadecimal characters.";
        return;
      }
      keyBytes = hexToBytes(cleanKey);

      const cleanIv = decryptIvInput.replace(/\s/g, "");
      if (cleanIv.length !== 24) {
        error = "IV for GCM must be exactly 24 hex characters (96 bits / 12 bytes). Use the IV from encryption.";
        return;
      }
      if (!/^[0-9a-fA-F]+$/.test(cleanIv)) {
        error = "IV must contain only hexadecimal characters.";
        return;
      }
      ivBytes = hexToBytes(cleanIv);
    }

    // Web Crypto expects ciphertext + tag concatenated
    const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
    combined.set(ciphertextBytes);
    combined.set(tagBytes, ciphertextBytes.length);

    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);

    const algParams: AesGcmParams = {
      name: "AES-GCM",
      iv: ivBytes.buffer as ArrayBuffer,
      tagLength: 128,
    };
    if (aad.trim()) {
      algParams.additionalData = new TextEncoder().encode(aad.trim());
    }

    const decryptedBuffer = await crypto.subtle.decrypt(algParams, cryptoKey, combined);
    const decoder = new TextDecoder();
    decryptOutput = decoder.decode(decryptedBuffer);
  };

  const decodeCiphertext = (input: string): Uint8Array => {
    const trimmed = input.trim();
    // Try base64 first
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0) {
      try {
        const binary = atob(trimmed);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      } catch {
        // Fall through to hex
      }
    }
    // Try hex
    const cleanHex = trimmed.replace(/\s/g, "");
    if (/^[0-9a-fA-F]+$/.test(cleanHex) && cleanHex.length % 2 === 0) {
      return hexToBytes(cleanHex);
    }
    throw new Error("Ciphertext must be valid Base64 or hexadecimal.");
  };

  const handleEncrypt = async () => {
    error = "";
    encryptOutput = "";
    encryptIvDisplay = "";
    encryptSaltDisplay = "";
    encryptTagDisplay = "";

    if (!encryptInput.trim()) {
      error = "Please enter text to encrypt.";
      return;
    }

    encrypting = true;
    try {
      if (aesMode === "aes-256-gcm") {
        await encryptGcm(encryptInput);
      } else {
        encryptCbcCtr(encryptInput, aesMode);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Encryption failed.";
    } finally {
      encrypting = false;
    }
  };

  const handleDecrypt = async () => {
    error = "";
    decryptOutput = "";

    if (!decryptInput.trim()) {
      error = "Please enter ciphertext to decrypt.";
      return;
    }

    decrypting = true;
    try {
      if (aesMode === "aes-256-gcm") {
        await decryptGcm(decryptInput);
      } else {
        decryptCbcCtr(decryptInput, aesMode);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Decryption failed. Check your inputs.";
    } finally {
      decrypting = false;
    }
  };

  const handleGenerateKey = () => {
    const keyBytes = generateRandom(32);
    rawKey = bytesToHex(keyBytes);
  };

  const handleGenerateIv = () => {
    const length = aesMode === "aes-256-gcm" ? 12 : 16;
    const ivBytes = generateRandom(length);
    rawIv = bytesToHex(ivBytes);
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Encrypt and decrypt text using AES-256 with CBC, CTR, or GCM modes.
      Supports PBKDF2 key derivation, OpenSSL/CryptoJS-compatible password mode (EVP_BytesToKey), and raw key/IV input.
      Compatible with n8n encrypted credentials. All operations run entirely in your browser.
    </p>
  </header>

  <!-- Tabs -->
  <div class="mb-4 flex border-b border-(--color-border) overflow-x-auto">
    {#each tabs as tab}
      <button
        onclick={() => handleTabSwitch(tab.id)}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors {activeTab === tab.id
          ? 'text-(--color-text) border-b-2 border-(--color-accent)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Config Bar -->
  <div class="mb-4 flex flex-wrap gap-3 items-end">
    <!-- AES Mode -->
    <div>
      <label for="aes-mode" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
        Mode
      </label>
      <select
        id="aes-mode"
        bind:value={aesMode}
        class="px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
      >
        {#each modes as mode}
          <option value={mode.id}>{mode.label}</option>
        {/each}
      </select>
    </div>

    <!-- Key Mode -->
    <div>
      <label for="key-mode" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
        Key Input
      </label>
      <select
        id="key-mode"
        bind:value={keyMode}
        class="px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
      >
        <option value="password">Password (PBKDF2)</option>
        <option value="openssl">Password (OpenSSL / CryptoJS)</option>
        <option value="raw">Raw Key + IV</option>
      </select>
    </div>

    <div class="ml-auto flex items-end gap-3">
      <!-- Output Format -->
      <div>
        <label for="output-format" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
          Output
        </label>
        <select
          id="output-format"
          bind:value={outputFormat}
          class="px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          <option value="base64">Base64</option>
          <option value="hex">Hex</option>
        </select>
      </div>

      {#if activeTab === "encrypt"}
        <button
          onclick={handleEncrypt}
          disabled={encrypting}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
        >
          {encrypting ? "Encrypting..." : "Encrypt"}
        </button>
      {:else}
        <button
          onclick={handleDecrypt}
          disabled={decrypting}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
        >
          {decrypting ? "Decrypting..." : "Decrypt"}
        </button>
      {/if}
    </div>
  </div>

  <!-- Key Input Section -->
  <div class="mb-4 flex flex-col gap-3">
    {#if keyMode === "password"}
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="flex-1">
          <label for="passphrase" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
            Passphrase
          </label>
          <input
            id="passphrase"
            type="password"
            bind:value={passphrase}
            placeholder="Enter your passphrase"
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
        <div class="sm:w-40">
          <label for="iterations" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
            PBKDF2 Iterations
          </label>
          <input
            id="iterations"
            type="number"
            bind:value={iterations}
            min="1000"
            step="1000"
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      </div>
    {:else if keyMode === "openssl"}
      <div>
        <label for="passphrase-openssl" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
          Passphrase
        </label>
        <input
          id="passphrase-openssl"
          type="password"
          bind:value={passphrase}
          placeholder="Enter your passphrase (e.g. N8N_ENCRYPTION_KEY)"
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
        <p class="mt-1 text-xs text-(--color-text-muted)">
          Uses EVP_BytesToKey (MD5-based) key derivation — compatible with OpenSSL, CryptoJS, and n8n credential encryption.
          Salt and IV are embedded in the ciphertext automatically.
        </p>
      </div>
    {:else}
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="flex-1">
          <div class="flex justify-between items-center mb-1">
            <label for="raw-key" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Key (64 hex chars = 256 bits)
            </label>
            <button
              onclick={handleGenerateKey}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Generate
            </button>
          </div>
          <input
            id="raw-key"
            type="text"
            bind:value={rawKey}
            placeholder="0123456789abcdef..."
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
        <div class="flex-1">
          <div class="flex justify-between items-center mb-1">
            <label for="raw-iv" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              IV ({aesMode === "aes-256-gcm" ? "24" : "32"} hex chars, optional for encrypt)
            </label>
            <button
              onclick={handleGenerateIv}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Generate
            </button>
          </div>
          <input
            id="raw-iv"
            type="text"
            bind:value={rawIv}
            placeholder={aesMode === "aes-256-gcm" ? "12 bytes (96 bits) hex" : "16 bytes (128 bits) hex"}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      </div>
    {/if}

    {#if aesMode === "aes-256-gcm"}
      <div>
        <label for="aad" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
          Additional Authenticated Data (optional)
        </label>
        <input
          id="aad"
          type="text"
          bind:value={aad}
          placeholder="AAD for authenticated encryption (must match for decrypt)"
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Encrypt Tab -->
  {#if activeTab === "encrypt"}
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Left: Input -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-1 flex flex-col min-h-[150px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Plaintext</span>
              <button
                onclick={async () => { encryptInput = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={encryptInput}
              placeholder="Enter text to encrypt..."
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
        </div>

        <!-- Right: Output -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-1 flex flex-col min-h-[150px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Ciphertext</span>
              {#if encryptOutput}
                <button
                  onclick={() => handleCopy(encryptOutput, "enc-out")}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  {copiedField === "enc-out" ? "Copied!" : "Copy"}
                </button>
              {/if}
            </div>
            <textarea
              readonly
              value={encryptOutput}
              placeholder="Encrypted output will appear here..."
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none"
            ></textarea>
          </div>

          <!-- Generated parameters -->
          {#if encryptIvDisplay || encryptSaltDisplay || encryptTagDisplay}
            <div class="flex flex-col gap-2 p-3 bg-(--color-bg-alt) border border-(--color-border) text-xs">
              <span class="text-(--color-text-light) font-medium tracking-wider">Generated Parameters (save these for decryption)</span>
              {#if encryptSaltDisplay}
                <div class="flex items-center justify-between gap-2">
                  <span class="text-(--color-text-muted)">Salt:</span>
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-(--color-text) break-all">{encryptSaltDisplay}</code>
                    <button
                      onclick={() => handleCopy(encryptSaltDisplay, "enc-salt")}
                      class="text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                    >
                      {copiedField === "enc-salt" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              {/if}
              {#if encryptIvDisplay}
                <div class="flex items-center justify-between gap-2">
                  <span class="text-(--color-text-muted)">IV:</span>
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-(--color-text) break-all">{encryptIvDisplay}</code>
                    <button
                      onclick={() => handleCopy(encryptIvDisplay, "enc-iv")}
                      class="text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                    >
                      {copiedField === "enc-iv" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              {/if}
              {#if encryptTagDisplay}
                <div class="flex items-center justify-between gap-2">
                  <span class="text-(--color-text-muted)">Auth Tag:</span>
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-(--color-text) break-all">{encryptTagDisplay}</code>
                    <button
                      onclick={() => handleCopy(encryptTagDisplay, "enc-tag")}
                      class="text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                    >
                      {copiedField === "enc-tag" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>

  <!-- Decrypt Tab -->
  {:else if activeTab === "decrypt"}
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Left: Input -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-1 flex flex-col min-h-[150px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Ciphertext (Base64 or Hex)</span>
              <button
                onclick={async () => { decryptInput = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={decryptInput}
              placeholder="Paste encrypted ciphertext (Base64 or Hex)..."
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>

          <!-- Decrypt parameters -->
          <div class="flex flex-col gap-2">
            {#if keyMode === "openssl"}
              <p class="text-xs text-(--color-text-muted)">
                No additional parameters needed — salt and IV are extracted from the ciphertext automatically.
              </p>
            {/if}
            {#if keyMode === "password"}
              <div>
                <label for="dec-salt" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
                  Salt (from encryption)
                </label>
                <input
                  id="dec-salt"
                  type="text"
                  bind:value={decryptSaltInput}
                  placeholder="32 hex characters"
                  class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
            {/if}
            {#if (keyMode === "raw" || aesMode === "aes-256-gcm") && keyMode !== "openssl"}
              <div>
                <label for="dec-iv" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
                  IV (from encryption)
                </label>
                <input
                  id="dec-iv"
                  type="text"
                  bind:value={decryptIvInput}
                  placeholder={aesMode === "aes-256-gcm" ? "24 hex characters (96 bits)" : "32 hex characters (128 bits)"}
                  class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
            {/if}
            {#if aesMode === "aes-256-gcm" && keyMode !== "openssl"}
              <div>
                <label for="dec-tag" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
                  Auth Tag (from encryption)
                </label>
                <input
                  id="dec-tag"
                  type="text"
                  bind:value={decryptTagInput}
                  placeholder="32 hex characters (128 bits)"
                  class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
            {/if}
          </div>
        </div>

        <!-- Right: Output -->
        <div class="flex-1 flex flex-col min-h-[200px]">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Decrypted Plaintext</span>
            {#if decryptOutput}
              <button
                onclick={() => handleCopy(decryptOutput, "dec-out")}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedField === "dec-out" ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <textarea
            readonly
            value={decryptOutput}
            placeholder="Decrypted plaintext will appear here..."
            class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none"
          ></textarea>
        </div>
      </div>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About AES-256:</strong>
    AES (Advanced Encryption Standard) with a 256-bit key is a symmetric-key algorithm widely used for secure data encryption.
    <strong>CBC</strong> (Cipher Block Chaining) is the most common mode.
    <strong>CTR</strong> (Counter) mode turns AES into a stream cipher.
    <strong>GCM</strong> (Galois/Counter Mode) provides both encryption and authentication, ensuring data integrity.
    <strong>PBKDF2</strong> mode derives keys using PBKDF2 with SHA-256 and a configurable iteration count.
    <strong>OpenSSL/CryptoJS</strong> mode uses EVP_BytesToKey (MD5-based) key derivation, producing ciphertext in the standard OpenSSL "Salted__" format.
    This mode is compatible with <code>openssl enc</code>, CryptoJS, and n8n credential encryption — paste your <code>N8N_ENCRYPTION_KEY</code> as the passphrase to decrypt n8n credentials.
  </div>
</div>
