<script lang="ts">
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
    initEditorsWithRetry,
  } from "../../lib/codemirror.js";

  type BitSize = 1024 | 2048 | 4096;

  let bitSize = $state<BitSize>(1024);
  let passphrase = $state("");
  let generating = $state(false);
  let error = $state("");
  let copiedPublic = $state(false);
  let copiedPrivate = $state(false);
  let isDark = $state(false);
  let hasKeys = $state(false);

  let publicKeyContainer: HTMLDivElement;
  let privateKeyContainer: HTMLDivElement;
  let publicKeyEditor: EditorView;
  let privateKeyEditor: EditorView;

  const bitSizes: BitSize[] = [1024, 2048, 4096];

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const formatPem = (base64: string, type: "PUBLIC" | "PRIVATE" | "ENCRYPTED PRIVATE"): string => {
    const lines: string[] = [];
    for (let i = 0; i < base64.length; i += 64) {
      lines.push(base64.slice(i, i + 64));
    }
    return `-----BEGIN ${type} KEY-----\n${lines.join("\n")}\n-----END ${type} KEY-----`;
  };

  const deriveKeyFromPassphrase = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: "SHA-256",
      },
      passphraseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
  };

  const encryptPrivateKey = async (privateKeyBuffer: ArrayBuffer, passphrase: string): Promise<string> => {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive encryption key from passphrase
    const encryptionKey = await deriveKeyFromPassphrase(passphrase, salt);

    // Encrypt the private key
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      encryptionKey,
      privateKeyBuffer
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

    return arrayBufferToBase64(combined.buffer);
  };

  const generateKeys = async () => {
    generating = true;
    error = "";
    hasKeys = false;
    updateEditorContent(publicKeyEditor, "");
    updateEditorContent(privateKeyEditor, "");

    try {
      // Generate RSA key pair using Web Crypto API
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: bitSize,
          publicExponent: new Uint8Array([1, 0, 1]), // 65537
          hash: "SHA-256",
        },
        true, // extractable
        ["encrypt", "decrypt"]
      );

      // Export public key in SPKI format (standard for PKCS#8 public keys)
      const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
      const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);
      const publicKeyPem = formatPem(publicKeyBase64, "PUBLIC");

      // Export private key in PKCS#8 format
      const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

      let privateKeyPem: string;
      if (passphrase.trim()) {
        // Encrypt the private key with passphrase
        const encryptedBase64 = await encryptPrivateKey(privateKeyBuffer, passphrase.trim());
        privateKeyPem = formatPem(encryptedBase64, "ENCRYPTED PRIVATE");
      } else {
        // No passphrase - use plain PKCS#8
        const privateKeyBase64 = arrayBufferToBase64(privateKeyBuffer);
        privateKeyPem = formatPem(privateKeyBase64, "PRIVATE");
      }

      updateEditorContent(publicKeyEditor, publicKeyPem);
      updateEditorContent(privateKeyEditor, privateKeyPem);
      hasKeys = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Key generation failed";
    } finally {
      generating = false;
    }
  };

  const createPublicKeyEditor = (): boolean => {
    if (!publicKeyContainer) return false;
    const content = getEditorContent(publicKeyEditor);
    if (publicKeyEditor) publicKeyEditor.destroy();

    publicKeyEditor = createEditor({
      container: publicKeyContainer,
      config: {
        dark: isDark,
        placeholderText: "Public key will appear here...",
        readOnly: true,
      },
      initialContent: content,
    });
    return true;
  };

  const createPrivateKeyEditor = (): boolean => {
    if (!privateKeyContainer) return false;
    const content = getEditorContent(privateKeyEditor);
    if (privateKeyEditor) privateKeyEditor.destroy();

    privateKeyEditor = createEditor({
      container: privateKeyContainer,
      config: {
        dark: isDark,
        placeholderText: "Private key will appear here...",
        readOnly: true,
      },
      initialContent: content,
    });
    return true;
  };

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createPublicKeyEditor();
        createPrivateKeyEditor();
      }
    });

    initEditorsWithRetry([createPublicKeyEditor, createPrivateKeyEditor]);

    return () => {
      cleanup();
      publicKeyEditor?.destroy();
      privateKeyEditor?.destroy();
    };
  });

  const handleCopyPublic = () => {
    const content = getEditorContent(publicKeyEditor);
    if (content) {
      navigator.clipboard.writeText(content);
      copiedPublic = true;
      setTimeout(() => { copiedPublic = false; }, 2000);
    }
  };

  const handleCopyPrivate = () => {
    const content = getEditorContent(privateKeyEditor);
    if (content) {
      navigator.clipboard.writeText(content);
      copiedPrivate = true;
      setTimeout(() => { copiedPrivate = false; }, 2000);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPublic = () => {
    const content = getEditorContent(publicKeyEditor);
    if (content) {
      downloadFile(content, "id_rsa.pub");
    }
  };

  const handleDownloadPrivate = () => {
    const content = getEditorContent(privateKeyEditor);
    if (content) {
      downloadFile(content, "id_rsa");
    }
  };

  const handleClear = () => {
    updateEditorContent(publicKeyEditor, "");
    updateEditorContent(privateKeyEditor, "");
    hasKeys = false;
    error = "";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate RSA public and private key pairs in PKCS#8 format.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="flex items-center gap-2">
      <span class="text-sm text-(--color-text-muted)">Key Size:</span>
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        {#each bitSizes as size}
          <button
            class="px-3 py-1 text-sm font-medium transition-colors {bitSize === size
              ? 'bg-(--color-text) text-(--color-btn-text)'
              : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            onclick={() => (bitSize = size)}
            disabled={generating}
          >
            {size}
          </button>
        {/each}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <label for="passphrase" class="text-sm text-(--color-text-muted)">Passphrase:</label>
      <input
        id="passphrase"
        type="password"
        bind:value={passphrase}
        placeholder="Optional"
        disabled={generating}
        class="px-3 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none w-40"
      />
    </div>

    <button
      onclick={generateKeys}
      disabled={generating}
      class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generating ? "Generating..." : "Generate"}
    </button>

    <button
      onclick={handleClear}
      class="text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors"
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

  <!-- Key Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Public Key -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Public Key (SPKI)
        </span>
        <div class="flex gap-3">
          <button
            onclick={handleDownloadPublic}
            disabled={!hasKeys}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download
          </button>
          <button
            onclick={handleCopyPublic}
            disabled={!hasKeys}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copiedPublic ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div
        bind:this={publicKeyContainer}
        class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
      ></div>
    </div>

    <!-- Private Key -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Private Key (PKCS#8)
        </span>
        <div class="flex gap-3">
          <button
            onclick={handleDownloadPrivate}
            disabled={!hasKeys}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download
          </button>
          <button
            onclick={handleCopyPrivate}
            disabled={!hasKeys}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copiedPrivate ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div
        bind:this={privateKeyContainer}
        class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
      ></div>
    </div>
  </div>

  <!-- Info -->
  <div class="mt-4 p-3 border border-(--color-border) bg-(--color-bg-alt) text-xs text-(--color-text-muted)">
    <p><strong>Note:</strong> Keys are generated locally in your browser using the Web Crypto API. They are never sent to any server.</p>
    <p class="mt-1">Larger key sizes (2048, 4096) provide better security but take longer to generate.</p>
    <p class="mt-1">If a passphrase is provided, the private key will be encrypted with AES-256-GCM using PBKDF2 key derivation.</p>
  </div>
</div>
