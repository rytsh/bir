<script lang="ts">
  type Direction = "in" | "out" | "info";
  type FrameKind = "text" | "binary";

  interface Frame {
    id: number;
    direction: Direction;
    kind: FrameKind;
    text: string; // text payload, or hex preview for binary
    bytes: number;
    timestamp: number;
    note?: string;
  }

  interface Preset {
    label: string;
    url: string;
    protocols: string;
  }

  const DEFAULT_PRESETS: Preset[] = [
    { label: "Echo (websocket.org)", url: "wss://echo.websocket.org", protocols: "" },
    { label: "Postman echo", url: "wss://ws.postman-echo.com/raw", protocols: "" },
  ];

  let url = $state("wss://echo.websocket.org");
  let protocolsInput = $state("");
  let autoReconnect = $state(false);

  let socket: WebSocket | null = null;
  let readyState = $state<number>(WebSocket.CLOSED);
  let connectError = $state("");
  let closeInfo = $state<{ code: number; reason: string } | null>(null);

  let frames = $state<Frame[]>([]);
  let counter = 0;

  // Compose
  let composeKind = $state<"text" | "binary-hex" | "binary-base64">("text");
  let composeText = $state("hello world");
  let composeBinary = $state("");

  // Filter
  let filter = $state("");

  // Latency / ping
  let pingTime = $state<number | null>(null);
  let lastPongMs = $state<number | null>(null);

  // Saved presets (localStorage)
  let savedPresets = $state<Preset[]>([]);
  let presetLabel = $state("");

  $effect(() => {
    try {
      const raw = localStorage.getItem("ws-tester-presets");
      if (raw) savedPresets = JSON.parse(raw);
    } catch {
      savedPresets = [];
    }
  });

  function persistPresets() {
    try {
      localStorage.setItem("ws-tester-presets", JSON.stringify(savedPresets));
    } catch {
      // ignore
    }
  }

  function addPreset() {
    const label = presetLabel.trim() || url;
    savedPresets = [...savedPresets, { label, url, protocols: protocolsInput }];
    presetLabel = "";
    persistPresets();
  }

  function removePreset(i: number) {
    savedPresets = savedPresets.filter((_, idx) => idx !== i);
    persistPresets();
  }

  function loadPreset(p: Preset) {
    url = p.url;
    protocolsInput = p.protocols;
  }

  // Frame helpers
  function pushFrame(f: Omit<Frame, "id">) {
    frames = [{ id: ++counter, ...f }, ...frames].slice(0, 1000);
  }

  function info(text: string) {
    pushFrame({ direction: "info", kind: "text", text, bytes: 0, timestamp: Date.now() });
  }

  function bytesToHex(buf: ArrayBuffer): string {
    const u8 = new Uint8Array(buf);
    return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join(" ");
  }

  function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    if (clean.length % 2 !== 0) throw new Error("Hex must have even length");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Connection
  function connect() {
    disconnect();
    connectError = "";
    closeInfo = null;
    if (!url.trim()) {
      connectError = "URL is required";
      return;
    }
    try {
      const protos = protocolsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ws = protos.length > 0 ? new WebSocket(url, protos) : new WebSocket(url);
      ws.binaryType = "arraybuffer";
      socket = ws;
      readyState = ws.readyState;
      info(`Connecting to ${url}${protos.length ? ` [${protos.join(", ")}]` : ""}…`);

      ws.onopen = () => {
        readyState = ws.readyState;
        info(`Connected. Protocol: ${ws.protocol || "(none)"} · Extensions: ${ws.extensions || "(none)"}`);
      };

      ws.onmessage = (e: MessageEvent) => {
        if (typeof e.data === "string") {
          pushFrame({
            direction: "in",
            kind: "text",
            text: e.data,
            bytes: new Blob([e.data]).size,
            timestamp: Date.now(),
          });
          // Pong-style latency check
          if (pingTime !== null && e.data.startsWith("__ping__")) {
            lastPongMs = Date.now() - pingTime;
            pingTime = null;
          }
        } else if (e.data instanceof ArrayBuffer) {
          pushFrame({
            direction: "in",
            kind: "binary",
            text: bytesToHex(e.data),
            bytes: e.data.byteLength,
            timestamp: Date.now(),
          });
        } else if (e.data instanceof Blob) {
          e.data.arrayBuffer().then((buf) => {
            pushFrame({
              direction: "in",
              kind: "binary",
              text: bytesToHex(buf),
              bytes: buf.byteLength,
              timestamp: Date.now(),
            });
          });
        }
      };

      ws.onerror = () => {
        connectError = "WebSocket error (check URL, network, or CORS).";
      };

      ws.onclose = (e: CloseEvent) => {
        readyState = WebSocket.CLOSED;
        closeInfo = { code: e.code, reason: e.reason };
        info(`Closed (code ${e.code}${e.reason ? ` · ${e.reason}` : ""}, wasClean=${e.wasClean})`);
        if (autoReconnect && socket === ws) {
          setTimeout(() => {
            if (autoReconnect) connect();
          }, 1500);
        }
      };
    } catch (err) {
      connectError = (err as Error).message;
      readyState = WebSocket.CLOSED;
    }
  }

  function disconnect() {
    if (socket) {
      try {
        socket.close(1000, "Client closing");
      } catch {
        // ignore
      }
      socket = null;
    }
    readyState = WebSocket.CLOSED;
  }

  function send() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectError = "Socket is not open";
      return;
    }
    try {
      if (composeKind === "text") {
        socket.send(composeText);
        pushFrame({
          direction: "out",
          kind: "text",
          text: composeText,
          bytes: new Blob([composeText]).size,
          timestamp: Date.now(),
        });
      } else if (composeKind === "binary-hex") {
        const bytes = hexToBytes(composeBinary);
        const buf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buf).set(bytes);
        socket.send(buf);
        pushFrame({
          direction: "out",
          kind: "binary",
          text: bytesToHex(buf),
          bytes: bytes.byteLength,
          timestamp: Date.now(),
        });
      } else {
        const bytes = base64ToBytes(composeBinary);
        const buf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buf).set(bytes);
        socket.send(buf);
        pushFrame({
          direction: "out",
          kind: "binary",
          text: bytesToHex(buf),
          bytes: bytes.byteLength,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      connectError = (err as Error).message;
    }
  }

  function ping() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    pingTime = Date.now();
    socket.send(`__ping__${pingTime}`);
    pushFrame({
      direction: "out",
      kind: "text",
      text: `__ping__${pingTime}`,
      bytes: 0,
      timestamp: Date.now(),
      note: "ping",
    });
  }

  function clearLog() {
    frames = [];
  }

  function exportLog(format: "txt" | "json") {
    const data =
      format === "json"
        ? JSON.stringify(frames, null, 2)
        : frames
            .map(
              (f) =>
                `[${new Date(f.timestamp).toISOString()}] ${f.direction.toUpperCase()} ${f.kind} (${f.bytes}B): ${f.text}`,
            )
            .join("\n");
    const blob = new Blob([data], { type: format === "json" ? "application/json" : "text/plain" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `ws-log.${format}`;
    a.click();
    URL.revokeObjectURL(u);
  }

  // Filter
  const filteredFrames = $derived(
    filter.trim()
      ? frames.filter(
          (f) =>
            f.text.toLowerCase().includes(filter.toLowerCase()) ||
            f.direction.toLowerCase().includes(filter.toLowerCase()),
        )
      : frames,
  );

  // Format JSON if possible for display
  function tryFormatJson(s: string): string {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }

  function rsLabel(s: number): string {
    return ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][s] ?? String(s);
  }

  function rsColor(s: number): string {
    return s === WebSocket.OPEN
      ? "bg-green-500"
      : s === WebSocket.CONNECTING
        ? "bg-yellow-500"
        : "bg-gray-400";
  }

  $effect(() => {
    return () => disconnect();
  });

  // Track readyState while open
  $effect(() => {
    if (!socket) return;
    const interval = setInterval(() => {
      if (socket) readyState = socket.readyState;
    }, 500);
    return () => clearInterval(interval);
  });

  function copy(s: string) {
    navigator.clipboard.writeText(s).catch(() => {});
  }

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
  }
</script>

<div class="h-full flex flex-col gap-3">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Connect to any WebSocket endpoint, send/receive text or binary frames, and inspect the live log.
    </p>
  </header>

  <!-- Connection bar -->
  <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-3">
    <div class="flex flex-wrap gap-2 items-center">
      <span class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full {rsColor(readyState)}"></span>
        <span class="text-xs font-mono text-(--color-text-muted)">{rsLabel(readyState)}</span>
      </span>
      <input
        type="text"
        bind:value={url}
        placeholder="ws://… or wss://…"
        class="flex-1 min-w-[260px] px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
      />
      <input
        type="text"
        bind:value={protocolsInput}
        placeholder="subprotocols (csv)"
        class="w-44 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
      />
      {#if readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING}
        <button
          onclick={disconnect}
          class="px-4 py-2 bg-(--color-bg) border border-(--color-border) text-sm text-(--color-text) hover:border-(--color-text-light) transition-colors"
        >
          Disconnect
        </button>
      {:else}
        <button
          onclick={connect}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
        >
          Connect
        </button>
      {/if}
      <button
        onclick={ping}
        disabled={readyState !== WebSocket.OPEN}
        class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Sends '__ping__<timestamp>' and measures echo latency"
      >
        Ping
      </button>
    </div>

    <div class="flex flex-wrap gap-3 items-center text-xs">
      <label class="flex items-center gap-1.5 text-(--color-text-muted) cursor-pointer">
        <input type="checkbox" bind:checked={autoReconnect} class="cursor-pointer" />
        Auto-reconnect
      </label>
      {#if lastPongMs !== null}
        <span class="text-(--color-text-muted)">Last echo: <span class="font-mono text-(--color-text)">{lastPongMs} ms</span></span>
      {/if}
      {#if closeInfo}
        <span class="text-(--color-text-muted)">Last close: <span class="font-mono text-(--color-text)">{closeInfo.code}{closeInfo.reason ? ` · ${closeInfo.reason}` : ""}</span></span>
      {/if}
      {#if connectError}
        <span class="text-(--color-error-text)">{connectError}</span>
      {/if}
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-xs text-(--color-text-light) uppercase tracking-wider font-medium">Presets:</span>
      {#each DEFAULT_PRESETS as p}
        <button
          onclick={() => loadPreset(p)}
          class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {p.label}
        </button>
      {/each}
      {#each savedPresets as p, i}
        <span class="inline-flex items-center bg-(--color-bg) border border-(--color-border)">
          <button
            onclick={() => loadPreset(p)}
            class="px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {p.label}
          </button>
          <button
            onclick={() => removePreset(i)}
            title="Remove"
            class="px-1.5 py-1 text-xs text-(--color-text-light) hover:text-(--color-error-text) transition-colors border-l border-(--color-border)"
          >
            ×
          </button>
        </span>
      {/each}
      <input
        type="text"
        bind:value={presetLabel}
        placeholder="label (optional)"
        class="w-32 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs focus:border-(--color-text-light) outline-none"
      />
      <button
        onclick={addPreset}
        class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        + Save current
      </button>
    </div>
  </div>

  <div class="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
    <!-- Compose -->
    <div class="lg:w-96 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Send</span>
        <div class="flex gap-1">
          {#each [["text", "Text"], ["binary-hex", "Hex"], ["binary-base64", "Base64"]] as [val, label]}
            <button
              onclick={() => (composeKind = val as typeof composeKind)}
              class="px-2 py-1 text-xs border transition-colors {composeKind === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg-alt) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>
      </div>

      {#if composeKind === "text"}
        <textarea
          bind:value={composeText}
          placeholder="text payload (use Cmd/Ctrl+Enter to send)"
          onkeydown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          rows="6"
          class="flex-1 px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none resize-y"
        ></textarea>
      {:else}
        <textarea
          bind:value={composeBinary}
          placeholder={composeKind === "binary-hex" ? "deadbeef ca fe" : "base64 string"}
          rows="6"
          class="flex-1 px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none resize-y"
        ></textarea>
      {/if}

      <button
        onclick={send}
        disabled={readyState !== WebSocket.OPEN}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>

    <!-- Log -->
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          Log ({frames.length})
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            bind:value={filter}
            placeholder="filter…"
            class="px-2 py-1 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-xs focus:border-(--color-text-light) outline-none"
          />
          <button
            onclick={() => exportLog("txt")}
            class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Export TXT
          </button>
          <button
            onclick={() => exportLog("json")}
            class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Export JSON
          </button>
          <button
            onclick={clearLog}
            class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto bg-(--color-bg-alt) border border-(--color-border)">
        {#if filteredFrames.length === 0}
          <div class="p-4 text-sm text-(--color-text-muted) text-center">
            No frames yet — connect and send a message.
          </div>
        {:else}
          <div class="divide-y divide-(--color-border)">
            {#each filteredFrames as f (f.id)}
              <div class="px-3 py-2 hover:bg-(--color-bg) transition-colors">
                <div class="flex items-center gap-2 text-xs mb-1">
                  <span class="font-mono text-(--color-text-light)">{fmtTime(f.timestamp)}</span>
                  <span
                    class="px-1.5 py-0.5 font-mono text-[10px] uppercase border {f.direction === 'in'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : f.direction === 'out'
                        ? 'border-green-500 text-green-600 dark:text-green-400'
                        : 'border-(--color-border) text-(--color-text-muted)'}"
                  >
                    {f.direction === "in" ? "← in" : f.direction === "out" ? "→ out" : "info"}
                  </span>
                  <span class="text-[10px] uppercase font-mono text-(--color-text-muted)">{f.kind}</span>
                  <span class="text-[10px] font-mono text-(--color-text-muted)">{f.bytes}B</span>
                  {#if f.note}
                    <span class="text-[10px] font-mono text-(--color-text-light)">[{f.note}]</span>
                  {/if}
                  {#if f.direction !== "info"}
                    <button
                      onclick={() => copy(f.text)}
                      class="ml-auto text-[10px] text-(--color-text-light) hover:text-(--color-text) transition-colors"
                    >
                      copy
                    </button>
                  {/if}
                </div>
                <pre class="text-xs text-(--color-text) font-mono whitespace-pre-wrap break-all m-0">{f.kind === "text" ? tryFormatJson(f.text) : f.text}</pre>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
