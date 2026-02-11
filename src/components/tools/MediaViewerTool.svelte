<script lang="ts">
  import { parse } from "@plussub/srt-vtt-parser";

  // Types
  type MediaType = "image" | "video" | "audio" | "none";
  type SubtitleSize = "small" | "medium" | "large" | "xlarge";
  type SubtitleFont = "inter" | "consolas" | "roboto" | "asap";

  interface SubtitleCue {
    id: string;
    startTime: number;
    endTime: number;
    text: string;
  }

  interface SubtitleSettings {
    enabled: boolean;
    cues: SubtitleCue[];
    fontSize: SubtitleSize;
    fontFamily: SubtitleFont;
    positionY: number; // 0-100 percentage from top
    textColor: string;
    backgroundColor: string;
    backgroundOpacity: number;
    timeOffset: number;
    speedFactor: number;
  }

  // State
  let mediaType = $state<MediaType>("none");
  let mediaUrl = $state<string>("");
  let mediaName = $state<string>("");
  let urlInput = $state<string>("");
  let error = $state<string>("");
  let isDragging = $state(false);

  // Video/Audio state
  let videoElement = $state<HTMLVideoElement | null>(null);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let isMuted = $state(false);
  let playbackSpeed = $state(1);
  let isLooping = $state(false);
  let isPiP = $state(false);
  let isFullscreen = $state(false);

  // Image state
  let imageElement = $state<HTMLImageElement | null>(null);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let panStartX = $state(0);
  let panStartY = $state(0);
  let imageNaturalWidth = $state(0);
  let imageNaturalHeight = $state(0);

  // Subtitle state
  let subtitles = $state<SubtitleSettings>({
    enabled: false,
    cues: [],
    fontSize: "medium",
    fontFamily: "inter",
    positionY: 85, // 85% from top (near bottom)
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.75,
    timeOffset: 0,
    speedFactor: 1,
  });
  let currentSubtitle = $state<string>("");
  let subtitleFileName = $state<string>("");

  // Audio visualization
  let audioContext = $state<AudioContext | null>(null);
  let analyser = $state<AnalyserNode | null>(null);
  let waveformCanvas = $state<HTMLCanvasElement | null>(null);
  let animationFrameId = $state<number | null>(null);

  // UI state
  let showSettings = $state(false);
  let showControls = $state(true);
  let controlsTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

  // Speed presets
  const speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Font size map
  const fontSizeMap: Record<SubtitleSize, string> = {
    small: "1rem",
    medium: "1.25rem",
    large: "1.75rem",
    xlarge: "2.25rem",
  };

  // Font family map
  const fontFamilyMap: Record<SubtitleFont, { name: string; value: string; weight?: number }> = {
    inter: { name: "Inter", value: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
    consolas: { name: "Consolas", value: "Consolas, 'Courier New', monospace" },
    roboto: { name: "Roboto Black", value: "'Roboto', Arial, sans-serif", weight: 900 },
    asap: { name: "Asap Condensed", value: "'Asap Condensed', Arial, sans-serif", weight: 500 },
  };

  // Supported formats
  const supportedFormats = {
    image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic", "ico"],
    video: ["mp4", "webm", "mkv", "avi", "mov", "ogv", "m4v", "3gp"],
    audio: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "opus", "wma", "aiff"],
  };

  // Detect media type from file
  function detectMediaType(file: File): MediaType {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (supportedFormats.image.includes(ext)) return "image";
    if (supportedFormats.video.includes(ext)) return "video";
    if (supportedFormats.audio.includes(ext)) return "audio";

    // Fallback to MIME type
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";

    return "none";
  }

  // Detect media type from URL
  function detectMediaTypeFromUrl(url: string): MediaType {
    const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
    if (supportedFormats.image.includes(ext)) return "image";
    if (supportedFormats.video.includes(ext)) return "video";
    if (supportedFormats.audio.includes(ext)) return "audio";
    return "none";
  }

  // Load media file
  function loadMedia(file: File) {
    cleanup();
    error = "";

    const type = detectMediaType(file);
    if (type === "none") {
      error = "Unsupported file format";
      return;
    }

    mediaType = type;
    mediaName = file.name;
    mediaUrl = URL.createObjectURL(file);
  }

  // Load media from URL
  function loadMediaFromUrl() {
    if (!urlInput.trim()) return;
    cleanup();
    error = "";

    const type = detectMediaTypeFromUrl(urlInput);
    if (type === "none") {
      // Try to load anyway, let browser handle it
      mediaType = "video"; // Default to video for URLs
    } else {
      mediaType = type;
    }

    mediaName = urlInput.split("/").pop()?.split("?")[0] || "Remote Media";
    mediaUrl = urlInput;
    urlInput = "";
  }

  // Cleanup resources
  function cleanup() {
    if (mediaUrl && mediaUrl.startsWith("blob:")) {
      URL.revokeObjectURL(mediaUrl);
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    mediaUrl = "";
    mediaName = "";
    mediaType = "none";
    isPlaying = false;
    currentTime = 0;
    duration = 0;
    zoom = 1;
    panX = 0;
    panY = 0;
    subtitles.cues = [];
    subtitles.enabled = false;
    subtitleFileName = "";
    currentSubtitle = "";
    isPiP = false;
  }

  // File input handlers
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      loadMedia(input.files[0]);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    const file = event.dataTransfer?.files[0];
    if (file) {
      loadMedia(file);
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  // Paste handler
  function handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          loadMedia(file);
          break;
        }
      }
    }
  }

  // Video/Audio controls
  function togglePlay() {
    const el = videoElement || audioElement;
    if (!el) return;

    if (isPlaying) {
      el.pause();
      showControls = true;
    } else {
      el.play();
      // Hide controls shortly after starting playback
      if (controlsTimeout) clearTimeout(controlsTimeout);
      controlsTimeout = setTimeout(() => {
        showControls = false;
      }, 100);
    }
  }

  function seek(time: number) {
    const el = videoElement || audioElement;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(time, duration));
  }

  function seekRelative(delta: number) {
    seek(currentTime + delta);
  }

  function setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    const el = videoElement || audioElement;
    if (el) el.volume = volume;
  }

  function toggleMute() {
    isMuted = !isMuted;
    const el = videoElement || audioElement;
    if (el) el.muted = isMuted;
  }

  function setSpeed(speed: number) {
    playbackSpeed = speed;
    const el = videoElement || audioElement;
    if (el) el.playbackRate = speed;
  }

  function toggleLoop() {
    isLooping = !isLooping;
    const el = videoElement || audioElement;
    if (el) el.loop = isLooping;
  }

  // Picture-in-Picture
  async function togglePiP() {
    if (!videoElement) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        isPiP = false;
      } else if (document.pictureInPictureEnabled) {
        await videoElement.requestPictureInPicture();
        isPiP = true;
      }
    } catch (e) {
      console.error("PiP error:", e);
    }
  }

  // Fullscreen
  async function toggleFullscreen() {
    const container = document.getElementById("media-container");
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        isFullscreen = false;
      } else {
        await container.requestFullscreen();
        isFullscreen = true;
      }
    } catch (e) {
      console.error("Fullscreen error:", e);
    }
  }

  // Frame stepping (assuming 30fps if unknown)
  function stepFrame(forward: boolean) {
    const el = videoElement;
    if (!el) return;

    const wasPlaying = isPlaying;
    if (wasPlaying) el.pause();

    const frameTime = 1 / 30;
    if (forward) {
      seek(currentTime + frameTime);
    } else {
      seek(currentTime - frameTime);
    }
  }

  // Screenshot
  function captureScreenshot() {
    if (!videoElement) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoElement, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // Casting support removed - Remote Playback API has very limited browser support

  // Subtitle loading
  async function loadSubtitle(file: File) {
    try {
      const text = await file.text();
      const { entries } = parse(text);

      subtitles.cues = entries.map((entry) => ({
        id: entry.id,
        startTime: entry.from / 1000,
        endTime: entry.to / 1000,
        text: entry.text,
      }));
      subtitles.enabled = true;
      subtitleFileName = file.name;
      error = "";
    } catch (e) {
      error = "Failed to parse subtitle file";
      console.error(e);
    }
  }

  function handleSubtitleSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      loadSubtitle(input.files[0]);
    }
  }

  // Update current subtitle based on time
  function updateCurrentSubtitle(time: number) {
    if (!subtitles.enabled || subtitles.cues.length === 0) {
      currentSubtitle = "";
      return;
    }

    // Apply time offset and speed factor
    const adjustedTime = (time + subtitles.timeOffset) * subtitles.speedFactor;

    const cue = subtitles.cues.find(
      (c) => adjustedTime >= c.startTime && adjustedTime <= c.endTime
    );
    currentSubtitle = cue?.text || "";
  }

  // Image controls
  function zoomIn() {
    zoom = Math.min(zoom * 1.25, 10);
  }

  function zoomOut() {
    zoom = Math.max(zoom / 1.25, 0.1);
  }

  function resetZoom() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  function fitToScreen() {
    if (!imageElement || !imageNaturalWidth || !imageNaturalHeight) return;

    const container = document.getElementById("media-container");
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = containerWidth / imageNaturalWidth;
    const scaleY = containerHeight / imageNaturalHeight;
    zoom = Math.min(scaleX, scaleY, 1);
    panX = 0;
    panY = 0;
  }

  function handleImageWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  }

  function handleImageMouseDown(event: MouseEvent) {
    if (zoom <= 1) return;
    isPanning = true;
    panStartX = event.clientX - panX;
    panStartY = event.clientY - panY;
  }

  function handleImageMouseMove(event: MouseEvent) {
    if (!isPanning) return;
    panX = event.clientX - panStartX;
    panY = event.clientY - panStartY;
  }

  function handleImageMouseUp() {
    isPanning = false;
  }

  // Video controls visibility
  function handleVideoMouseMove() {
    showControls = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (isPlaying) {
      controlsTimeout = setTimeout(() => {
        showControls = false;
      }, 1500);
    }
  }

  // Audio visualization
  function setupAudioVisualization() {
    if (!audioElement || !waveformCanvas) return;

    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      analyser.fftSize = 256;
      drawWaveform();
    } catch (e) {
      console.error("Audio visualization error:", e);
    }
  }

  function drawWaveform() {
    if (!analyser || !waveformCanvas) return;

    const canvas = waveformCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      if (!analyser || !ctx) return;
      animationFrameId = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Use CSS variable color or fallback
      const computedStyle = getComputedStyle(canvas);
      const bgColor = computedStyle.getPropertyValue("--color-bg-alt") || "#1a1a1a";
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        // Create gradient effect
        const hue = (i / bufferLength) * 60 + 200; // Blue to purple range
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    }

    draw();
  }

  // Format time as mm:ss or hh:mm:ss
  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return "0:00";

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    if (mediaType === "none") return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    switch (event.code) {
      case "Space":
        event.preventDefault();
        if (mediaType === "video" || mediaType === "audio") togglePlay();
        break;
      case "ArrowLeft":
        event.preventDefault();
        seekRelative(-5);
        break;
      case "ArrowRight":
        event.preventDefault();
        seekRelative(5);
        break;
      case "ArrowUp":
        event.preventDefault();
        setVolume(volume + 0.1);
        break;
      case "ArrowDown":
        event.preventDefault();
        setVolume(volume - 0.1);
        break;
      case "KeyM":
        toggleMute();
        break;
      case "KeyF":
        toggleFullscreen();
        break;
      case "KeyL":
        toggleLoop();
        break;
      case "KeyP":
        if (mediaType === "video") togglePiP();
        break;
      case "Period":
        stepFrame(true);
        break;
      case "Comma":
        stepFrame(false);
        break;
      case "BracketLeft":
        setSpeed(Math.max(0.25, playbackSpeed - 0.25));
        break;
      case "BracketRight":
        setSpeed(Math.min(2, playbackSpeed + 0.25));
        break;
      case "Digit0":
        seek(0);
        break;
      case "Minus":
        if (mediaType === "image") zoomOut();
        break;
      case "Equal":
        if (mediaType === "image") zoomIn();
        break;
    }
  }

  // Effects
  $effect(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeydown);
      window.addEventListener("paste", handlePaste as EventListener);

      return () => {
        window.removeEventListener("keydown", handleKeydown);
        window.removeEventListener("paste", handlePaste as EventListener);
      };
    }
  });

  $effect(() => {
    updateCurrentSubtitle(currentTime);
  });

  // Fullscreen change listener
  $effect(() => {
    if (typeof document !== "undefined") {
      const handler = () => {
        isFullscreen = !!document.fullscreenElement;
      };
      document.addEventListener("fullscreenchange", handler);
      return () => document.removeEventListener("fullscreenchange", handler);
    }
  });

  // PiP change listener
  $effect(() => {
    if (videoElement) {
      const el = videoElement;
      const enterHandler = () => (isPiP = true);
      const leaveHandler = () => (isPiP = false);
      el.addEventListener("enterpictureinpicture", enterHandler);
      el.addEventListener("leavepictureinpicture", leaveHandler);
      return () => {
        el.removeEventListener("enterpictureinpicture", enterHandler);
        el.removeEventListener("leavepictureinpicture", leaveHandler);
      };
    }
  });
</script>

<div class="flex flex-col h-full">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      View images, play videos and audio with speed control, subtitles, and more.
    </p>
  </header>

  {#if error}
    <div class="mb-4 p-3 border border-red-500/50 bg-red-500/10 text-sm text-red-500">
      {error}
    </div>
  {/if}

  <!-- Input Section - Hide when media is loaded -->
  {#if mediaType === "none"}
    <div
      class="border border-(--color-border) bg-(--color-bg-alt) p-8 text-center transition-colors {isDragging
        ? 'border-(--color-accent) bg-(--color-accent)/10'
        : ''}"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="region"
      aria-label="Drop zone"
    >
      <div class="flex flex-col items-center gap-4">
        <div class="text-5xl opacity-50">🎬</div>
        <div>
          <p class="text-(--color-text) font-medium">Drop media file here or paste from clipboard</p>
          <p class="text-sm text-(--color-text-muted) mt-1">
            Supports images, videos, and audio files
          </p>
        </div>
        <div class="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <label
            class="cursor-pointer px-4 py-2 border border-(--color-border) bg-(--color-bg) text-sm font-medium text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
          >
            Browse Files
            <input
              type="file"
              accept="image/*,video/*,audio/*"
              class="hidden"
              onchange={handleFileSelect}
            />
          </label>
          <span class="text-(--color-text-muted) text-sm">or</span>
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={urlInput}
              placeholder="Enter URL..."
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-sm text-(--color-text) outline-none focus:border-(--color-accent) w-64"
              onkeydown={(e) => e.key === "Enter" && loadMediaFromUrl()}
            />
            <button
              onclick={loadMediaFromUrl}
              class="px-4 py-2 border border-(--color-border) bg-(--color-bg) text-sm text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
            >
              Load
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Media Display -->
  {#if mediaType !== "none"}
    <!-- Header with file info and clear button -->
    <div class="flex items-center justify-between mb-4 p-3 border border-(--color-border) bg-(--color-bg-alt)">
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-2xl shrink-0">
          {#if mediaType === "image"}🖼️{:else if mediaType === "video"}🎥{:else}🎵{/if}
        </span>
        <div class="min-w-0">
          <p class="font-medium text-(--color-text) truncate">{mediaName}</p>
          <p class="text-xs text-(--color-text-muted)">
            {mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
            {#if mediaType === "image" && imageNaturalWidth && imageNaturalHeight}
              &bull; {imageNaturalWidth} x {imageNaturalHeight}
            {/if}
            {#if (mediaType === "video" || mediaType === "audio") && duration}
              &bull; {formatTime(duration)}
            {/if}
          </p>
        </div>
      </div>
      <button
        onclick={cleanup}
        class="px-3 py-1 text-sm text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Clear
      </button>
    </div>

    <div
      id="media-container"
      class="relative border border-(--color-border) bg-black overflow-hidden {isFullscreen ? 'fixed inset-0 z-50' : ''}"
    >
      <!-- Image Viewer -->
      {#if mediaType === "image"}
        <div
          class="relative flex items-center justify-center overflow-hidden bg-[#1a1a1a]"
          style="height: {isFullscreen ? '100vh' : '60vh'};"
          onwheel={handleImageWheel}
          onmousedown={handleImageMouseDown}
          onmousemove={handleImageMouseMove}
          onmouseup={handleImageMouseUp}
          onmouseleave={handleImageMouseUp}
          role="img"
          aria-label="Image viewer"
        >
          <img
            bind:this={imageElement}
            src={mediaUrl}
            alt={mediaName}
            class="max-w-none select-none transition-transform"
            style="transform: scale({zoom}) translate({panX / zoom}px, {panY / zoom}px); cursor: {zoom > 1 ? 'grab' : 'default'};"
            draggable="false"
            onload={(e) => {
              const img = e.target as HTMLImageElement;
              imageNaturalWidth = img.naturalWidth;
              imageNaturalHeight = img.naturalHeight;
            }}
          />
        </div>

        <!-- Image Controls -->
        <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/80 p-2 backdrop-blur">
          <button
            onclick={zoomOut}
            class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Zoom Out (-)"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <span class="min-w-16 text-center text-sm text-white/80">{Math.round(zoom * 100)}%</span>
          <button
            onclick={zoomIn}
            class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Zoom In (+)"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
          <div class="mx-1 h-6 w-px bg-white/30"></div>
          <button
            onclick={fitToScreen}
            class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Fit to Screen"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            onclick={resetZoom}
            class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Reset (100%)"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onclick={toggleFullscreen}
            class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Fullscreen (F)"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {#if isFullscreen}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              {/if}
            </svg>
          </button>
        </div>
      {/if}

      <!-- Video Player -->
      {#if mediaType === "video"}
        <div
          class="relative"
          style="height: {isFullscreen ? '100vh' : '60vh'}; cursor: {!showControls && isPlaying ? 'none' : 'default'};"
          onmousemove={handleVideoMouseMove}
          onclick={togglePlay}
          role="button"
          tabindex="0"
          aria-label="Video player - click to play/pause"
          onkeydown={(e) => e.code === "Space" && togglePlay()}
        >
          <!-- svelte-ignore element_invalid_self_closing_tag -->
          <video
            bind:this={videoElement}
            src={mediaUrl}
            class="h-full w-full bg-black"
            onplay={() => (isPlaying = true)}
            onpause={() => {
              isPlaying = false;
              showControls = true;
            }}
            ontimeupdate={() => (currentTime = videoElement?.currentTime || 0)}
            onloadedmetadata={() => {
              duration = videoElement?.duration || 0;
              if (videoElement) {
                videoElement.volume = volume;
                videoElement.playbackRate = playbackSpeed;
              }
            }}
            onended={() => (isPlaying = false)}
            crossorigin="anonymous"
          />

          <!-- Subtitle Overlay -->
          {#if subtitles.enabled && currentSubtitle}
            <div
              class="absolute left-0 right-0 flex justify-center px-4 pointer-events-none"
              style="top: {subtitles.positionY}%; transform: translateY(-50%);"
            >
              <div
                class="max-w-[80%] px-4 py-2 text-center"
                style="
                  font-size: {fontSizeMap[subtitles.fontSize]};
                  font-family: {fontFamilyMap[subtitles.fontFamily].value};
                  font-weight: {fontFamilyMap[subtitles.fontFamily].weight || 400};
                  color: {subtitles.textColor};
                  background-color: {subtitles.backgroundColor}{Math.round(subtitles.backgroundOpacity * 255).toString(16).padStart(2, '0')};
                "
              >
                {@html currentSubtitle.replace(/\n/g, "<br>")}
              </div>
            </div>
          {/if}

          <!-- Video Controls Overlay -->
          <div
            class="absolute bottom-0 left-0 right-0 bg-black/70 transition-opacity duration-200"
            style="opacity: {showControls || !isPlaying ? 1 : 0};"
            onclick={(e) => e.stopPropagation()}
            role="group"
            aria-label="Video controls"
          >
            <!-- Progress Bar -->
            <div class="px-4 pt-3">
              <div
                class="relative h-1 w-full cursor-pointer bg-white/30"
                onclick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  seek(percent * duration);
                }}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={currentTime}
                tabindex="0"
                onkeydown={(e) => {
                  if (e.code === "ArrowLeft") seekRelative(-5);
                  else if (e.code === "ArrowRight") seekRelative(5);
                }}
              >
                <!-- Played portion (red) -->
                <div
                  class="absolute top-0 left-0 h-full bg-red-500"
                  style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%;"
                ></div>
              </div>
            </div>

            <!-- Controls Row -->
            <div class="flex items-center gap-2 px-4 py-3">
              <!-- Play/Pause -->
              <button
                onclick={togglePlay}
                class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                title="Play/Pause (Space)"
              >
                <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  {#if isPlaying}
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  {:else}
                    <path d="M8 5v14l11-7z" />
                  {/if}
                </svg>
              </button>

              <!-- Time -->
              <span class="text-sm text-white/80 min-w-[80px]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <!-- Spacer -->
              <div class="flex-1"></div>

              <!-- Volume -->
              <div class="flex items-center gap-1">
                <button
                  onclick={toggleMute}
                  class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                  title="Mute (M)"
                >
                  <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    {#if isMuted || volume === 0}
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                    {:else}
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    {/if}
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  oninput={(e) => setVolume(Number((e.target as HTMLInputElement).value))}
                  class="h-1 w-20 cursor-pointer appearance-none bg-white/30 accent-white"
                />
              </div>

              <div class="mx-1 h-5 w-px bg-white/30"></div>

              <!-- Speed -->
              <select
                value={playbackSpeed}
                onchange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}
                class="px-2 py-1 text-sm bg-transparent text-white/80 hover:text-white border border-white/30 hover:border-white/50 outline-none cursor-pointer"
              >
                {#each speedPresets as speed}
                  <option value={speed} class="bg-black text-white">{speed}x</option>
                {/each}
              </select>

              <!-- Loop -->
              <button
                onclick={toggleLoop}
                class="p-2 transition-colors {isLooping ? 'text-white' : 'text-white/50 hover:text-white/80'}"
                title="Loop (L)"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                </svg>
              </button>

              <div class="mx-1 h-5 w-px bg-white/30"></div>

              <!-- Frame Step -->
              <button
                onclick={() => stepFrame(false)}
                class="p-1 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                title="Previous Frame (,)"
              >
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>
              <button
                onclick={() => stepFrame(true)}
                class="p-1 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                title="Next Frame (.)"
              >
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 6h-2v12h2zm-3.5 6L6 6v12z" />
                </svg>
              </button>

              <div class="mx-1 h-5 w-px bg-white/30"></div>

              <!-- Screenshot -->
              <button
                onclick={captureScreenshot}
                class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                title="Screenshot"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
              </button>

              <!-- Subtitles -->
              <button
                onclick={() => (showSettings = !showSettings)}
                class="p-2 transition-colors {showSettings || subtitles.enabled ? 'text-white' : 'text-white/50 hover:text-white/80'}"
                title="Subtitles"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z"/>
                </svg>
              </button>

              <!-- PiP -->
              {#if document.pictureInPictureEnabled}
                <button
                  onclick={togglePiP}
                  class="p-2 transition-colors {isPiP ? 'text-white' : 'text-white/50 hover:text-white/80'}"
                  title="Picture-in-Picture (P)"
                >
                  <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
                  </svg>
                </button>
              {/if}

              <!-- Fullscreen -->
              <button
                onclick={toggleFullscreen}
                class="p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                title="Fullscreen (F)"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {#if isFullscreen}
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  {:else}
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  {/if}
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Audio Player -->
      {#if mediaType === "audio"}
        <div class="p-6 bg-(--color-bg-alt)">
          <div class="mb-6 flex flex-col items-center">
            <div class="mb-4 text-6xl opacity-50">🎵</div>
          </div>

          <!-- Waveform -->
          <canvas
            bind:this={waveformCanvas}
            width="600"
            height="80"
            class="mx-auto mb-6 w-full max-w-[600px] border border-(--color-border) bg-(--color-bg)"
          ></canvas>

          <!-- svelte-ignore element_invalid_self_closing_tag -->
          <audio
            bind:this={audioElement}
            src={mediaUrl}
            class="hidden"
            onplay={() => {
              isPlaying = true;
              if (!audioContext) setupAudioVisualization();
            }}
            onpause={() => (isPlaying = false)}
            ontimeupdate={() => (currentTime = audioElement?.currentTime || 0)}
            onloadedmetadata={() => {
              duration = audioElement?.duration || 0;
              if (audioElement) {
                audioElement.volume = volume;
                audioElement.playbackRate = playbackSpeed;
              }
            }}
            onended={() => (isPlaying = false)}
          />

          <!-- Progress Bar -->
          <div class="mb-4 max-w-[600px] mx-auto">
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={currentTime}
              oninput={(e) => seek(Number((e.target as HTMLInputElement).value))}
              class="h-2 w-full cursor-pointer appearance-none bg-(--color-border) accent-(--color-accent)"
            />
            <div class="mt-1 flex justify-between text-sm text-(--color-text-muted)">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <!-- Controls -->
          <div class="flex flex-wrap items-center justify-center gap-3">
            <button onclick={togglePlay} class="p-4 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors">
              <svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                {#if isPlaying}
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                {:else}
                  <path d="M8 5v14l11-7z" />
                {/if}
              </svg>
            </button>

            <div class="flex items-center gap-2">
              <button onclick={toggleMute} class="p-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  {#if isMuted || volume === 0}
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  {:else}
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  {/if}
                </svg>
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                oninput={(e) => setVolume(Number((e.target as HTMLInputElement).value))}
                class="h-1 w-24 cursor-pointer appearance-none bg-(--color-border) accent-(--color-accent)"
              />
            </div>

            <select
              value={playbackSpeed}
              onchange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-sm text-(--color-text) outline-none focus:border-(--color-accent)"
            >
              {#each speedPresets as speed}
                <option value={speed}>{speed}x</option>
              {/each}
            </select>

            <button
              onclick={toggleLoop}
              class="p-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors {isLooping ? 'border-(--color-accent) text-(--color-accent)' : ''}"
              title="Loop (L)"
            >
              <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
              </svg>
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Settings Panel (for video) -->
    {#if mediaType === "video" && showSettings}
      <div class="mt-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between p-4 border-b border-(--color-border)">
          <span class="text-sm uppercase tracking-wider text-(--color-text-muted) font-medium">Subtitle Settings</span>
        </div>

        <div class="p-4">
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <!-- Load Subtitle -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Load Subtitle</span>
              <label class="cursor-pointer block px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text) hover:border-(--color-accent) transition-colors text-center">
                {subtitleFileName || "Choose SRT/VTT..."}
                <input
                  type="file"
                  accept=".srt,.vtt"
                  class="hidden"
                  onchange={handleSubtitleSelect}
                />
              </label>
              {#if subtitles.cues.length > 0}
                <p class="mt-2 text-xs text-(--color-text-muted)">{subtitles.cues.length} cues loaded</p>
              {/if}
            </div>

            <!-- Enable/Disable -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Status</span>
              <button
                onclick={() => (subtitles.enabled = !subtitles.enabled)}
                class="w-full px-3 py-2 text-sm border transition-colors {subtitles.enabled ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)' : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text-muted)'}"
                disabled={subtitles.cues.length === 0}
              >
                {subtitles.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <!-- Time Offset -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Time Offset: {subtitles.timeOffset.toFixed(1)}s</span>
              <div class="flex items-center gap-2">
                <button
                  onclick={() => (subtitles.timeOffset -= 0.5)}
                  class="px-2 py-1 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text) hover:border-(--color-accent)"
                >
                  -0.5s
                </button>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  bind:value={subtitles.timeOffset}
                  class="h-1 flex-1 cursor-pointer appearance-none bg-(--color-border) accent-(--color-accent)"
                />
                <button
                  onclick={() => (subtitles.timeOffset += 0.5)}
                  class="px-2 py-1 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text) hover:border-(--color-accent)"
                >
                  +0.5s
                </button>
              </div>
            </div>

            <!-- Speed Factor -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium">Speed Factor: {subtitles.speedFactor.toFixed(2)}x</span>
                <button onclick={() => (subtitles.speedFactor = 1)} class="text-xs text-(--color-accent) hover:underline">Reset</button>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.01"
                bind:value={subtitles.speedFactor}
                class="h-1 w-full cursor-pointer appearance-none bg-(--color-border) accent-(--color-accent)"
              />
              <div class="mt-1 flex justify-between text-xs text-(--color-text-muted)">
                <span>0.5x</span>
                <span>1.5x</span>
              </div>
            </div>

            <!-- Font Size -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Font Size</span>
              <div class="flex gap-1">
                {#each (["small", "medium", "large", "xlarge"] as SubtitleSize[]) as size}
                  <button
                    onclick={() => (subtitles.fontSize = size)}
                    class="flex-1 px-2 py-1 text-sm border transition-colors {subtitles.fontSize === size ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)' : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text)'}"
                  >
                    {size.charAt(0).toUpperCase()}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Font Family -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Font Family</span>
              <select
                value={subtitles.fontFamily}
                onchange={(e) => (subtitles.fontFamily = (e.target as HTMLSelectElement).value as SubtitleFont)}
                class="w-full px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-accent)"
              >
                {#each (["inter", "consolas", "roboto", "asap"] as SubtitleFont[]) as font}
                  <option value={font}>{fontFamilyMap[font].name}</option>
                {/each}
              </select>
            </div>

            <!-- Position Y -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium">Position: {subtitles.positionY}%</span>
                <button onclick={() => (subtitles.positionY = 85)} class="text-xs text-(--color-accent) hover:underline">Reset</button>
              </div>
              <input
                type="range"
                min="5"
                max="95"
                step="1"
                bind:value={subtitles.positionY}
                class="h-1 w-full cursor-pointer appearance-none bg-(--color-border) accent-(--color-accent)"
              />
              <div class="mt-1 flex justify-between text-xs text-(--color-text-muted)">
                <span>Top</span>
                <span>Bottom</span>
              </div>
            </div>

            <!-- Text Color -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Text Color</span>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  bind:value={subtitles.textColor}
                  class="h-8 w-8 cursor-pointer border border-(--color-border) bg-transparent"
                />
                <input
                  type="text"
                  bind:value={subtitles.textColor}
                  class="flex-1 px-2 py-1 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text) font-mono outline-none focus:border-(--color-accent)"
                />
              </div>
            </div>

            <!-- Background Color & Opacity -->
            <div class="p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-muted) font-medium mb-2 block">Background</span>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  bind:value={subtitles.backgroundColor}
                  class="h-8 w-8 cursor-pointer border border-(--color-border) bg-transparent"
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  bind:value={subtitles.backgroundOpacity}
                  class="h-1 flex-1 cursor-pointer appearance-none bg-(--color-border) accent-(--color-accent)"
                />
                <span class="text-sm text-(--color-text-muted) w-12 text-right">{Math.round(subtitles.backgroundOpacity * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Keyboard Shortcuts -->
    <details class="mt-4 border border-(--color-border) bg-(--color-bg-alt)">
      <summary class="cursor-pointer p-4 text-sm font-medium text-(--color-text) hover:bg-(--color-bg) transition-colors">Keyboard Shortcuts</summary>
      <div class="border-t border-(--color-border) p-4">
        <div class="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:grid-cols-4">
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">Space</kbd> <span class="text-(--color-text-muted)">Play/Pause</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">← →</kbd> <span class="text-(--color-text-muted)">Seek ±5s</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">↑ ↓</kbd> <span class="text-(--color-text-muted)">Volume</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">M</kbd> <span class="text-(--color-text-muted)">Mute</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">F</kbd> <span class="text-(--color-text-muted)">Fullscreen</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">L</kbd> <span class="text-(--color-text-muted)">Loop</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">, .</kbd> <span class="text-(--color-text-muted)">Frame step</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">[ ]</kbd> <span class="text-(--color-text-muted)">Speed</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">P</kbd> <span class="text-(--color-text-muted)">PiP</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">0</kbd> <span class="text-(--color-text-muted)">Go to start</span></div>
          <div><kbd class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-xs font-mono">- +</kbd> <span class="text-(--color-text-muted)">Zoom (image)</span></div>
        </div>
      </div>
    </details>
  {/if}
</div>
