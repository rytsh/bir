<script lang="ts">
  import { onMount, tick } from "svelte";

  type ConnectionStatus = "disconnected" | "connecting" | "connected" | "disconnecting";
  type NoticeKind = "" | "error" | "success";
  type Direction = "rx" | "tx" | "system" | "error";
  type DisplayMode = "text" | "hex" | "both";
  type SendMode = "text" | "hex";
  type LineEnding = "none" | "lf" | "cr" | "crlf";
  type Parity = "none" | "even" | "odd";
  type FlowControl = "none" | "hardware";

  interface WebSerialOptions {
    baudRate: number;
    dataBits: 7 | 8;
    stopBits: 1 | 2;
    parity: Parity;
    bufferSize?: number;
    flowControl: FlowControl;
  }

  interface WebSerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
    bluetoothServiceClassId?: string;
  }

  interface WebSerialOutputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }

  interface WebSerialInputSignals {
    clearToSend: boolean;
    dataCarrierDetect: boolean;
    dataSetReady: boolean;
    ringIndicator: boolean;
  }

  interface WebSerialPort {
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    open: (options: WebSerialOptions) => Promise<void>;
    close: () => Promise<void>;
    getInfo: () => WebSerialPortInfo;
    setSignals?: (signals: WebSerialOutputSignals) => Promise<void>;
    getSignals?: () => Promise<WebSerialInputSignals>;
    forget?: () => Promise<void>;
  }

  interface WebSerialApi {
    requestPort: (options?: { filters?: Record<string, unknown>[] }) => Promise<WebSerialPort>;
    getPorts: () => Promise<WebSerialPort[]>;
    addEventListener: (type: string, listener: EventListener) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
  }

  interface SerialDisconnectEvent extends Event {
    port?: WebSerialPort;
  }

  interface TerminalEntry {
    id: number;
    timestamp: number;
    direction: Direction;
    text: string;
    hex: string;
    byteCount: number;
  }

  const MAX_LOG_ENTRIES = 3000;
  const baudRates = [300, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
  const lineEndings: Record<LineEnding, string> = {
    none: "",
    lf: "\n",
    cr: "\r",
    crlf: "\r\n",
  };

  let port: WebSerialPort | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let readTask: Promise<void> | null = null;
  let decoder = new TextDecoder();
  let closing = false;
  let logViewport: HTMLDivElement | null = null;
  let entryId = 0;
  let mounted = false;

  let supported = $state<boolean | null>(null);
  let secureContext = $state(true);
  let authorizedPortCount = $state(0);
  let status = $state<ConnectionStatus>("disconnected");
  let notice = $state("Choose Connect to select a serial device.");
  let noticeKind = $state<NoticeKind>("");
  let deviceLabel = $state("No device selected");

  let baudRate = $state(115200);
  let dataBits = $state<7 | 8>(8);
  let stopBits = $state<1 | 2>(1);
  let parity = $state<Parity>("none");
  let flowControl = $state<FlowControl>("none");
  let dtr = $state(true);
  let rts = $state(false);
  let inputSignals = $state<WebSerialInputSignals | null>(null);

  let entries = $state<TerminalEntry[]>([]);
  let displayMode = $state<DisplayMode>("text");
  let showTimestamps = $state(true);
  let autoScroll = $state(true);
  let rxBytes = $state(0);
  let txBytes = $state(0);
  let sessionStarted = $state<number | null>(null);

  let sendMode = $state<SendMode>("text");
  let sendValue = $state("");
  let lineEnding = $state<LineEnding>("crlf");
  let sending = $state(false);
  let copied = $state(false);

  let connected = $derived(status === "connected");
  let configurationLocked = $derived(status !== "disconnected");
  let statusLabel = $derived(
    status === "connected"
      ? "CONNECTED"
      : status === "connecting"
        ? "CONNECTING"
        : status === "disconnecting"
          ? "CLOSING"
          : "DISCONNECTED",
  );
  let signalStates = $derived([
    { label: "CTS", value: inputSignals?.clearToSend },
    { label: "DSR", value: inputSignals?.dataSetReady },
    { label: "DCD", value: inputSignals?.dataCarrierDetect },
    { label: "RI", value: inputSignals?.ringIndicator },
  ]);

  onMount(() => {
    mounted = true;
    secureContext = window.isSecureContext;
    supported = "serial" in navigator;
    const serial = getSerialApi();

    if (!secureContext) {
      setNotice("Web Serial requires HTTPS or localhost. Open this page in a secure context.", "error");
    } else if (!supported) {
      setNotice("Web Serial is not available in this browser. Use desktop Chrome, Edge, or another Chromium-based browser.", "error");
    } else if (serial) {
      refreshAuthorizedPorts();
      const disconnectHandler: EventListener = (event) => {
        const serialEvent = event as SerialDisconnectEvent;
        const eventPort = serialEvent.port ?? (event.target as unknown as WebSerialPort);
        if (port && eventPort === port) handleUnexpectedDisconnect();
      };
      serial.addEventListener("disconnect", disconnectHandler);

      return () => {
        mounted = false;
        serial.removeEventListener("disconnect", disconnectHandler);
        void disconnectPort();
      };
    }

    return () => {
      mounted = false;
    };
  });

  function getSerialApi(): WebSerialApi | null {
    return typeof navigator !== "undefined" && "serial" in navigator
      ? (navigator as Navigator & { serial: WebSerialApi }).serial
      : null;
  }

  function setNotice(message: string, kind: NoticeKind = ""): void {
    notice = message;
    noticeKind = kind;
  }

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  async function refreshAuthorizedPorts(): Promise<void> {
    const serial = getSerialApi();
    if (!serial) return;
    try {
      authorizedPortCount = (await serial.getPorts()).length;
    } catch {
      authorizedPortCount = 0;
    }
  }

  function formatUsbId(value: number | undefined): string {
    return value === undefined ? "----" : value.toString(16).toUpperCase().padStart(4, "0");
  }

  function describePort(selectedPort: WebSerialPort): string {
    const info = selectedPort.getInfo();
    if (info.usbVendorId !== undefined || info.usbProductId !== undefined) {
      return `USB ${formatUsbId(info.usbVendorId)}:${formatUsbId(info.usbProductId)}`;
    }
    if (info.bluetoothServiceClassId) return `Bluetooth ${info.bluetoothServiceClassId}`;
    return "Serial device";
  }

  async function requestPort(): Promise<void> {
    const serial = getSerialApi();
    if (!serial || !secureContext || status !== "disconnected") return;
    status = "connecting";
    setNotice("Waiting for a device selection...");
    try {
      const selectedPort = await serial.requestPort();
      if (!mounted) return;
      await openPort(selectedPort);
    } catch (error) {
      status = "disconnected";
      if (error instanceof DOMException && error.name === "NotFoundError") {
        setNotice("No device was selected.");
      } else {
        setNotice(errorMessage(error, "The serial port could not be selected."), "error");
        appendEntry("error", errorMessage(error, "Connection failed."), new Uint8Array());
      }
    } finally {
      refreshAuthorizedPorts();
    }
  }

  async function reconnectAuthorizedPort(): Promise<void> {
    const serial = getSerialApi();
    if (!serial || status !== "disconnected") return;
    status = "connecting";
    setNotice("Opening the previously authorized port...");
    try {
      const ports = await serial.getPorts();
      if (!ports[0]) {
        status = "disconnected";
        authorizedPortCount = 0;
        setNotice("No previously authorized port is available. Choose Connect to select one.");
        return;
      }
      await openPort(ports[0]);
    } catch (error) {
      status = "disconnected";
      setNotice(errorMessage(error, "The authorized serial port could not be opened."), "error");
    }
  }

  async function openPort(selectedPort: WebSerialPort): Promise<void> {
    if (!mounted) return;
    try {
      await selectedPort.open({
        baudRate,
        dataBits,
        stopBits,
        parity,
        flowControl,
        bufferSize: 65536,
      });
      if (!mounted) {
        await closeAbandonedPort(selectedPort);
        return;
      }
      port = selectedPort;
      closing = false;
      decoder = new TextDecoder();
      writer = selectedPort.writable?.getWriter() ?? null;
      status = "connected";
      deviceLabel = describePort(selectedPort);
      rxBytes = 0;
      txBytes = 0;
      sessionStarted = Date.now();
      await applyOutputSignals();
      if (!mounted || port !== selectedPort) return;
      await refreshInputSignals();
      if (!mounted || port !== selectedPort) return;
      appendEntry("system", `Connected to ${deviceLabel} at ${baudRate.toLocaleString()} baud.`, new Uint8Array());
      setNotice(`${deviceLabel} is connected. Incoming data will appear in the terminal.`, "success");
      readTask = readLoop(selectedPort);
    } catch (error) {
      writer?.releaseLock();
      writer = null;
      if (port === selectedPort && !closing) await closeAbandonedPort(selectedPort);
      port = null;
      status = "disconnected";
      deviceLabel = "No device selected";
      throw error;
    }
  }

  async function readLoop(activePort: WebSerialPort): Promise<void> {
    try {
      while (activePort.readable && port === activePort && !closing) {
        const activeReader = activePort.readable.getReader();
        reader = activeReader;
        let readError = "";
        try {
          while (!closing) {
            const { value, done } = await activeReader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            rxBytes += value.length;
            appendEntry("rx", decoder.decode(value, { stream: true }), value);
          }
        } catch (error) {
          if (!closing) {
            readError = errorMessage(error, "The serial read stream reported an error.");
            appendEntry("error", readError, new Uint8Array());
          }
        } finally {
          activeReader.releaseLock();
          if (reader === activeReader) reader = null;
        }
        if (readError && !closing && port === activePort && activePort.readable) {
          setNotice(`${readError} The terminal is recovering the stream.`, "error");
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      if (!closing) {
        appendEntry("error", errorMessage(error, "The serial read stream stopped."), new Uint8Array());
        setNotice(errorMessage(error, "The serial read stream stopped."), "error");
      }
    } finally {
      if (!closing && port === activePort) {
        writer?.releaseLock();
        writer = null;
        try {
          await activePort.close();
        } catch {
          // The operating system may have already removed the device.
        }
        port = null;
        status = "disconnected";
        deviceLabel = "No device selected";
        inputSignals = null;
        refreshAuthorizedPorts();
      }
    }
  }

  async function disconnectPort(): Promise<void> {
    const activePort = port;
    if (!activePort || status === "disconnecting") return;
    closing = true;
    status = "disconnecting";
    setNotice("Closing the serial connection...");

    try {
      await reader?.cancel();
    } catch {
      // A removed device can reject cancellation; cleanup still continues.
    }
    try {
      await readTask;
    } catch {
      // Read errors are already surfaced by the loop.
    }

    writer?.releaseLock();
    writer = null;
    const closeError = await closePortWithRetry(activePort, mounted ? 1 : 3);
    if (closeError) {
      appendEntry("error", closeError, new Uint8Array());
    }

    if (closeError) {
      if (!mounted) {
        try {
          await activePort.forget?.();
        } catch {
          // The component is gone; no UI remains for another recovery action.
        }
        port = null;
        reader = null;
        readTask = null;
        writer = null;
        return;
      }
      port = activePort;
      closing = false;
      status = "connected";
      writer = activePort.writable?.getWriter() ?? null;
      if (activePort.readable) readTask = readLoop(activePort);
      setNotice(`${closeError} The port reference was retained; try Disconnect again.`, "error");
      return;
    }

    appendEntry("system", `Disconnected from ${deviceLabel}.`, new Uint8Array());
    port = null;
    reader = null;
    readTask = null;
    status = "disconnected";
    closing = false;
    deviceLabel = "No device selected";
    inputSignals = null;
    setNotice("Serial connection closed.");
    refreshAuthorizedPorts();
  }

  async function closePortWithRetry(activePort: WebSerialPort, attempts: number): Promise<string> {
    let message = "";
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        await activePort.close();
        return "";
      } catch (error) {
        message = errorMessage(error, "The serial port did not close cleanly.");
        if (attempt + 1 < attempts) {
          await new Promise<void>((resolve) => setTimeout(resolve, 120));
        }
      }
    }
    return message;
  }

  async function closeAbandonedPort(activePort: WebSerialPort): Promise<void> {
    const closeError = await closePortWithRetry(activePort, 3);
    if (!closeError) return;
    try {
      await activePort.forget?.();
    } catch {
      // The browser or operating system owns final cleanup after unmount.
    }
  }

  function handleUnexpectedDisconnect(): void {
    if (closing || status === "disconnected") return;
    closing = true;
    appendEntry("error", "The serial device was disconnected by the operating system.", new Uint8Array());
    writer?.releaseLock();
    writer = null;
    port = null;
    status = "disconnected";
    closing = false;
    deviceLabel = "No device selected";
    inputSignals = null;
    setNotice("The serial device was disconnected. Reconnect it and open the port again.", "error");
    refreshAuthorizedPorts();
  }

  function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  function parseHex(input: string): Uint8Array {
    const normalized = input.replace(/0x/gi, "").replace(/[\s,:;_-]/g, "");
    if (!normalized) return new Uint8Array();
    if (!/^[0-9a-f]+$/i.test(normalized)) throw new Error("Hex input can contain only 0-9 and A-F.");
    if (normalized.length % 2 !== 0) throw new Error("Hex input needs an even number of digits.");
    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  async function sendData(): Promise<void> {
    if (!writer || !connected || sending) return;
    sending = true;
    try {
      let bytes: Uint8Array;
      let text: string;
      if (sendMode === "hex") {
        bytes = parseHex(sendValue);
        text = new TextDecoder().decode(bytes);
      } else {
        text = `${sendValue}${lineEndings[lineEnding]}`;
        bytes = new TextEncoder().encode(text);
      }
      if (bytes.length === 0) {
        setNotice("Enter text or hex bytes before sending.", "error");
        return;
      }
      await writer.write(bytes);
      txBytes += bytes.length;
      appendEntry("tx", text, bytes);
      sendValue = "";
      setNotice(`${bytes.length.toLocaleString()} byte${bytes.length === 1 ? "" : "s"} sent.`, "success");
    } catch (error) {
      const message = errorMessage(error, "The data could not be sent.");
      appendEntry("error", message, new Uint8Array());
      setNotice(message, "error");
    } finally {
      sending = false;
    }
  }

  function handleSendKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendData();
    }
  }

  async function applyOutputSignals(): Promise<void> {
    if (!port?.setSignals) return;
    try {
      await port.setSignals({ dataTerminalReady: dtr, requestToSend: rts });
    } catch (error) {
      setNotice(errorMessage(error, "DTR and RTS could not be updated."), "error");
    }
  }

  function handleDtrChange(event: Event): void {
    dtr = (event.currentTarget as HTMLInputElement).checked;
    void applyOutputSignals();
  }

  function handleRtsChange(event: Event): void {
    rts = (event.currentTarget as HTMLInputElement).checked;
    void applyOutputSignals();
  }

  async function pulseBreak(): Promise<void> {
    if (!port?.setSignals) return;
    try {
      await port.setSignals({ break: true, dataTerminalReady: dtr, requestToSend: rts });
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
      await port.setSignals({ break: false, dataTerminalReady: dtr, requestToSend: rts });
      appendEntry("system", "Sent a 120 ms BREAK signal.", new Uint8Array());
    } catch (error) {
      setNotice(errorMessage(error, "The BREAK signal could not be sent."), "error");
    }
  }

  async function refreshInputSignals(): Promise<void> {
    if (!port?.getSignals) {
      inputSignals = null;
      return;
    }
    try {
      inputSignals = await port.getSignals();
    } catch {
      inputSignals = null;
    }
  }

  function appendEntry(direction: Direction, text: string, bytes: Uint8Array): void {
    const entry: TerminalEntry = {
      id: ++entryId,
      timestamp: Date.now(),
      direction,
      text,
      hex: bytesToHex(bytes),
      byteCount: bytes.length,
    };
    entries = [...entries.slice(-(MAX_LOG_ENTRIES - 1)), entry];
    if (autoScroll) {
      tick().then(() => {
        if (logViewport) logViewport.scrollTop = logViewport.scrollHeight;
      });
    }
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function directionLabel(direction: Direction): string {
    if (direction === "rx") return "RX";
    if (direction === "tx") return "TX";
    if (direction === "error") return "ERR";
    return "SYS";
  }

  function signalStateLabel(value: boolean | undefined): string {
    return value === undefined ? "unknown" : value ? "on" : "off";
  }

  function entryText(entry: TerminalEntry): string {
    const prefix = `${formatTime(entry.timestamp)} ${directionLabel(entry.direction)}`;
    if (entry.direction === "system" || entry.direction === "error") return `${prefix} ${entry.text}`;
    if (displayMode === "hex") return `${prefix} ${entry.hex}`;
    if (displayMode === "both") return `${prefix} ${entry.text}\n${entry.hex}`;
    return `${prefix} ${entry.text}`;
  }

  function fullLog(): string {
    return entries.map(entryText).join("\n");
  }

  async function copyLog(): Promise<void> {
    if (entries.length === 0) return;
    try {
      await navigator.clipboard.writeText(fullLog());
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch (error) {
      setNotice(errorMessage(error, "The terminal log could not be copied."), "error");
    }
  }

  function downloadLog(): void {
    if (entries.length === 0) return;
    const blob = new Blob([fullLog()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `serial-session-${stamp}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<div class="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3">
  <header class="flex flex-col gap-3 border-b border-(--color-border) pb-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <span class="border px-2 py-1 text-[10px] font-bold tracking-wider {connected ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : status === 'connecting' || status === 'disconnecting' ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text-muted)'}">{statusLabel}</span>
        <strong class="truncate text-sm text-(--color-text)">{deviceLabel}</strong>
        {#if connected}<span class="text-xs tabular-nums text-(--color-text-muted)">{baudRate.toLocaleString()} baud · {dataBits}{parity === "none" ? "N" : parity === "even" ? "E" : "O"}{stopBits}</span>{/if}
      </div>
      <p class="mt-1 text-xs text-(--color-text-muted)">Data travels directly between this browser and the selected device. Nothing is uploaded.</p>
    </div>

    <div class="flex flex-wrap gap-2">
      {#if status === "disconnected"}
        {#if authorizedPortCount > 0}
          <button class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2 text-xs font-medium text-(--color-text-muted) hover:border-(--color-text-muted) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)" onclick={reconnectAuthorizedPort} disabled={!supported || !secureContext}>Reconnect authorized</button>
        {/if}
        <button class="bg-(--color-accent) px-4 py-2 text-xs font-semibold text-(--color-btn-text) hover:bg-(--color-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50" onclick={requestPort} disabled={!supported || !secureContext}>Connect</button>
      {:else}
        <button class="border border-(--color-error-border) bg-(--color-error-bg) px-4 py-2 text-xs font-semibold text-(--color-error-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-error-text) disabled:cursor-not-allowed disabled:opacity-50" onclick={disconnectPort} disabled={status !== "connected"}>Disconnect</button>
      {/if}
    </div>
  </header>

  {#if supported === false || !secureContext}
    <section class="border border-(--color-error-border) bg-(--color-error-bg) p-4 text-(--color-error-text)" role="alert">
      <h2 class="text-sm font-semibold">Web Serial unavailable</h2>
      <p class="mt-1 max-w-[72ch] text-sm">{!secureContext ? "This page must run over HTTPS or localhost before a browser can expose serial ports." : "Use desktop Chrome, Edge, or another Chromium browser with Web Serial support. Firefox and Safari do not currently expose this API."}</p>
    </section>
  {/if}

  <div class="border px-3 py-2 text-xs {noticeKind === 'error' ? 'border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text)' : noticeKind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text-muted)'}" role={noticeKind === "error" ? "alert" : "status"}>{notice}</div>

  <div class="grid min-h-0 flex-1 gap-3 xl:grid-cols-[18rem_minmax(0,1fr)]">
    <aside class="grid content-start gap-4 border border-(--color-border) bg-(--color-bg-alt) p-3">
      <div>
        <h2 class="mb-3 text-sm font-semibold text-(--color-text)">Connection</h2>
        <div class="grid grid-cols-2 gap-2">
          <label class="col-span-2 text-xs text-(--color-text-muted)" for="baud-rate">Baud rate
            <select id="baud-rate" bind:value={baudRate} disabled={configurationLocked} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm tabular-nums text-(--color-text) outline-none focus:border-(--color-text-muted) disabled:cursor-not-allowed disabled:opacity-60">
              {#each baudRates as rate}<option value={rate}>{rate.toLocaleString()}</option>{/each}
            </select>
          </label>
          <label class="text-xs text-(--color-text-muted)" for="data-bits">Data bits
            <select id="data-bits" bind:value={dataBits} disabled={configurationLocked} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted) disabled:opacity-60"><option value={8}>8</option><option value={7}>7</option></select>
          </label>
          <label class="text-xs text-(--color-text-muted)" for="stop-bits">Stop bits
            <select id="stop-bits" bind:value={stopBits} disabled={configurationLocked} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted) disabled:opacity-60"><option value={1}>1</option><option value={2}>2</option></select>
          </label>
          <label class="text-xs text-(--color-text-muted)" for="parity">Parity
            <select id="parity" bind:value={parity} disabled={configurationLocked} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted) disabled:opacity-60"><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select>
          </label>
          <label class="text-xs text-(--color-text-muted)" for="flow-control">Flow control
            <select id="flow-control" bind:value={flowControl} disabled={configurationLocked} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted) disabled:opacity-60"><option value="none">None</option><option value="hardware">Hardware</option></select>
          </label>
        </div>
      </div>

      <div class="border-t border-(--color-border) pt-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-(--color-text)">Signals</h2>
          <button class="text-xs text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40" onclick={refreshInputSignals} disabled={!connected}>Refresh input</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <label class="flex items-center gap-2 text-xs text-(--color-text-muted)"><input type="checkbox" checked={dtr} onchange={handleDtrChange} disabled={!connected} class="accent-(--color-accent)" /> DTR</label>
          <label class="flex items-center gap-2 text-xs text-(--color-text-muted)"><input type="checkbox" checked={rts} onchange={handleRtsChange} disabled={!connected} class="accent-(--color-accent)" /> RTS</label>
          <button class="border border-(--color-border) px-2 py-1 text-[11px] text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40" onclick={pulseBreak} disabled={!connected}>Pulse BREAK</button>
        </div>
        <div class="mt-3 grid grid-cols-4 gap-1">
          {#each signalStates as signal}
            <div class="border border-(--color-border) px-1 py-1.5 text-center text-[10px] font-semibold {signal.value ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-(--color-text-light)'}" aria-label={`${signal.label} ${signalStateLabel(signal.value)}`}>
              <span>{signal.label}</span>
              <span class="ml-1 font-normal">{signal.value === undefined ? "—" : signal.value ? "ON" : "OFF"}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="border-t border-(--color-border) pt-3">
        <h2 class="text-sm font-semibold text-(--color-text)">Session</h2>
        <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div><dt class="text-(--color-text-light)">Received</dt><dd class="mt-0.5 font-mono tabular-nums text-(--color-text)">{formatBytes(rxBytes)}</dd></div>
          <div><dt class="text-(--color-text-light)">Sent</dt><dd class="mt-0.5 font-mono tabular-nums text-(--color-text)">{formatBytes(txBytes)}</dd></div>
          <div class="col-span-2"><dt class="text-(--color-text-light)">Started</dt><dd class="mt-0.5 font-mono tabular-nums text-(--color-text)">{sessionStarted ? new Date(sessionStarted).toLocaleString() : "—"}</dd></div>
        </dl>
      </div>
    </aside>

    <section class="flex min-h-[32rem] flex-col border border-(--color-border) bg-[#101214] text-[#e7ecef] xl:min-h-0">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#171a1d] px-3 py-2">
        <div class="flex items-center gap-1">
          {#each [["text", "Text"], ["hex", "Hex"], ["both", "Both"]] as option}
            <button class="px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white {displayMode === option[0] ? 'bg-white text-black' : 'text-white/60 hover:text-white'}" aria-pressed={displayMode === option[0]} onclick={() => (displayMode = option[0] as DisplayMode)}>{option[1]}</button>
          {/each}
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-1.5 text-[11px] text-white/60"><input type="checkbox" bind:checked={showTimestamps} class="accent-white" /> Timestamps</label>
          <label class="flex items-center gap-1.5 text-[11px] text-white/60"><input type="checkbox" bind:checked={autoScroll} class="accent-white" /> Auto-scroll</label>
          <button class="text-[11px] text-white/60 hover:text-white disabled:opacity-30" onclick={copyLog} disabled={entries.length === 0}>{copied ? "Copied" : "Copy"}</button>
          <button class="text-[11px] text-white/60 hover:text-white disabled:opacity-30" onclick={downloadLog} disabled={entries.length === 0}>Download</button>
          <button class="text-[11px] text-white/60 hover:text-white disabled:opacity-30" onclick={() => (entries = [])} disabled={entries.length === 0}>Clear</button>
        </div>
      </div>

      <div bind:this={logViewport} class="thin-scrollbar min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed" role="region" aria-live="off" aria-label="Serial terminal output" tabindex="0">
        {#if entries.length === 0}
          <div class="flex h-full min-h-52 items-center justify-center text-center text-white/40">
            <div>
              <p class="text-sm text-white/65">Terminal is waiting</p>
              <p class="mt-1 max-w-md">Connect a device to receive data. Text and hex output are retained only for this browser session.</p>
            </div>
          </div>
        {:else}
          <div class="grid gap-1">
            {#each entries as entry (entry.id)}
              <div class="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-2 border-b border-white/[0.04] py-1 {entry.direction === 'error' ? 'text-[#ff9a9a]' : entry.direction === 'tx' ? 'text-[#8bd5ff]' : entry.direction === 'system' ? 'text-[#ffd479]' : 'text-[#d8f3dc]'}">
                {#if showTimestamps}<span class="select-none tabular-nums text-white/35">{formatTime(entry.timestamp)}</span>{/if}
                <span class="select-none font-bold {entry.direction === 'rx' ? 'text-[#75e6a4]' : entry.direction === 'tx' ? 'text-[#74c7ff]' : entry.direction === 'error' ? 'text-[#ff7b7b]' : 'text-[#f4c95d]'}">{directionLabel(entry.direction)}</span>
                <div class="min-w-0">
                  {#if entry.direction === "system" || entry.direction === "error"}
                    <span class="whitespace-pre-wrap break-words">{entry.text}</span>
                  {:else if displayMode === "hex"}
                    <span class="whitespace-pre-wrap break-all">{entry.hex}</span>
                  {:else if displayMode === "both"}
                    <div class="whitespace-pre-wrap break-words">{entry.text || "·"}</div>
                    <div class="mt-0.5 break-all text-white/45">{entry.hex}</div>
                  {:else}
                    <span class="whitespace-pre-wrap break-words">{entry.text || "·"}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="border-t border-white/10 bg-[#171a1d] p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1">
            <button class="px-2 py-1 text-xs font-medium {sendMode === 'text' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}" aria-pressed={sendMode === "text"} onclick={() => (sendMode = "text")}>Text</button>
            <button class="px-2 py-1 text-xs font-medium {sendMode === 'hex' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}" aria-pressed={sendMode === "hex"} onclick={() => (sendMode = "hex")}>Hex</button>
          </div>
          {#if sendMode === "text"}
            <label class="flex items-center gap-2 text-[11px] text-white/55" for="line-ending">Line ending
              <select id="line-ending" bind:value={lineEnding} class="border border-white/15 bg-[#101214] px-2 py-1 text-white outline-none focus:border-white/40"><option value="none">None</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option></select>
            </label>
          {/if}
        </div>
        <div class="flex gap-2">
          <label class="sr-only" for="serial-send-value">{sendMode === "text" ? "Text to send" : "Hex bytes to send"}</label>
          <textarea id="serial-send-value" bind:value={sendValue} onkeydown={handleSendKeydown} rows="2" disabled={!connected} class="thin-scrollbar min-h-14 flex-1 resize-y border border-white/15 bg-[#0c0e10] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50" placeholder={sendMode === "text" ? "Type a command. Enter sends; Shift+Enter adds a line." : "Enter bytes, for example: A5 01 FF 0D 0A"}></textarea>
          <button class="self-stretch bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-35" onclick={sendData} disabled={!connected || !sendValue.trim() || sending}>{sending ? "Sending" : "Send"}</button>
        </div>
      </div>
    </section>
  </div>

  <footer class="border-t border-(--color-border) pt-3 text-xs text-(--color-text-muted)">
    Web Serial requires a user gesture to choose a port. Close other serial monitors before connecting because operating systems usually allow only one application to hold a port at a time.
  </footer>
</div>
