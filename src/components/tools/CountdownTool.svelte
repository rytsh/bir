<script lang="ts">
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
    { name: "Default", bg: "#1a1a1a", timer: "#ffffff", font: "Quantico", size: 8 },
    { name: "Flu", bg: "#ffbc0b", timer: "#000000", font: "Quantico", size: 8 },
    { name: "Retro LCD", bg: "#a8c64e", timer: "#3c412c", font: "DSEG7 Classic", size: 8 },
    { name: "Mint", bg: "#0d1f0d", timer: "#98fb98", font: "Micro 5", size: 16 },
    { name: "Stealth", bg: "#0a0a0a", timer: "#2a2a2a", font: "Quantico", size: 8 },
    { name: "Blueprint", bg: "#003366", timer: "#ffffff", font: "Quantico", size: 8 },
    { name: "Sunset", bg: "#2d1b1b", timer: "#ffab91", font: "Quantico", size: 8 },
    { name: "Minimal", bg: "#ffffff", timer: "#333333", font: "Quantico", size: 8 },
    { name: "Minimal2", bg: "#ffffff", timer: "#333333", font: "Tourney", size: 8 },
    { name: "Terminal", bg: "#0d1117", timer: "#00ff00", font: "DSEG7 Modern", size: 8 },
    { name: "Fire", bg: "#1a0a0a", timer: "#ff5722", font: "Quantico", size: 8 },
    { name: "Cyberpunk", bg: "#000000", timer: "#fcee09", font: "DSEG14 Modern", size: 8 },
    { name: "Amber CRT", bg: "#fb7c00", timer: "#222222", font: "DSEG7 Classic", size: 8 },
    { name: "Ice", bg: "#e8f4f8", timer: "#0077b6", font: "Iceberg", size: 8 },
    { name: "Vintage", bg: "#f5e6d3", timer: "#8b4513", font: "Love Ya Like A Sister", size: 8 },
    { name: "Arctic", bg: "#1c2541", timer: "#a8dadc", font: "Iceberg", size: 8 },
    { name: "Lava", bg: "#1a0000", timer: "#ff4500", font: "DSEG14 Classic", size: 8 },
  ];

  const fontPresets = [
    { name: "Quantico", family: "'Quantico', sans-serif", url: "https://fonts.googleapis.com/css2?family=Quantico&display=swap" },
    { name: "Iceberg", family: "'Iceberg', sans-serif", url: "https://fonts.googleapis.com/css2?family=Iceberg&display=swap" },
    { name: "Tourney", family: "'Tourney', sans-serif", url: "https://fonts.googleapis.com/css2?family=Tourney:wght@100&display=swap" },
    { name: "System Mono", family: "ui-monospace, monospace", url: "" },
    { name: "DSEG7 Classic", family: "'DSEG7 Classic', monospace", url: "" },
    { name: "DSEG7 Modern", family: "'DSEG7 Modern', monospace", url: "" },
    { name: "DSEG14 Classic", family: "'DSEG14 Classic', monospace", url: "" },
    { name: "DSEG14 Modern", family: "'DSEG14 Modern', monospace", url: "" },
    { name: "Micro 5", family: "'Micro 5', monospace", url: "https://fonts.googleapis.com/css2?family=Micro+5&display=swap" },
    { name: "Love Ya Like A Sister", family: "'Love Ya Like A Sister', cursive", url: "https://fonts.googleapis.com/css2?family=Love+Ya+Like+A+Sister&display=swap" },
    { name: "New Rocker", family: "'New Rocker', system-ui", url: "https://fonts.googleapis.com/css2?family=New+Rocker&display=swap", weight: 200 },
    { name: "Jersey 10", family: "'Jersey 10', system-ui", url: "https://fonts.googleapis.com/css2?family=Jersey+10&display=swap", weight: 200 },
    { name: "Monoton", family: "'Monoton', system-ui", url: "https://fonts.googleapis.com/css2?family=Monoton&display=swap", weight: 200 },
    { name: "Press Start 2P", family: "'Press Start 2P', system-ui", url: "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap", weight: 200 },
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
  let isFlashing = $state(false);
  let flashIntervalId: ReturnType<typeof setInterval> | null = null;

  // Settings loaded flag to prevent saving during initial load
  let settingsLoaded = $state(false);

  // Audio context for beep sound
  let audioContext: AudioContext | null = null;

  // Load settings from localStorage
  const loadSettings = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings: Partial<StoredSettings> = JSON.parse(stored);
        if (settings.hours !== undefined) hours = settings.hours;
        if (settings.minutes !== undefined) minutes = settings.minutes;
        if (settings.seconds !== undefined) seconds = settings.seconds;
        if (settings.backgroundColor) backgroundColor = settings.backgroundColor;
        if (settings.timerColor) timerColor = settings.timerColor;
        if (settings.selectedColorPreset) selectedColorPreset = settings.selectedColorPreset;
        if (settings.selectedFont) selectedFont = settings.selectedFont;
        if (settings.fontSize !== undefined) fontSize = settings.fontSize;
        if (settings.enableSound !== undefined) enableSound = settings.enableSound;
        if (settings.enableFlashing !== undefined) enableFlashing = settings.enableFlashing;
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
  };

  // Load settings on mount
  $effect(() => {
    loadSettings();
  });

  // Auto-save settings when they change
  $effect(() => {
    // Access all settings to track them
    hours; minutes; seconds;
    backgroundColor; timerColor; selectedColorPreset;
    selectedFont; fontSize;
    enableSound; enableFlashing;
    
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
    timerFinished ? "00:00" : (isRunning || remainingMs > 0 ? formatTime(remainingMs) : formatTime(getTotalMs()))
  );

  const playBeep = () => {
    if (!enableSound) return;

    try {
      if (!audioContext) {
        audioContext = new AudioContext();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      // Play 3 beeps
      setTimeout(() => {
        if (audioContext) {
          const osc2 = audioContext.createOscillator();
          const gain2 = audioContext.createGain();
          osc2.connect(gain2);
          gain2.connect(audioContext.destination);
          osc2.frequency.value = 800;
          osc2.type = "sine";
          gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          osc2.start(audioContext.currentTime);
          osc2.stop(audioContext.currentTime + 0.5);
        }
      }, 600);

      setTimeout(() => {
        if (audioContext) {
          const osc3 = audioContext.createOscillator();
          const gain3 = audioContext.createGain();
          osc3.connect(gain3);
          gain3.connect(audioContext.destination);
          osc3.frequency.value = 1000;
          osc3.type = "sine";
          gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
          gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
          osc3.start(audioContext.currentTime);
          osc3.stop(audioContext.currentTime + 0.8);
        }
      }, 1200);
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

  // React to color preset selection changes
  $effect(() => {
    if (selectedColorPreset && selectedColorPreset !== "Custom") {
      applyColorPreset(selectedColorPreset);
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
        const existingLink = document.querySelector(`link[href="${preset.url}"]`);
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
  let isFullscreen = $state(false);

  const progress = $derived(
    getTotalMs() > 0 ? (remainingMs / getTotalMs()) * 100 : 0
  );

  const isTimerSet = $derived(hours > 0 || minutes > 0 || seconds > 0 || remainingMs > 0);

  const toggleFullscreen = async () => {
    if (!timerContainer) return;

    try {
      if (!document.fullscreenElement) {
        await timerContainer.requestFullscreen();
        isFullscreen = true;
      } else {
        await document.exitFullscreen();
        isFullscreen = false;
      }
    } catch (e) {
      console.warn("Fullscreen failed:", e);
    }
  };

  // Listen for fullscreen changes and keyboard events
  $effect(() => {
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };

    const handleKeydown = (e: KeyboardEvent) => {
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

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeydown);
    };
  });

  // Show frame corners when timer is ready but not started
  const showFrameCorners = $derived(isFullscreen && !isRunning && !timerFinished && isTimerSet);
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Countdown Timer
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Customizable countdown timer with color themes, presets, and end-of-time alerts.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-col gap-4">
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
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Appearance Settings -->
    <div class="px-4 py-3 border border-(--color-border) bg-(--color-bg-alt)">
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
                const currentIndex = colorPresets.findIndex((p) => p.name === selectedColorPreset);
                let newIndex;
                if (e.key === "ArrowUp") {
                  newIndex = currentIndex <= 0 ? colorPresets.length - 1 : currentIndex - 1;
                } else {
                  newIndex = currentIndex >= colorPresets.length - 1 ? 0 : currentIndex + 1;
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
              oninput={() => selectedColorPreset = "Custom"}
              class="w-10 h-10 border border-(--color-border) cursor-pointer"
            />
            <input
              type="text"
              bind:value={backgroundColor}
              oninput={() => selectedColorPreset = "Custom"}
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
              oninput={() => selectedColorPreset = "Custom"}
              class="w-10 h-10 border border-(--color-border) cursor-pointer"
            />
            <input
              type="text"
              bind:value={timerColor}
              oninput={() => selectedColorPreset = "Custom"}
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
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/>
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
                const currentIndex = fontPresets.findIndex((p) => p.name === selectedFont);
                let newIndex;
                if (e.key === "ArrowUp") {
                  newIndex = currentIndex <= 0 ? fontPresets.length - 1 : currentIndex - 1;
                } else {
                  newIndex = currentIndex >= fontPresets.length - 1 ? 0 : currentIndex + 1;
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
    <div class="px-4 py-3 border border-(--color-border) bg-(--color-bg-alt)">
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
            disabled={remainingMs === 0 && !isRunning && !isFlashing && !timerFinished}
            class="px-6 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>

          <button
            onclick={toggleFullscreen}
            class="p-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {#if isFullscreen}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 4 20 10 20"></polyline><polyline points="20 10 20 4 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Timer Display -->
  <div class="flex-1 flex flex-col min-h-[300px]">
    <div
      bind:this={timerContainer}
      class="flex-1 flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-200 {isFullscreen ? '' : 'border border-(--color-border)'}"
      style="background-color: {isFlashing ? (backgroundColor === '#ffffff' ? '#ff0000' : '#ffffff') : backgroundColor};"
    >
      <!-- Frame corners (shown in fullscreen when ready to start) -->
      {#if showFrameCorners}
        <!-- Top left corner -->
        <div class="absolute top-8 left-8 w-16 h-16 border-l-4 border-t-4 transition-opacity duration-300" style="border-color: {timerColor}; opacity: 0.6;"></div>
        <!-- Top right corner -->
        <div class="absolute top-8 right-8 w-16 h-16 border-r-4 border-t-4 transition-opacity duration-300" style="border-color: {timerColor}; opacity: 0.6;"></div>
        <!-- Bottom left corner -->
        <div class="absolute bottom-8 left-8 w-16 h-16 border-l-4 border-b-4 transition-opacity duration-300" style="border-color: {timerColor}; opacity: 0.6;"></div>
        <!-- Bottom right corner -->
        <div class="absolute bottom-8 right-8 w-16 h-16 border-r-4 border-b-4 transition-opacity duration-300" style="border-color: {timerColor}; opacity: 0.6;"></div>
        <!-- Spacebar hint -->
        <div class="absolute bottom-12 text-sm uppercase tracking-widest transition-opacity duration-300" style="color: {timerColor}; opacity: 0.4;">
          Press Space to Start
        </div>
      {/if}

      <!-- Progress bar -->
      {#if isRunning || remainingMs > 0}
        <div
          class="absolute bottom-0 left-0 h-1 transition-all duration-100"
          style="width: {progress}%; background-color: {timerColor}; opacity: 0.5;"
        ></div>
      {/if}

      <!-- Timer -->
      <div
        class="tracking-wider transition-colors duration-200"
        style="color: {timerColor}; font-family: {timerFontFamily}; font-size: {fontSize}rem; font-weight: {timerFontWeight ?? 'bold'};"
      >
        {displayTime}
      </div>
    </div>
  </div>
</div>
