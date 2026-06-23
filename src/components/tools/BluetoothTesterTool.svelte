<script lang="ts">
  // Minimal Web Bluetooth typings (not present in default lib.dom for all targets)
  type GattCharacteristic = {
    uuid: string;
    properties: Record<string, boolean>;
    value?: DataView | null;
    readValue: () => Promise<DataView>;
    writeValue?: (v: BufferSource) => Promise<void>;
    writeValueWithResponse?: (v: BufferSource) => Promise<void>;
    writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
    startNotifications: () => Promise<GattCharacteristic>;
    stopNotifications: () => Promise<GattCharacteristic>;
    addEventListener: (t: string, fn: (e: Event) => void) => void;
    removeEventListener: (t: string, fn: (e: Event) => void) => void;
  };
  type GattService = {
    uuid: string;
    getCharacteristics: () => Promise<GattCharacteristic[]>;
  };
  type GattServer = {
    connected: boolean;
    connect: () => Promise<GattServer>;
    disconnect: () => void;
    getPrimaryServices: () => Promise<GattService[]>;
  };
  type BtDevice = {
    id: string;
    name?: string;
    gatt?: GattServer;
    addEventListener: (t: string, fn: (e: Event) => void) => void;
    removeEventListener: (t: string, fn: (e: Event) => void) => void;
  };

  type Status = "disconnected" | "connecting" | "connected";
  type StatusKind = "" | "ready" | "error";
  type Format = "hex" | "text" | "base64" | "dec";
  type WriteMode = "auto" | "response" | "noResponse";
  type LogKind = "info" | "read" | "write" | "notify" | "error";

  interface CharInfo {
    key: string;
    uuid: string;
    name: string;
    props: string[];
    canRead: boolean;
    canWrite: boolean;
    canNotify: boolean;
    notifying: boolean;
    lastHex: string;
    lastDec: string;
    lastText: string;
    lastDecoded: string;
    lastTime: number | null;
  }
  interface ServiceInfo {
    uuid: string;
    name: string;
    chars: CharInfo[];
  }
  interface LogEntry {
    id: number;
    t: number;
    kind: LogKind;
    target: string;
    hex: string;
    text: string;
  }

  // Common 16-bit GATT UUID names (subset of the SIG registry).
  const GATT_NAMES: Record<string, string> = {
    "1800": "Generic Access",
    "1801": "Generic Attribute",
    "1802": "Immediate Alert",
    "1803": "Link Loss",
    "1804": "Tx Power",
    "1805": "Current Time",
    "180a": "Device Information",
    "180d": "Heart Rate",
    "180f": "Battery Service",
    "1810": "Blood Pressure",
    "1816": "Cycling Speed and Cadence",
    "1818": "Cycling Power",
    "181a": "Environmental Sensing",
    "181b": "Body Composition",
    "181c": "User Data",
    "181d": "Weight Scale",
    "1822": "Pulse Oximeter",
    "fe59": "Nordic DFU",
    "2a00": "Device Name",
    "2a01": "Appearance",
    "2a05": "Service Changed",
    "2a06": "Alert Level",
    "2a19": "Battery Level",
    "2a23": "System ID",
    "2a24": "Model Number",
    "2a25": "Serial Number",
    "2a26": "Firmware Revision",
    "2a27": "Hardware Revision",
    "2a28": "Software Revision",
    "2a29": "Manufacturer Name",
    "2a37": "Heart Rate Measurement",
    "2a38": "Body Sensor Location",
    "2a6e": "Temperature",
    "2a6f": "Humidity",
  };

  // Nordic UART Service — a very common custom service used for "send hex" style devices.
  const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write
  const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";

  // ---- non-reactive GATT object holders (kept out of $state to avoid proxy issues) ----
  let device: BtDevice | null = null;
  let server: GattServer | null = null;
  const charMap = new Map<string, GattCharacteristic>();
  const notifyHandlers = new Map<string, (e: Event) => void>();
  let onDisconnect: ((e: Event) => void) | null = null;

  // ---- reactive UI state ----
  let supported = $state<boolean | null>(null);
  let secure = $state(true);
  let adapterAvailable = $state<boolean | null>(null);
  let status = $state<Status>("disconnected");
  let deviceName = $state("");
  let deviceId = $state("");
  // Single Clawd-style status line shared by connect / read / write / notify.
  let statusMsg = $state("Ready. Press Connect to pick a device.");
  let statusKind = $state<StatusKind>("");
  let services = $state<ServiceInfo[]>([]);
  let log = $state<LogEntry[]>([]);
  let logId = 0;

  // request options
  let acceptAll = $state(true);
  let namePrefix = $state("");
  let filterServicesInput = $state("");
  let optionalServicesInput = $state(
    `battery_service, device_information, heart_rate, ${NUS_SERVICE}`,
  );

  // compose / send
  let selectedKey = $state("");
  let sendFormat = $state<Format>("hex");
  let sendValue = $state("");
  let writeMode = $state<WriteMode>("auto");
  let readFormat = $state<Format>("hex");

  $effect(() => {
    secure = window.isSecureContext;
    supported = typeof navigator !== "undefined" && "bluetooth" in navigator;
  });

  // Probe whether a Bluetooth adapter is actually available (powered + present).
  $effect(() => {
    if (!supported) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;
    if (!bt?.getAvailability) {
      adapterAvailable = null;
      return;
    }
    let cancelled = false;
    bt.getAvailability()
      .then((v: boolean) => {
        if (!cancelled) adapterAvailable = v;
      })
      .catch(() => {
        if (!cancelled) adapterAvailable = null;
      });
    const handler = (e: Event) => {
      adapterAvailable = (e as unknown as { value: boolean }).value;
    };
    bt.addEventListener?.("availabilitychanged", handler);
    return () => {
      cancelled = true;
      bt.removeEventListener?.("availabilitychanged", handler);
    };
  });

  $effect(() => {
    return () => cleanup();
  });

  function adapterHint(msg: string): string {
    if (/adapter|turned off|not available|no .*bluetooth|powered/i.test(msg)) {
      return `${msg} — make sure Bluetooth is turned on at the OS level and an adapter is present. On Linux, check \`rfkill list\` / \`systemctl status bluetooth\`, and that the page runs over HTTPS or localhost.`;
    }
    return msg;
  }

  // ---- Clawd-style status + run() wrapper ----
  function setStatus(msg: string, kind: StatusKind = "") {
    statusMsg = msg;
    statusKind = kind;
  }

  // Run an async action, surfacing success / failure on the status line.
  async function run<T>(p: Promise<T>, okMessage?: string): Promise<T | void> {
    try {
      const result = await p;
      if (okMessage) setStatus(okMessage, "ready");
      return result;
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      setStatus(adapterHint(msg), "error");
      addLog("error", "error", "", msg);
    }
  }

  const badgeText = $derived(
    statusKind === "error"
      ? "ERROR"
      : status === "connected"
        ? "CONNECTED"
        : status === "connecting"
          ? "CONNECTING"
          : "DISCONNECTED",
  );

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Retry reads for up to 30s so first-time pairing / bonding has time to finish.
  async function readRetry(ch: GattCharacteristic): Promise<DataView> {
    const deadline = Date.now() + 30000;
    let lastError: unknown;
    let prompted = false;
    for (;;) {
      try {
        return await ch.readValue();
      } catch (e) {
        lastError = e;
      }
      if (!prompted) {
        setStatus(
          "Waiting for pairing… if the device asks to confirm (PIN, button, or an OS prompt), accept it now. This can take up to ~30s.",
        );
        prompted = true;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Could not read characteristic (${(lastError as Error)?.message ?? lastError}). ` +
            "If the device needs pairing, confirm it in your OS Bluetooth settings and try again.",
        );
      }
      await sleep(800);
    }
  }

  const writableChars = $derived(
    services.flatMap((s) =>
      s.chars.filter((c) => c.canWrite).map((c) => ({ ...c, service: s.uuid })),
    ),
  );

  // ---------- helpers ----------
  function shortFromUuid(uuid: string): string | null {
    const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(uuid);
    return m ? m[1].toLowerCase() : null;
  }

  function friendly(uuid: string): string {
    const short = shortFromUuid(uuid);
    if (short) return GATT_NAMES[short] ?? `0x${short}`;
    if (uuid.toLowerCase() === NUS_SERVICE) return "Nordic UART Service";
    if (uuid.toLowerCase() === NUS_RX) return "Nordic UART RX";
    if (uuid.toLowerCase() === "6e400003-b5a3-f393-e0a9-e50e24dcca9e") return "Nordic UART TX";
    return "";
  }

  function parseUuidList(input: string): (number | string)[] {
    return input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((tok) => {
        if (/^0x[0-9a-f]+$/i.test(tok)) return parseInt(tok, 16);
        if (/^[0-9a-f]{1,8}$/i.test(tok)) return parseInt(tok, 16);
        return tok.toLowerCase();
      });
  }

  function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
    if (clean.length % 2 !== 0) throw new Error("Hex must have an even number of digits");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function decToBytes(input: string): Uint8Array {
    const parts = input.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const out = new Uint8Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i]);
      if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`"${parts[i]}" is not a byte (0-255)`);
      out[i] = n;
    }
    return out;
  }

  function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encodeValue(fmt: Format, val: string): Uint8Array {
    switch (fmt) {
      case "hex":
        return hexToBytes(val);
      case "dec":
        return decToBytes(val);
      case "base64":
        return base64ToBytes(val);
      case "text":
        return new TextEncoder().encode(val);
    }
  }

  function dvToHex(dv: DataView): string {
    const out: string[] = [];
    for (let i = 0; i < dv.byteLength; i++) out.push(dv.getUint8(i).toString(16).padStart(2, "0"));
    return out.join(" ");
  }

  function dvToText(dv: DataView): string {
    try {
      return new TextDecoder().decode(dv.buffer);
    } catch {
      return "";
    }
  }

  function dvToDec(dv: DataView): string {
    const out: string[] = [];
    for (let i = 0; i < dv.byteLength; i++) out.push(String(dv.getUint8(i)));
    return out.join(" ");
  }

  // True only when every byte is printable ASCII (so we don't show garbage utf8).
  function looksTextual(dv: DataView): boolean {
    if (dv.byteLength === 0) return false;
    for (let i = 0; i < dv.byteLength; i++) {
      const b = dv.getUint8(i);
      if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
      if (b < 0x20 || b > 0x7e) return false;
    }
    return true;
  }

  // Human-friendly decode for well-known GATT characteristics.
  function decodeKnown(uuid: string, dv: DataView): string {
    const short = shortFromUuid(uuid);
    if (!short || dv.byteLength === 0) return "";
    switch (short) {
      case "2a19": // Battery Level (uint8 percentage)
        return `${dv.getUint8(0)}%`;
      case "2a6f": // Humidity (uint16, 0.01 %RH)
        return dv.byteLength >= 2 ? `${(dv.getUint16(0, true) / 100).toFixed(2)} %RH` : "";
      case "2a6e": // Temperature (sint16, 0.01 °C)
        return dv.byteLength >= 2 ? `${(dv.getInt16(0, true) / 100).toFixed(2)} °C` : "";
      case "2a01": // Appearance (uint16)
        return dv.byteLength >= 2 ? `appearance ${dv.getUint16(0, true)}` : "";
      case "2a06": // Alert Level (uint8)
        return `level ${dv.getUint8(0)}`;
      case "2a37": { // Heart Rate Measurement
        const flags = dv.getUint8(0);
        const hr16 = (flags & 0x01) !== 0;
        const bpm = hr16
          ? dv.byteLength >= 3
            ? dv.getUint16(1, true)
            : 0
          : dv.byteLength >= 2
            ? dv.getUint8(1)
            : 0;
        return `${bpm} bpm`;
      }
      default:
        return "";
    }
  }

  // Best text for logs: decoded value if known, else printable text, else nothing.
  function humanValue(uuid: string, dv: DataView): string {
    const decoded = decodeKnown(uuid, dv);
    if (decoded) return decoded;
    return looksTextual(dv) ? dvToText(dv) : "";
  }

  function bytesToHex(b: Uint8Array): string {
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
  }

  function addLog(kind: LogKind, target: string, hex = "", text = "") {
    log = [{ id: ++logId, t: Date.now(), kind, target, hex, text }, ...log].slice(0, 500);
  }

  function fmtTime(t: number): string {
    return new Date(t).toLocaleTimeString(undefined, { hour12: false });
  }

  function setCharValue(key: string, dv: DataView) {
    for (const s of services) {
      for (const c of s.chars) {
        if (c.key === key) {
          c.lastHex = dvToHex(dv);
          c.lastDec = dvToDec(dv);
          c.lastText = looksTextual(dv) ? dvToText(dv) : "";
          c.lastDecoded = decodeKnown(c.uuid, dv);
          c.lastTime = Date.now();
          return;
        }
      }
    }
  }

  // ---------- connection ----------
  async function connect() {
    if (!supported) throw new Error("Web Bluetooth is not available in this browser.");

    let options: Record<string, unknown>;
    const optional = parseUuidList(optionalServicesInput);
    if (acceptAll) {
      options = { acceptAllDevices: true, optionalServices: optional };
    } else {
      const filter: Record<string, unknown> = {};
      const svc = parseUuidList(filterServicesInput);
      if (svc.length) filter.services = svc;
      if (namePrefix.trim()) filter.namePrefix = namePrefix.trim();
      if (Object.keys(filter).length === 0) {
        throw new Error("Add a service filter / name prefix, or enable “Accept all devices”.");
      }
      options = { filters: [filter], optionalServices: optional };
    }

    status = "connecting";
    setStatus("Opening the browser device chooser… pick your device.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;

    // The chooser throws NotFoundError when the user dismisses it — treat gently.
    try {
      device = (await bt.requestDevice(options)) as BtDevice;
    } catch (e) {
      status = "disconnected";
      const msg = (e as Error).message || String(e);
      if (/cancel|chooser|User cancelled|NotFoundError/i.test(msg)) {
        setStatus("Device chooser cancelled.");
        return;
      }
      throw e;
    }

    try {
      deviceName = device.name || "(unnamed device)";
      deviceId = device.id;
      addLog("info", deviceName, "", "device selected");

      onDisconnect = () => {
        addLog("info", deviceName, "", "GATT server disconnected");
        status = "disconnected";
        services = [];
        charMap.clear();
        setStatus("Device disconnected.");
      };
      device.addEventListener("gattserverdisconnected", onDisconnect);

      if (!device.gatt) throw new Error("Device has no GATT server");
      setStatus("Connecting…");
      server = await device.gatt.connect();
      addLog("info", deviceName, "", "connected — discovering services…");
      await discover();
      status = "connected";
      setStatus(`Connected to ${deviceName}.`, "ready");
    } catch (e) {
      status = device?.gatt?.connected ? "connected" : "disconnected";
      // Re-probe availability so the banner reflects reality.
      bt?.getAvailability?.().then((v: boolean) => (adapterAvailable = v)).catch(() => {});
      throw e;
    }
  }

  async function discover() {
    if (!server) return;
    const next: ServiceInfo[] = [];
    charMap.clear();
    let idx = 0;
    const svcs = await server.getPrimaryServices();
    for (const svc of svcs) {
      const si: ServiceInfo = { uuid: svc.uuid, name: friendly(svc.uuid), chars: [] };
      let chars: GattCharacteristic[] = [];
      try {
        chars = await svc.getCharacteristics();
      } catch (e) {
        addLog("error", svc.uuid, "", `getCharacteristics: ${(e as Error).message}`);
      }
      for (const ch of chars) {
        const key = `c${idx++}`;
        charMap.set(key, ch);
        const p = ch.properties || {};
        const props = Object.keys(p).filter((k) => (p as Record<string, boolean>)[k]);
        si.chars.push({
          key,
          uuid: ch.uuid,
          name: friendly(ch.uuid),
          props,
          canRead: !!p.read,
          canWrite: !!(p.write || p.writeWithoutResponse),
          canNotify: !!(p.notify || p.indicate),
          notifying: false,
          lastHex: "",
          lastDec: "",
          lastText: "",
          lastDecoded: "",
          lastTime: null,
        });
      }
      next.push(si);
    }
    services = next;
    addLog("info", deviceName, "", `discovered ${next.length} service(s)`);
    // auto-select first writable characteristic
    const firstWritable = next.flatMap((s) => s.chars).find((c) => c.canWrite);
    if (firstWritable) selectedKey = firstWritable.key;
  }

  function disconnect() {
    cleanup();
    status = "disconnected";
    setStatus("Disconnected.");
    addLog("info", deviceName || "device", "", "disconnected by user");
  }

  function cleanup() {
    for (const [key, ch] of charMap) {
      const h = notifyHandlers.get(key);
      if (h) {
        try {
          ch.removeEventListener("characteristicvaluechanged", h);
        } catch {
          /* ignore */
        }
      }
    }
    notifyHandlers.clear();
    if (device && onDisconnect) {
      try {
        device.removeEventListener("gattserverdisconnected", onDisconnect);
      } catch {
        /* ignore */
      }
    }
    onDisconnect = null;
    if (server && server.connected) {
      try {
        server.disconnect();
      } catch {
        /* ignore */
      }
    }
    server = null;
    device = null;
  }

  // ---------- characteristic operations ----------
  async function readChar(key: string) {
    const ch = charMap.get(key);
    if (!ch) return;
    await run(
      (async () => {
        // readRetry waits out first-time pairing instead of failing immediately.
        const dv = await readRetry(ch);
        setCharValue(key, dv);
        addLog("read", ch.uuid, dvToHex(dv), humanValue(ch.uuid, dv));
      })(),
      `Read ${friendly(ch.uuid) || ch.uuid}.`,
    );
  }

  async function toggleNotify(key: string) {
    const ch = charMap.get(key);
    if (!ch) return;
    const info = services.flatMap((s) => s.chars).find((c) => c.key === key);
    if (!info) return;
    try {
      if (info.notifying) {
        await ch.stopNotifications();
        const h = notifyHandlers.get(key);
        if (h) ch.removeEventListener("characteristicvaluechanged", h);
        notifyHandlers.delete(key);
        info.notifying = false;
        addLog("info", ch.uuid, "", "notifications stopped");
        setStatus(`Notifications stopped for ${friendly(ch.uuid) || ch.uuid}.`, "ready");
      } else {
        const handler = (e: Event) => {
          const target = e.target as unknown as GattCharacteristic;
          const dv = target.value;
          if (!dv) return;
          setCharValue(key, dv);
          addLog("notify", ch.uuid, dvToHex(dv), humanValue(ch.uuid, dv));
        };
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", handler);
        notifyHandlers.set(key, handler);
        info.notifying = true;
        addLog("info", ch.uuid, "", "notifications started");
        setStatus(`Notifications started for ${friendly(ch.uuid) || ch.uuid}.`, "ready");
      }
    } catch (e) {
      const msg = (e as Error).message;
      setStatus(`Notify failed: ${msg}`, "error");
      addLog("error", ch.uuid, "", `notify: ${msg}`);
    }
  }

  async function sendCommand() {
    if (!selectedKey) {
      setStatus("Select a characteristic to write to.", "error");
      return;
    }
    const ch = charMap.get(selectedKey);
    if (!ch) {
      setStatus("Characteristic not available.", "error");
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = encodeValue(sendFormat, sendValue);
    } catch (e) {
      setStatus((e as Error).message, "error");
      return;
    }
    if (bytes.byteLength === 0) {
      setStatus("Nothing to send.", "error");
      return;
    }
    const p = ch.properties || {};
    await run(
      (async () => {
        if (writeMode === "noResponse" && p.writeWithoutResponse && ch.writeValueWithoutResponse) {
          await ch.writeValueWithoutResponse(bytes);
        } else if (writeMode === "response" && p.write && ch.writeValueWithResponse) {
          await ch.writeValueWithResponse(bytes);
        } else if (p.write && ch.writeValueWithResponse) {
          await ch.writeValueWithResponse(bytes);
        } else if (p.writeWithoutResponse && ch.writeValueWithoutResponse) {
          await ch.writeValueWithoutResponse(bytes);
        } else if (ch.writeValue) {
          await ch.writeValue(bytes);
        } else {
          throw new Error("Characteristic is not writable");
        }
        addLog("write", ch.uuid, bytesToHex(bytes), sendFormat === "text" ? sendValue : "");
      })(),
      `Wrote ${bytes.byteLength} byte(s) to ${friendly(ch.uuid) || ch.uuid}.`,
    );
  }

  function selectForWrite(key: string) {
    selectedKey = key;
  }

  function copy(s: string) {
    navigator.clipboard.writeText(s).catch(() => {});
  }

  function clearLog() {
    log = [];
  }

  function logColor(k: LogKind): string {
    return k === "read"
      ? "border-blue-500 text-blue-600 dark:text-blue-400"
      : k === "write"
        ? "border-green-500 text-green-600 dark:text-green-400"
        : k === "notify"
          ? "border-purple-500 text-purple-600 dark:text-purple-400"
          : k === "error"
            ? "border-(--color-error-text) text-(--color-error-text)"
            : "border-(--color-border) text-(--color-text-muted)";
  }
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-3xl mx-auto space-y-6">

    {#if supported === false}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6 text-center">
        <h2 class="text-lg font-medium mb-2">Web Bluetooth not available</h2>
        <p class="text-sm text-(--color-text-light)">
          This API is supported in Chrome, Edge, and Opera on desktop and Android.
          Firefox, Safari, and iOS browsers do not support it.
          {#if !secure}
            <br />It also requires a secure context (HTTPS or localhost).
          {/if}
        </p>
      </section>
    {:else}
      <!-- Status bar -->
      <header class="flex items-center justify-between gap-3 pb-3 border-b border-(--color-border)">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-3.5 h-3.5 rounded-[5px] bg-(--color-accent) shrink-0" aria-hidden="true"></span>
          <span class="text-lg font-bold tracking-tight">Web Bluetooth</span>
          <span class="text-[11px] font-semibold tracking-[0.14em] uppercase text-(--color-text-light)">BLE Tester</span>
        </div>
        <span
          class="text-[11px] font-semibold tracking-wider uppercase border rounded-full px-3 py-1 whitespace-nowrap {statusKind ===
          'error'
            ? 'bg-(--color-error-text) text-white border-transparent'
            : status === 'connected'
              ? 'bg-green-600 text-white border-transparent'
              : 'text-(--color-text-light) border-(--color-border) bg-(--color-bg)'}"
        >
          {badgeText}
        </span>
      </header>

      {#if adapterAvailable === false}
        <section class="border border-(--color-error-text) bg-(--color-bg-alt) p-4">
          <h2 class="text-sm font-medium mb-1 text-(--color-error-text)">No Bluetooth adapter available</h2>
          <p class="text-xs text-(--color-text-light)">
            Your browser reports that no Bluetooth adapter is present or powered on. Turn Bluetooth on
            at the OS level and make sure the device has an adapter. On Linux, check
            <span class="font-mono">rfkill list</span> /
            <span class="font-mono">systemctl status bluetooth</span>, and that this page is served over
            HTTPS or localhost. Remote/VM/headless environments usually have no adapter.
          </p>
        </section>
      {/if}

      <!-- Device / connection -->
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <h2 class="text-xs font-bold tracking-[0.14em] uppercase text-(--color-text-light) mb-2">Device</h2>
        <p class="text-sm text-(--color-text-light) mb-3">
          Pick a BLE (GATT) device, then read, write, and subscribe to its characteristics.
          Chrome / Edge over HTTPS or localhost.
        </p>

        {#if status === "connected"}
          <div class="text-sm font-mono text-(--color-text-light) mb-3">
            <div>name: {deviceName}</div>
            <div class="text-xs break-all">id: {deviceId}</div>
          </div>
        {:else}
          <div class="space-y-3 mb-3">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" bind:checked={acceptAll} class="cursor-pointer" />
              Accept all devices
            </label>

            {#if !acceptAll}
              <div class="grid sm:grid-cols-2 gap-2">
                <div>
                  <span class="text-xs text-(--color-text-light) block mb-1">Service filter (UUIDs / names)</span>
                  <input
                    type="text"
                    bind:value={filterServicesInput}
                    placeholder="180f, heart_rate, 6e400001-…"
                    class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
                  />
                </div>
                <div>
                  <span class="text-xs text-(--color-text-light) block mb-1">Name prefix</span>
                  <input
                    type="text"
                    bind:value={namePrefix}
                    placeholder="e.g. MyDevice"
                    class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
                  />
                </div>
              </div>
            {/if}

            <div>
              <span class="text-xs text-(--color-text-light) block mb-1">
                Optional services (must list a service UUID here to access it)
              </span>
              <input
                type="text"
                bind:value={optionalServicesInput}
                placeholder="battery_service, 6e400001-b5a3-f393-e0a9-e50e24dcca9e"
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
              />
            </div>
          </div>
        {/if}

        <div class="flex gap-2">
          <button
            onclick={() => run(connect())}
            disabled={status === "connected" || status === "connecting"}
            class="flex-1 px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "connecting" ? "Connecting…" : "Connect"}
          </button>
          <button
            onclick={disconnect}
            disabled={status !== "connected"}
            class="flex-1 px-4 py-2 bg-(--color-bg) border border-(--color-border) text-sm text-(--color-text) hover:border-(--color-text-light) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Disconnect
          </button>
        </div>

        <pre class="m-0 mt-3 font-mono text-xs whitespace-pre-wrap break-words p-3 border border-(--color-border) bg-(--color-bg) {statusKind ===
          'ready'
            ? 'text-green-600 dark:text-green-400'
            : statusKind === 'error'
              ? 'text-(--color-error-text)'
              : 'text-(--color-text-muted)'}">{statusMsg}</pre>
      </section>

      <!-- Send custom command -->
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <h2 class="font-medium mb-3">Send custom command</h2>

        <div class="grid sm:grid-cols-2 gap-2 mb-2">
          <div>
            <span class="text-xs text-(--color-text-light) block mb-1">Characteristic (writable)</span>
            <select
              bind:value={selectedKey}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
            >
              {#if writableChars.length === 0}
                <option value="">— no writable characteristics —</option>
              {/if}
              {#each writableChars as c}
                <option value={c.key}>{c.name || c.uuid}</option>
              {/each}
            </select>
          </div>
          <div>
            <span class="text-xs text-(--color-text-light) block mb-1">Write mode</span>
            <select
              bind:value={writeMode}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs focus:border-(--color-text-light) outline-none"
            >
              <option value="auto">Auto</option>
              <option value="response">With response</option>
              <option value="noResponse">Without response</option>
            </select>
          </div>
        </div>

        <div class="flex gap-1 mb-2">
          {#each [["hex", "Hex"], ["text", "Text"], ["base64", "Base64"], ["dec", "Decimal"]] as [val, label]}
            <button
              onclick={() => (sendFormat = val as Format)}
              class="px-2 py-1 text-xs border transition-colors {sendFormat === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>

        <textarea
          bind:value={sendValue}
          rows="3"
          placeholder={sendFormat === "hex"
            ? "01 ff a0 0b  (hex bytes)"
            : sendFormat === "dec"
              ? "1 255 160 11  (0-255 per byte)"
              : sendFormat === "base64"
                ? "base64 string"
                : "text payload"}
          onkeydown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              sendCommand();
            }
          }}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none resize-y"
        ></textarea>

        <div class="flex items-center gap-2 mt-2">
          <button
            onclick={sendCommand}
            disabled={status !== "connected" || !selectedKey}
            class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
          <span class="text-xs text-(--color-text-light)">Cmd/Ctrl+Enter to send</span>
        </div>
      </section>

      <!-- Services tree -->
      {#if services.length > 0}
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          <h2 class="font-medium mb-3">Services &amp; characteristics</h2>
          <div class="space-y-4">
            {#each services as s (s.uuid)}
              <div class="border border-(--color-border) bg-(--color-bg)">
                <div class="px-3 py-2 border-b border-(--color-border)">
                  <div class="text-sm font-medium">{s.name || "Unknown service"}</div>
                  <div class="text-[11px] font-mono text-(--color-text-light) break-all">{s.uuid}</div>
                </div>
                <div class="divide-y divide-(--color-border)">
                  {#each s.chars as c (c.key)}
                    <div class="px-3 py-2">
                      <div class="flex items-start gap-2 flex-wrap">
                        <div class="min-w-0">
                          <div class="text-sm">{c.name || "Characteristic"}</div>
                          <div class="text-[11px] font-mono text-(--color-text-light) break-all">{c.uuid}</div>
                          <div class="flex flex-wrap gap-1 mt-1">
                            {#each c.props as prop}
                              <span class="px-1.5 py-0.5 text-[10px] font-mono border border-(--color-border) text-(--color-text-muted)">{prop}</span>
                            {/each}
                          </div>
                        </div>
                        <div class="ml-auto flex gap-1">
                          {#if c.canRead}
                            <button
                              onclick={() => readChar(c.key)}
                              class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                            >
                              Read
                            </button>
                          {/if}
                          {#if c.canNotify}
                            <button
                              onclick={() => toggleNotify(c.key)}
                              class="px-2 py-1 text-xs border transition-colors {c.notifying
                                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                                : 'bg-(--color-bg-alt) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                            >
                              {c.notifying ? "Notifying" : "Notify"}
                            </button>
                          {/if}
                          {#if c.canWrite}
                            <button
                              onclick={() => selectForWrite(c.key)}
                              class="px-2 py-1 text-xs border transition-colors {selectedKey === c.key
                                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                                : 'bg-(--color-bg-alt) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                            >
                              Write →
                            </button>
                          {/if}
                        </div>
                      </div>
                      {#if c.lastTime}
                        <div class="mt-2 text-xs font-mono bg-(--color-bg-alt) border border-(--color-border) p-2 break-all">
                          {#if c.lastDecoded}
                            <span class="text-(--color-text-light)">value:</span> <span class="font-medium text-(--color-accent)">{c.lastDecoded}</span><br />
                          {/if}
                          <span class="text-(--color-text-light)">hex:</span> {c.lastHex || "(empty)"}
                          {#if c.lastDec}
                            <br /><span class="text-(--color-text-light)">dec:</span> {c.lastDec}
                          {/if}
                          {#if c.lastText && !c.lastDecoded}
                            <br /><span class="text-(--color-text-light)">utf8:</span> {c.lastText}
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                  {#if s.chars.length === 0}
                    <div class="px-3 py-2 text-xs text-(--color-text-light)">No characteristics</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Log -->
      <section class="border border-(--color-border) bg-(--color-bg-alt)">
        <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between">
          <h2 class="font-medium">Log ({log.length})</h2>
          <button onclick={clearLog} class="text-xs text-(--color-text-light) hover:text-(--color-text)">Clear</button>
        </div>
        <div class="max-h-72 overflow-auto divide-y divide-(--color-border)">
          {#if log.length === 0}
            <div class="px-4 py-3 text-sm text-(--color-text-light) text-center">No activity yet</div>
          {:else}
            {#each log as e (e.id)}
              <div class="px-3 py-1.5">
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-mono text-(--color-text-light)">{fmtTime(e.t)}</span>
                  <span class="px-1.5 py-0.5 font-mono text-[10px] uppercase border {logColor(e.kind)}">{e.kind}</span>
                  <span class="font-mono text-[11px] text-(--color-text-muted) truncate">{e.target}</span>
                  {#if e.hex}
                    <button onclick={() => copy(e.hex)} class="ml-auto text-[10px] text-(--color-text-light) hover:text-(--color-text)">copy</button>
                  {/if}
                </div>
                {#if e.hex}
                  <pre class="text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all m-0 mt-0.5">{e.hex}{e.text ? `   "${e.text}"` : ""}</pre>
                {:else if e.text}
                  <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all m-0 mt-0.5">{e.text}</pre>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <p class="text-xs text-(--color-text-light)">
        Web Bluetooth talks to BLE (GATT) devices only — classic Bluetooth and audio devices are not
        accessible. To access a service you must list its UUID in “Optional services” (or a filter)
        before connecting.
      </p>
    {/if}

  </div>
</div>
