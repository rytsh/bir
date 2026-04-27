<script lang="ts">
  type Mode = "hide" | "reveal";

  // Magic header: 4 bytes "STEG"
  const MAGIC = new Uint8Array([0x53, 0x54, 0x45, 0x47]);
  const FLAG_ENCRYPTED = 0x01;
  const FLAG_FILE = 0x02;

  let mode = $state<Mode>("hide");
  let bitsPerChannel = $state(1); // 1..4
  let useChannels = $state({ r: true, g: true, b: true, a: false });

  // Cover image
  let coverFile = $state<File | null>(null);
  let coverImageEl: HTMLImageElement | null = null;
  let coverWidth = $state(0);
  let coverHeight = $state(0);
  let coverDataURL = $state<string>("");

  // Payload
  let payloadKind = $state<"text" | "file">("text");
  let payloadText = $state("Secret message ✨");
  let payloadFile = $state<File | null>(null);
  let payloadFileName = $state("");

  // Password
  let usePassword = $state(false);
  let password = $state("");

  // Reveal
  let stegoFile = $state<File | null>(null);
  let revealedText = $state<string>("");
  let revealedFileName = $state<string>("");
  let revealedFileBytes = $state<Uint8Array | null>(null);
  let revealedIsFile = $state(false);

  let resultDataURL = $state<string>("");
  let diffDataURL = $state<string>("");
  let error = $state<string>("");
  let busy = $state(false);

  // Capacity
  const capacityBits = $derived.by(() => {
    if (!coverWidth || !coverHeight) return 0;
    const channelCount =
      (useChannels.r ? 1 : 0) + (useChannels.g ? 1 : 0) + (useChannels.b ? 1 : 0) + (useChannels.a ? 1 : 0);
    return coverWidth * coverHeight * channelCount * bitsPerChannel;
  });
  const capacityBytes = $derived(Math.floor(capacityBits / 8));

  const payloadByteEstimate = $derived.by(() => {
    if (payloadKind === "text") {
      return new TextEncoder().encode(payloadText).length;
    }
    return payloadFile ? payloadFile.size : 0;
  });

  const headerOverhead = $derived(usePassword ? 4 + 4 + 1 + 12 + 16 : 4 + 4 + 1); // magic+len+flags(+iv+tag)

  // File handling
  async function loadCoverFile(file: File) {
    coverFile = file;
    const url = URL.createObjectURL(file);
    coverDataURL = url;
    const img = new Image();
    img.src = url;
    await img.decode();
    coverImageEl = img;
    coverWidth = img.width;
    coverHeight = img.height;
  }

  function onCoverChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) loadCoverFile(f);
  }

  function onPayloadFileChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      payloadFile = f;
      payloadFileName = f.name;
    }
  }

  function onStegoFileChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) stegoFile = f;
  }

  // Crypto
  async function deriveKey(pw: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder().encode(pw);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc as unknown as ArrayBuffer,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function encryptBytes(bytes: Uint8Array, pw: string): Promise<Uint8Array> {
    // Layout: salt(16) | iv(12) | ciphertext+tag
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pw, salt);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
      key,
      bytes as unknown as ArrayBuffer,
    );
    const ctU8 = new Uint8Array(ct);
    const out = new Uint8Array(salt.length + iv.length + ctU8.length);
    out.set(salt, 0);
    out.set(iv, salt.length);
    out.set(ctU8, salt.length + iv.length);
    return out;
  }

  async function decryptBytes(bytes: Uint8Array, pw: string): Promise<Uint8Array> {
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ct = bytes.slice(28);
    const key = await deriveKey(pw, salt);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
      key,
      ct as unknown as ArrayBuffer,
    );
    return new Uint8Array(pt);
  }

  // Bit packing into pixel data
  function buildHeader(payload: Uint8Array, encrypted: boolean, isFile: boolean, fileName: string): Uint8Array {
    // Header: MAGIC(4) | flags(1) | nameLen(2) | nameBytes | payloadLen(4) | payload
    const nameBytes = isFile ? new TextEncoder().encode(fileName) : new Uint8Array(0);
    const flags = (encrypted ? FLAG_ENCRYPTED : 0) | (isFile ? FLAG_FILE : 0);
    const total = MAGIC.length + 1 + 2 + nameBytes.length + 4 + payload.length;
    const out = new Uint8Array(total);
    let p = 0;
    out.set(MAGIC, p);
    p += MAGIC.length;
    out[p++] = flags;
    out[p++] = (nameBytes.length >> 8) & 0xff;
    out[p++] = nameBytes.length & 0xff;
    out.set(nameBytes, p);
    p += nameBytes.length;
    const len = payload.length;
    out[p++] = (len >>> 24) & 0xff;
    out[p++] = (len >>> 16) & 0xff;
    out[p++] = (len >>> 8) & 0xff;
    out[p++] = len & 0xff;
    out.set(payload, p);
    return out;
  }

  function readHeader(bytes: Uint8Array): {
    flags: number;
    fileName: string;
    payload: Uint8Array;
  } | null {
    if (bytes.length < MAGIC.length + 1 + 2 + 4) return null;
    for (let i = 0; i < MAGIC.length; i++) {
      if (bytes[i] !== MAGIC[i]) return null;
    }
    let p = MAGIC.length;
    const flags = bytes[p++];
    const nameLen = (bytes[p++] << 8) | bytes[p++];
    if (bytes.length < p + nameLen + 4) return null;
    const nameBytes = bytes.slice(p, p + nameLen);
    p += nameLen;
    const len = (bytes[p++] << 24) | (bytes[p++] << 16) | (bytes[p++] << 8) | bytes[p++];
    if (bytes.length < p + len) return null;
    const payload = bytes.slice(p, p + len);
    const fileName = new TextDecoder().decode(nameBytes);
    return { flags, fileName, payload };
  }

  function getChannelOffsets(): number[] {
    const offsets: number[] = [];
    if (useChannels.r) offsets.push(0);
    if (useChannels.g) offsets.push(1);
    if (useChannels.b) offsets.push(2);
    if (useChannels.a) offsets.push(3);
    return offsets;
  }

  function embedBits(pixelData: Uint8ClampedArray, payload: Uint8Array, bitsPerCh: number) {
    const offsets = getChannelOffsets();
    const totalBits = payload.length * 8;
    const mask = (0xff << bitsPerCh) & 0xff;
    let bitIdx = 0;
    for (let pix = 0; pix < pixelData.length / 4 && bitIdx < totalBits; pix++) {
      for (let c = 0; c < offsets.length && bitIdx < totalBits; c++) {
        const i = pix * 4 + offsets[c];
        let v = pixelData[i] & mask;
        for (let b = 0; b < bitsPerCh && bitIdx < totalBits; b++) {
          const byteIdx = bitIdx >> 3;
          const bitInByte = 7 - (bitIdx & 7);
          const bit = (payload[byteIdx] >> bitInByte) & 1;
          v |= bit << b;
          bitIdx++;
        }
        pixelData[i] = v;
      }
    }
  }

  function extractBits(pixelData: Uint8ClampedArray, byteCount: number, bitsPerCh: number): Uint8Array {
    const offsets = getChannelOffsets();
    const out = new Uint8Array(byteCount);
    const totalBits = byteCount * 8;
    let bitIdx = 0;
    for (let pix = 0; pix < pixelData.length / 4 && bitIdx < totalBits; pix++) {
      for (let c = 0; c < offsets.length && bitIdx < totalBits; c++) {
        const i = pix * 4 + offsets[c];
        const v = pixelData[i];
        for (let b = 0; b < bitsPerCh && bitIdx < totalBits; b++) {
          const bit = (v >> b) & 1;
          const byteIdx = bitIdx >> 3;
          const bitInByte = 7 - (bitIdx & 7);
          out[byteIdx] |= bit << bitInByte;
          bitIdx++;
        }
      }
    }
    return out;
  }

  async function hide() {
    error = "";
    resultDataURL = "";
    diffDataURL = "";
    busy = true;
    try {
      if (!coverImageEl) throw new Error("Pick a cover image first");

      // Build payload
      let payload: Uint8Array;
      let isFile = false;
      let fileName = "";
      if (payloadKind === "text") {
        payload = new TextEncoder().encode(payloadText);
      } else {
        if (!payloadFile) throw new Error("Pick a payload file");
        payload = new Uint8Array(await payloadFile.arrayBuffer());
        isFile = true;
        fileName = payloadFile.name;
      }

      const encrypted = usePassword;
      if (encrypted) {
        if (!password) throw new Error("Password required when encryption is enabled");
        payload = await encryptBytes(payload, password);
      }

      const stream = buildHeader(payload, encrypted, isFile, fileName);

      // Capacity check
      if (stream.length * 8 > capacityBits) {
        throw new Error(
          `Payload (${stream.length} B) exceeds capacity (${capacityBytes} B). Increase bits-per-channel, enable more channels, or use a larger image.`,
        );
      }

      // Render to canvas, embed
      const canvas = document.createElement("canvas");
      canvas.width = coverWidth;
      canvas.height = coverHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.drawImage(coverImageEl, 0, 0);
      const imgData = ctx.getImageData(0, 0, coverWidth, coverHeight);
      const original = new Uint8ClampedArray(imgData.data);
      embedBits(imgData.data, stream, bitsPerChannel);

      // Diff visualization
      const diffData = ctx.createImageData(coverWidth, coverHeight);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const dr = Math.min(255, Math.abs(imgData.data[i] - original[i]) * 32);
        const dg = Math.min(255, Math.abs(imgData.data[i + 1] - original[i + 1]) * 32);
        const db = Math.min(255, Math.abs(imgData.data[i + 2] - original[i + 2]) * 32);
        diffData.data[i] = dr;
        diffData.data[i + 1] = dg;
        diffData.data[i + 2] = db;
        diffData.data[i + 3] = 255;
      }

      ctx.putImageData(imgData, 0, 0);
      resultDataURL = canvas.toDataURL("image/png");

      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = coverWidth;
      diffCanvas.height = coverHeight;
      const dctx = diffCanvas.getContext("2d");
      if (dctx) {
        dctx.putImageData(diffData, 0, 0);
        diffDataURL = diffCanvas.toDataURL("image/png");
      }
    } catch (e) {
      error = (e as Error).message || "Hide failed";
    } finally {
      busy = false;
    }
  }

  async function reveal() {
    error = "";
    revealedText = "";
    revealedFileName = "";
    revealedFileBytes = null;
    revealedIsFile = false;
    busy = true;
    try {
      if (!stegoFile) throw new Error("Pick a stego image first");
      const url = URL.createObjectURL(stegoFile);
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);

      // Read enough bits to read at least the magic + flags + name length + payload length
      // Read header progressively. Read up to capacity.
      const channelCount = getChannelOffsets().length || 3;
      const totalBytesAvailable = Math.floor((img.width * img.height * channelCount * bitsPerChannel) / 8);
      const readBytes = extractBits(imgData.data, totalBytesAvailable, bitsPerChannel);
      const parsed = readHeader(readBytes);
      if (!parsed) throw new Error("No stego data found (or wrong bits-per-channel / channels).");

      let payload = parsed.payload;
      const encrypted = (parsed.flags & FLAG_ENCRYPTED) !== 0;
      const isFile = (parsed.flags & FLAG_FILE) !== 0;
      if (encrypted) {
        if (!password) throw new Error("This payload is encrypted — enter the password.");
        try {
          payload = await decryptBytes(payload, password);
        } catch {
          throw new Error("Decryption failed — wrong password?");
        }
      }
      if (isFile) {
        revealedIsFile = true;
        revealedFileName = parsed.fileName || "payload.bin";
        revealedFileBytes = payload;
      } else {
        revealedText = new TextDecoder().decode(payload);
      }
    } catch (e) {
      error = (e as Error).message || "Reveal failed";
    } finally {
      busy = false;
    }
  }

  function downloadResult() {
    if (!resultDataURL) return;
    const a = document.createElement("a");
    a.href = resultDataURL;
    a.download = "stego.png";
    a.click();
  }

  function downloadRevealedFile() {
    if (!revealedFileBytes) return;
    const buf = new ArrayBuffer(revealedFileBytes.byteLength);
    new Uint8Array(buf).set(revealedFileBytes);
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = revealedFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
    return `${(n / 1024 / 1024).toFixed(2)} MiB`;
  }
</script>

<div class="h-full flex flex-col gap-3 overflow-auto">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Hide messages or files inside PNG images using LSB steganography. Optional AES-GCM encryption with PBKDF2 key derivation. The output PNG is visually near-identical to the cover.
    </p>
  </header>

  <!-- Mode -->
  <div class="flex gap-1">
    {#each [["hide", "Hide"], ["reveal", "Reveal"]] as [val, label]}
      <button
        onclick={() => (mode = val as Mode)}
        class="px-4 py-2 text-sm border-b-2 -mb-px transition-colors {mode === val
          ? 'border-(--color-accent) text-(--color-text)'
          : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        {label}
      </button>
    {/each}
  </div>

  <!-- Settings (shared) -->
  <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-wrap gap-4 items-center">
    <label class="text-xs text-(--color-text-muted) flex items-center gap-2">
      Bits / channel:
      <input type="number" min="1" max="4" bind:value={bitsPerChannel} class="w-14 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none" />
    </label>
    <span class="text-xs text-(--color-text-muted) flex items-center gap-2">
      Channels:
      {#each [["r", "R"], ["g", "G"], ["b", "B"], ["a", "A"]] as [key, label]}
        <label class="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={useChannels[key as "r" | "g" | "b" | "a"]}
            onchange={(e) => {
              useChannels = { ...useChannels, [key]: (e.currentTarget as HTMLInputElement).checked };
            }}
            class="cursor-pointer"
          />
          {label}
        </label>
      {/each}
    </span>
    <label class="text-xs text-(--color-text-muted) flex items-center gap-2 cursor-pointer">
      <input type="checkbox" bind:checked={usePassword} class="cursor-pointer" />
      Encrypt with password
    </label>
    {#if usePassword}
      <input
        type="password"
        bind:value={password}
        placeholder="password"
        class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
      />
    {/if}
  </div>

  {#if mode === "hide"}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <!-- Cover -->
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-2">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Cover image (PNG/JPG)</span>
        <input type="file" accept="image/*" onchange={onCoverChange} class="text-xs text-(--color-text-muted)" />
        {#if coverDataURL}
          <img src={coverDataURL} alt="cover" class="max-h-64 object-contain border border-(--color-border)" />
          <span class="text-xs text-(--color-text-muted)">
            {coverWidth}×{coverHeight} · capacity: <span class="font-mono text-(--color-text)">{fmtBytes(capacityBytes)}</span>
          </span>
        {/if}
      </div>

      <!-- Payload -->
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-2">
        <div class="flex gap-1">
          {#each [["text", "Text message"], ["file", "File"]] as [val, label]}
            <button
              onclick={() => (payloadKind = val as "text" | "file")}
              class="px-2 py-1 text-xs border transition-colors {payloadKind === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>
        {#if payloadKind === "text"}
          <textarea
            bind:value={payloadText}
            rows="6"
            placeholder="message to hide"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none resize-y"
          ></textarea>
        {:else}
          <input type="file" onchange={onPayloadFileChange} class="text-xs text-(--color-text-muted)" />
          {#if payloadFile}
            <span class="text-xs text-(--color-text-muted)">{payloadFileName} · {fmtBytes(payloadFile.size)}</span>
          {/if}
        {/if}
        <span class="text-xs text-(--color-text-muted)">
          Estimated payload: <span class="font-mono text-(--color-text)">{fmtBytes(payloadByteEstimate + headerOverhead)}</span>
          {#if capacityBytes > 0}
            of <span class="font-mono">{fmtBytes(capacityBytes)}</span>
            {#if payloadByteEstimate + headerOverhead > capacityBytes}
              <span class="text-(--color-error-text)">— too big!</span>
            {/if}
          {/if}
        </span>
      </div>
    </div>

    <button
      onclick={hide}
      disabled={busy || !coverFile}
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
    >
      {busy ? "Hiding…" : "Hide & download"}
    </button>

    {#if error}
      <div class="bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm p-3">{error}</div>
    {/if}

    {#if resultDataURL}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Stego image</span>
            <button onclick={downloadResult} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Download PNG</button>
          </div>
          <img src={resultDataURL} alt="stego" class="max-h-80 object-contain border border-(--color-border)" />
        </div>
        {#if diffDataURL}
          <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-2">Pixel-difference (×32)</span>
            <img src={diffDataURL} alt="diff" class="max-h-80 object-contain border border-(--color-border)" />
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- Reveal -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-2">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Stego image (PNG)</span>
      <input type="file" accept="image/*" onchange={onStegoFileChange} class="text-xs text-(--color-text-muted)" />
    </div>

    <button
      onclick={reveal}
      disabled={busy || !stegoFile}
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
    >
      {busy ? "Revealing…" : "Reveal"}
    </button>

    {#if error}
      <div class="bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm p-3">{error}</div>
    {/if}

    {#if revealedText}
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-2">Revealed message</span>
        <pre class="text-sm font-mono text-(--color-text) whitespace-pre-wrap break-all m-0">{revealedText}</pre>
      </div>
    {/if}
    {#if revealedIsFile && revealedFileBytes}
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex items-center justify-between">
        <span class="text-sm text-(--color-text)">
          File: <span class="font-mono">{revealedFileName}</span> · {fmtBytes(revealedFileBytes.length)}
        </span>
        <button onclick={downloadRevealedFile} class="px-3 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">
          Download
        </button>
      </div>
    {/if}
  {/if}
</div>
