<script lang="ts">
  let screenWidth = $state(0);
  let screenHeight = $state(0);
  let windowWidth = $state(0);
  let windowHeight = $state(0);
  let devicePixelRatio = $state(1);
  let colorDepth = $state(0);
  let orientation = $state("");
  let availWidth = $state(0);
  let availHeight = $state(0);
  let isFullscreen = $state(false);

  interface DisplayInfo {
    label: string;
    value: string;
    description: string;
  }

  function updateInfo() {
    screenWidth = window.screen.width;
    screenHeight = window.screen.height;
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    devicePixelRatio = window.devicePixelRatio || 1;
    colorDepth = window.screen.colorDepth;
    availWidth = window.screen.availWidth;
    availHeight = window.screen.availHeight;
    isFullscreen = !!document.fullscreenElement;
    
    if (window.screen.orientation) {
      orientation = window.screen.orientation.type;
    } else {
      orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    }
  }

  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }

  function getAspectRatio(w: number, h: number): string {
    const divisor = gcd(w, h);
    return `${w / divisor}:${h / divisor}`;
  }

  function getCommonName(w: number, h: number): string {
    const resolutions: Record<string, string> = {
      "1920x1080": "Full HD (1080p)",
      "2560x1440": "Quad HD (1440p)",
      "3840x2160": "4K UHD",
      "1366x768": "HD",
      "1280x720": "HD (720p)",
      "1536x864": "HD+",
      "1440x900": "WXGA+",
      "1600x900": "HD+",
      "1680x1050": "WSXGA+",
      "1920x1200": "WUXGA",
      "2560x1600": "WQXGA",
      "3440x1440": "Ultra-Wide QHD",
      "5120x2880": "5K",
      "7680x4320": "8K UHD",
      "2880x1800": "Retina (MacBook Pro 15)",
      "2560x1664": "Retina (MacBook Air)",
      "3024x1964": "Liquid Retina XDR",
      "2048x1536": "QXGA (iPad)",
      "2732x2048": "iPad Pro",
      "828x1792": "iPhone XR/11",
      "1170x2532": "iPhone 12/13/14",
      "1179x2556": "iPhone 14 Pro",
      "1290x2796": "iPhone 14 Pro Max",
      "1125x2436": "iPhone X/XS/11 Pro",
      "1242x2688": "iPhone XS Max/11 Pro Max",
    };
    
    const key = `${w}x${h}`;
    const keyReverse = `${h}x${w}`;
    return resolutions[key] || resolutions[keyReverse] || "";
  }

  const displayInfo = $derived<DisplayInfo[]>([
    {
      label: "Screen Resolution",
      value: `${screenWidth} x ${screenHeight}`,
      description: "Physical screen resolution in pixels",
    },
    {
      label: "Common Name",
      value: getCommonName(screenWidth, screenHeight) || "Custom",
      description: "Standard resolution name if recognized",
    },
    {
      label: "Aspect Ratio",
      value: getAspectRatio(screenWidth, screenHeight),
      description: "Width to height ratio",
    },
    {
      label: "Browser Window",
      value: `${windowWidth} x ${windowHeight}`,
      description: "Current browser viewport size",
    },
    {
      label: "Available Screen",
      value: `${availWidth} x ${availHeight}`,
      description: "Screen minus OS UI elements (taskbar, dock)",
    },
    {
      label: "Device Pixel Ratio",
      value: `${devicePixelRatio}x`,
      description: "Physical pixels per CSS pixel (Retina = 2x+)",
    },
    {
      label: "Effective Resolution",
      value: `${Math.round(screenWidth * devicePixelRatio)} x ${Math.round(screenHeight * devicePixelRatio)}`,
      description: "Actual physical pixels rendered",
    },
    {
      label: "Color Depth",
      value: `${colorDepth}-bit`,
      description: "Bits per pixel for colors",
    },
    {
      label: "Orientation",
      value: orientation.replace("-", " "),
      description: "Screen orientation mode",
    },
    {
      label: "Fullscreen",
      value: isFullscreen ? "Yes" : "No",
      description: "Browser fullscreen state",
    },
  ]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  function copyInfo() {
    const text = displayInfo.map(i => `${i.label}: ${i.value}`).join("\n");
    navigator.clipboard.writeText(text);
  }

  $effect(() => {
    updateInfo();
    
    const handleResize = () => updateInfo();
    const handleFullscreenChange = () => updateInfo();
    const handleOrientationChange = () => updateInfo();
    
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("orientationchange", handleOrientationChange);
    
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      View your screen resolution, window size, pixel density, and display information. Resize window to see live updates.
    </p>
  </header>

  <!-- Actions -->
  <div class="flex gap-2 mb-4">
    <button
      onclick={toggleFullscreen}
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors text-sm font-medium"
    >
      {isFullscreen ? "Exit Fullscreen" : "Go Fullscreen"}
    </button>
    <button
      onclick={copyInfo}
      class="px-4 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover) transition-colors text-sm"
    >
      Copy All
    </button>
  </div>

  <!-- Info Grid -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each displayInfo as info}
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="text-xs text-(--color-text-muted) mb-1">{info.label}</div>
        <div class="text-xl font-mono font-semibold text-(--color-text)">{info.value}</div>
        <div class="text-xs text-(--color-text-muted) mt-1">{info.description}</div>
      </div>
    {/each}
  </div>

  <!-- Visual representation -->
  <div class="mt-6">
    <h3 class="text-sm font-medium mb-2">Visual Comparison</h3>
    <div class="relative border border-(--color-border) bg-(--color-bg-alt) p-4 overflow-hidden">
      <div class="text-xs text-(--color-text-muted) mb-2">Browser window relative to screen (scaled)</div>
      <div class="relative mx-auto" style="width: 300px; height: 180px;">
        <!-- Screen -->
        <div 
          class="absolute border-2 border-(--color-text-muted) bg-(--color-bg) flex items-center justify-center"
          style="width: 100%; height: 100%; left: 0; top: 0;"
        >
          <span class="text-xs text-(--color-text-muted)">Screen {screenWidth}x{screenHeight}</span>
        </div>
        <!-- Window -->
        <div 
          class="absolute border-2 border-(--color-accent) bg-(--color-accent)/10 flex items-center justify-center"
          style="width: {(windowWidth / screenWidth) * 100}%; height: {(windowHeight / screenHeight) * 100}%; left: 0; top: 0;"
        >
          <span class="text-xs text-(--color-accent)">Window</span>
        </div>
      </div>
    </div>
  </div>
</div>
