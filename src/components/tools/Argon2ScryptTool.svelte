<script lang="ts">
  import { argon2i, argon2id, argon2d, argon2Verify, scrypt } from "hash-wasm";

  type Algo = "argon2id" | "argon2i" | "argon2d" | "scrypt";
  type Mode = "hash" | "verify";

  let algo = $state<Algo>("argon2id");
  let mode = $state<Mode>("hash");

  // Common
  let password = $state("correct horse battery staple");
  let saltMode = $state<"random" | "utf8" | "hex">("random");
  let saltUtf8 = $state("");
  let saltHex = $state("");
  let randomSaltBytes = $state(16);
  let outputType = $state<"hex" | "encoded" | "base64">("encoded");

  // Argon2 params (OWASP 2023 defaults)
  let a2Iterations = $state(2);
  let a2Memory = $state(19456); // KiB
  let a2Parallelism = $state(1);
  let a2HashLength = $state(32);

  // Scrypt params (OWASP 2023 defaults)
  // N = 2^17, r = 8, p = 1, dkLen = 32
  let sExp = $state(17);
  let sBlockSize = $state(8);
  let sParallelism = $state(1);
  let sHashLength = $state(32);

  // Verify
  let verifyPassword = $state("");
  let verifyHash = $state("");

  // Output
  let result = $state<string>("");
  let resultBytes = $state<Uint8Array | null>(null);
  let timing = $state<number | null>(null);
  let error = $state<string>("");
  let busy = $state(false);
  let verifyResult = $state<boolean | null>(null);

  function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    if (clean.length % 2 !== 0) throw new Error("Hex must have even length");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function bytesToBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function getSalt(): Uint8Array {
    if (saltMode === "random") {
      const bytes = new Uint8Array(randomSaltBytes);
      crypto.getRandomValues(bytes);
      return bytes;
    }
    if (saltMode === "utf8") {
      return new TextEncoder().encode(saltUtf8);
    }
    return hexToBytes(saltHex);
  }

  function applyProfile(profile: "light" | "owasp" | "strong") {
    if (algo.startsWith("argon2")) {
      if (profile === "light") {
        a2Iterations = 1;
        a2Memory = 4096;
        a2Parallelism = 1;
        a2HashLength = 32;
      } else if (profile === "owasp") {
        a2Iterations = 2;
        a2Memory = 19456;
        a2Parallelism = 1;
        a2HashLength = 32;
      } else {
        a2Iterations = 4;
        a2Memory = 65536;
        a2Parallelism = 4;
        a2HashLength = 32;
      }
    } else {
      if (profile === "light") {
        sExp = 14;
        sBlockSize = 8;
        sParallelism = 1;
      } else if (profile === "owasp") {
        sExp = 17;
        sBlockSize = 8;
        sParallelism = 1;
      } else {
        sExp = 20;
        sBlockSize = 8;
        sParallelism = 1;
      }
      sHashLength = 32;
    }
  }

  async function runHash() {
    error = "";
    result = "";
    resultBytes = null;
    timing = null;
    busy = true;
    const t0 = performance.now();
    try {
      const salt = getSalt();
      // Show salt in hex too
      saltHex = bytesToHex(salt);
      let hex: string | Uint8Array;
      if (algo === "scrypt") {
        const N = Math.pow(2, sExp);
        // hash-wasm scrypt returns hex; we want either hex or binary
        const out = await scrypt({
          password,
          salt,
          costFactor: N,
          blockSize: sBlockSize,
          parallelism: sParallelism,
          hashLength: sHashLength,
          outputType: "binary",
        });
        resultBytes = out;
        hex = bytesToHex(out);
        result =
          outputType === "hex"
            ? hex
            : outputType === "base64"
              ? bytesToBase64(out)
              : // Use Linux crypt-style scrypt encoded form (informal)
                `$scrypt$ln=${sExp},r=${sBlockSize},p=${sParallelism}$${bytesToBase64(salt).replace(/=+$/, "")}$${bytesToBase64(out).replace(/=+$/, "")}`;
      } else {
        const fn =
          algo === "argon2id"
            ? argon2id
            : algo === "argon2i"
              ? argon2i
              : argon2d;
        if (outputType === "encoded") {
          const out = await fn({
            password,
            salt,
            iterations: a2Iterations,
            parallelism: a2Parallelism,
            memorySize: a2Memory,
            hashLength: a2HashLength,
            outputType: "encoded",
          });
          result = out as string;
        } else {
          const out = await fn({
            password,
            salt,
            iterations: a2Iterations,
            parallelism: a2Parallelism,
            memorySize: a2Memory,
            hashLength: a2HashLength,
            outputType: "binary",
          });
          resultBytes = out as Uint8Array;
          hex = bytesToHex(out as Uint8Array);
          result = outputType === "hex" ? hex : bytesToBase64(out as Uint8Array);
        }
      }
    } catch (e) {
      error = (e as Error).message || "Hash failed";
    } finally {
      timing = performance.now() - t0;
      busy = false;
    }
  }

  async function runVerify() {
    error = "";
    verifyResult = null;
    busy = true;
    try {
      if (algo === "scrypt") {
        error = "Scrypt verification requires manual recomputation. Use the same params and compare outputs.";
        return;
      }
      verifyResult = await argon2Verify({
        password: verifyPassword,
        hash: verifyHash,
      });
    } catch (e) {
      error = (e as Error).message || "Verify failed";
    } finally {
      busy = false;
    }
  }

  function copy() {
    if (result) navigator.clipboard.writeText(result).catch(() => {});
  }

  function generateRandomSalt() {
    const bytes = new Uint8Array(randomSaltBytes);
    crypto.getRandomValues(bytes);
    saltHex = bytesToHex(bytes);
    saltMode = "hex";
  }

  function paramsHint(): string {
    if (algo === "scrypt") {
      const N = Math.pow(2, sExp);
      return `N = 2^${sExp} = ${N.toLocaleString()}, r = ${sBlockSize}, p = ${sParallelism}`;
    }
    return `t = ${a2Iterations}, m = ${a2Memory.toLocaleString()} KiB (${(a2Memory / 1024).toFixed(1)} MiB), p = ${a2Parallelism}`;
  }
</script>

<div class="h-full flex flex-col gap-3 overflow-auto">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Hash passwords with Argon2 (id, i, d) or scrypt — modern memory-hard KDFs. Defaults follow OWASP 2023 recommendations. All computation runs in WebAssembly in your browser.
    </p>
  </header>

  <!-- Algo + Mode + Profile -->
  <div class="flex flex-wrap gap-3 items-center bg-(--color-bg-alt) border border-(--color-border) p-3">
    <div>
      <span class="text-[10px] uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">Algorithm</span>
      <div class="flex gap-1">
        {#each [["argon2id", "Argon2id"], ["argon2i", "Argon2i"], ["argon2d", "Argon2d"], ["scrypt", "scrypt"]] as [val, label]}
          <button
            onclick={() => (algo = val as Algo)}
            class="px-2 py-1 text-xs border transition-colors {algo === val
              ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
              : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
    <div>
      <span class="text-[10px] uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">Mode</span>
      <div class="flex gap-1">
        {#each [["hash", "Hash"], ["verify", "Verify"]] as [val, label]}
          <button
            onclick={() => (mode = val as Mode)}
            class="px-2 py-1 text-xs border transition-colors {mode === val
              ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
              : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
    <div>
      <span class="text-[10px] uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">Profile</span>
      <div class="flex gap-1">
        <button onclick={() => applyProfile("light")} class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">Light</button>
        <button onclick={() => applyProfile("owasp")} class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">OWASP 2023</button>
        <button onclick={() => applyProfile("strong")} class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">Strong</button>
      </div>
    </div>
    <div class="ml-auto text-xs font-mono text-(--color-text-muted)">{paramsHint()}</div>
  </div>

  {#if mode === "hash"}
    <!-- Password -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
      <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">Password</label>
      <input
        type="text"
        bind:value={password}
        class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
      />
    </div>

    <!-- Salt -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
      <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Salt</span>
        <div class="flex gap-1">
          {#each [["random", "Random"], ["utf8", "UTF-8"], ["hex", "Hex"]] as [val, label]}
            <button
              onclick={() => (saltMode = val as typeof saltMode)}
              class="px-2 py-1 text-xs border transition-colors {saltMode === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>
      </div>
      {#if saltMode === "random"}
        <div class="flex items-center gap-2">
          <label class="text-sm text-(--color-text-muted)">Bytes:</label>
          <input
            type="number"
            min="8"
            max="64"
            bind:value={randomSaltBytes}
            class="w-20 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none"
          />
          <button onclick={generateRandomSalt} class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">
            Preview
          </button>
          {#if saltHex}
            <span class="font-mono text-xs text-(--color-text-light) truncate flex-1">{saltHex}</span>
          {/if}
        </div>
      {:else if saltMode === "utf8"}
        <input
          type="text"
          bind:value={saltUtf8}
          placeholder="utf-8 string"
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
        />
      {:else}
        <input
          type="text"
          bind:value={saltHex}
          placeholder="hex bytes"
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
        />
      {/if}
    </div>

    <!-- Params -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-2">Parameters</span>
      {#if algo === "scrypt"}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            log2(N)
            <input type="number" min="8" max="22" bind:value={sExp} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            r (block size)
            <input type="number" min="1" max="32" bind:value={sBlockSize} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            p (parallelism)
            <input type="number" min="1" max="16" bind:value={sParallelism} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            dkLen (bytes)
            <input type="number" min="16" max="64" bind:value={sHashLength} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Iterations (t)
            <input type="number" min="1" max="20" bind:value={a2Iterations} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Memory KiB (m)
            <input type="number" min="64" max="1048576" step="1024" bind:value={a2Memory} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Parallelism (p)
            <input type="number" min="1" max="16" bind:value={a2Parallelism} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Hash length (bytes)
            <input type="number" min="16" max="64" bind:value={a2HashLength} class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
          </label>
        </div>
      {/if}
    </div>

    <!-- Output format -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex items-center gap-2 flex-wrap">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Output:</span>
      {#each [["encoded", algo === "scrypt" ? "scrypt-style" : "argon2 encoded"], ["hex", "Hex"], ["base64", "Base64"]] as [val, label]}
        <button
          onclick={() => (outputType = val as typeof outputType)}
          class="px-2 py-1 text-xs border transition-colors {outputType === val
            ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
            : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
        >
          {label}
        </button>
      {/each}
    </div>

    <button
      onclick={runHash}
      disabled={busy}
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
    >
      {busy ? "Hashing…" : "Hash"}
    </button>

    {#if error}
      <div class="bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm p-3">{error}</div>
    {/if}

    {#if result}
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Result</span>
          <div class="flex items-center gap-3">
            {#if timing !== null}
              <span class="text-xs text-(--color-text-muted)">{timing.toFixed(0)} ms</span>
            {/if}
            <button onclick={copy} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Copy</button>
          </div>
        </div>
        <pre class="text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all m-0">{result}</pre>
      </div>
    {/if}

  {:else}
    <!-- Verify mode -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
      <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">Password to verify</label>
      <input
        type="text"
        bind:value={verifyPassword}
        class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
      />
    </div>
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
      <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">Encoded hash ($argon2…$)</label>
      <textarea
        bind:value={verifyHash}
        rows="3"
        placeholder="$argon2id$v=19$m=19456,t=2,p=1$..."
        class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
      ></textarea>
    </div>

    <button
      onclick={runVerify}
      disabled={busy || !verifyHash}
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
    >
      {busy ? "Verifying…" : "Verify"}
    </button>

    {#if error}
      <div class="bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm p-3">{error}</div>
    {/if}

    {#if verifyResult !== null}
      <div class="p-3 border {verifyResult ? 'bg-green-50 border-green-300 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300' : 'bg-(--color-error-bg) border-(--color-error-border) text-(--color-error-text)'}">
        {verifyResult ? "✓ Match — password is correct" : "✗ No match"}
      </div>
    {/if}
  {/if}
</div>
