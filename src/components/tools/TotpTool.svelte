<script lang="ts">
  import CryptoJS from "crypto-js";
  import { onMount } from "svelte";
  import bwipjs from "@bwip-js/browser";

  type Algorithm = "SHA1" | "SHA256" | "SHA512";

  // State
  let secret = $state("");
  let algorithm = $state<Algorithm>("SHA1");
  let digits = $state(6);
  let period = $state(30);
  let currentCode = $state("");
  let timeRemaining = $state(0);
  let verifyCode = $state("");
  let verifyResult = $state<"valid" | "invalid" | null>(null);
  let copied = $state(false);
  let error = $state("");
  let showSecret = $state(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let issuer = $state("BIR Tools");
  let account = $state("user@example.com");

  // Base32 alphabet
  const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  // Decode Base32 to bytes
  const base32ToBytes = (base32: string): Uint8Array => {
    // Remove spaces and convert to uppercase
    const input = base32.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();

    if (input.length === 0) return new Uint8Array(0);

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

  // Encode bytes to Base32
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

    return result;
  };

  // Generate random secret
  const generateSecret = (length: number = 20): string => {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToBase32(bytes);
  };

  // Convert Uint8Array to CryptoJS WordArray
  const bytesToWordArray = (bytes: Uint8Array): CryptoJS.lib.WordArray => {
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      words.push(
        ((bytes[i] || 0) << 24) |
          ((bytes[i + 1] || 0) << 16) |
          ((bytes[i + 2] || 0) << 8) |
          (bytes[i + 3] || 0),
      );
    }
    return CryptoJS.lib.WordArray.create(words, bytes.length);
  };

  // Generate TOTP code
  const generateTOTP = (
    secretKey: string,
    time: number,
    algo: Algorithm,
    digitCount: number,
    periodSeconds: number,
  ): string => {
    try {
      // Decode the base32 secret
      const keyBytes = base32ToBytes(secretKey);
      const keyWordArray = bytesToWordArray(keyBytes);

      // Calculate time counter
      const counter = Math.floor(time / periodSeconds);

      // Convert counter to 8-byte big-endian
      const counterBytes = new Uint8Array(8);
      let temp = counter;
      for (let i = 7; i >= 0; i--) {
        counterBytes[i] = temp & 0xff;
        temp = Math.floor(temp / 256);
      }
      const counterWordArray = bytesToWordArray(counterBytes);

      // Calculate HMAC
      let hmac: CryptoJS.lib.WordArray;
      switch (algo) {
        case "SHA1":
          hmac = CryptoJS.HmacSHA1(counterWordArray, keyWordArray);
          break;
        case "SHA256":
          hmac = CryptoJS.HmacSHA256(counterWordArray, keyWordArray);
          break;
        case "SHA512":
          hmac = CryptoJS.HmacSHA512(counterWordArray, keyWordArray);
          break;
      }

      // Convert to bytes
      const hmacHex = hmac.toString(CryptoJS.enc.Hex);
      const hmacBytes = new Uint8Array(hmacHex.length / 2);
      for (let i = 0; i < hmacHex.length; i += 2) {
        hmacBytes[i / 2] = parseInt(hmacHex.substring(i, i + 2), 16);
      }

      // Dynamic truncation
      const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
      const binary =
        ((hmacBytes[offset] & 0x7f) << 24) |
        ((hmacBytes[offset + 1] & 0xff) << 16) |
        ((hmacBytes[offset + 2] & 0xff) << 8) |
        (hmacBytes[offset + 3] & 0xff);

      // Generate OTP
      const otp = binary % Math.pow(10, digitCount);
      return otp.toString().padStart(digitCount, "0");
    } catch (e) {
      throw new Error("Invalid secret key");
    }
  };

  // Update current code and time remaining
  const updateCode = () => {
    error = "";

    if (!secret.trim()) {
      currentCode = "";
      timeRemaining = 0;
      return;
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      currentCode = generateTOTP(secret, now, algorithm, digits, period);
      timeRemaining = period - (now % period);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to generate code";
      currentCode = "";
    }
  };

  // Verify a code
  const handleVerify = () => {
    error = "";
    verifyResult = null;

    if (!secret.trim()) {
      error = "Please enter a secret key";
      return;
    }

    if (!verifyCode.trim()) {
      error = "Please enter a code to verify";
      return;
    }

    try {
      const now = Math.floor(Date.now() / 1000);

      // Check current and adjacent time windows for clock skew tolerance
      for (let i = -1; i <= 1; i++) {
        const testTime = now + i * period;
        const expectedCode = generateTOTP(
          secret,
          testTime,
          algorithm,
          digits,
          period,
        );
        if (verifyCode.trim() === expectedCode) {
          verifyResult = "valid";
          return;
        }
      }

      verifyResult = "invalid";
    } catch (e) {
      error = e instanceof Error ? e.message : "Verification failed";
    }
  };

  // Generate new secret
  const handleGenerateSecret = () => {
    secret = generateSecret(20);
    error = "";
    verifyResult = null;
    verifyCode = "";
  };

  // Copy current code
  const handleCopy = () => {
    if (currentCode) {
      navigator.clipboard.writeText(currentCode);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  // Copy secret
  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
    }
  };

  // Generate otpauth URI for QR code
  let otpauthUri = $derived(() => {
    if (!secret.trim()) return "";

    const params = new URLSearchParams({
      secret: secret.replace(/\s+/g, "").toUpperCase(),
      issuer: issuer.trim() || "App",
      algorithm,
      digits: digits.toString(),
      period: period.toString(),
    });

    const issuerPart = issuer.trim() || "App";
    const accountPart = account.trim() || "user";
    return `otpauth://totp/${encodeURIComponent(issuerPart)}:${encodeURIComponent(accountPart)}?${params.toString()}`;
  });

  // Progress percentage for the circular timer
  let progress = $derived(
    timeRemaining > 0 ? (timeRemaining / period) * 100 : 0,
  );

  // QR code state
  let qrCodeSvg = $state("");
  let qrError = $state("");

  // Generate QR code from otpauth URI
  const generateQrCode = async () => {
    qrError = "";
    const uri = otpauthUri();

    if (!uri) {
      qrCodeSvg = "";
      return;
    }

    try {
      const options: Record<string, unknown> = {
        bcid: "qrcode",
        text: uri,
        scale: 3,
        eclevel: "M",
      };

      let svg = bwipjs.toSVG(
        options as unknown as Parameters<typeof bwipjs.toSVG>[0],
      );

      // Ensure SVG has width and height attributes for proper display
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, "image/svg+xml");
      const svgElement = doc.querySelector("svg");

      if (svgElement) {
        if (
          !svgElement.getAttribute("width") ||
          !svgElement.getAttribute("height")
        ) {
          const viewBox = svgElement.getAttribute("viewBox");
          if (viewBox) {
            const parts = viewBox.split(/[\s,]+/);
            if (parts.length === 4) {
              svgElement.setAttribute("width", parts[2]);
              svgElement.setAttribute("height", parts[3]);
            }
          }
        }
        svg = new XMLSerializer().serializeToString(doc);
      }

      qrCodeSvg = svg;
    } catch (e) {
      qrError = e instanceof Error ? e.message : "Failed to generate QR code";
      qrCodeSvg = "";
    }
  };

  // Setup interval on mount
  onMount(() => {
    updateCode();
    intervalId = setInterval(updateCode, 1000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  });

  // Update when settings change
  $effect(() => {
    secret;
    algorithm;
    digits;
    period;
    updateCode();
  });

  // Update QR code when otpauth URI changes
  $effect(() => {
    secret;
    algorithm;
    digits;
    period;
    issuer;
    account;
    generateQrCode();
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate and verify Time-based One-Time Passwords (TOTP) for two-factor
      authentication.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6">
    <!-- Left Column: Settings -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Secret Key -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex justify-between items-center mb-2">
          <label
            for="secret-input"
            class="text-xs tracking-wider text-(--color-text-light) font-medium"
          >
            Secret Key (Base32)
          </label>
          <div class="flex gap-2">
            <button
              onclick={handleCopySecret}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              disabled={!secret}
            >
              Copy
            </button>
            <button
              onclick={() => (showSecret = !showSecret)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            id="secret-input"
            type={showSecret ? "text" : "password"}
            bind:value={secret}
            placeholder="Enter or generate a Base32 secret..."
            class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
          />
          <button
            onclick={handleGenerateSecret}
            class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
          >
            Generate
          </button>
        </div>
      </div>

      <div class="flex flex-row gap-4">
        <!-- Algorithm & Settings -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div
            class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
          >
            Settings
          </div>
          <div class="flex flex-wrap gap-4">
            <!-- Algorithm -->
            <div>
              <label
                for="algorithm-select"
                class="block text-xs text-(--color-text-muted) mb-1"
              >
                Algorithm
              </label>
              <select
                id="algorithm-select"
                bind:value={algorithm}
                class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
              >
                <option value="SHA1">SHA-1</option>
                <option value="SHA256">SHA-256</option>
                <option value="SHA512">SHA-512</option>
              </select>
            </div>

            <!-- Digits -->
            <div>
              <label
                for="digits-input"
                class="block text-xs text-(--color-text-muted) mb-1"
              >
                Digits
              </label>
              <select
                id="digits-input"
                bind:value={digits}
                class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
              >
                <option value={6}>6</option>
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>

            <!-- Period -->
            <div class="flex-1">
              <label
                for="period-input"
                class="block text-xs text-(--color-text-muted) mb-1"
              >
                Period (seconds)
              </label>
              <select
                id="period-input"
                bind:value={period}
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
              >
                <option value={30}>30</option>
                <option value={60}>60</option>
                <option value={90}>90</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Verify Code -->
        <div
          class="flex-1 p-4 border border-(--color-border) bg-(--color-bg-alt)"
        >
          <div
            class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
          >
            Verify Code
          </div>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={verifyCode}
              placeholder="Enter code to verify..."
              maxlength={8}
              class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent) tracking-widest"
              onkeydown={(e) => e.key === "Enter" && handleVerify()}
            />
            <button
              onclick={handleVerify}
              class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
            >
              Verify
            </button>
          </div>
          {#if verifyResult === "valid"}
            <div
              class="mt-2 p-2 bg-green-500/10 border border-green-500 text-green-500 text-sm"
            >
              Code is valid
            </div>
          {:else if verifyResult === "invalid"}
            <div
              class="mt-2 p-2 bg-red-500/10 border border-red-500 text-red-500 text-sm"
            >
              Code is invalid
            </div>
          {/if}
        </div>
      </div>
      <!-- otpauth URI & QR Code -->
      {#if secret.trim()}
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div
            class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
          >
            QR Code (scan with authenticator app)
          </div>

          <!-- Issuer and Account inputs -->
          <div class="flex flex-wrap gap-4 mb-4">
            <div class="flex-1 min-w-[200px]">
              <label
                for="issuer-input"
                class="block text-xs text-(--color-text-muted) mb-1"
              >
                Issuer (app/service name)
              </label>
              <input
                id="issuer-input"
                type="text"
                bind:value={issuer}
                placeholder="My App"
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
            <div class="flex-1 min-w-[200px]">
              <label
                for="account-input"
                class="block text-xs text-(--color-text-muted) mb-1"
              >
                Account (username/email)
              </label>
              <input
                id="account-input"
                type="text"
                bind:value={account}
                placeholder="user@example.com"
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>

          <!-- QR Code Display -->
          <div
            class="flex justify-center mb-4 p-4 bg-(--color-bg) border border-(--color-border)"
          >
            {#if qrError}
              <div class="text-red-500 text-sm">{qrError}</div>
            {:else if qrCodeSvg}
              <div class="max-w-full bg-white">
                {@html qrCodeSvg}
              </div>
            {:else}
              <div class="text-(--color-text-muted) text-sm">
                Generating QR code...
              </div>
            {/if}
          </div>

          <div
            class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
          >
            otpauth URI
          </div>
          <div
            class="p-2 bg-(--color-bg) border border-(--color-border) text-xs font-mono text-(--color-text-muted) break-all"
          >
            {otpauthUri()}
          </div>
        </div>
      {/if}
    </div>

    <!-- Right Column: Current Code Display -->
    <div class="lg:w-80 flex flex-col gap-4">
      <!-- Current Code -->
      <div
        class="p-6 border border-(--color-border) bg-(--color-bg-alt) text-center"
      >
        <div
          class="text-xs tracking-wider text-(--color-text-light) font-medium mb-4"
        >
          Current Code
        </div>

        {#if currentCode}
          <div class="relative inline-block mb-4">
            <!-- Circular progress -->
            <svg class="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
              <!-- Background circle -->
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="var(--color-border)"
                stroke-width="4"
              />
              <!-- Progress circle -->
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={timeRemaining <= 5 ? "#ef4444" : "var(--color-accent)"}
                stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray={`${progress * 2.827} 282.7`}
                class="transition-all duration-1000 ease-linear"
              />
            </svg>
            <!-- Code in center -->
            <div class="absolute inset-0 flex items-center justify-center">
              <span
                class="text-2xl font-mono font-bold text-(--color-text) tracking-widest"
              >
                {currentCode}
              </span>
            </div>
          </div>

          <div class="text-sm text-(--color-text-muted) mb-4">
            Expires in <span
              class={timeRemaining <= 5 ? "text-red-500 font-bold" : ""}
              >{timeRemaining}s</span
            >
          </div>

          <button
            onclick={handleCopy}
            class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
          >
            {copied ? "Copied!" : "Copy Code"}
          </button>
        {:else}
          <div class="text-(--color-text-muted) text-sm py-8">
            Enter a secret key to generate codes
          </div>
        {/if}

        {#if error}
          <div class="text-red-500 text-sm mb-4">{error}</div>
        {/if}
      </div>

      <!-- Info -->
      <div
        class="p-4 border border-(--color-border) bg-(--color-bg-alt) text-xs text-(--color-text-muted)"
      >
        <div class="font-medium text-(--color-text) mb-2">About TOTP</div>
        <ul class="space-y-1 list-disc list-inside">
          <li>TOTP generates time-based codes for 2FA</li>
          <li>Compatible with Google Authenticator, Authy, etc.</li>
          <li>Default: SHA-1, 6 digits, 30 second period</li>
          <li>Verification allows 1 period clock skew</li>
        </ul>
      </div>
    </div>
  </div>
</div>
