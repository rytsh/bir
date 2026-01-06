<script lang="ts">
  import { fade } from "svelte/transition";

  interface Preset {
    name: string;
    hours: number;
    minutes: number;
    seconds: number;
  }

  interface StoredSettings {
    hours: number;
    minutes: number;
    seconds: number;
    backgroundColor: string;
    timerColor: string;
    selectedColorPreset: string;
    selectedFont: string;
    fontSize: number;
    enableSound: boolean;
    enableFlashing: boolean;
    showProgressBar: boolean;
  }

  const STORAGE_KEY = "countdown-timer-settings";

  // Default values
  const defaults: StoredSettings = {
    hours: 0,
    minutes: 5,
    seconds: 0,
    backgroundColor: "#1a1a1a",
    timerColor: "#ffffff",
    selectedColorPreset: "Default",
    selectedFont: "Quantico",
    fontSize: 8,
    enableSound: true,
    enableFlashing: true,
    showProgressBar: true,
  };

  const presets: Preset[] = [
    { name: "Pomodoro", hours: 0, minutes: 25, seconds: 0 },
    { name: "Short Break", hours: 0, minutes: 5, seconds: 0 },
    { name: "Long Break", hours: 0, minutes: 15, seconds: 0 },
    { name: "1 Minute", hours: 0, minutes: 1, seconds: 0 },
    { name: "5 Minutes", hours: 0, minutes: 5, seconds: 0 },
    { name: "10 Minutes", hours: 0, minutes: 10, seconds: 0 },
    { name: "30 Minutes", hours: 0, minutes: 30, seconds: 0 },
    { name: "1 Hour", hours: 1, minutes: 0, seconds: 0 },
  ];

  const colorPresets = [
    {
      name: "Default",
      bg: "#1a1a1a",
      timer: "#ffffff",
      font: "Quantico",
      size: 8,
    },
    { name: "Flu", bg: "#ffbc0b", timer: "#000000", font: "Quantico", size: 8 },
    {
      name: "Retro LCD",
      bg: "#a8c64e",
      timer: "#3c412c",
      font: "DSEG7 Classic",
      size: 8,
    },
    {
      name: "Mint",
      bg: "#0d1f0d",
      timer: "#98fb98",
      font: "Micro 5",
      size: 16,
    },
    {
      name: "Stealth",
      bg: "#0a0a0a",
      timer: "#2a2a2a",
      font: "Quantico",
      size: 8,
    },
    {
      name: "Blueprint",
      bg: "#003366",
      timer: "#ffffff",
      font: "Quantico",
      size: 8,
    },
    {
      name: "Sunset",
      bg: "#2d1b1b",
      timer: "#ffab91",
      font: "Quantico",
      size: 8,
    },
    {
      name: "Minimal",
      bg: "#ffffff",
      timer: "#333333",
      font: "Quantico",
      size: 8,
    },
    {
      name: "Minimal2",
      bg: "#ffffff",
      timer: "#333333",
      font: "Tourney",
      size: 8,
    },
    {
      name: "Terminal",
      bg: "#0d1117",
      timer: "#00ff00",
      font: "DSEG7 Modern",
      size: 8,
    },
    {
      name: "Fire",
      bg: "#1a0a0a",
      timer: "#ff5722",
      font: "Quantico",
      size: 8,
    },
    {
      name: "Cyberpunk",
      bg: "#000000",
      timer: "#fcee09",
      font: "DSEG14 Modern",
      size: 8,
    },
    {
      name: "Amber CRT",
      bg: "#fb7c00",
      timer: "#222222",
      font: "DSEG7 Classic",
      size: 8,
    },
    { name: "Ice", bg: "#e8f4f8", timer: "#0077b6", font: "Iceberg", size: 8 },
    {
      name: "Vintage",
      bg: "#f5e6d3",
      timer: "#8b4513",
      font: "Love Ya Like A Sister",
      size: 8,
    },
    {
      name: "Arctic",
      bg: "#1c2541",
      timer: "#a8dadc",
      font: "Iceberg",
      size: 8,
    },
    {
      name: "Lava",
      bg: "#1a0000",
      timer: "#ff4500",
      font: "DSEG14 Classic",
      size: 8,
    },
  ];

  const fontPresets = [
    {
      name: "Quantico",
      family: "'Quantico', sans-serif",
      url: "https://fonts.googleapis.com/css2?family=Quantico&display=swap",
    },
    {
      name: "Iceberg",
      family: "'Iceberg', sans-serif",
      url: "https://fonts.googleapis.com/css2?family=Iceberg&display=swap",
    },
    {
      name: "Tourney",
      family: "'Tourney', sans-serif",
      url: "https://fonts.googleapis.com/css2?family=Tourney:wght@100&display=swap",
    },
    { name: "System Mono", family: "ui-monospace, monospace", url: "" },
    { name: "DSEG7 Classic", family: "'DSEG7 Classic', monospace", url: "" },
    { name: "DSEG7 Modern", family: "'DSEG7 Modern', monospace", url: "" },
    { name: "DSEG14 Classic", family: "'DSEG14 Classic', monospace", url: "" },
    { name: "DSEG14 Modern", family: "'DSEG14 Modern', monospace", url: "" },
    {
      name: "Micro 5",
      family: "'Micro 5', monospace",
      url: "https://fonts.googleapis.com/css2?family=Micro+5&display=swap",
    },
    {
      name: "Love Ya Like A Sister",
      family: "'Love Ya Like A Sister', cursive",
      url: "https://fonts.googleapis.com/css2?family=Love+Ya+Like+A+Sister&display=swap",
    },
    {
      name: "New Rocker",
      family: "'New Rocker', system-ui",
      url: "https://fonts.googleapis.com/css2?family=New+Rocker&display=swap",
      weight: 200,
    },
    {
      name: "Jersey 10",
      family: "'Jersey 10', system-ui",
      url: "https://fonts.googleapis.com/css2?family=Jersey+10&display=swap",
      weight: 200,
    },
    {
      name: "Monoton",
      family: "'Monoton', system-ui",
      url: "https://fonts.googleapis.com/css2?family=Monoton&display=swap",
      weight: 200,
    },
    {
      name: "Press Start 2P",
      family: "'Press Start 2P', system-ui",
      url: "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap",
      weight: 200,
    },
  ];

  // Timer state
  let hours = $state(defaults.hours);
  let minutes = $state(defaults.minutes);
  let seconds = $state(defaults.seconds);
  let remainingMs = $state(0);
  let isRunning = $state(false);
  let timerFinished = $state(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTickTime = $state(0);

  // Appearance
  let backgroundColor = $state(defaults.backgroundColor);
  let timerColor = $state(defaults.timerColor);
  let selectedColorPreset = $state(defaults.selectedColorPreset);
  let selectedTimePreset = $state("");
  let selectedFont = $state(defaults.selectedFont);
  let timerFontFamily = $state("ui-monospace, monospace");
  let timerFontWeight = $state<number | undefined>(undefined);
  let fontSize = $state(defaults.fontSize);

  // End of time settings
  let enableSound = $state(defaults.enableSound);
  let enableFlashing = $state(defaults.enableFlashing);
  let showProgressBar = $state(defaults.showProgressBar);
  let isFlashing = $state(false);
  let flashIntervalId: ReturnType<typeof setInterval> | null = null;

  // Hint timer
  let showHint = $state(true);

  // Settings loaded flag to prevent saving during initial load
  let settingsLoaded = $state(false);

  // PiP (Picture-in-Picture) Mode state
  type ViewMode = "timer" | "pip";
  let viewMode = $state<ViewMode>("timer");
  let pipCanvas = $state<HTMLCanvasElement | null>(null);
  let pipVideo = $state<HTMLVideoElement | null>(null);
  let mediaStream: MediaStream | null = null;
  let canvasAnimationId: number | null = null;
  let pipAudioContext: AudioContext | null = null;
  let pipAudioDestination: MediaStreamAudioDestinationNode | null = null;
  let pipAudioEnabled = $state(false);
  let isPipActive = $state(false);

  // Extracted Window state
  let extractedWindow: Window | null = null;
  let isExtracted = $state(false);
  let broadcastChannel: BroadcastChannel | null = null;

  // Audio context for beep sound
  let audioContext: AudioContext | null = null;

  // Enable audio for pip mode (requires user interaction on iOS)
  const enablePipAudio = async () => {
    if (pipVideo) {
      pipVideo.muted = false;
      try {
        await pipVideo.play();
      } catch (e) {
        console.warn("Video play failed:", e);
      }
    }
    // Resume audio contexts if suspended (iOS requirement)
    if (pipAudioContext?.state === "suspended") {
      await pipAudioContext.resume();
    }
    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }
    pipAudioEnabled = true;
  };

  // Toggle Picture-in-Picture mode
  const togglePictureInPicture = async () => {
    if (!pipVideo) return;

    try {
      if (document.pictureInPictureElement === pipVideo) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await pipVideo.requestPictureInPicture();
      }
    } catch (e) {
      console.warn("Picture-in-Picture failed:", e);
    }
  };

  // Track PiP state changes
  $effect(() => {
    if (!pipVideo) return;

    const video = pipVideo;

    const handlePipEnter = () => {
      isPipActive = true;
    };

    const handlePipLeave = () => {
      isPipActive = false;
    };

    video.addEventListener("enterpictureinpicture", handlePipEnter);
    video.addEventListener("leavepictureinpicture", handlePipLeave);

    return () => {
      video.removeEventListener("enterpictureinpicture", handlePipEnter);
      video.removeEventListener("leavepictureinpicture", handlePipLeave);
    };
  });

  // Broadcast timer state to extracted window
  const broadcastTimerState = () => {
    if (!broadcastChannel || !isExtracted) return;

    broadcastChannel.postMessage({
      type: "state",
      displayTime,
      backgroundColor,
      timerColor,
      fontFamily: timerFontFamily,
      fontWeight: timerFontWeight ?? "bold",
      fontSize,
      isFlashing,
      progress,
      showProgressBar,
      isRunning,
      remainingMs,
    });
  };

  // Extract timer to new window
  const extractTimerWindow = () => {
    // If already extracted, focus the window or close it
    if (extractedWindow && !extractedWindow.closed) {
      extractedWindow.focus();
      return;
    }

    // Create broadcast channel for communication
    broadcastChannel = new BroadcastChannel("countdown-timer");

    // Open new window
    extractedWindow = window.open(
      "",
      "countdown-display",
      "width=800,height=600,menubar=no,toolbar=no,location=no,status=no"
    );

    if (!extractedWindow) {
      console.warn("Failed to open window - popup may be blocked");
      return;
    }

    isExtracted = true;

    // Get current font URL if any
    const currentFontPreset = fontPresets.find((p) => p.name === selectedFont);
    const fontUrl = currentFontPreset?.url || "";
    const fontImport = fontUrl
      ? `<link rel="stylesheet" href="${fontUrl}">`
      : "";

    // Write the HTML content to the new window
    const progressDisplay = showProgressBar && (isRunning || remainingMs > 0) ? "block" : "none";
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Countdown Timer</title>
  ${fontImport}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dseg@0.46.0/css/dseg.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: ${backgroundColor};
      transition: background-color 0.2s;
      font-family: system-ui, sans-serif;
    }
    #timer {
      color: ${timerColor};
      font-family: ${timerFontFamily};
      font-size: ${fontSize}rem;
      font-weight: ${timerFontWeight ?? "bold"};
      letter-spacing: 0.05em;
      transition: color 0.2s;
    }
    #progress-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 4px;
      background-color: ${timerColor};
      opacity: 0.5;
      transition: width 0.1s, background-color 0.2s;
      width: ${progress}%;
    }
    #controls {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    body:hover #controls { opacity: 1; }
    .btn {
      padding: 8px;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .btn:hover { background: rgba(0, 0, 0, 0.7); }
    #hint {
      position: absolute;
      bottom: 16px;
      color: ${timerColor};
      opacity: 0.4;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: opacity 0.3s, color 0.2s;
    }
    body:hover #hint { opacity: 0; }
  </style>
</head>
<body>
  <div id="timer">${displayTime}</div>
  <div id="progress-bar" style="display: ${progressDisplay}"></div>
  <div id="controls">
    <button class="btn" id="fullscreen-btn" title="Toggle Fullscreen">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    </button>
  </div>
</body>
</html>`;

    extractedWindow.document.write(htmlContent);
    extractedWindow.document.close();

    // Inject script after document is written (avoids script tag parsing issues)
    const scriptEl = extractedWindow.document.createElement("script");
    scriptEl.textContent = `
      const channel = new BroadcastChannel("countdown-timer");
      const timerEl = document.getElementById("timer");
      const progressBar = document.getElementById("progress-bar");
      const hintEl = document.getElementById("hint");
      const fullscreenBtn = document.getElementById("fullscreen-btn");
      const controlsEl = document.getElementById("controls");
      
      channel.onmessage = (e) => {
        const data = e.data;
        if (data.type === "state") {
          timerEl.textContent = data.displayTime;
          timerEl.style.color = data.timerColor;
          timerEl.style.fontFamily = data.fontFamily;
          timerEl.style.fontSize = data.fontSize + "rem";
          timerEl.style.fontWeight = data.fontWeight;
          const bgColor = data.isFlashing
            ? (data.backgroundColor === "#ffffff" ? "#ff0000" : "#ffffff")
            : data.backgroundColor;
          document.body.style.backgroundColor = bgColor;
          progressBar.style.width = data.progress + "%";
          progressBar.style.backgroundColor = data.timerColor;
          progressBar.style.display = data.showProgressBar && (data.isRunning || data.remainingMs > 0) ? "block" : "none";
          hintEl.style.color = data.timerColor;
        } else if (data.type === "close") {
          window.close();
        }
      };
      
      fullscreenBtn.addEventListener("click", async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else {
            await document.documentElement.requestFullscreen();
          }
        } catch (e) {
          console.warn("Fullscreen failed:", e);
        }
      });
      
      // Hide controls and hint when in fullscreen
      document.addEventListener("fullscreenchange", () => {
        const isFs = !!document.fullscreenElement;
        controlsEl.style.display = isFs ? "none" : "flex";
        hintEl.style.display = isFs ? "none" : "block";
      });
      
      window.addEventListener("beforeunload", () => {
        channel.postMessage({ type: "closed" });
      });
    `;
    extractedWindow.document.body.appendChild(scriptEl);

    // Listen for close notification from extracted window
    broadcastChannel.onmessage = (e) => {
      if (e.data.type === "closed") {
        isExtracted = false;
        extractedWindow = null;
      }
    };

    // Also check if window was closed via polling (backup)
    const checkWindowClosed = setInterval(() => {
      if (extractedWindow?.closed) {
        isExtracted = false;
        extractedWindow = null;
        clearInterval(checkWindowClosed);
      }
    }, 1000);

    // Send initial state
    setTimeout(() => broadcastTimerState(), 100);
  };

  // Close extracted window
  const closeExtractedWindow = () => {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: "close" });
    }
    if (extractedWindow && !extractedWindow.closed) {
      extractedWindow.close();
    }
    extractedWindow = null;
    isExtracted = false;
    if (broadcastChannel) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  };

  // Broadcast state changes to extracted window
  $effect(() => {
    // Track all relevant state for broadcasting
    displayTime;
    backgroundColor;
    timerColor;
    timerFontFamily;
    timerFontWeight;
    fontSize;
    isFlashing;
    progress;
    showProgressBar;
    isRunning;
    remainingMs;

    broadcastTimerState();
  });

  // Cleanup on unmount - close extracted window
  $effect(() => {
    return () => {
      if (extractedWindow && !extractedWindow.closed) {
        extractedWindow.close();
      }
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  });

  // Canvas rendering for PiP Mode
  const renderCanvasFrame = () => {
    if (!pipCanvas) return;

    const ctx = pipCanvas.getContext("2d");
    if (!ctx) return;

    const width = pipCanvas.width;
    const height = pipCanvas.height;

    // Get current background color (handle flashing)
    const currentBg = isFlashing
      ? backgroundColor === "#ffffff"
        ? "#ff0000"
        : "#ffffff"
      : backgroundColor;

    // Clear and fill background
    ctx.fillStyle = currentBg;
    ctx.fillRect(0, 0, width, height);

    // Draw timer text
    ctx.fillStyle = timerColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Calculate font size relative to canvas (scale from rem to px, then to canvas)
    // fontSize is in rem, we'll use a base calculation for canvas
    const canvasFontSize = Math.min(width, height) * 0.2 * (fontSize / 8);
    ctx.font = `${timerFontWeight ?? "bold"} ${canvasFontSize}px ${timerFontFamily}`;

    ctx.fillText(displayTime, width / 2, height / 2);

    // Draw progress bar
    if (showProgressBar && (isRunning || remainingMs > 0)) {
      const barHeight = 4;
      const barWidth = (progress / 100) * width;
      ctx.fillStyle = timerColor;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, height - barHeight, barWidth, barHeight);
      ctx.globalAlpha = 1.0;
    }
  };

  // Start canvas animation loop for PiP Mode
  const startCanvasLoop = () => {
    const animate = () => {
      renderCanvasFrame();
      canvasAnimationId = requestAnimationFrame(animate);
    };
    animate();
  };

  // Stop canvas animation loop
  const stopCanvasLoop = () => {
    if (canvasAnimationId !== null) {
      cancelAnimationFrame(canvasAnimationId);
      canvasAnimationId = null;
    }
  };

  // Initialize PiP Mode stream
  const initPipMode = () => {
    if (!pipCanvas || !pipVideo) return;

    // Set canvas size for good video quality
    pipCanvas.width = 1920;
    pipCanvas.height = 1080;

    // Render initial frame
    renderCanvasFrame();

    // Create media stream from canvas
    try {
      mediaStream = pipCanvas.captureStream(30); // 30 FPS

      // Create audio context and destination for pip audio
      pipAudioContext = new AudioContext();
      pipAudioDestination = pipAudioContext.createMediaStreamDestination();

      // Add audio track to the media stream
      const audioTrack = pipAudioDestination.stream.getAudioTracks()[0];
      if (audioTrack) {
        mediaStream.addTrack(audioTrack);
      }

      pipVideo.srcObject = mediaStream;
      pipVideo
        .play()
        .catch((e: Error) => console.warn("Video play failed:", e));

      // Start render loop
      startCanvasLoop();
    } catch (e) {
      console.error("Failed to initialize pip mode:", e);
    }
  };

  // Cleanup PiP Mode
  const cleanupPipMode = () => {
    stopCanvasLoop();

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStream = null;
    }

    if (pipVideo) {
      pipVideo.srcObject = null;
    }

    if (pipAudioContext) {
      pipAudioContext.close();
      pipAudioContext = null;
      pipAudioDestination = null;
    }
    pipAudioEnabled = false;
  };

  // Effect to handle PiP Mode initialization/cleanup
  $effect(() => {
    if (viewMode === "pip" && pipCanvas && pipVideo) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        initPipMode();
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        cleanupPipMode();
      };
    }
  });

  // Toggle native video fullscreen (best for AirPlay/Cast)
  // const toggleVideoFullscreen = async () => {
  //   if (!pipVideo) return;

  //   try {
  //     // Check if video is currently in fullscreen
  //     if (
  //       document.fullscreenElement === pipVideo ||
  //       (document as any).webkitFullscreenElement === pipVideo
  //     ) {
  //       // Exit fullscreen
  //       if (document.exitFullscreen) {
  //         await document.exitFullscreen();
  //       } else if ((document as any).webkitExitFullscreen) {
  //         await (document as any).webkitExitFullscreen();
  //       }
  //     } else {
  //       // Enter fullscreen on the video element
  //       if (pipVideo.requestFullscreen) {
  //         await pipVideo.requestFullscreen();
  //       } else if ((pipVideo as any).webkitRequestFullscreen) {
  //         await (pipVideo as any).webkitRequestFullscreen();
  //       } else if ((pipVideo as any).webkitEnterFullscreen) {
  //         // iOS Safari specific
  //         await (pipVideo as any).webkitEnterFullscreen();
  //       }
  //     }
  //   } catch (e) {
  //     console.warn("Video fullscreen failed:", e);
  //   }
  // };

  // Load settings from localStorage
  const loadSettings = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings: Partial<StoredSettings> = JSON.parse(stored);
        if (settings.hours !== undefined) hours = settings.hours;
        if (settings.minutes !== undefined) minutes = settings.minutes;
        if (settings.seconds !== undefined) seconds = settings.seconds;
        if (settings.backgroundColor)
          backgroundColor = settings.backgroundColor;
        if (settings.timerColor) timerColor = settings.timerColor;
        if (settings.selectedColorPreset)
          selectedColorPreset = settings.selectedColorPreset;
        if (settings.selectedFont) selectedFont = settings.selectedFont;
        if (settings.fontSize !== undefined) fontSize = settings.fontSize;
        if (settings.enableSound !== undefined)
          enableSound = settings.enableSound;
        if (settings.enableFlashing !== undefined)
          enableFlashing = settings.enableFlashing;
        if (settings.showProgressBar !== undefined)
          showProgressBar = settings.showProgressBar;
      }
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
    settingsLoaded = true;
  };

  // Save settings to localStorage
  const saveSettings = () => {
    if (!settingsLoaded) return;
    try {
      const settings: StoredSettings = {
        hours,
        minutes,
        seconds,
        backgroundColor,
        timerColor,
        selectedColorPreset,
        selectedFont,
        fontSize,
        enableSound,
        enableFlashing,
        showProgressBar,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Failed to save settings:", e);
    }
  };

  // Clear all settings and reset to defaults
  const clearSettings = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear settings:", e);
    }
    handleReset();
    hours = defaults.hours;
    minutes = defaults.minutes;
    seconds = defaults.seconds;
    backgroundColor = defaults.backgroundColor;
    timerColor = defaults.timerColor;
    selectedColorPreset = defaults.selectedColorPreset;
    selectedTimePreset = "";
    selectedFont = defaults.selectedFont;
    fontSize = defaults.fontSize;
    enableSound = defaults.enableSound;
    enableFlashing = defaults.enableFlashing;
    showProgressBar = defaults.showProgressBar;
  };

  // Load settings on mount
  $effect(() => {
    loadSettings();
  });

  // Auto-save settings when they change
  $effect(() => {
    // Access all settings to track them
    hours;
    minutes;
    seconds;
    backgroundColor;
    timerColor;
    selectedColorPreset;
    selectedFont;
    fontSize;
    enableSound;
    enableFlashing;
    showProgressBar;

    saveSettings();
  });

  const getTotalMs = (): number => {
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  };

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const displayTime = $derived(
    timerFinished
      ? "00:00"
      : isRunning || remainingMs > 0
        ? formatTime(remainingMs)
        : formatTime(getTotalMs()),
  );

  const playBeep = () => {
    if (!enableSound) return;

    // Helper to play beep on a given audio context and destination
    const playBeepOn = (
      ctx: AudioContext,
      dest: AudioNode,
      delayMs: number,
      freq: number,
      duration: number,
    ) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(dest);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + duration,
        );
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      }, delayMs);
    };

    try {
      // Play on main audio context (device speakers)
      if (!audioContext) {
        audioContext = new AudioContext();
      }
      playBeepOn(audioContext, audioContext.destination, 0, 800, 0.5);
      playBeepOn(audioContext, audioContext.destination, 600, 800, 0.5);
      playBeepOn(audioContext, audioContext.destination, 1200, 1000, 0.8);

      // Also play on pip audio context if in pip mode (for AirPlay audio)
      if (viewMode === "pip" && pipAudioContext && pipAudioDestination) {
        playBeepOn(pipAudioContext, pipAudioDestination, 0, 800, 0.5);
        playBeepOn(pipAudioContext, pipAudioDestination, 600, 800, 0.5);
        playBeepOn(pipAudioContext, pipAudioDestination, 1200, 1000, 0.8);
      }
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  };

  const startFlashing = () => {
    if (!enableFlashing) return;

    isFlashing = true;
    let flashCount = 0;

    flashIntervalId = setInterval(() => {
      isFlashing = !isFlashing;
      flashCount++;

      if (flashCount >= 10) {
        if (flashIntervalId) {
          clearInterval(flashIntervalId);
          flashIntervalId = null;
        }
        isFlashing = false;
      }
    }, 300);
  };

  const onTimerEnd = () => {
    isRunning = false;
    remainingMs = 0;
    timerFinished = true;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    playBeep();
    startFlashing();
  };

  const handleStart = () => {
    if (isRunning) return;

    if (remainingMs === 0) {
      remainingMs = getTotalMs();
    }

    if (remainingMs <= 0) return;

    isRunning = true;
    lastTickTime = Date.now();

    intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickTime;
      lastTickTime = now;

      remainingMs = Math.max(0, remainingMs - elapsed);

      if (remainingMs <= 0) {
        onTimerEnd();
      }
    }, 100);
  };

  const handlePause = () => {
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const handleReset = () => {
    isRunning = false;
    remainingMs = 0;
    timerFinished = false;
    isFlashing = false;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (flashIntervalId) {
      clearInterval(flashIntervalId);
      flashIntervalId = null;
    }
  };

  const applyColorPreset = (presetName: string) => {
    const preset = colorPresets.find((p) => p.name === presetName);
    if (preset) {
      backgroundColor = preset.bg;
      timerColor = preset.timer;
      if (preset.font) {
        selectedFont = preset.font;
      }
      if (preset.size) {
        fontSize = preset.size;
      }
    }
  };

  // React to color preset selection changes (only apply size when preset changes, not on initial load)
  let lastColorPreset: string | null = null;
  
  $effect(() => {
    if (selectedColorPreset && selectedColorPreset !== "Custom") {
      const isInitialLoad = lastColorPreset === null;
      const presetChanged = lastColorPreset !== null && lastColorPreset !== selectedColorPreset;
      
      if (isInitialLoad) {
        // Initial load: apply colors/font but preserve saved fontSize
        const savedFontSize = fontSize;
        applyColorPreset(selectedColorPreset);
        fontSize = savedFontSize;
      } else if (presetChanged) {
        // User changed preset: apply everything including size
        applyColorPreset(selectedColorPreset);
      }
      // If neither (same preset, not initial): don't apply anything
      
      lastColorPreset = selectedColorPreset;
    }
  });

  // React to time preset selection changes
  $effect(() => {
    if (selectedTimePreset) {
      const preset = presets.find((p) => p.name === selectedTimePreset);
      if (preset) {
        handleReset();
        hours = preset.hours;
        minutes = preset.minutes;
        seconds = preset.seconds;
      }
    }
  });

  // React to font selection changes
  $effect(() => {
    const preset = fontPresets.find((p) => p.name === selectedFont);
    if (preset) {
      // Load font if it has a URL
      if (preset.url) {
        const existingLink = document.querySelector(
          `link[href="${preset.url}"]`,
        );
        if (!existingLink) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = preset.url;
          document.head.appendChild(link);
        }
      }
      timerFontFamily = preset.family;
      timerFontWeight = preset.weight;
    }
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (flashIntervalId) {
        clearInterval(flashIntervalId);
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  });

  // Fullscreen
  let timerContainer: HTMLDivElement | null = $state(null);
  let pipContainer: HTMLDivElement | null = $state(null);
  let isFullscreen = $state(false);
  let isOverlayFullscreen = $state(false); // Track if using CSS overlay fallback

  // Get the active container based on view mode
  const getActiveContainer = (): HTMLDivElement | null => {
    return viewMode === "pip" ? pipContainer : timerContainer;
  };

  const progress = $derived(
    getTotalMs() > 0 ? (remainingMs / getTotalMs()) * 100 : 0,
  );

  const isTimerSet = $derived(
    hours > 0 || minutes > 0 || seconds > 0 || remainingMs > 0,
  );

  // Check if native fullscreen API is available
  const canUseNativeFullscreen = (): boolean => {
    return !!(
      document.fullscreenEnabled ||
      (document as any).webkitFullscreenEnabled ||
      (document as any).mozFullScreenEnabled ||
      (document as any).msFullscreenEnabled
    );
  };

  // Enable CSS overlay fullscreen
  const enableOverlayFullscreen = () => {
    const container = getActiveContainer();
    if (!container) return;
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100vw";
    container.style.height = "100vh";
    container.style.zIndex = "9999";
    isOverlayFullscreen = true;
    isFullscreen = true;
    document.body.style.overflow = "hidden";
  };

  // Disable CSS overlay fullscreen
  const disableOverlayFullscreen = () => {
    // Reset both containers to be safe
    [timerContainer, pipContainer].forEach((container) => {
      if (container) {
        container.style.position = "";
        container.style.top = "";
        container.style.left = "";
        container.style.width = "";
        container.style.height = "";
        container.style.zIndex = "";
      }
    });
    isOverlayFullscreen = false;
    isFullscreen = false;
    document.body.style.overflow = "";
  };

  const toggleFullscreen = async () => {
    const container = getActiveContainer();
    if (!container) return;

    // If currently in overlay mode, exit overlay
    if (isOverlayFullscreen) {
      disableOverlayFullscreen();
      return;
    }

    // If currently in native fullscreen, exit it
    if (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      } catch (e) {
        console.warn("Exit fullscreen failed:", e);
      }
      isFullscreen = false;
      return;
    }

    // Try to enter fullscreen
    // First check if native fullscreen is available
    if (!canUseNativeFullscreen()) {
      // Native fullscreen not available, use overlay
      enableOverlayFullscreen();
      return;
    }

    // Try native fullscreen API
    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen();
      } else if ((container as any).mozRequestFullScreen) {
        await (container as any).mozRequestFullScreen();
      } else if ((container as any).msRequestFullscreen) {
        await (container as any).msRequestFullscreen();
      } else {
        // No fullscreen method available, use overlay
        enableOverlayFullscreen();
        return;
      }
      isFullscreen = true;
    } catch (e) {
      console.warn("Fullscreen request failed, using overlay fallback:", e);
      // Fallback to CSS overlay
      enableOverlayFullscreen();
    }
  };

  // Listen for fullscreen changes and keyboard events
  $effect(() => {
    let lastTouchTime = 0;
    const doubleTapThreshold = 300; // ms

    const handleFullscreenChange = () => {
      const inNativeFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      // Only update isFullscreen if not in overlay mode
      if (!isOverlayFullscreen) {
        isFullscreen = inNativeFullscreen;
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      // Handle Escape key to exit overlay fullscreen
      if (e.code === "Escape" && isOverlayFullscreen) {
        e.preventDefault();
        disableOverlayFullscreen();
        return;
      }

      if (!isFullscreen) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (isRunning) {
          handlePause();
        } else if (isTimerSet && !timerFinished) {
          handleStart();
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isFullscreen) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastTouchTime;

      if (timeDiff < doubleTapThreshold && timeDiff > 0) {
        // Double tap detected
        e.preventDefault();
        if (isRunning) {
          handlePause();
        } else if (isTimerSet && !timerFinished) {
          handleStart();
        }
      }

      lastTouchTime = currentTime;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeydown);

    // Add touch event listener to both containers
    if (timerContainer) {
      timerContainer.addEventListener("touchstart", handleTouchStart, {
        passive: false,
      });
    }
    if (pipContainer) {
      pipContainer.addEventListener("touchstart", handleTouchStart, {
        passive: false,
      });
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange,
      );
      document.removeEventListener("keydown", handleKeydown);

      if (timerContainer) {
        timerContainer.removeEventListener("touchstart", handleTouchStart);
      }
      if (pipContainer) {
        pipContainer.removeEventListener("touchstart", handleTouchStart);
      }

      // Clean up overlay state if component unmounts
      if (isOverlayFullscreen) {
        document.body.style.overflow = "";
      }
    };
  });

  // Show frame corners when timer is ready but not started
  const showFrameCorners = $derived(
    isFullscreen && !isRunning && !timerFinished && isTimerSet,
  );

  $effect(() => {
    // Hide hint after 2 seconds
    if (showFrameCorners) {
      showHint = true;
      const hintTimeout = setTimeout(() => {
        showHint = false;
      }, 2000);
      return () => {
        clearTimeout(hintTimeout);
      };
    } else {
      showHint = false;
    }
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-2">
    <p class="text-sm text-(--color-text-muted)">
      Customizable countdown timer with color themes, presets, and end-of-time
      alerts.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-col gap-2">
    <!-- Time Input Row -->
    <div class="flex flex-row flex-wrap gap-4 items-end">
      <div>
        <label
          for="hours-input"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Hours
        </label>
        <input
          id="hours-input"
          type="number"
          min="0"
          max="99"
          bind:value={hours}
          disabled={isRunning}
          class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label
          for="minutes-input"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Minutes
        </label>
        <input
          id="minutes-input"
          type="number"
          min="0"
          max="59"
          bind:value={minutes}
          disabled={isRunning}
          class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label
          for="seconds-input"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Seconds
        </label>
        <input
          id="seconds-input"
          type="number"
          min="0"
          max="59"
          bind:value={seconds}
          disabled={isRunning}
          class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <!-- Preset Selector -->
      <div class="flex-1 min-w-[150px]">
        <label
          for="preset-select"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Presets
        </label>
        <div class="flex gap-2">
          <select
            id="preset-select"
            bind:value={selectedTimePreset}
            disabled={isRunning}
            class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select preset...</option>
            {#each presets as preset}
              <option value={preset.name}>{preset.name}</option>
            {/each}
          </select>
          <button
            onclick={clearSettings}
            disabled={isRunning}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear all settings and reset to defaults"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Appearance Settings -->
    <div class="px-2 py-1 border border-(--color-border) bg-(--color-bg-alt)">
      <div class="flex flex-wrap gap-4 items-center">
        <div>
          <label
            for="color-preset-select"
            class="block text-xs text-(--color-text-light) mb-1"
          >
            Color Theme
          </label>
          <select
            id="color-preset-select"
            bind:value={selectedColorPreset}
            onkeydown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const currentIndex = colorPresets.findIndex(
                  (p) => p.name === selectedColorPreset,
                );
                let newIndex;
                if (e.key === "ArrowUp") {
                  newIndex =
                    currentIndex <= 0
                      ? colorPresets.length - 1
                      : currentIndex - 1;
                } else {
                  newIndex =
                    currentIndex >= colorPresets.length - 1
                      ? 0
                      : currentIndex + 1;
                }
                selectedColorPreset = colorPresets[newIndex].name;
              }
            }}
            class="w-36 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            {#each colorPresets as preset}
              <option value={preset.name}>{preset.name}</option>
            {/each}
          </select>
        </div>

        <div>
          <label
            for="bg-color"
            class="block text-xs text-(--color-text-light) mb-1"
          >
            Background
          </label>
          <div class="flex items-center gap-2">
            <input
              id="bg-color"
              type="color"
              bind:value={backgroundColor}
              oninput={() => (selectedColorPreset = "Custom")}
              class="w-10 h-10 border border-(--color-border) cursor-pointer"
            />
            <input
              type="text"
              bind:value={backgroundColor}
              oninput={() => (selectedColorPreset = "Custom")}
              class="w-24 px-2 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>

        <div>
          <label
            for="timer-color"
            class="block text-xs text-(--color-text-light) mb-1"
          >
            Timer Color
          </label>
          <div class="flex items-center gap-2">
            <input
              id="timer-color"
              type="color"
              bind:value={timerColor}
              oninput={() => (selectedColorPreset = "Custom")}
              class="w-10 h-10 border border-(--color-border) cursor-pointer"
            />
            <input
              type="text"
              bind:value={timerColor}
              oninput={() => (selectedColorPreset = "Custom")}
              class="w-24 px-2 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs text-(--color-text-light) mb-1">
            Switch
          </label>
          <button
            onclick={() => {
              const temp = backgroundColor;
              backgroundColor = timerColor;
              timerColor = temp;
              selectedColorPreset = "Custom";
            }}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm hover:bg-(--color-bg) transition-colors"
            title="Switch background and timer colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"
              />
            </svg>
          </button>
        </div>

        <div>
          <label
            for="font-select"
            class="block text-xs text-(--color-text-light) mb-1"
          >
            Font
          </label>
          <select
            id="font-select"
            bind:value={selectedFont}
            onkeydown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const currentIndex = fontPresets.findIndex(
                  (p) => p.name === selectedFont,
                );
                let newIndex;
                if (e.key === "ArrowUp") {
                  newIndex =
                    currentIndex <= 0
                      ? fontPresets.length - 1
                      : currentIndex - 1;
                } else {
                  newIndex =
                    currentIndex >= fontPresets.length - 1
                      ? 0
                      : currentIndex + 1;
                }
                selectedFont = fontPresets[newIndex].name;
              }
            }}
            class="w-40 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            {#each fontPresets as preset}
              <option value={preset.name}>{preset.name}</option>
            {/each}
          </select>
        </div>

        <div>
          <label
            for="font-size"
            class="block text-xs text-(--color-text-light) mb-1"
          >
            Size ({fontSize}rem)
          </label>
          <input
            id="font-size"
            type="range"
            min="4"
            max="20"
            step="1"
            bind:value={fontSize}
            class="w-28 h-2 accent-(--color-accent) cursor-pointer"
          />
        </div>
      </div>
    </div>

    <!-- End of Time Settings & Controls -->
    <div class="px-2 py-1 border border-(--color-border) bg-(--color-bg-alt)">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap gap-x-6 gap-y-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={enableSound}
              class="w-4 h-4 accent-(--color-accent)"
            />
            <span class="text-sm text-(--color-text)">Sound Alert</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={enableFlashing}
              class="w-4 h-4 accent-(--color-accent)"
            />
            <span class="text-sm text-(--color-text)">Flash Screen</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={showProgressBar}
              class="w-4 h-4 accent-(--color-accent)"
            />
            <span class="text-sm text-(--color-text)">Progress Bar</span>
          </label>
        </div>

        <div class="flex gap-2">
          {#if !isRunning}
            <button
              onclick={handleStart}
              disabled={!isTimerSet}
              class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {remainingMs > 0 ? "Resume" : "Start"}
            </button>
          {:else}
            <button
              onclick={handlePause}
              class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
            >
              Pause
            </button>
          {/if}

          <button
            onclick={handleReset}
            disabled={remainingMs === 0 &&
              !isRunning &&
              !isFlashing &&
              !timerFinished}
            class="px-6 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>

          <button
            onclick={toggleFullscreen}
            ontouchstart={toggleFullscreen}
            class="p-3 border border-(--color-border) text-(--color-text) transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--color-bg)]"
            style="touch-action: manipulation;"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {#if isFullscreen}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polyline points="4 14 4 20 10 20"></polyline><polyline
                  points="20 10 20 4 14 4"
                ></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line
                  x1="3"
                  y1="21"
                  x2="10"
                  y2="14"
                ></line></svg
              >
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polyline points="15 3 21 3 21 9"></polyline><polyline
                  points="9 21 3 21 3 15"
                ></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line
                  x1="3"
                  y1="21"
                  x2="10"
                  y2="14"
                ></line></svg
              >
            {/if}
          </button>

          <button
            onclick={() => isExtracted ? closeExtractedWindow() : extractTimerWindow()}
            class="p-3 border border-(--color-border) text-(--color-text) transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--color-bg)] {isExtracted ? 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)' : ''}"
            style="touch-action: manipulation;"
            title={isExtracted ? "Close External Window" : "Extract to New Window"}
          >
            {#if isExtracted}
              <!-- Close/X icon when extracted -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="9" y1="8" x2="15" y2="14"></line>
                <line x1="15" y1="8" x2="9" y2="14"></line>
              </svg>
            {:else}
              <!-- External window icon -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Timer Display -->
  <div class="flex-1 flex flex-col min-h-[300px]">
    <!-- View Mode Tabs -->
    <div class="flex border-b border-(--color-border) mb-0">
      <button
        onclick={() => (viewMode = "timer")}
        class="px-4 py-2 text-sm font-medium transition-colors {viewMode ===
        'timer'
          ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        Timer
      </button>
      <button
        onclick={() => (viewMode = "pip")}
        class="px-4 py-2 text-sm font-medium transition-colors {viewMode ===
        'pip'
          ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        PiP Video
      </button>
    </div>

    {#if viewMode === "timer"}
      <!-- Normal Timer View -->
      <div
        bind:this={timerContainer}
        class="flex-1 flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-200 {isFullscreen
          ? 'min-h-screen w-full'
          : 'border border-t-0 border-(--color-border)'}"
        style="background-color: {isFlashing
          ? backgroundColor === '#ffffff'
            ? '#ff0000'
            : '#ffffff'
          : backgroundColor};"
      >
        <!-- Frame corners (shown in fullscreen when ready to start) -->
        {#if showFrameCorners}
          <!-- Top left corner -->
          <div
            class="absolute top-8 left-8 w-16 h-16 border-l-4 border-t-4 transition-opacity duration-300"
            style="border-color: {timerColor}; opacity: 0.6;"
          ></div>
          <!-- Top right corner -->
          <div
            class="absolute top-8 right-8 w-16 h-16 border-r-4 border-t-4 transition-opacity duration-300"
            style="border-color: {timerColor}; opacity: 0.6;"
          ></div>
          <!-- Bottom left corner -->
          <div
            class="absolute bottom-8 left-8 w-16 h-16 border-l-4 border-b-4 transition-opacity duration-300"
            style="border-color: {timerColor}; opacity: 0.6;"
          ></div>
          <!-- Bottom right corner -->
          <div
            class="absolute bottom-8 right-8 w-16 h-16 border-r-4 border-b-4 transition-opacity duration-300"
            style="border-color: {timerColor}; opacity: 0.6;"
          ></div>
          <!-- Spacebar hint -->
          {#if showFrameCorners && showHint}
            <div
              class="absolute bottom-12 text-sm uppercase tracking-widest transition-opacity duration-300"
              style="color: {timerColor}; opacity: 0.4;"
              out:fade={{ duration: 500 }}
            >
              Press Space to Start
            </div>
          {/if}
        {/if}

        <!-- Close button for overlay fullscreen mode -->
        {#if isOverlayFullscreen}
          <button
            onclick={disableOverlayFullscreen}
            class="absolute top-4 right-4 p-2 rounded-full transition-opacity duration-200 hover:opacity-100"
            style="color: {timerColor}; opacity: 0.5;"
            title="Exit fullscreen (ESC)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        {/if}

        <!-- Progress bar -->
        {#if showProgressBar && (isRunning || remainingMs > 0)}
          <div
            class="absolute bottom-0 left-0 h-1 transition-all duration-100"
            style="width: {progress}%; background-color: {timerColor}; opacity: 0.5;"
          ></div>
        {/if}

        <!-- Timer -->
        <div
          class="tracking-wider transition-colors duration-200"
          style="color: {timerColor}; font-family: {timerFontFamily}; font-size: {fontSize}rem; font-weight: {timerFontWeight ??
            'bold'};"
        >
          {displayTime}
        </div>
      </div>
    {:else}
      <!-- PiP (Picture-in-Picture) Mode View -->
      <div
        bind:this={pipContainer}
        class="flex-1 flex flex-col border border-t-0 border-(--color-border) {isFullscreen
          ? 'min-h-screen w-full !border-0'
          : ''}"
        style="background-color: {backgroundColor};"
      >
        <!-- Hidden canvas for rendering -->
        <canvas bind:this={pipCanvas} class="hidden" width="1920" height="1080"
        ></canvas>

        <!-- Close button for overlay fullscreen mode in pip view -->
        {#if isOverlayFullscreen && viewMode === "pip"}
          <button
            onclick={disableOverlayFullscreen}
            class="absolute top-4 right-4 p-2 rounded-full transition-opacity duration-200 hover:opacity-100 z-10"
            style="color: {timerColor}; opacity: 0.5;"
            title="Exit fullscreen (ESC)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        {/if}

        <!-- Video element for Picture-in-Picture -->
        <div class="flex-1 flex flex-col items-center justify-center relative">
          <div
            class="w-full {isFullscreen
              ? 'h-full max-w-none'
              : 'aspect-video'} relative group"
          >
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={pipVideo}
              class="w-full h-full {isFullscreen
                ? 'object-cover'
                : 'object-contain'}"
              style="background-color: {backgroundColor};"
              autoplay
              playsinline
              muted
              {...{ "x-webkit-airplay": "allow" }}
            ></video>

            <!-- PiP Button Overlay -->
            <button
              onclick={togglePictureInPicture}
              class="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded transition-all duration-200 opacity-0 group-hover:opacity-100 {isPipActive ? 'opacity-100 bg-green-600/70 hover:bg-green-600/90' : ''}"
              title={isPipActive ? "Exit Picture-in-Picture" : "Open Picture-in-Picture"}
            >
              {#if isPipActive}
                <!-- Exit PiP icon -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <polyline points="8 21 12 17 16 21"></polyline>
                </svg>
              {:else}
                <!-- Enter PiP icon -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <rect x="12" y="8" width="8" height="7" rx="1" ry="1"></rect>
                </svg>
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
