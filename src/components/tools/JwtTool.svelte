<script lang="ts">
  import { tick } from "svelte";
  import { json } from "@codemirror/lang-json";
  import {
    EditorView,
    EditorState,
    createBaseExtensions,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
  } from "../../lib/codemirror.js";
  import * as jose from "jose";

  type Algorithm = "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";

  let tokenInput = $state("");
  let secret = $state("");
  let algorithm = $state<Algorithm>("HS256");
  let error = $state("");
  let copiedToken = $state(false);
  let isDark = $state(false);
  let isSigningEnabled = $state(false);

  let headerEditorContainer: HTMLDivElement;
  let payloadEditorContainer: HTMLDivElement;
  let headerEditor: EditorView;
  let payloadEditor: EditorView;
  let mounted = $state(false);
  let signTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Track the source of changes to prevent loops
  let lastTokenFromSign = "";

  const algorithmOptions: Algorithm[] = ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384", "ES512"];

  const isSymmetricAlgorithm = (alg: Algorithm): boolean => {
    return alg.startsWith("HS");
  };

  // Import private key from PKCS8 PEM or JWK format
  const importPrivateKey = async (key: string, alg: Algorithm) => {
    const trimmedKey = key.trim();
    
    // Check if JWK (JSON format)
    if (trimmedKey.startsWith("{")) {
      try {
        const jwk = JSON.parse(trimmedKey) as jose.JWK;
        if (!jwk.kty) {
          throw new Error("Invalid JWK: missing 'kty' field");
        }
        return await jose.importJWK(jwk, alg);
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error("Invalid JSON format for JWK");
        }
        throw e;
      }
    }
    
    // Check if PKCS8 PEM
    if (trimmedKey.includes("-----BEGIN PRIVATE KEY-----")) {
      return await jose.importPKCS8(trimmedKey, alg);
    }
    
    throw new Error("Unsupported key format. Use PKCS8 PEM or JWK.");
  };

  const decodeToken = () => {
    error = "";

    const token = tokenInput.trim();
    if (!token) {
      updateEditorContent(headerEditor, "");
      updateEditorContent(payloadEditor, "");
      return;
    }

    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format. Expected 3 parts separated by dots.");
      }

      const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));

      updateEditorContent(headerEditor, JSON.stringify(header, null, 2));
      updateEditorContent(payloadEditor, JSON.stringify(payload, null, 2));

      // Update algorithm from header
      if (header.alg && algorithmOptions.includes(header.alg)) {
        algorithm = header.alg;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to decode JWT";
      updateEditorContent(headerEditor, "");
      updateEditorContent(payloadEditor, "");
    }
  };

  const signToken = async () => {
    if (!isSigningEnabled) return;
    
    const headerContent = getEditorContent(headerEditor);
    const payloadContent = getEditorContent(payloadEditor);

    if (!payloadContent.trim()) {
      tokenInput = "";
      lastTokenFromSign = "";
      return;
    }

    if (!secret.trim()) {
      error = "Secret/Private key is required for signing";
      return;
    }

    error = "";

    try {
      const payload = JSON.parse(payloadContent);
      let header: jose.JWTHeaderParameters = { alg: algorithm, typ: "JWT" };
      
      if (headerContent.trim()) {
        try {
          const parsedHeader = JSON.parse(headerContent);
          header = { ...header, ...parsedHeader, alg: algorithm };
        } catch {
          // Use default header if parsing fails
        }
      }

      let signedToken: string;

      if (isSymmetricAlgorithm(algorithm)) {
        // HMAC algorithms use a secret
        const secretKey = new TextEncoder().encode(secret);
        signedToken = await new jose.SignJWT(payload)
          .setProtectedHeader(header)
          .sign(secretKey);
      } else {
        // RSA/EC algorithms use a private key (PKCS8 or JWK)
        const privateKey = await importPrivateKey(secret, algorithm);
        signedToken = await new jose.SignJWT(payload)
          .setProtectedHeader(header)
          .sign(privateKey);
      }

      lastTokenFromSign = signedToken;
      tokenInput = signedToken;
    } catch (e) {
      if (e instanceof SyntaxError) {
        error = "Invalid JSON in payload";
      } else {
        error = e instanceof Error ? e.message : "Failed to sign JWT";
      }
    }
  };

  // Debounced sign function
  const debouncedSignToken = () => {
    if (signTimeout) {
      clearTimeout(signTimeout);
    }
    signTimeout = setTimeout(() => {
      signToken();
    }, 300);
  };

  const createHeaderEditor = (readOnly: boolean) => {
    if (!headerEditorContainer) return;
    const content = getEditorContent(headerEditor);
    if (headerEditor) headerEditor.destroy();

    const extensions = createBaseExtensions({
      dark: isDark,
      language: json(),
      placeholderText: '{"alg": "HS256", "typ": "JWT"}',
      readOnly: readOnly,
      onUpdate: readOnly ? undefined : () => debouncedSignToken(),
    });

    headerEditor = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions,
      }),
      parent: headerEditorContainer,
    });
  };

  const createPayloadEditor = (readOnly: boolean) => {
    if (!payloadEditorContainer) return;
    const content = getEditorContent(payloadEditor);
    if (payloadEditor) payloadEditor.destroy();

    const extensions = createBaseExtensions({
      dark: isDark,
      language: json(),
      placeholderText: '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "iat": 1516239022\n}',
      readOnly: readOnly,
      onUpdate: readOnly ? undefined : () => debouncedSignToken(),
    });

    payloadEditor = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions,
      }),
      parent: payloadEditorContainer,
    });
  };

  let hasMounted = $state(false);

  $effect(() => {
    if (!hasMounted) {
      hasMounted = true;

      isDark = getInitialDarkMode();

      const cleanup = createDarkModeObserver((newIsDark) => {
        if (newIsDark !== isDark) {
          isDark = newIsDark;
          createHeaderEditor(!isSigningEnabled);
          createPayloadEditor(!isSigningEnabled);
        }
      });

      tick().then(() => {
        createHeaderEditor(!isSigningEnabled);
        createPayloadEditor(!isSigningEnabled);
        mounted = true;
      });

      return () => {
        cleanup();
        if (signTimeout) clearTimeout(signTimeout);
        headerEditor?.destroy();
        payloadEditor?.destroy();
      };
    }
  });

  // Decode when token input changes from external source (not from signing)
  $effect(() => {
    tokenInput;
    if (mounted && tokenInput !== lastTokenFromSign) {
      lastTokenFromSign = "";
      decodeToken();
    }
  });

  // Re-sign when algorithm or secret changes (debounced)
  $effect(() => {
    algorithm;
    secret;
    if (mounted && isSigningEnabled) {
      debouncedSignToken();
    }
  });

  // Recreate editors when signing mode changes
  let prevSigningEnabled = $state(isSigningEnabled);
  $effect(() => {
    if (mounted && isSigningEnabled !== prevSigningEnabled) {
      prevSigningEnabled = isSigningEnabled;
      tick().then(() => {
        createHeaderEditor(!isSigningEnabled);
        createPayloadEditor(!isSigningEnabled);
      });
    }
  });

  const handleCopyToken = () => {
    if (tokenInput) {
      navigator.clipboard.writeText(tokenInput);
      copiedToken = true;
      setTimeout(() => { copiedToken = false; }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      lastTokenFromSign = ""; // Reset so it decodes
      tokenInput = text;
    });
  };

  const handleClear = () => {
    lastTokenFromSign = "";
    tokenInput = "";
    secret = "";
    error = "";
    updateEditorContent(headerEditor, "");
    updateEditorContent(payloadEditor, "");
  };

  const handleSampleToken = () => {
    lastTokenFromSign = ""; // Reset so it decodes
    tokenInput = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Decode JSON Web Tokens to inspect header and payload. Enable signing mode with a secret/private key to edit and re-sign tokens.
    </p>
  </header>

  <!-- Configuration -->
  <div class="mb-4 px-2 py-1 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap items-center gap-3 lg:gap-4">
      <!-- Algorithm -->
      <div class="flex items-center gap-2">
        <label
          for="algorithm"
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          Algorithm
        </label>
        <select
          id="algorithm"
          bind:value={algorithm}
          class="px-2 py-1.5 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
        >
          {#each algorithmOptions as alg}
            <option value={alg}>{alg}</option>
          {/each}
        </select>
      </div>

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      <!-- Enable Signing -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={isSigningEnabled}
          class="w-4 h-4 accent-(--color-text) hover:cursor-pointer"
        />
        <span class="text-sm text-(--color-text-muted)">Enable signing</span>
      </label>
    </div>

    <!-- Secret/Key Input -->
    {#if isSigningEnabled}
      <div class="mt-3 pt-3 border-t border-(--color-border)">
        <label
          for="secret"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          {isSymmetricAlgorithm(algorithm) ? "Secret" : "Private Key (PKCS8 or JWK)"}
        </label>
        {#if isSymmetricAlgorithm(algorithm)}
          <input
            id="secret"
            type="text"
            bind:value={secret}
            placeholder="your-256-bit-secret"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none font-mono text-sm"
          />
        {:else}
          <textarea
            id="secret"
            bind:value={secret}
            placeholder={'PKCS8: -----BEGIN PRIVATE KEY-----\nOr JWK: {"kty": "RSA", "n": "...", "d": "..."}'}
            rows="4"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none font-mono text-sm resize-none"
          ></textarea>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Token Input -->
  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
        JWT Token
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleSampleToken}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Sample
        </button>
        <button
          onclick={handlePaste}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste
        </button>
        <button
          onclick={handleCopyToken}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copiedToken ? "Copied!" : "Copy"}
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
      bind:value={tokenInput}
      placeholder="Paste your JWT token here..."
      rows="3"
      class="w-full px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none font-mono text-sm resize-none break-all"
    ></textarea>
  </div>

  <!-- Decoded Output -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Header -->
    <div class="flex-1 flex flex-col min-h-[150px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Header
        </span>
        {#if isSigningEnabled}
          <span class="text-xs text-(--color-text-muted)">Editable</span>
        {/if}
      </div>
      <div
        bind:this={headerEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>

    <!-- Payload -->
    <div class="flex-[2] flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Payload
        </span>
        {#if isSigningEnabled}
          <span class="text-xs text-(--color-text-muted)">Editable</span>
        {/if}
      </div>
      <div
        bind:this={payloadEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>
  </div>

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About JWT:</strong>
    JSON Web Tokens (JWT) are an open standard (RFC 7519) for securely transmitting information between parties as a JSON object.
    Enable signing mode and provide a secret (for HS* algorithms) or private key in PKCS8 PEM or JWK format (for RS*/ES* algorithms) to edit the payload and generate a new signed token.
  </div>
</div>
