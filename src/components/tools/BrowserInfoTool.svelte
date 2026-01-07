<script lang="ts">
  interface InfoSection {
    title: string;
    items: InfoItem[];
  }

  interface InfoItem {
    label: string;
    value: string;
    supported?: boolean;
  }

  let copied = $state(false);
  let sections = $state<InfoSection[]>([]);

  function getBrowserInfo(): InfoItem[] {
    const ua = navigator.userAgent;
    let browserName = "Unknown";
    let browserVersion = "";

    if (ua.includes("Firefox/")) {
      browserName = "Firefox";
      browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] || "";
    } else if (ua.includes("Edg/")) {
      browserName = "Microsoft Edge";
      browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] || "";
    } else if (ua.includes("Chrome/")) {
      browserName = "Chrome";
      browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || "";
    } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
      browserName = "Safari";
      browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] || "";
    }

    let osName = "Unknown";
    if (ua.includes("Windows")) osName = "Windows";
    else if (ua.includes("Mac OS")) osName = "macOS";
    else if (ua.includes("Linux")) osName = "Linux";
    else if (ua.includes("Android")) osName = "Android";
    else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) osName = "iOS";

    return [
      { label: "Browser", value: `${browserName} ${browserVersion}` },
      { label: "Operating System", value: osName },
      { label: "User Agent", value: navigator.userAgent },
      { label: "Platform", value: navigator.platform },
      { label: "Language", value: navigator.language },
      { label: "Languages", value: navigator.languages?.join(", ") || navigator.language },
      { label: "Cookies Enabled", value: navigator.cookieEnabled ? "Yes" : "No", supported: navigator.cookieEnabled },
      { label: "Do Not Track", value: navigator.doNotTrack === "1" ? "Enabled" : "Disabled" },
      { label: "Online Status", value: navigator.onLine ? "Online" : "Offline", supported: navigator.onLine },
      { label: "Hardware Concurrency", value: navigator.hardwareConcurrency?.toString() || "Unknown" },
      { label: "Device Memory", value: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ? `${(navigator as Navigator & { deviceMemory?: number }).deviceMemory} GB` : "Not available" },
      { label: "Max Touch Points", value: navigator.maxTouchPoints?.toString() || "0" },
    ];
  }

  function getStorageInfo(): InfoItem[] {
    let localStorageAvailable = false;
    let sessionStorageAvailable = false;

    try {
      localStorage.setItem("test", "test");
      localStorage.removeItem("test");
      localStorageAvailable = true;
    } catch {
      localStorageAvailable = false;
    }

    try {
      sessionStorage.setItem("test", "test");
      sessionStorage.removeItem("test");
      sessionStorageAvailable = true;
    } catch {
      sessionStorageAvailable = false;
    }

    return [
      { label: "Local Storage", value: localStorageAvailable ? "Available" : "Blocked", supported: localStorageAvailable },
      { label: "Session Storage", value: sessionStorageAvailable ? "Available" : "Blocked", supported: sessionStorageAvailable },
      { label: "IndexedDB", value: !!window.indexedDB ? "Available" : "Not available", supported: !!window.indexedDB },
      { label: "Cache API", value: "caches" in window ? "Available" : "Not available", supported: "caches" in window },
    ];
  }

  function getMediaInfo(): InfoItem[] {
    return [
      { label: "WebGL", value: !!document.createElement("canvas").getContext("webgl") ? "Supported" : "Not supported", supported: !!document.createElement("canvas").getContext("webgl") },
      { label: "WebGL2", value: !!document.createElement("canvas").getContext("webgl2") ? "Supported" : "Not supported", supported: !!document.createElement("canvas").getContext("webgl2") },
      { label: "WebGPU", value: "gpu" in navigator ? "Supported" : "Not supported", supported: "gpu" in navigator },
      { label: "Canvas", value: !!document.createElement("canvas").getContext("2d") ? "Supported" : "Not supported", supported: !!document.createElement("canvas").getContext("2d") },
      { label: "WebRTC", value: !!(window.RTCPeerConnection) ? "Supported" : "Not supported", supported: !!(window.RTCPeerConnection) },
      { label: "Web Audio", value: !!(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ? "Supported" : "Not supported", supported: !!(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) },
      { label: "Media Devices", value: !!navigator.mediaDevices ? "Supported" : "Not supported", supported: !!navigator.mediaDevices },
      { label: "Picture in Picture", value: "pictureInPictureEnabled" in document ? "Supported" : "Not supported", supported: "pictureInPictureEnabled" in document },
    ];
  }

  function getApiInfo(): InfoItem[] {
    return [
      { label: "Service Worker", value: "serviceWorker" in navigator ? "Supported" : "Not supported", supported: "serviceWorker" in navigator },
      { label: "Web Workers", value: typeof Worker !== "undefined" ? "Supported" : "Not supported", supported: typeof Worker !== "undefined" },
      { label: "Shared Workers", value: typeof SharedWorker !== "undefined" ? "Supported" : "Not supported", supported: typeof SharedWorker !== "undefined" },
      { label: "WebSocket", value: "WebSocket" in window ? "Supported" : "Not supported", supported: "WebSocket" in window },
      { label: "Fetch API", value: "fetch" in window ? "Supported" : "Not supported", supported: "fetch" in window },
      { label: "Geolocation", value: "geolocation" in navigator ? "Supported" : "Not supported", supported: "geolocation" in navigator },
      { label: "Notifications", value: "Notification" in window ? "Supported" : "Not supported", supported: "Notification" in window },
      { label: "Push API", value: "PushManager" in window ? "Supported" : "Not supported", supported: "PushManager" in window },
      { label: "Clipboard API", value: !!navigator.clipboard ? "Supported" : "Not supported", supported: !!navigator.clipboard },
      { label: "Share API", value: !!navigator.share ? "Supported" : "Not supported", supported: !!navigator.share },
      { label: "Bluetooth", value: "bluetooth" in navigator ? "Supported" : "Not supported", supported: "bluetooth" in navigator },
      { label: "USB", value: "usb" in navigator ? "Supported" : "Not supported", supported: "usb" in navigator },
      { label: "Gamepad API", value: "getGamepads" in navigator ? "Supported" : "Not supported", supported: "getGamepads" in navigator },
      { label: "Battery API", value: "getBattery" in navigator ? "Supported" : "Not supported", supported: "getBattery" in navigator },
      { label: "Vibration API", value: "vibrate" in navigator ? "Supported" : "Not supported", supported: "vibrate" in navigator },
      { label: "Web Crypto", value: !!window.crypto?.subtle ? "Supported" : "Not supported", supported: !!window.crypto?.subtle },
      { label: "Performance API", value: "performance" in window ? "Supported" : "Not supported", supported: "performance" in window },
      { label: "Intersection Observer", value: "IntersectionObserver" in window ? "Supported" : "Not supported", supported: "IntersectionObserver" in window },
      { label: "Resize Observer", value: "ResizeObserver" in window ? "Supported" : "Not supported", supported: "ResizeObserver" in window },
      { label: "Mutation Observer", value: "MutationObserver" in window ? "Supported" : "Not supported", supported: "MutationObserver" in window },
    ];
  }

  function getConnectionInfo(): InfoItem[] {
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } }).connection;
    
    if (!conn) {
      return [{ label: "Network Information API", value: "Not supported", supported: false }];
    }

    return [
      { label: "Connection Type", value: conn.effectiveType || "Unknown" },
      { label: "Downlink Speed", value: conn.downlink ? `${conn.downlink} Mbps` : "Unknown" },
      { label: "Round Trip Time", value: conn.rtt ? `${conn.rtt} ms` : "Unknown" },
      { label: "Data Saver", value: conn.saveData ? "Enabled" : "Disabled" },
    ];
  }

  function getSecurityInfo(): InfoItem[] {
    return [
      { label: "HTTPS", value: location.protocol === "https:" ? "Yes" : "No", supported: location.protocol === "https:" },
      { label: "Secure Context", value: window.isSecureContext ? "Yes" : "No", supported: window.isSecureContext },
      { label: "Cross-Origin Isolated", value: (window as Window & { crossOriginIsolated?: boolean }).crossOriginIsolated ? "Yes" : "No", supported: !!(window as Window & { crossOriginIsolated?: boolean }).crossOriginIsolated },
    ];
  }

  function loadInfo() {
    sections = [
      { title: "Browser & System", items: getBrowserInfo() },
      { title: "Security", items: getSecurityInfo() },
      { title: "Storage", items: getStorageInfo() },
      { title: "Graphics & Media", items: getMediaInfo() },
      { title: "Network", items: getConnectionInfo() },
      { title: "APIs & Features", items: getApiInfo() },
    ];
  }

  function copyAll() {
    const text = sections.map(section => {
      const items = section.items.map(item => `  ${item.label}: ${item.value}`).join("\n");
      return `${section.title}\n${items}`;
    }).join("\n\n");
    
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  $effect(() => {
    loadInfo();
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      View detailed information about your browser capabilities, supported APIs, storage, and system features.
    </p>
  </header>

  <!-- Actions -->
  <div class="flex gap-2 mb-4">
    <button
      onclick={loadInfo}
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors text-sm font-medium"
    >
      Refresh
    </button>
    <button
      onclick={copyAll}
      class="px-4 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover) transition-colors text-sm"
    >
      {copied ? "Copied!" : "Copy All"}
    </button>
  </div>

  <!-- Info Sections -->
  <div class="flex-1 overflow-auto space-y-6">
    {#each sections as section}
      <div>
        <h3 class="text-sm font-medium mb-3 text-(--color-text)">{section.title}</h3>
        <div class="border border-(--color-border) divide-y divide-(--color-border)">
          {#each section.items as item}
            <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-3 py-2 bg-(--color-bg-alt)">
              <span class="text-sm text-(--color-text-muted) sm:w-48 shrink-0">{item.label}</span>
              <span 
                class="text-sm font-mono break-all {item.supported === true ? 'text-green-500' : item.supported === false ? 'text-red-500' : 'text-(--color-text)'}"
              >
                {item.value}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
