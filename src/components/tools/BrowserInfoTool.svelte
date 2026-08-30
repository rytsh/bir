<script lang="ts">
  import { Copy, Info, RefreshCw, ShieldCheck } from "@lucide/svelte";

  interface InfoItem {
    label: string;
    value: string;
    note?: string;
    supported?: boolean;
    pending?: boolean;
  }

  interface InfoSection {
    title: string;
    description: string;
    items: InfoItem[];
    wide?: boolean;
    compact?: boolean;
  }

  interface SummaryItem {
    label: string;
    value: string;
    detail: string;
    pending?: boolean;
  }

  interface ClientHints {
    architecture?: string;
    bitness?: string;
    formFactors?: string[];
    mobile?: boolean;
    model?: string;
    platform?: string;
    platformVersion?: string;
    wow64?: boolean;
  }

  interface NavigatorUAData {
    mobile: boolean;
    platform: string;
    getHighEntropyValues: (hints: string[]) => Promise<ClientHints>;
  }

  interface GpuAdapterInfo {
    architecture?: string;
    description?: string;
    device?: string;
    vendor?: string;
  }

  interface GpuAdapter {
    info?: GpuAdapterInfo;
    requestAdapterInfo?: () => Promise<GpuAdapterInfo>;
  }

  interface StorageSnapshot {
    persisted: boolean | null;
    quota: number | null;
    usage: number | null;
  }

  interface GraphicsSnapshot {
    api: string;
    renderer: string;
    shadingLanguage: string;
    supported: boolean;
    vendor: string;
    version: string;
    webgl2: boolean;
  }

  interface MediaSnapshot {
    audioInputs: number;
    audioOutputs: number;
    cameras: number;
    available: boolean;
  }

  interface BatterySnapshot {
    charging: boolean;
    level: number;
  }

  interface ConnectionInfo {
    downlink?: number;
    effectiveType?: string;
    rtt?: number;
    saveData?: boolean;
    type?: string;
  }

  interface PerformanceMemory {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  }

  /** Data that is free to read, so it can render on the first paint. */
  interface InstantSnapshot {
    browserName: string;
    browserVersion: string;
    colorDepth: number;
    colorGamut: string;
    connection: ConnectionInfo | null;
    cookiesEnabled: boolean;
    crossOriginIsolated: boolean;
    deviceMemory: number | null;
    doNotTrack: string;
    dynamicRange: string;
    heapLimit: number | null;
    hoverCapable: boolean;
    https: boolean;
    indexedDb: boolean;
    cacheApi: boolean;
    language: string;
    languages: string;
    localStorage: boolean;
    logicalProcessors: number | null;
    online: boolean;
    orientation: string;
    physicalHeight: number;
    physicalWidth: number;
    pixelRatio: number;
    platform: string;
    pointer: string;
    screenAvailHeight: number;
    screenAvailWidth: number;
    screenHeight: number;
    screenWidth: number;
    secureContext: boolean;
    sessionStorage: boolean;
    touchPoints: number;
    userAgent: string;
  }

  type ProbeStatus = "pending" | "settled";

  interface Probe<T> {
    status: ProbeStatus;
    value: T | null;
  }

  const PENDING_LABEL = "Checking…";

  let copyStatus = $state<"idle" | "copied" | "failed">("idle");
  let errorMessage = $state("");
  let lastUpdated = $state("");
  let instant = $state<InstantSnapshot | null>(null);

  let clientHints = $state<Probe<ClientHints>>({ status: "pending", value: null });
  let graphics = $state<Probe<GraphicsSnapshot>>({ status: "pending", value: null });
  let webGpu = $state<Probe<GpuAdapterInfo>>({ status: "pending", value: null });
  let storage = $state<Probe<StorageSnapshot>>({ status: "pending", value: null });
  let media = $state<Probe<MediaSnapshot>>({ status: "pending", value: null });
  let battery = $state<Probe<BatterySnapshot>>({ status: "pending", value: null });

  let runToken = 0;
  let frameHandle = 0;

  function formatBytes(bytes: number | null, decimals = 1): string {
    if (bytes === null || !Number.isFinite(bytes)) return "Not available";
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(decimals)} ${units[index]}`;
  }

  function reported(value?: string): string {
    return value?.trim() || "Not reported by this browser";
  }

  function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 4000): Promise<T> {
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(fallback), timeoutMs);
      promise.then(
        (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        () => {
          window.clearTimeout(timeout);
          resolve(fallback);
        },
      );
    });
  }

  function detectBrowser(): { name: string; version: string } {
    const ua = navigator.userAgent;
    const candidates: { marker: RegExp; name: string }[] = [
      { marker: /Edg\/([\d.]+)/, name: "Microsoft Edge" },
      { marker: /OPR\/([\d.]+)/, name: "Opera" },
      { marker: /SamsungBrowser\/([\d.]+)/, name: "Samsung Internet" },
      { marker: /FxiOS\/([\d.]+)/, name: "Firefox iOS" },
      { marker: /Firefox\/([\d.]+)/, name: "Firefox" },
      { marker: /CriOS\/([\d.]+)/, name: "Chrome iOS" },
      { marker: /Chrome\/([\d.]+)/, name: "Chrome" },
      { marker: /Version\/([\d.]+).*Safari/, name: "Safari" },
    ];

    for (const candidate of candidates) {
      const match = ua.match(candidate.marker);
      if (match) return { name: candidate.name, version: match[1] };
    }

    return { name: "Unknown", version: "Not available" };
  }

  function isDesktopModeIpad(): boolean {
    return /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  }

  function detectOperatingSystem(hints: ClientHints | null): string {
    if (hints?.platform) return hints.platform;

    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua) || isDesktopModeIpad()) return "iOS / iPadOS";
    if (/Windows/i.test(ua)) return "Windows";
    if (/CrOS/i.test(ua)) return "ChromeOS";
    if (/Mac OS/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Unknown";
  }

  function detectDeviceType(hints: ClientHints | null): string {
    const ua = navigator.userAgent;
    const formFactor = hints?.formFactors?.[0];
    if (formFactor) return formFactor.charAt(0).toUpperCase() + formFactor.slice(1);
    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || isDesktopModeIpad()) return "Tablet";
    if (hints?.mobile || /Mobi|iPhone|iPod/i.test(ua)) return "Phone";
    return "Desktop / Laptop";
  }

  function getArchitectureLabel(hints: ClientHints | null): string {
    const architecture = hints?.architecture;
    if (!architecture) return "Not reported by this browser";

    const names: Record<string, string> = {
      arm: "ARM",
      arm64: "ARM64",
      x86: "x86",
      x86_64: "x86-64",
    };
    const name = names[architecture.toLowerCase()] || architecture;
    return hints?.bitness ? `${name} (${hints.bitness}-bit)` : name;
  }

  function canWriteStorage(getStorage: () => Storage): boolean {
    try {
      const store = getStorage();
      const key = `__hardware_info_test_${Date.now()}_${Math.random()}__`;
      store.setItem(key, "1");
      store.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  /** Reads only cheap, synchronous values. Nothing here may touch WebGL or GPU APIs. */
  function readInstant(): InstantSnapshot {
    const browser = detectBrowser();
    const performanceMemory = (performance as Performance & { memory?: PerformanceMemory }).memory;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
    const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection ?? null;

    return {
      browserName: browser.name,
      browserVersion: browser.version,
      cacheApi: "caches" in window,
      colorDepth: screen.colorDepth,
      colorGamut: matchMedia("(color-gamut: rec2020)").matches
        ? "Rec. 2020"
        : matchMedia("(color-gamut: p3)").matches
          ? "Display P3"
          : "sRGB",
      connection,
      cookiesEnabled: navigator.cookieEnabled,
      crossOriginIsolated: window.crossOriginIsolated,
      deviceMemory,
      doNotTrack: navigator.doNotTrack === "1" ? "Enabled" : "Disabled",
      dynamicRange: matchMedia("(dynamic-range: high)").matches ? "High (HDR capable)" : "Standard",
      heapLimit: performanceMemory?.jsHeapSizeLimit ?? null,
      hoverCapable: matchMedia("(hover: hover)").matches,
      https: location.protocol === "https:",
      indexedDb: !!window.indexedDB,
      language: navigator.language,
      languages: navigator.languages?.join(", ") || navigator.language,
      localStorage: canWriteStorage(() => window.localStorage),
      logicalProcessors: navigator.hardwareConcurrency || null,
      online: navigator.onLine,
      orientation: (screen.orientation?.type || (screen.width > screen.height ? "landscape" : "portrait")).replaceAll("-", " "),
      physicalHeight: Math.round(screen.height * window.devicePixelRatio),
      physicalWidth: Math.round(screen.width * window.devicePixelRatio),
      pixelRatio: window.devicePixelRatio,
      platform: navigator.platform || "Not available",
      pointer: matchMedia("(pointer: coarse)").matches
        ? "Coarse (touch-like)"
        : matchMedia("(pointer: fine)").matches
          ? "Fine (mouse-like)"
          : "Unknown",
      screenAvailHeight: screen.availHeight,
      screenAvailWidth: screen.availWidth,
      screenHeight: screen.height,
      screenWidth: screen.width,
      secureContext: window.isSecureContext,
      sessionStorage: canWriteStorage(() => window.sessionStorage),
      touchPoints: navigator.maxTouchPoints || 0,
      userAgent: navigator.userAgent,
    };
  }

  /** Creating a WebGL context can stall for hundreds of ms, so it never runs before first paint. */
  function readGraphics(): GraphicsSnapshot {
    const canvas = document.createElement("canvas");
    const context = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as
      | WebGL2RenderingContext
      | WebGLRenderingContext
      | null;

    if (!context) {
      return {
        api: "Not available",
        renderer: "Not reported by this browser",
        shadingLanguage: "Not available",
        supported: false,
        vendor: "Not reported by this browser",
        version: "Not available",
        webgl2: false,
      };
    }

    const debugInfo = context.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext;

    const snapshot: GraphicsSnapshot = {
      api: webgl2 ? "WebGL 2" : "WebGL 1",
      renderer: String(
        debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER),
      ),
      shadingLanguage: String(context.getParameter(context.SHADING_LANGUAGE_VERSION)),
      supported: true,
      vendor: String(
        debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : context.getParameter(context.VENDOR),
      ),
      version: String(context.getParameter(context.VERSION)),
      webgl2,
    };

    // Release the context instead of leaving it attached to the GPU process.
    (context.getExtension("WEBGL_lose_context") as { loseContext: () => void } | null)?.loseContext();
    return snapshot;
  }

  async function readClientHints(): Promise<ClientHints | null> {
    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
    if (!uaData) return null;

    try {
      return await uaData.getHighEntropyValues([
        "architecture",
        "bitness",
        "formFactors",
        "model",
        "platformVersion",
        "wow64",
      ]);
    } catch {
      return { mobile: uaData.mobile, platform: uaData.platform };
    }
  }

  async function readWebGpu(): Promise<GpuAdapterInfo | null> {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<GpuAdapter | null> } }).gpu;
    if (!gpu) return null;

    try {
      const adapter = await withTimeout(gpu.requestAdapter(), null);
      if (!adapter) return null;
      if (adapter.info) return adapter.info;
      return adapter.requestAdapterInfo ? await withTimeout(adapter.requestAdapterInfo(), null) : null;
    } catch {
      return null;
    }
  }

  async function readStorage(): Promise<StorageSnapshot> {
    if (!navigator.storage?.estimate) return { persisted: null, quota: null, usage: null };

    try {
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted?.() ?? Promise.resolve(null),
      ]);
      return { persisted, quota: estimate.quota ?? null, usage: estimate.usage ?? null };
    } catch {
      return { persisted: null, quota: null, usage: null };
    }
  }

  async function readMedia(): Promise<MediaSnapshot> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { audioInputs: 0, audioOutputs: 0, cameras: 0, available: false };
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter((device) => device.kind === "audioinput").length,
        audioOutputs: devices.filter((device) => device.kind === "audiooutput").length,
        cameras: devices.filter((device) => device.kind === "videoinput").length,
        available: true,
      };
    } catch {
      return { audioInputs: 0, audioOutputs: 0, cameras: 0, available: false };
    }
  }

  async function readBattery(): Promise<BatterySnapshot | null> {
    const getBattery = (navigator as Navigator & {
      getBattery?: () => Promise<{ charging: boolean; level: number }>;
    }).getBattery;
    if (!getBattery) return null;

    try {
      const level = await getBattery.call(navigator);
      return { charging: level.charging, level: level.level };
    } catch {
      return null;
    }
  }

  function markUpdated(): void {
    lastUpdated = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
  }

  /** Runs the slow probes after the page has painted, filling each field as it resolves. */
  function runProbes(): void {
    const token = ++runToken;
    const alive = () => token === runToken;

    const graphicsTask = new Promise<GraphicsSnapshot>((resolve) => {
      window.setTimeout(() => resolve(readGraphics()), 0);
    }).then((value) => {
      if (alive()) graphics = { status: "settled", value };
    });

    const tasks = [
      graphicsTask,
      withTimeout(readClientHints(), null).then((value) => {
        if (alive()) clientHints = { status: "settled", value };
      }),
      withTimeout(readWebGpu(), null).then((value) => {
        if (alive()) webGpu = { status: "settled", value };
      }),
      withTimeout(readStorage(), { persisted: null, quota: null, usage: null }).then((value) => {
        if (alive()) storage = { status: "settled", value };
      }),
      withTimeout(readMedia(), { audioInputs: 0, audioOutputs: 0, cameras: 0, available: false }).then((value) => {
        if (alive()) media = { status: "settled", value };
      }),
      withTimeout(readBattery(), null).then((value) => {
        if (alive()) battery = { status: "settled", value };
      }),
    ];

    void Promise.allSettled(tasks).then(() => {
      if (alive()) markUpdated();
    });
  }

  function scan(): void {
    try {
      instant = readInstant();
      errorMessage = "";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Hardware information could not be read.";
      return;
    }

    clientHints = { status: "pending", value: null };
    graphics = { status: "pending", value: null };
    webGpu = { status: "pending", value: null };
    storage = { status: "pending", value: null };
    media = { status: "pending", value: null };
    battery = { status: "pending", value: null };

    // Two frames guarantees the freshly rendered content is on screen before the GPU probes start.
    window.cancelAnimationFrame(frameHandle);
    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = window.requestAnimationFrame(() => runProbes());
    });
  }

  function probeItem(
    label: string,
    status: ProbeStatus,
    resolve: () => string,
    extra: { note?: string; supported?: boolean } = {},
  ): InfoItem {
    if (status === "pending") return { label, value: PENDING_LABEL, pending: true, note: extra.note };
    return { label, value: resolve(), note: extra.note, supported: extra.supported };
  }

  function capability(label: string, supported: boolean): InfoItem {
    return { label, value: supported ? "Supported" : "Not supported", supported };
  }

  let isScanning = $derived(
    instant !== null &&
      [clientHints.status, graphics.status, webGpu.status, storage.status, media.status, battery.status].includes(
        "pending",
      ),
  );

  let gpuName = $derived.by(() => {
    if (webGpu.status === "settled" && webGpu.value?.description) return webGpu.value.description;
    if (graphics.status === "settled" && graphics.value) return graphics.value.renderer;
    return PENDING_LABEL;
  });

  let summary = $derived.by<SummaryItem[]>(() => {
    if (!instant) return [];

    const hints = clientHints.value;
    const hintsPending = clientHints.status === "pending";
    const storagePending = storage.status === "pending";
    const graphicsPending = graphics.status === "pending" || webGpu.status === "pending";

    return [
      {
        label: "Device",
        value: detectDeviceType(hints),
        detail: `${detectOperatingSystem(hints)}${hints?.platformVersion ? ` ${hints.platformVersion}` : ""}`,
      },
      {
        label: "Processor",
        value: hintsPending ? PENDING_LABEL : getArchitectureLabel(hints),
        detail: `${instant.logicalProcessors ?? "Unknown"} logical processors`,
        pending: hintsPending,
      },
      {
        label: "Memory",
        value: instant.deviceMemory ? `~${instant.deviceMemory} GB` : "Not exposed",
        detail: instant.deviceMemory ? "Privacy-rounded browser estimate" : "Unavailable in this browser",
      },
      {
        label: "Graphics",
        value: gpuName,
        detail: graphicsPending
          ? "Querying WebGL and WebGPU"
          : webGpu.value
            ? "WebGPU adapter"
            : (graphics.value?.api ?? "Not available"),
        pending: graphicsPending,
      },
      {
        label: "Display",
        value: `${instant.physicalWidth} × ${instant.physicalHeight}`,
        detail: `${instant.pixelRatio}× pixel ratio · ${instant.colorGamut}`,
      },
      {
        label: "Browser storage",
        value: storagePending ? PENDING_LABEL : formatBytes(storage.value?.quota ?? null),
        detail: storagePending
          ? "Reading storage quota"
          : storage.value?.usage != null
            ? `${formatBytes(storage.value.usage)} currently used`
            : "Quota not exposed",
        pending: storagePending,
      },
    ];
  });

  let sections = $derived.by<InfoSection[]>(() => {
    if (!instant) return [];

    const snapshot = instant;
    const hints = clientHints.value;
    const hintsStatus = clientHints.status;
    const graphicsValue = graphics.value;
    const graphicsStatus = graphics.status;
    const webGpuValue = webGpu.value;
    const webGpuStatus = webGpu.status;
    const storageValue = storage.value;
    const storageStatus = storage.status;
    const mediaValue = media.value;
    const mediaStatus = media.status;
    const batteryValue = battery.value;
    const batteryStatus = battery.status;
    const connection = snapshot.connection;

    const webGpuDetails = [webGpuValue?.vendor, webGpuValue?.architecture, webGpuValue?.device]
      .filter((value): value is string => !!value)
      .join(" / ");

    return [
      {
        title: "Processor",
        description: "CPU information the browser is permitted to reveal.",
        items: [
          probeItem("Architecture", hintsStatus, () => getArchitectureLabel(hints)),
          {
            label: "Logical processors",
            value: snapshot.logicalProcessors?.toString() ?? "Not reported by this browser",
            note: "May be reduced by browser privacy protections.",
          },
          {
            label: "CPU model",
            value: "Not exposed by web browsers",
            note: "Exact CPU names and clock speeds require a native system tool.",
          },
          ...(hintsStatus === "settled" && hints?.wow64 !== undefined
            ? [{ label: "32-bit app on 64-bit Windows", value: hints.wow64 ? "Yes" : "No" }]
            : []),
        ],
      },
      {
        title: "Memory & storage",
        description: "Approximate memory and this site's browser storage allowance.",
        items: [
          {
            label: "Device memory",
            value: snapshot.deviceMemory
              ? `Approximately ${snapshot.deviceMemory} GB`
              : "Not reported by this browser",
            note: snapshot.deviceMemory
              ? "Rounded and capped for privacy; this is not an exact installed-RAM reading."
              : undefined,
          },
          {
            label: "JavaScript heap limit",
            value: snapshot.heapLimit ? formatBytes(snapshot.heapLimit) : "Not reported by this browser",
            note: "A browser runtime limit, not total system RAM.",
          },
          probeItem("Browser storage", storageStatus, () =>
            storageValue?.usage != null && storageValue.quota
              ? `${formatBytes(storageValue.usage)} of ${formatBytes(storageValue.quota)}`
              : "Not available",
          ),
          probeItem("Persistent storage", storageStatus, () =>
            storageValue?.persisted === null || storageValue?.persisted === undefined
              ? "Not reported by this browser"
              : storageValue.persisted
                ? "Granted"
                : "Not granted",
          ),
        ],
      },
      {
        title: "Graphics",
        description: "GPU details reported through WebGL and WebGPU.",
        items: [
          {
            label: "GPU / renderer",
            value: gpuName,
            pending: graphicsStatus === "pending" || webGpuStatus === "pending",
          },
          probeItem("GPU vendor", graphicsStatus, () => reported(webGpuValue?.vendor || graphicsValue?.vendor)),
          probeItem("WebGPU adapter", webGpuStatus, () =>
            webGpuDetails || (webGpuValue ? "Available (details withheld)" : "Not available"),
          ),
          probeItem("Graphics API", graphicsStatus, () => graphicsValue?.api ?? "Not available"),
          probeItem("WebGL version", graphicsStatus, () => graphicsValue?.version ?? "Not available"),
          probeItem("Shader language", graphicsStatus, () => graphicsValue?.shadingLanguage ?? "Not available"),
        ],
      },
      {
        title: "Display & input",
        description: "Current screen, pixel density, color, and pointer characteristics.",
        items: [
          { label: "Screen (CSS pixels)", value: `${snapshot.screenWidth} × ${snapshot.screenHeight}` },
          {
            label: "Estimated physical pixels",
            value: `${snapshot.physicalWidth} × ${snapshot.physicalHeight}`,
            note: "Calculated from CSS size and device pixel ratio.",
          },
          { label: "Available screen", value: `${snapshot.screenAvailWidth} × ${snapshot.screenAvailHeight}` },
          { label: "Device pixel ratio", value: `${snapshot.pixelRatio}×` },
          { label: "Color depth", value: `${snapshot.colorDepth}-bit · ${snapshot.colorGamut}` },
          { label: "Dynamic range", value: snapshot.dynamicRange },
          { label: "Orientation", value: snapshot.orientation },
          { label: "Touch points", value: snapshot.touchPoints.toString() },
          { label: "Primary pointer", value: snapshot.pointer },
          { label: "Hover support", value: snapshot.hoverCapable ? "Yes" : "No" },
        ],
      },
      {
        title: "Device & browser",
        description: "Operating system and browser identity reported to this page.",
        wide: true,
        items: [
          { label: "Device class", value: detectDeviceType(hints) },
          { label: "Browser", value: `${snapshot.browserName} ${snapshot.browserVersion}` },
          { label: "Operating system", value: detectOperatingSystem(hints) },
          probeItem("OS version", hintsStatus, () => reported(hints?.platformVersion)),
          probeItem("Device model", hintsStatus, () => reported(hints?.model)),
          { label: "Platform", value: snapshot.platform },
          { label: "Language", value: snapshot.language },
          { label: "Languages", value: snapshot.languages },
          { label: "User agent", value: snapshot.userAgent },
        ],
      },
      {
        title: "Connected hardware",
        description: "Device counts visible without requesting new permissions.",
        items: [
          probeItem("Cameras", mediaStatus, () =>
            mediaValue?.available ? mediaValue.cameras.toString() : "Not reported by this browser",
          ),
          probeItem("Microphones", mediaStatus, () =>
            mediaValue?.available ? mediaValue.audioInputs.toString() : "Not reported by this browser",
          ),
          probeItem("Audio outputs", mediaStatus, () =>
            mediaValue?.available ? mediaValue.audioOutputs.toString() : "Not reported by this browser",
          ),
          probeItem(
            "Battery",
            batteryStatus,
            () =>
              batteryValue
                ? `${Math.round(batteryValue.level * 100)}% · ${batteryValue.charging ? "Charging" : "On battery"}`
                : "Not reported by this browser",
            { note: "Many browsers disable battery details for privacy." },
          ),
        ],
      },
      {
        title: "Network",
        description: "Coarse connection information reported by the browser.",
        items: connection
          ? [
              { label: "Connection", value: connection.type || connection.effectiveType || "Unknown" },
              { label: "Estimated downlink", value: connection.downlink ? `${connection.downlink} Mbps` : "Not exposed" },
              { label: "Estimated round trip", value: connection.rtt ? `${connection.rtt} ms` : "Not exposed" },
              { label: "Data saver", value: connection.saveData ? "Enabled" : "Disabled" },
            ]
          : [{ label: "Network Information API", value: "Not supported", supported: false }],
      },
      {
        title: "Storage features",
        description: "Browser data stores available to web applications.",
        items: [
          { label: "Local Storage", value: snapshot.localStorage ? "Available" : "Blocked", supported: snapshot.localStorage },
          {
            label: "Session Storage",
            value: snapshot.sessionStorage ? "Available" : "Blocked",
            supported: snapshot.sessionStorage,
          },
          { label: "IndexedDB", value: snapshot.indexedDb ? "Available" : "Not available", supported: snapshot.indexedDb },
          { label: "Cache API", value: snapshot.cacheApi ? "Available" : "Not available", supported: snapshot.cacheApi },
        ],
      },
      {
        title: "Web platform support",
        description: "Useful hardware and application APIs available in this browser.",
        wide: true,
        compact: true,
        items: [
          capability("WebGPU", "gpu" in navigator),
          probeItem("WebGL 2", graphicsStatus, () => (graphicsValue?.webgl2 ? "Supported" : "Not supported"), {
            supported: !!graphicsValue?.webgl2,
          }),
          capability("WebRTC", "RTCPeerConnection" in window),
          capability("Web Audio", "AudioContext" in window || "webkitAudioContext" in window),
          capability("Media Devices", !!navigator.mediaDevices),
          capability("Web Bluetooth", "bluetooth" in navigator),
          capability("Web USB", "usb" in navigator),
          capability("Web Serial", "serial" in navigator),
          capability("Gamepad", "getGamepads" in navigator),
          capability("Battery Status", "getBattery" in navigator),
          capability("Vibration", "vibrate" in navigator),
          capability("Geolocation", "geolocation" in navigator),
          capability("Clipboard", !!navigator.clipboard),
          capability("Web Workers", typeof Worker !== "undefined"),
          capability("Service Worker", "serviceWorker" in navigator),
          capability("Web Crypto", !!window.crypto?.subtle),
          capability("Picture in Picture", "pictureInPictureEnabled" in document),
          capability("Notifications", "Notification" in window),
        ],
      },
      {
        title: "Security context",
        description: "Security properties that control access to sensitive browser APIs.",
        wide: true,
        compact: true,
        items: [
          capability("HTTPS", snapshot.https),
          capability("Secure Context", snapshot.secureContext),
          capability("Cross-Origin Isolated", snapshot.crossOriginIsolated),
          { label: "Cookies", value: snapshot.cookiesEnabled ? "Enabled" : "Disabled", supported: snapshot.cookiesEnabled },
          { label: "Do Not Track", value: snapshot.doNotTrack },
          { label: "Online status", value: snapshot.online ? "Online" : "Offline", supported: snapshot.online },
        ],
      },
    ];
  });

  async function copyAll(): Promise<void> {
    const text = [
      "Hardware & Browser Info",
      ...sections.flatMap((section) => [
        "",
        section.title,
        ...section.items.map((item) => `${item.label}: ${item.value}`),
      ]),
    ].join("\n");

    let copySucceeded = false;
    try {
      await navigator.clipboard.writeText(text);
      copySucceeded = true;
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        copySucceeded = document.execCommand("copy");
      } finally {
        textArea.remove();
      }
    }

    copyStatus = copySucceeded ? "copied" : "failed";
    window.setTimeout(() => {
      copyStatus = "idle";
    }, 2000);
  }

  $effect(() => {
    return () => {
      runToken += 1;
      window.cancelAnimationFrame(frameHandle);
    };
  });
</script>

<div class="flex h-full flex-col pb-8 text-(--color-text)">
  <header class="mb-5 flex flex-col gap-4 border-b border-(--color-border) pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div class="max-w-3xl">
      <p class="text-sm leading-6 text-(--color-text-muted)">
        Inspect the hardware and system details your browser can safely report. Results are collected locally and never leave this page.
      </p>
      <p class="mt-1 text-xs text-(--color-text-muted)">
        {#if isScanning}
          Reading slower hardware details…
        {:else if lastUpdated}
          Last scanned at {lastUpdated}
        {:else}
          Ready to scan when you are.
        {/if}
      </p>
    </div>

    <div class="flex shrink-0 gap-2">
      <button
        type="button"
        onclick={scan}
        disabled={isScanning}
        class="inline-flex min-h-10 items-center justify-center gap-2 bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-btn-text) transition-colors hover:bg-(--color-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-text) disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw size={16} class={isScanning ? "animate-spin" : ""} aria-hidden="true" />
        {isScanning ? "Scanning" : instant ? "Scan again" : "Scan hardware"}
      </button>
      <button
        type="button"
        onclick={copyAll}
        disabled={sections.length === 0}
        class="inline-flex min-h-10 items-center justify-center gap-2 border border-(--color-border) bg-(--color-bg-alt) px-4 py-2 text-sm font-medium text-(--color-text) transition-colors hover:border-(--color-text-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-text) disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy size={16} aria-hidden="true" />
        {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy report"}
      </button>
    </div>
  </header>

  <div class="mb-5 flex gap-3 border border-(--color-border) bg-(--color-bg-alt) p-4">
    <ShieldCheck class="mt-0.5 shrink-0 text-(--color-text-muted)" size={19} aria-hidden="true" />
    <div>
      <h2 class="text-sm font-semibold">Browser-safe inspection</h2>
      <p class="mt-1 max-w-4xl text-sm leading-5 text-(--color-text-muted)">
        Browsers deliberately limit exact CPU models, clock speeds, installed RAM, disk models, serial numbers, and other identifying data. Values may be rounded, unsupported, or blocked by browser or device policy; unavailable does not mean the hardware is absent.
      </p>
    </div>
  </div>

  {#if errorMessage}
    <div class="mb-5 flex gap-3 border border-(--color-error-border) bg-(--color-error-bg) p-4 text-(--color-error-text)" role="alert">
      <Info class="mt-0.5 shrink-0" size={19} aria-hidden="true" />
      <div>
        <h2 class="text-sm font-semibold">Scan could not be completed</h2>
        <p class="mt-1 text-sm">{errorMessage} Refresh the page and try again.</p>
      </div>
    </div>
  {:else if !instant}
    <div class="border border-(--color-border) bg-(--color-bg-alt) px-5 py-12 text-center">
      <RefreshCw class="mx-auto mb-3 text-(--color-text-muted)" size={22} aria-hidden="true" />
      <p class="text-sm font-medium">Ready to inspect this device</p>
      <p class="mt-1 text-xs text-(--color-text-muted)">Nothing is scanned until you start it. No permissions are requested.</p>
      <button
        type="button"
        onclick={scan}
        class="mt-5 inline-flex min-h-10 items-center justify-center gap-2 bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-btn-text) transition-colors hover:bg-(--color-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-text)"
      >
        <RefreshCw size={16} aria-hidden="true" />
        Scan hardware
      </button>
    </div>
  {:else}
    <section class="mb-7" aria-labelledby="hardware-summary">
      <h2 id="hardware-summary" class="mb-3 text-base font-semibold">At a glance</h2>
      <div class="grid grid-cols-1 gap-px border border-(--color-border) bg-(--color-border) sm:grid-cols-2 xl:grid-cols-3">
        {#each summary as item}
          <div class="min-w-0 bg-(--color-bg-alt) px-4 py-4">
            <div class="text-xs font-medium text-(--color-text-muted)">{item.label}</div>
            <div
              class="mt-1 truncate text-lg font-semibold tracking-tight {item.pending ? 'animate-pulse text-(--color-text-muted)' : ''}"
              title={item.value}
            >
              {item.value}
            </div>
            <div class="mt-1 truncate text-xs text-(--color-text-muted)" title={item.detail}>{item.detail}</div>
          </div>
        {/each}
      </div>
    </section>

    <div class="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      {#each sections as section}
        <section class="min-w-0 border border-(--color-border) bg-(--color-bg-alt) {section.wide ? 'xl:col-span-2' : ''}">
          <div class="border-b border-(--color-border) px-4 py-3">
            <h2 class="text-sm font-semibold">{section.title}</h2>
            <p class="mt-0.5 text-xs leading-5 text-(--color-text-muted)">{section.description}</p>
          </div>

          {#if section.compact}
            <dl class="grid grid-cols-1 gap-px bg-(--color-border) sm:grid-cols-2 lg:grid-cols-3">
              {#each section.items as item}
                <div class="flex min-w-0 items-center justify-between gap-3 bg-(--color-bg-alt) px-4 py-3">
                  <dt class="truncate text-sm text-(--color-text-muted)" title={item.label}>{item.label}</dt>
                  <dd
                    class="flex shrink-0 items-center gap-2 text-xs font-medium {item.pending ? 'animate-pulse text-(--color-text-muted)' : ''}"
                  >
                    {#if item.supported !== undefined && !item.pending}
                      <span
                        class="h-2 w-2 rounded-full {item.supported ? 'bg-green-600 dark:bg-green-400' : 'bg-red-600 dark:bg-red-400'}"
                        aria-hidden="true"
                      ></span>
                    {/if}
                    {item.value}
                  </dd>
                </div>
              {/each}
            </dl>
          {:else}
            <dl class="divide-y divide-(--color-border)">
              {#each section.items as item}
                <div class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)] sm:gap-5">
                  <dt class="text-sm text-(--color-text-muted)">{item.label}</dt>
                  <dd
                    class="min-w-0 break-words text-sm font-medium sm:text-right {item.pending ? 'animate-pulse text-(--color-text-muted)' : ''}"
                  >
                    <span class="inline-flex items-center gap-2">
                      {#if item.supported !== undefined && !item.pending}
                        <span
                          class="h-2 w-2 shrink-0 rounded-full {item.supported ? 'bg-green-600 dark:bg-green-400' : 'bg-red-600 dark:bg-red-400'}"
                          aria-hidden="true"
                        ></span>
                      {/if}
                      <span>{item.value}</span>
                    </span>
                    {#if item.note && !item.pending}
                      <span class="mt-1 block text-xs font-normal leading-5 text-(--color-text-muted)">{item.note}</span>
                    {/if}
                  </dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>
      {/each}
    </div>
  {/if}

  <p class="sr-only" aria-live="polite">
    {copyStatus === "copied" ? "Hardware report copied to clipboard." : copyStatus === "failed" ? "Hardware report could not be copied." : ""}
  </p>
</div>
