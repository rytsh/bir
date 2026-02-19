<script lang="ts">
  import * as openpgp from "openpgp";

  type Tab = "generate" | "encrypt" | "decrypt" | "sign" | "verify";
  type KeyType = "ecc" | "rsa2048" | "rsa4096";

  let activeTab = $state<Tab>("generate");

  // Generate tab state
  let keyType = $state<KeyType>("ecc");
  let genName = $state("");
  let genEmail = $state("");
  let genPassphrase = $state("");
  let generatedPublicKey = $state("");
  let generatedPrivateKey = $state("");
  let generating = $state(false);

  // Encrypt tab state
  let encryptPublicKey = $state("");
  let encryptPlaintext = $state("");
  let encryptOutput = $state("");
  let encrypting = $state(false);

  // Decrypt tab state
  let decryptPrivateKey = $state("");
  let decryptPassphrase = $state("");
  let decryptCiphertext = $state("");
  let decryptOutput = $state("");
  let decrypting = $state(false);

  // Sign tab state
  let signPrivateKey = $state("");
  let signPassphrase = $state("");
  let signMessage = $state("");
  let signOutput = $state("");
  let signing = $state(false);

  // Verify tab state
  let verifyPublicKey = $state("");
  let verifySignedMessage = $state("");
  let verifyResult = $state("");
  let verifyValid = $state<boolean | null>(null);
  let verifying = $state(false);

  // Shared state
  let error = $state("");
  let copiedField = $state("");

  const tabs: { id: Tab; label: string }[] = [
    { id: "generate", label: "Generate Keys" },
    { id: "encrypt", label: "Encrypt" },
    { id: "decrypt", label: "Decrypt" },
    { id: "sign", label: "Sign" },
    { id: "verify", label: "Verify" },
  ];

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = "";
    }, 2000);
  };

  const handleGenerate = async () => {
    error = "";
    generatedPublicKey = "";
    generatedPrivateKey = "";

    if (!genName.trim() && !genEmail.trim()) {
      error = "Please provide at least a name or email address.";
      return;
    }

    generating = true;
    try {
      const userID: { name?: string; email?: string } = {};
      if (genName.trim()) userID.name = genName.trim();
      if (genEmail.trim()) userID.email = genEmail.trim();

      const baseOptions = {
        userIDs: [userID],
        passphrase: genPassphrase || undefined,
        format: "armored" as const,
      };

      let result: { publicKey: string; privateKey: string };

      if (keyType === "ecc") {
        result = await openpgp.generateKey({
          ...baseOptions,
          type: "ecc" as const,
          curve: "curve25519Legacy" as const,
        }) as unknown as { publicKey: string; privateKey: string };
      } else {
        result = await openpgp.generateKey({
          ...baseOptions,
          type: "rsa" as const,
          rsaBits: keyType === "rsa4096" ? 4096 : 2048,
        }) as unknown as { publicKey: string; privateKey: string };
      }

      generatedPublicKey = result.publicKey;
      generatedPrivateKey = result.privateKey;
    } catch (e) {
      error = e instanceof Error ? e.message : "Key generation failed";
    } finally {
      generating = false;
    }
  };

  const handleEncrypt = async () => {
    error = "";
    encryptOutput = "";

    if (!encryptPublicKey.trim()) {
      error = "Please provide a public key.";
      return;
    }
    if (!encryptPlaintext.trim()) {
      error = "Please provide a message to encrypt.";
      return;
    }

    encrypting = true;
    try {
      const publicKey = await openpgp.readKey({ armoredKey: encryptPublicKey.trim() });
      const message = await openpgp.createMessage({ text: encryptPlaintext });
      const encrypted = await openpgp.encrypt({
        message,
        encryptionKeys: publicKey,
      });
      encryptOutput = encrypted as string;
    } catch (e) {
      error = e instanceof Error ? e.message : "Encryption failed";
    } finally {
      encrypting = false;
    }
  };

  const handleDecrypt = async () => {
    error = "";
    decryptOutput = "";

    if (!decryptPrivateKey.trim()) {
      error = "Please provide a private key.";
      return;
    }
    if (!decryptCiphertext.trim()) {
      error = "Please provide an encrypted message.";
      return;
    }

    decrypting = true;
    try {
      let privateKey = await openpgp.readPrivateKey({ armoredKey: decryptPrivateKey.trim() });

      if (!privateKey.isDecrypted()) {
        if (!decryptPassphrase) {
          error = "This private key is passphrase-protected. Please enter the passphrase.";
          decrypting = false;
          return;
        }
        privateKey = await openpgp.decryptKey({
          privateKey,
          passphrase: decryptPassphrase,
        });
      }

      const message = await openpgp.readMessage({ armoredMessage: decryptCiphertext.trim() });
      const { data } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey,
      });
      decryptOutput = data as string;
    } catch (e) {
      error = e instanceof Error ? e.message : "Decryption failed";
    } finally {
      decrypting = false;
    }
  };

  const handleSign = async () => {
    error = "";
    signOutput = "";

    if (!signPrivateKey.trim()) {
      error = "Please provide a private key.";
      return;
    }
    if (!signMessage.trim()) {
      error = "Please provide a message to sign.";
      return;
    }

    signing = true;
    try {
      let privateKey = await openpgp.readPrivateKey({ armoredKey: signPrivateKey.trim() });

      if (!privateKey.isDecrypted()) {
        if (!signPassphrase) {
          error = "This private key is passphrase-protected. Please enter the passphrase.";
          signing = false;
          return;
        }
        privateKey = await openpgp.decryptKey({
          privateKey,
          passphrase: signPassphrase,
        });
      }

      const message = await openpgp.createCleartextMessage({ text: signMessage });
      const signed = await openpgp.sign({
        message,
        signingKeys: privateKey,
      });
      signOutput = signed as string;
    } catch (e) {
      error = e instanceof Error ? e.message : "Signing failed";
    } finally {
      signing = false;
    }
  };

  const handleVerify = async () => {
    error = "";
    verifyResult = "";
    verifyValid = null;

    if (!verifyPublicKey.trim()) {
      error = "Please provide a public key.";
      return;
    }
    if (!verifySignedMessage.trim()) {
      error = "Please provide a signed message.";
      return;
    }

    verifying = true;
    try {
      const publicKey = await openpgp.readKey({ armoredKey: verifyPublicKey.trim() });
      const message = await openpgp.readCleartextMessage({ cleartextMessage: verifySignedMessage.trim() });

      const { data, signatures } = await openpgp.verify({
        message,
        verificationKeys: publicKey,
      });

      try {
        await signatures[0].verified;
        verifyValid = true;
        verifyResult = data as string;
      } catch {
        verifyValid = false;
        verifyResult = data as string;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Verification failed";
      verifyValid = null;
    } finally {
      verifying = false;
    }
  };

  const handleTabSwitch = (tab: Tab) => {
    activeTab = tab;
    error = "";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate PGP key pairs, encrypt and decrypt messages, sign and verify signatures.
      All operations run entirely in your browser using OpenPGP.js — nothing is sent to any server.
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

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Generate Keys Tab -->
  {#if activeTab === "generate"}
    <div class="flex-1 flex flex-col">
      <div class="mb-4 flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <label for="gen-name" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
              Name
            </label>
            <input
              id="gen-name"
              type="text"
              bind:value={genName}
              placeholder="Sarı Çizmeli Mehmet Ağa"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div class="flex-1">
            <label for="gen-email" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
              Email
            </label>
            <input
              id="gen-email"
              type="email"
              bind:value={genEmail}
              placeholder="mehmet@example.com"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <label for="gen-passphrase" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
              Passphrase (optional)
            </label>
            <input
              id="gen-passphrase"
              type="password"
              bind:value={genPassphrase}
              placeholder="Passphrase to protect private key"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div class="sm:w-48">
            <label for="key-type" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
              Key Type
            </label>
            <select
              id="key-type"
              bind:value={keyType}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
            >
              <option value="ecc">ECC (Curve25519)</option>
              <option value="rsa2048">RSA 2048</option>
              <option value="rsa4096">RSA 4096</option>
            </select>
          </div>
        </div>

        <button
          onclick={handleGenerate}
          disabled={generating}
          class="self-start px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Key Pair"}
        </button>
      </div>

      {#if generatedPublicKey || generatedPrivateKey}
        <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          <div class="flex-1 flex flex-col min-h-[200px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Public Key</span>
              <button
                onclick={() => handleCopy(generatedPublicKey, "gen-pub")}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedField === "gen-pub" ? "Copied!" : "Copy"}
              </button>
            </div>
            <textarea
              readonly
              value={generatedPublicKey}
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none"
            ></textarea>
          </div>
          <div class="flex-1 flex flex-col min-h-[200px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Private Key</span>
              <button
                onclick={() => handleCopy(generatedPrivateKey, "gen-priv")}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedField === "gen-priv" ? "Copied!" : "Copy"}
              </button>
            </div>
            <textarea
              readonly
              value={generatedPrivateKey}
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none"
            ></textarea>
          </div>
        </div>
      {/if}
    </div>

  <!-- Encrypt Tab -->
  {:else if activeTab === "encrypt"}
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Left: Inputs -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-1 flex flex-col min-h-[100px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Recipient's Public Key</span>
              <button
                onclick={async () => { encryptPublicKey = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={encryptPublicKey}
              placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;...&#10;-----END PGP PUBLIC KEY BLOCK-----"
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <div class="flex-1 flex flex-col min-h-[100px]">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium mb-1">Message</span>
            <textarea
              bind:value={encryptPlaintext}
              placeholder="Enter message to encrypt..."
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <button
            onclick={handleEncrypt}
            disabled={encrypting}
            class="self-start px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {encrypting ? "Encrypting..." : "Encrypt"}
          </button>
        </div>

        <!-- Right: Output -->
        <div class="flex-1 flex flex-col min-h-[200px]">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Encrypted Message</span>
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
      </div>
    </div>

  <!-- Decrypt Tab -->
  {:else if activeTab === "decrypt"}
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Left: Inputs -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-[2] flex flex-col min-h-[80px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Private Key</span>
              <button
                onclick={async () => { decryptPrivateKey = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={decryptPrivateKey}
              placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;...&#10;-----END PGP PRIVATE KEY BLOCK-----"
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <div>
            <label for="dec-passphrase" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
              Passphrase (if key is protected)
            </label>
            <input
              id="dec-passphrase"
              type="password"
              bind:value={decryptPassphrase}
              placeholder="Private key passphrase"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div class="flex-[2] flex flex-col min-h-[80px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Encrypted Message</span>
              <button
                onclick={async () => { decryptCiphertext = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={decryptCiphertext}
              placeholder="-----BEGIN PGP MESSAGE-----&#10;...&#10;-----END PGP MESSAGE-----"
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <button
            onclick={handleDecrypt}
            disabled={decrypting}
            class="self-start px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {decrypting ? "Decrypting..." : "Decrypt"}
          </button>
        </div>

        <!-- Right: Output -->
        <div class="flex-1 flex flex-col min-h-[200px]">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Decrypted Message</span>
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

  <!-- Sign Tab -->
  {:else if activeTab === "sign"}
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Left: Inputs -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-[2] flex flex-col min-h-[80px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Private Key</span>
              <button
                onclick={async () => { signPrivateKey = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={signPrivateKey}
              placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;...&#10;-----END PGP PRIVATE KEY BLOCK-----"
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <div>
            <label for="sign-passphrase" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-1">
              Passphrase (if key is protected)
            </label>
            <input
              id="sign-passphrase"
              type="password"
              bind:value={signPassphrase}
              placeholder="Private key passphrase"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div class="flex-[2] flex flex-col min-h-[80px]">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium mb-1">Message</span>
            <textarea
              bind:value={signMessage}
              placeholder="Enter message to sign..."
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <button
            onclick={handleSign}
            disabled={signing}
            class="self-start px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {signing ? "Signing..." : "Sign"}
          </button>
        </div>

        <!-- Right: Output -->
        <div class="flex-1 flex flex-col min-h-[200px]">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Signed Message</span>
            {#if signOutput}
              <button
                onclick={() => handleCopy(signOutput, "sign-out")}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedField === "sign-out" ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <textarea
            readonly
            value={signOutput}
            placeholder="Signed message will appear here..."
            class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none"
          ></textarea>
        </div>
      </div>
    </div>

  <!-- Verify Tab -->
  {:else if activeTab === "verify"}
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Left: Inputs -->
        <div class="flex-1 flex flex-col gap-3 min-h-[200px]">
          <div class="flex-1 flex flex-col min-h-[100px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Signer's Public Key</span>
              <button
                onclick={async () => { verifyPublicKey = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={verifyPublicKey}
              placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;...&#10;-----END PGP PUBLIC KEY BLOCK-----"
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <div class="flex-1 flex flex-col min-h-[100px]">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Signed Message</span>
              <button
                onclick={async () => { verifySignedMessage = await navigator.clipboard.readText(); }}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Paste
              </button>
            </div>
            <textarea
              bind:value={verifySignedMessage}
              placeholder="-----BEGIN PGP SIGNED MESSAGE-----&#10;...&#10;-----BEGIN PGP SIGNATURE-----&#10;...&#10;-----END PGP SIGNATURE-----"
              class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          </div>
          <button
            onclick={handleVerify}
            disabled={verifying}
            class="self-start px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "Verify"}
          </button>
        </div>

        <!-- Right: Output -->
        <div class="flex-1 flex flex-col min-h-[200px]">
          {#if verifyValid !== null}
            <div class="mb-3 p-3 border text-sm {verifyValid
              ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
              : 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400'}">
              {verifyValid ? "Signature is valid" : "Signature is INVALID"}
            </div>
          {/if}
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Extracted Message</span>
            {#if verifyResult}
              <button
                onclick={() => handleCopy(verifyResult, "verify-out")}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedField === "verify-out" ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <textarea
            readonly
            value={verifyResult}
            placeholder="Extracted message will appear here after verification..."
            class="flex-1 w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none"
          ></textarea>
        </div>
      </div>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About PGP:</strong>
    Pretty Good Privacy (PGP) uses public-key cryptography for secure communication.
    Generate a key pair, share your public key for others to encrypt messages to you, and use your private key to decrypt them.
    Cleartext signatures let you prove authorship without encrypting the message content.
    All operations use <a href="https://openpgpjs.org/" target="_blank" rel="noopener" class="underline hover:text-(--color-text)">OpenPGP.js</a> and run entirely in your browser.
  </div>
</div>
