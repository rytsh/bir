<script lang="ts">
  import { onDestroy } from "svelte";
  import { SAMPLE_SVG, SVG_PRESETS } from "./constants";
  import type {
    AudioAsset,
    AudioClip,
    AudioClipView,
    AudioDragSnapshot,
    BackgroundMode,
    Clip,
    ClipKeyframe,
    ClipView,
    DragClipSnapshot,
    DragMode,
    ExportFormat,
    MockupPreset,
    OverlayItem,
    OverlayDragSnapshot,
    OverlayKeyframe,
    OverlayKind,
    OverlayRenderSegment,
    VideoAsset,
    ZoomDragSnapshot,
    ZoomEasing,
    ZoomFragment,
  } from "./types";
  import {
    clamp,
    evenDimension,
    formatFileSize,
    formatOverlayBackground,
    formatSecondsForFfmpeg,
    formatTime,
    getBaseName,
    makeId,
  } from "./utils";

  interface VideoRenderSegment {
    clips: ClipView[];
    start: number;
    end: number;
    time: number;
  }

  interface ClipFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
  }

  interface ClipRenderFrame extends ClipFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    rotatedX: number;
    rotatedY: number;
    rotatedWidth: number;
    rotatedHeight: number;
  }

  interface PreviewClipSnapshot {
    clip: ClipView;
    frame: ClipFrame;
    pointerX: number;
    pointerY: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    resizeHandle: OverlayResizeHandle;
  }

  interface PreviewOverlaySnapshot {
    overlay: OverlayItem;
    pointerX: number;
    pointerY: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    resizeHandle: OverlayResizeHandle;
  }

  type MediaPoolTab = "media" | "effects" | "text";
  type TimelineVideoFormat = "mp4" | "webm";
  type OverlayResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

  interface MediaFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    contentX: number;
    contentY: number;
    contentWidth: number;
    contentHeight: number;
    scale: number;
    rotation: number;
  }

  const OUTPUT_SIZE_PRESETS = [
    { id: "source", label: "Source", width: 0, height: 0 },
    { id: "youtube", label: "YouTube 16:9", width: 1920, height: 1080 },
    { id: "shorts", label: "Shorts/Reels", width: 1080, height: 1920 },
    { id: "square", label: "Instagram Square", width: 1080, height: 1080 },
    { id: "story", label: "Story 9:16", width: 1080, height: 1920 },
    { id: "landscape", label: "Instagram Wide", width: 1080, height: 608 },
  ];

  const CLIP_EFFECT_PRESETS = [
    { label: "Clean", brightness: 0, contrast: 1, saturation: 1, blur: 0, grayscale: false },
    { label: "Punchy", brightness: 0.04, contrast: 1.22, saturation: 1.24, blur: 0, grayscale: false },
    { label: "Warm", brightness: 0.03, contrast: 1.08, saturation: 1.18, blur: 0, grayscale: false },
    { label: "Noir", brightness: -0.02, contrast: 1.32, saturation: 0, blur: 0, grayscale: true },
    { label: "Soft Blur", brightness: 0.02, contrast: 0.94, saturation: 1.02, blur: 2, grayscale: false },
  ];

  const TEXT_PRESETS = [
    { label: "Title", text: "Big title", fontSize: 88, weight: "800" as const, transparent: true },
    { label: "Subtitle", text: "Subtitle text", fontSize: 42, weight: "600" as const, transparent: true },
    { label: "Lower third", text: "Name · Detail", fontSize: 44, weight: "800" as const, transparent: false },
    { label: "Callout", text: "Watch this", fontSize: 54, weight: "800" as const, transparent: false },
  ];

  const BACKGROUND_PRESETS = [
    { label: "Ink", mode: "gradient" as const, color: "#0f172a", color2: "#38bdf8", angle: 135 },
    { label: "Sunset", mode: "gradient" as const, color: "#7c2d12", color2: "#f97316", angle: 125 },
    { label: "Aurora", mode: "gradient" as const, color: "#111827", color2: "#a855f7", angle: 145 },
    { label: "Clean", mode: "solid" as const, color: "#f8fafc", color2: "#f8fafc", angle: 0 },
  ];

  const MOCKUP_PRESETS: { id: MockupPreset; label: string }[] = [
    { id: "none", label: "None" },
    { id: "chrome", label: "Chrome" },
    { id: "safari", label: "Safari" },
    { id: "macos", label: "macOS" },
    { id: "iphone", label: "iPhone" },
  ];

  const ZOOM_EASINGS: { id: ZoomEasing; label: string }[] = [
    { id: "smooth", label: "Smooth" },
    { id: "linear", label: "Linear" },
    { id: "ease-in", label: "Ease in" },
    { id: "ease-out", label: "Ease out" },
  ];

  const TIMELINE_RULER_HEIGHT = 32;
  const GRAPHICS_LANE_HEIGHT = 34;
  const ZOOM_LANE_HEIGHT = 34;
  const VIDEO_LANE_HEIGHT = 58;
  const AUDIO_LANE_HEIGHT = 44;
  const WEBM_INFO_SCAN_BYTES = 8 * 1024 * 1024;
  const WEBM_TAIL_SCAN_BYTES = 32 * 1024 * 1024;
  const WEBM_FULL_SCAN_BYTES = 96 * 1024 * 1024;
  const OVERLAY_RESIZE_HANDLES: {
    id: OverlayResizeHandle;
    label: string;
    x: number;
    y: number;
    scaleX: -1 | 0 | 1;
    scaleY: -1 | 0 | 1;
    cursor: string;
  }[] = [
    { id: "nw", label: "top left", x: 0, y: 0, scaleX: -1, scaleY: -1, cursor: "nwse-resize" },
    { id: "n", label: "top", x: 50, y: 0, scaleX: 0, scaleY: -1, cursor: "ns-resize" },
    { id: "ne", label: "top right", x: 100, y: 0, scaleX: 1, scaleY: -1, cursor: "nesw-resize" },
    { id: "e", label: "right", x: 100, y: 50, scaleX: 1, scaleY: 0, cursor: "ew-resize" },
    { id: "se", label: "bottom right", x: 100, y: 100, scaleX: 1, scaleY: 1, cursor: "nwse-resize" },
    { id: "s", label: "bottom", x: 50, y: 100, scaleX: 0, scaleY: 1, cursor: "ns-resize" },
    { id: "sw", label: "bottom left", x: 0, y: 100, scaleX: -1, scaleY: 1, cursor: "nesw-resize" },
    { id: "w", label: "left", x: 0, y: 50, scaleX: -1, scaleY: 0, cursor: "ew-resize" },
  ];

  interface OverlayFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
  }

  let videoInput = $state<HTMLInputElement | null>(null);
  let audioInput = $state<HTMLInputElement | null>(null);
  let svgInput = $state<HTMLInputElement | null>(null);
  let imageInput = $state<HTMLInputElement | null>(null);
  let backgroundInput = $state<HTMLInputElement | null>(null);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let timelineElement = $state<HTMLDivElement | null>(null);
  let previewElement = $state<HTMLDivElement | null>(null);
  let deliverEditElement = $state<HTMLDivElement | null>(null);

  let videos = $state<VideoAsset[]>([]);
  let audios = $state<AudioAsset[]>([]);
  let selectedAssetId = $state<string | null>(null);
  let playhead = $state(0);
  let isPlaying = $state(false);
  let isDraggingOver = $state(false);

  let clips = $state<Clip[]>([]);
  let audioClips = $state<AudioClip[]>([]);
  let selectedClipId = $state<string | null>(null);
  let selectedAudioClipId = $state<string | null>(null);
  let overlays = $state<OverlayItem[]>([]);
  let selectedOverlayId = $state<string | null>(null);
  let zoomFragments = $state<ZoomFragment[]>([]);
  let selectedZoomId = $state<string | null>(null);

  let dragMode = $state<DragMode>(null);
  let dragClipId = $state<string | null>(null);
  let dragOverlayId = $state<string | null>(null);
  let dragClipSnapshot: DragClipSnapshot | null = null;
  let audioDragSnapshot: AudioDragSnapshot | null = null;
  let overlayDragSnapshot: OverlayDragSnapshot | null = null;
  let zoomDragSnapshot: ZoomDragSnapshot | null = null;

  let overlayDragId = $state<string | null>(null);
  let overlayPreviewMode = $state<"move" | "resize" | "rotate" | null>(null);
  let overlayDragOffset = { x: 0, y: 0 };
  let overlayPreviewSnapshot: PreviewOverlaySnapshot | null = null;
  let clipPreviewMode = $state<"move" | "resize" | "rotate" | null>(null);
  let clipPreviewDragId = $state<string | null>(null);
  let clipPreviewDragOffset = { x: 0, y: 0 };
  let clipPreviewSnapshot: PreviewClipSnapshot | null = null;
  const clipPreviewElements = new Map<string, HTMLVideoElement>();
  const finalPreviewClipElements = new Map<string, HTMLVideoElement>();
  const expandedFinalPreviewClipElements = new Map<string, HTMLVideoElement>();

  let ffmpegInstance: import("@ffmpeg/ffmpeg").FFmpeg | null = null;
  let ffmpegInitialized = $state(false);
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let exportStatus = $state("");
  let exportFormat = $state<ExportFormat>("mp4");
  let exportCrf = $state(23);
  let exportedUrl = $state("");
  let exportedName = $state("");
  let error = $state("");
  let isGraphicModalOpen = $state(false);
  let isFinalPreviewExpanded = $state(false);
  let mediaPoolTab = $state<MediaPoolTab>("media");
  let outputSizePreset = $state("source");
  let outputWidth = $state(1920);
  let outputHeight = $state(1080);
  let outputFrameRate = $state(30);
  let programWidth = $state(1920);
  let programHeight = $state(1080);
  let backgroundMode = $state<BackgroundMode>("gradient");
  let backgroundColor = $state("#0f172a");
  let backgroundColor2 = $state("#38bdf8");
  let backgroundAngle = $state(135);
  let backgroundImageSrc = $state("");
  let backgroundBlur = $state(0);
  let stagePadding = $state(10);
  let stageRounded = $state(18);
  let stageShadow = $state(35);
  let mediaScale = $state(1);
  let mediaOffsetX = $state(0);
  let mediaOffsetY = $state(0);
  let mediaRotation = $state(0);
  let mockupPreset = $state<MockupPreset>("none");
  let recordSystemAudio = $state(true);
  let isRecording = $state(false);
  let recordingCountdown = $state(0);
  let recordingStatus = $state("");
  let mediaRecorder: MediaRecorder | null = null;
  let recordingStream: MediaStream | null = null;
  let recordingChunks: Blob[] = [];

  let clipViews = $derived.by(() => {
    return clips.map((clip, index) => {
      const clipDuration = getClipDuration(clip);
      const view: ClipView = {
        ...clip,
        index,
        duration: clipDuration,
        sequenceStart: clip.start,
        sequenceEnd: clip.start + clipDuration,
      };
      return view;
    });
  });

  let audioClipViews = $derived.by(() =>
    audioClips.map((clip) => {
      const rawDuration = clip.sourceEnd - clip.sourceStart;
      const duration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
      const view: AudioClipView = {
        ...clip,
        duration,
        sequenceStart: clip.start,
        sequenceEnd: clip.start + duration,
      };
      return view;
    })
  );

  let timelineDuration = $derived.by(() => {
    const videoEnd = clipViews.reduce((max, clip) => maxFiniteDuration(max, clip.sequenceEnd), 0);
    const audioEnd = audioClipViews.reduce((max, clip) => maxFiniteDuration(max, clip.sequenceEnd), 0);
    const overlayEnd = overlays.reduce((max, overlay) => maxFiniteDuration(max, overlay.end), 0);
    const zoomEnd = zoomFragments.reduce((max, zoom) => maxFiniteDuration(max, zoom.end), 0);
    return Math.max(videoEnd, audioEnd, overlayEnd, zoomEnd, 0);
  });

  let timelineDisplayDuration = $derived.by(() => {
    const clipGhostEnd = clipViews.reduce((max, clip) => {
      const sourceDuration = getClipSourceDuration(clip);
      return Math.max(max, clip.sequenceStart - clip.sourceStart + sourceDuration);
    }, timelineDuration);
    const audioEnd = audioClipViews.reduce((max, clip) => Math.max(max, clip.sequenceEnd), 0);
    const overlayEnd = overlays.reduce((max, overlay) => Math.max(max, overlay.end), 0);
    const zoomEnd = zoomFragments.reduce((max, zoom) => Math.max(max, zoom.end), 0);
    return Math.max(timelineDuration, clipGhostEnd, audioEnd, overlayEnd, zoomEnd, 1);
  });

  let videoLaneCount = $derived(Math.max(clipViews.length, 1));
  let graphicsLaneCount = $derived(Math.max(overlays.length, 1));
  let zoomLaneCount = $derived(Math.max(zoomFragments.length, 1));
  let audioLaneCount = $derived(Math.max(audioClipViews.length, 1));
  let timelineContentWidth = $derived(Math.max(900, Math.ceil(timelineDisplayDuration * 96)));
  let graphicsLaneTop = $derived(TIMELINE_RULER_HEIGHT);
  let zoomLaneTop = $derived(TIMELINE_RULER_HEIGHT + graphicsLaneCount * GRAPHICS_LANE_HEIGHT);
  let videoLaneTop = $derived(zoomLaneTop + zoomLaneCount * ZOOM_LANE_HEIGHT);
  let audioLaneTop = $derived(videoLaneTop + videoLaneCount * VIDEO_LANE_HEIGHT);
  let timelineContentHeight = $derived(TIMELINE_RULER_HEIGHT + graphicsLaneCount * GRAPHICS_LANE_HEIGHT + zoomLaneCount * ZOOM_LANE_HEIGHT + videoLaneCount * VIDEO_LANE_HEIGHT + audioLaneCount * AUDIO_LANE_HEIGHT);

  let selectedClip = $derived.by(() =>
    clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null
  );

  let selectedClipView = $derived.by(() =>
    clipViews.find((clip) => clip.id === selectedClipId) ?? clipViews[0] ?? null
  );

  let selectedAudioClip = $derived.by(() =>
    audioClips.find((clip) => clip.id === selectedAudioClipId) ?? null
  );

  let activeClipView = $derived.by(() => findClipViewAt(playhead));

  let selectedAsset = $derived.by(() =>
    videos.find((video) => video.id === selectedAssetId) ?? videos[0] ?? null
  );

  let activeAsset = $derived.by(() =>
    activeClipView ? getVideoAsset(activeClipView.assetId) : clips.length === 0 ? selectedAsset : null
  );

  let selectedOverlay = $derived.by(() =>
    overlays.find((overlay) => overlay.id === selectedOverlayId) ?? null
  );

  let selectedZoom = $derived.by(() =>
    zoomFragments.find((zoom) => zoom.id === selectedZoomId) ?? null
  );

  let totalSourceSize = $derived.by(() => videos.reduce((total, video) => total + video.file.size, 0));
  let totalAudioSize = $derived.by(() => audios.reduce((total, audio) => total + audio.file.size, 0));
  let hasTimelineContent = $derived.by(() =>
    timelineDuration > 0 && (
      clipViews.some((clip) => clip.duration > 0) ||
      audioClipViews.some((clip) => clip.duration > 0) ||
      overlays.some((overlay) => overlay.end > overlay.start) ||
      zoomFragments.some((zoom) => zoom.end > zoom.start)
    )
  );
  let canExport = $derived(Boolean(hasTimelineContent && !isExporting));
  let expandedFinalProgress = $derived(timelineDuration > 0 ? clamp((playhead / timelineDuration) * 100, 0, 100) : 0);

  let timelinePlaybackFrame = 0;
  let timelinePlaybackStartedAt = 0;
  let timelinePlaybackStart = 0;

  $effect(() => {
    if (!exportedUrl) return;

    return () => {
      URL.revokeObjectURL(exportedUrl);
    };
  });

  $effect(() => {
    if (!dragMode) return;

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp, { once: true });
    window.addEventListener("pointercancel", handleGlobalPointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  });

  $effect(() => {
    playhead;
    clipViews;
    if (videos.length === 0 || isPlaying) return;
    syncPreviewToPlayhead(false);
  });

  onDestroy(() => {
    cancelTimelinePlaybackFrame();
    pauseClipPreviewElements();
    stopRecordingStream();
    for (const video of videos) {
      URL.revokeObjectURL(video.url);
    }
    for (const audio of audios) {
      URL.revokeObjectURL(audio.url);
    }
  });

  function getVideoAsset(assetId: string): VideoAsset | null {
    return videos.find((video) => video.id === assetId) ?? null;
  }

  function getAudioAsset(assetId: string): AudioAsset | null {
    return audios.find((audio) => audio.id === assetId) ?? null;
  }

  function getClipSourceDuration(clip: Clip): number {
    const duration = getVideoAsset(clip.assetId)?.duration ?? 0;
    return isPositiveFinite(duration) ? duration : 0;
  }

  function getClipSourceName(clip: Clip): string {
    return getVideoAsset(clip.assetId)?.name ?? "Missing source";
  }

  function getAudioClipSourceDuration(clip: AudioClip): number {
    const duration = getAudioAsset(clip.assetId)?.duration ?? 0;
    return isPositiveFinite(duration) ? duration : 0;
  }

  function getAudioClipSourceName(clip: AudioClip): string {
    return getAudioAsset(clip.assetId)?.name ?? "Missing audio";
  }

  function getClipDuration(clip: Clip): number {
    const duration = clip.sourceEnd - clip.sourceStart;
    return Number.isFinite(duration) ? Math.max(0, duration) : 0;
  }

  function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
  }

  function maxFiniteDuration(current: number, next: number): number {
    return isPositiveFinite(next) ? Math.max(current, next) : current;
  }

  function findClipViewAt(time: number): ClipView | null {
    if (clipViews.length === 0) return null;
    const maxTime = Math.max(timelineDuration - 0.001, 0);
    const safeTime = clamp(time, 0, maxTime);
    return [...clipViews].reverse().find((clip) => safeTime >= clip.sequenceStart && safeTime < clip.sequenceEnd) ?? null;
  }

  function getVisibleClipViewsAt(time: number): ClipView[] {
    const maxTime = Math.max(timelineDuration - 0.001, 0);
    const safeTime = clamp(time, 0, maxTime);
    return clipViews.filter((clip) => safeTime >= clip.sequenceStart && safeTime < clip.sequenceEnd);
  }

  function sourceTimeForPlayhead(time: number): number {
    const clip = findClipViewAt(time);
    if (!clip) return 0;
    return clamp(
      clip.sourceStart + (time - clip.sequenceStart),
      clip.sourceStart,
      Math.max(clip.sourceStart, clip.sourceEnd - 0.001)
    );
  }

  function cancelTimelinePlaybackFrame(): void {
    if (!timelinePlaybackFrame) return;
    cancelAnimationFrame(timelinePlaybackFrame);
    timelinePlaybackFrame = 0;
  }

  function startTimelineClockPlayback(): void {
    cancelTimelinePlaybackFrame();
    timelinePlaybackStartedAt = performance.now();
    timelinePlaybackStart = playhead;
    isPlaying = true;
    syncPreviewToPlayhead(true);

    const tick = (now: number) => {
      if (!isPlaying) {
        timelinePlaybackFrame = 0;
        return;
      }

      playhead = clamp(timelinePlaybackStart + (now - timelinePlaybackStartedAt) / 1000, 0, timelineDuration);
      if (playhead >= timelineDuration) {
        isPlaying = false;
        pauseClipPreviewElements();
        timelinePlaybackFrame = 0;
        return;
      }

      timelinePlaybackFrame = requestAnimationFrame(tick);
    };

    timelinePlaybackFrame = requestAnimationFrame(tick);
  }

  function seekTo(time: number): void {
    if (timelineDuration <= 0) return;
    playhead = clamp(time, 0, timelineDuration);
    syncPreviewToPlayhead(false);
  }

  function scrubExpandedFinalPreview(event: Event): void {
    if (timelineDuration <= 0) return;
    const wasPlaying = isPlaying;
    const input = event.currentTarget as HTMLInputElement;
    playhead = clamp(parseFloat(input.value) || 0, 0, timelineDuration);
    if (wasPlaying) {
      timelinePlaybackStartedAt = performance.now();
      timelinePlaybackStart = playhead;
      syncPreviewToPlayhead(true);
      return;
    }

    syncPreviewToPlayhead(false);
  }

  function syncPreviewToPlayhead(shouldPlay: boolean): void {
    const visibleClips = getVisibleClipViewsAt(playhead);
    syncClipPreviewElements(clipPreviewElements, visibleClips, shouldPlay);
    syncClipPreviewElements(finalPreviewClipElements, visibleClips, shouldPlay);
    syncClipPreviewElements(expandedFinalPreviewClipElements, visibleClips, shouldPlay);

    if (!shouldPlay) return;
    if (visibleClips.length === 0 && clips.length > 0) return;
    isPlaying = true;
  }

  function syncClipPreviewElements(elements: Map<string, HTMLVideoElement>, visibleClips: ClipView[], shouldPlay: boolean): void {
    for (const [clipId, element] of elements) {
      const clip = visibleClips.find((item) => item.id === clipId);
      if (clip) syncClipPreviewElement(element, clip, shouldPlay);
      else element.pause();
    }
  }

  function pauseClipPreviewElements(): void {
    for (const element of clipPreviewElements.values()) {
      element.pause();
    }
    for (const element of finalPreviewClipElements.values()) {
      element.pause();
    }
    for (const element of expandedFinalPreviewClipElements.values()) {
      element.pause();
    }
  }

  function syncClipPreviewElement(element: HTMLVideoElement, clip: ClipView, shouldPlay: boolean): void {
    const asset = getVideoAsset(clip.assetId);
    if (!asset) return;

    const sourceTime = clamp(
      clip.sourceStart + (playhead - clip.sequenceStart),
      clip.sourceStart,
      Math.max(clip.sourceStart, clip.sourceEnd - 0.001)
    );
    const applyTime = () => {
      if (Math.abs(element.currentTime - sourceTime) > 0.08) {
        element.currentTime = clamp(sourceTime, 0, Math.max(asset.duration - 0.001, 0));
      }
      if (shouldPlay) {
        void element.play()
          .then(() => {
            isPlaying = true;
          })
          .catch(() => {
            isPlaying = false;
            error = "The browser blocked playback. Click the preview and try again.";
          });
      }
    };

    if (element.src !== asset.url) {
      element.pause();
      element.src = asset.url;
      element.load();
    }

    if (element.readyState >= 1) {
      applyTime();
    } else {
      element.addEventListener("loadedmetadata", applyTime, { once: true });
    }
  }

  function clipPreviewNode(node: HTMLVideoElement, clip: ClipView) {
    clipPreviewElements.set(clip.id, node);
    syncClipPreviewElement(node, clip, isPlaying);
    return {
      update(nextClip: ClipView) {
        clipPreviewElements.set(nextClip.id, node);
        syncClipPreviewElement(node, nextClip, isPlaying);
      },
      destroy() {
        node.pause();
        clipPreviewElements.delete(clip.id);
      },
    };
  }

  function finalPreviewClipNode(node: HTMLVideoElement, clip: ClipView) {
    finalPreviewClipElements.set(clip.id, node);
    syncClipPreviewElement(node, clip, isPlaying);
    return {
      update(nextClip: ClipView) {
        finalPreviewClipElements.set(nextClip.id, node);
        syncClipPreviewElement(node, nextClip, isPlaying);
      },
      destroy() {
        node.pause();
        finalPreviewClipElements.delete(clip.id);
      },
    };
  }

  function expandedFinalPreviewClipNode(node: HTMLVideoElement, clip: ClipView) {
    expandedFinalPreviewClipElements.set(clip.id, node);
    syncClipPreviewElement(node, clip, isPlaying);
    return {
      update(nextClip: ClipView) {
        expandedFinalPreviewClipElements.set(nextClip.id, node);
        syncClipPreviewElement(node, nextClip, isPlaying);
      },
      destroy() {
        node.pause();
        expandedFinalPreviewClipElements.delete(clip.id);
      },
    };
  }

  function updateClip(id: string, updates: Partial<Clip>): void {
    clips = clips.map((clip) => (clip.id === id ? { ...clip, ...updates } : clip));
    if (timelineDuration > 0) {
      playhead = clamp(playhead, 0, timelineDuration);
    }
  }

  function getDefaultClipFrame(time: number): ClipFrame {
    const frame = getMediaFrameAtTime(time);
    const width = clamp((frame.contentWidth * frame.scale) / 100, 0.05, 1);
    const height = clamp((frame.contentHeight * frame.scale) / 100, 0.05, 1);
    const x = clamp(frame.contentX / 100 - (width - frame.contentWidth / 100) / 2, 0, Math.max(0, 1 - width));
    const y = clamp(frame.contentY / 100 - (height - frame.contentHeight / 100) / 2, 0, Math.max(0, 1 - height));
    return {
      x,
      y,
      width,
      height,
      rotation: frame.rotation,
      opacity: 1,
    };
  }

  function getClipBaseFrame(clip: Clip, time: number): ClipFrame {
    const fallback = getDefaultClipFrame(time);
    return {
      x: clip.x ?? fallback.x,
      y: clip.y ?? fallback.y,
      width: clip.width ?? fallback.width,
      height: clip.height ?? fallback.height,
      rotation: clip.rotation ?? fallback.rotation,
      opacity: clip.opacity ?? fallback.opacity,
    };
  }

  function getSortedClipKeyframes(clip: Clip): ClipKeyframe[] {
    return [...(clip.keyframes ?? [])].sort((a, b) => a.time - b.time);
  }

  function clipFrameFromKeyframe(keyframe: ClipKeyframe): ClipFrame {
    return {
      x: keyframe.x,
      y: keyframe.y,
      width: keyframe.width,
      height: keyframe.height,
      rotation: keyframe.rotation,
      opacity: keyframe.opacity,
    };
  }

  function interpolateClipFrame(from: ClipKeyframe, to: ClipKeyframe, progress: number): ClipFrame {
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      width: from.width + (to.width - from.width) * progress,
      height: from.height + (to.height - from.height) * progress,
      rotation: interpolateRotation(from.rotation, to.rotation, progress),
      opacity: from.opacity + (to.opacity - from.opacity) * progress,
    };
  }

  function getClipFrameAtTime(clip: Clip, time: number): ClipFrame {
    const keyframes = getSortedClipKeyframes(clip);
    if (keyframes.length > 0) {
      if (time <= keyframes[0].time) return clipFrameFromKeyframe(keyframes[0]);
      const last = keyframes[keyframes.length - 1];
      if (time >= last.time) return clipFrameFromKeyframe(last);

      for (let index = 0; index < keyframes.length - 1; index++) {
        const from = keyframes[index];
        const to = keyframes[index + 1];
        if (time < from.time || time > to.time) continue;
        const rawProgress = (time - from.time) / Math.max(to.time - from.time, 0.001);
        return interpolateClipFrame(from, to, smoothStep(clamp(rawProgress, 0, 1)));
      }
    }

    return getClipBaseFrame(clip, time);
  }

  function getDeliverFrameInProgram(): { x: number; y: number; width: number; height: number } {
    const programAspect = Math.max(programWidth, 1) / Math.max(programHeight, 1);
    const outputAspect = Math.max(outputWidth, 1) / Math.max(outputHeight, 1);
    if (outputAspect >= programAspect) {
      const height = clamp(programAspect / outputAspect, 0.01, 1);
      return { x: 0, y: (1 - height) / 2, width: 1, height };
    }

    const width = clamp(outputAspect / programAspect, 0.01, 1);
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }

  function mapFrameToDeliver(frame: ClipFrame): ClipFrame {
    const deliver = getDeliverFrameInProgram();
    return {
      ...frame,
      x: (frame.x - deliver.x) / deliver.width,
      y: (frame.y - deliver.y) / deliver.height,
      width: frame.width / deliver.width,
      height: frame.height / deliver.height,
    };
  }

  function mapFrameFromDeliver(frame: ClipFrame): ClipFrame {
    const deliver = getDeliverFrameInProgram();
    return {
      ...frame,
      x: deliver.x + frame.x * deliver.width,
      y: deliver.y + frame.y * deliver.height,
      width: frame.width * deliver.width,
      height: frame.height * deliver.height,
    };
  }

  function getDeliverGuideStyle(): string {
    const deliver = getDeliverFrameInProgram();
    return `left: ${deliver.x * 100}%; top: ${deliver.y * 100}%; width: ${deliver.width * 100}%; height: ${deliver.height * 100}%;`;
  }

  function getMonitorFrameStyle(width: number, height: number): string {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    const aspect = safeWidth / safeHeight;
    return [
      `aspect-ratio: ${safeWidth} / ${safeHeight}`,
      `width: min(100cqw, calc(100cqh * ${aspect}))`,
      `height: min(100cqh, calc(100cqw / ${aspect}))`,
    ].join("; ");
  }

  function getClipInteractionRect(): DOMRect | null {
    return deliverEditElement?.getBoundingClientRect() ?? previewElement?.getBoundingClientRect() ?? null;
  }

  function getOverlayInteractionRect(): DOMRect | null {
    return getClipInteractionRect();
  }

  function getClipFramePixels(clip: Clip, targetWidth: number, targetHeight: number, time: number, useDeliverFrame = true): ClipRenderFrame {
    const rawFrame = getClipFrameAtTime(clip, time);
    const frame = useDeliverFrame ? mapFrameToDeliver(rawFrame) : rawFrame;
    const width = Math.max(2, evenDimension(frame.width * targetWidth));
    const height = Math.max(2, evenDimension(frame.height * targetHeight));
    const x = frame.x * targetWidth;
    const y = frame.y * targetHeight;
    const radians = (frame.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const rotatedWidth = Math.max(2, evenDimension(width * cos + height * sin));
    const rotatedHeight = Math.max(2, evenDimension(width * sin + height * cos));
    return {
      ...frame,
      x,
      y,
      width,
      height,
      rotatedX: x + width / 2 - rotatedWidth / 2,
      rotatedY: y + height / 2 - rotatedHeight / 2,
      rotatedWidth,
      rotatedHeight,
    };
  }

  function createClipKeyframeFromFrame(clip: Clip, time: number, frame: ClipFrame): ClipKeyframe {
    return {
      id: makeId("clip-keyframe"),
      time: clamp(time, clip.start, clip.start + getClipDuration(clip)),
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rotation: frame.rotation,
      opacity: frame.opacity,
    };
  }

  function upsertClipKeyframe(keyframes: ClipKeyframe[], keyframe: ClipKeyframe): ClipKeyframe[] {
    const existing = keyframes.find((item) => Math.abs(item.time - keyframe.time) < 0.04);
    const next = existing
      ? keyframes.map((item) => (item.id === existing.id ? { ...keyframe, id: existing.id } : item))
      : [...keyframes, keyframe];
    return next.sort((a, b) => a.time - b.time);
  }

  function updateClipFrameAtPlayhead(clip: Clip, updates: Partial<ClipFrame>): void {
    const currentFrame = getClipFrameAtTime(clip, playhead);
    const nextFrame: ClipFrame = {
      ...currentFrame,
      ...updates,
      width: clamp(updates.width ?? currentFrame.width, 0.05, 1),
      height: clamp(updates.height ?? currentFrame.height, 0.05, 1),
      opacity: clamp(updates.opacity ?? currentFrame.opacity, 0.05, 1),
      rotation: normalizeRotation(updates.rotation ?? currentFrame.rotation),
    };
    const patch: Partial<Clip> = {
      x: clamp(nextFrame.x, -1, 1),
      y: clamp(nextFrame.y, -1, 1),
      width: nextFrame.width,
      height: nextFrame.height,
      rotation: nextFrame.rotation,
      opacity: nextFrame.opacity,
    };

    if ((clip.keyframes ?? []).length > 0) {
      patch.keyframes = upsertClipKeyframe(
        clip.keyframes ?? [],
        createClipKeyframeFromFrame(clip, playhead, {
          ...nextFrame,
          x: patch.x ?? nextFrame.x,
          y: patch.y ?? nextFrame.y,
        })
      );
    }

    updateClip(clip.id, patch);
  }

  function updateClipFrameAtPlayheadFromDeliver(clip: Clip, updates: Partial<ClipFrame>): void {
    const currentFrame = mapFrameToDeliver(getClipFrameAtTime(clip, playhead));
    const nextFrame = mapFrameFromDeliver({
      ...currentFrame,
      ...updates,
      width: clamp(updates.width ?? currentFrame.width, 0.05, 4),
      height: clamp(updates.height ?? currentFrame.height, 0.05, 4),
      opacity: clamp(updates.opacity ?? currentFrame.opacity, 0.05, 1),
      rotation: normalizeRotation(updates.rotation ?? currentFrame.rotation),
    });
    updateClipFrameAtPlayhead(clip, nextFrame);
  }

  function updateAudioClip(id: string, updates: Partial<AudioClip>): void {
    audioClips = audioClips.map((clip) => (clip.id === id ? { ...clip, ...updates } : clip));
  }

  function updateOverlay(id: string, updates: Partial<OverlayItem>): void {
    overlays = overlays.map((overlay) =>
      overlay.id === id ? { ...overlay, ...updates } : overlay
    );
  }

  function setOutputSizePreset(presetId: string): void {
    outputSizePreset = presetId;
    if (presetId === "source") {
      syncSourceOutputSize();
      return;
    }

    const preset = OUTPUT_SIZE_PRESETS.find((item) => item.id === presetId);
    if (!preset || preset.width <= 0 || preset.height <= 0) return;
    outputWidth = evenDimension(preset.width);
    outputHeight = evenDimension(preset.height);
  }

  function syncSourceOutputSize(): void {
    const source = videos[0] ?? activeAsset;
    outputWidth = evenDimension(source?.width ?? outputWidth ?? 1920);
    outputHeight = evenDimension(source?.height ?? outputHeight ?? 1080);
  }

  function updateCustomOutputSize(width: number, height: number): void {
    outputSizePreset = "custom";
    outputWidth = evenDimension(clamp(width, 128, 4096));
    outputHeight = evenDimension(clamp(height, 128, 4096));
  }

  function getTimelineVideoFormat(): TimelineVideoFormat {
    return exportFormat === "webm" ? "webm" : "mp4";
  }

  function isStillExportFormat(): boolean {
    return exportFormat === "png" || exportFormat === "webp" || exportFormat === "jpg";
  }

  function getExportMimeType(): string {
    if (exportFormat === "webm") return "video/webm";
    if (exportFormat === "gif") return "image/gif";
    if (exportFormat === "png") return "image/png";
    if (exportFormat === "webp") return "image/webp";
    if (exportFormat === "jpg") return "image/jpeg";
    return "video/mp4";
  }

  function applyBackgroundPreset(preset: (typeof BACKGROUND_PRESETS)[number]): void {
    backgroundMode = preset.mode;
    backgroundColor = preset.color;
    backgroundColor2 = preset.color2;
    backgroundAngle = preset.angle;
  }

  function getStageBackgroundStyle(): string {
    if (backgroundMode === "image" && backgroundImageSrc) {
      return `background-image: url(${backgroundImageSrc}); background-size: cover; background-position: center;`;
    }
    if (backgroundMode === "gradient") {
      return `background: linear-gradient(${backgroundAngle}deg, ${backgroundColor}, ${backgroundColor2});`;
    }
    return `background: ${backgroundColor};`;
  }

  function getFfmpegColor(color: string): string {
    return color.replace("#", "0x");
  }

  function getZoomAtTime(time: number): { scale: number; x: number; y: number } {
    const activeZooms = zoomFragments.filter((zoom) => time >= zoom.start && time <= zoom.end && zoom.end > zoom.start);
    if (activeZooms.length === 0) return { scale: 1, x: 0, y: 0 };
    const zoom = activeZooms[activeZooms.length - 1];
    const rawProgress = clamp((time - zoom.start) / Math.max(zoom.end - zoom.start, 0.001), 0, 1);
    const progress = applyZoomEasing(rawProgress, zoom.easing);
    return {
      scale: 1 + (zoom.scale - 1) * progress,
      x: zoom.x * progress,
      y: zoom.y * progress,
    };
  }

  function applyZoomEasing(value: number, easing: ZoomEasing): number {
    if (easing === "linear") return value;
    if (easing === "ease-in") return value * value;
    if (easing === "ease-out") return 1 - (1 - value) * (1 - value);
    return smoothStep(value);
  }

  function getMockupInsetPercent(): { top: number; right: number; bottom: number; left: number } {
    if (mockupPreset === "chrome" || mockupPreset === "safari" || mockupPreset === "macos") {
      return { top: 9, right: 2, bottom: 2, left: 2 };
    }
    if (mockupPreset === "iphone") {
      return { top: 5, right: 5, bottom: 5, left: 5 };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  function getMediaFrameAtTime(time: number): MediaFrame {
    const zoom = getZoomAtTime(time);
    const safePadding = clamp(stagePadding, 0, 35);
    const boxX = safePadding + mediaOffsetX + zoom.x;
    const boxY = safePadding + mediaOffsetY + zoom.y;
    const boxWidth = Math.max(10, 100 - safePadding * 2);
    const boxHeight = Math.max(10, 100 - safePadding * 2);
    const inset = getMockupInsetPercent();
    return {
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      contentX: boxX + inset.left,
      contentY: boxY + inset.top,
      contentWidth: Math.max(5, boxWidth - inset.left - inset.right),
      contentHeight: Math.max(5, boxHeight - inset.top - inset.bottom),
      scale: mediaScale * zoom.scale,
      rotation: mediaRotation,
    };
  }

  function getMediaFramePixels(targetWidth: number, targetHeight: number, time: number): MediaFrame {
    const frame = getMediaFrameAtTime(time);
    const contentWidth = clamp((frame.contentWidth / 100) * targetWidth, 2, targetWidth * 2);
    const contentHeight = clamp((frame.contentHeight / 100) * targetHeight, 2, targetHeight * 2);
    const scaledContentWidth = contentWidth * frame.scale;
    const scaledContentHeight = contentHeight * frame.scale;
    return {
      ...frame,
      x: clamp((frame.x / 100) * targetWidth, -targetWidth, targetWidth),
      y: clamp((frame.y / 100) * targetHeight, -targetHeight, targetHeight),
      width: clamp((frame.width / 100) * targetWidth, 2, targetWidth * 2),
      height: clamp((frame.height / 100) * targetHeight, 2, targetHeight * 2),
      contentX: clamp((frame.contentX / 100) * targetWidth - (scaledContentWidth - contentWidth) / 2, -targetWidth, targetWidth),
      contentY: clamp((frame.contentY / 100) * targetHeight - (scaledContentHeight - contentHeight) / 2, -targetHeight, targetHeight),
      contentWidth: clamp(scaledContentWidth, 2, targetWidth * 3),
      contentHeight: clamp(scaledContentHeight, 2, targetHeight * 3),
    };
  }

  function getMediaBoxStyle(time = playhead): string {
    const frame = getMediaFrameAtTime(time);
    const shadow = clamp(stageShadow, 0, 100);
    return [
      `left: ${frame.x}%`,
      `top: ${frame.y}%`,
      `width: ${frame.width}%`,
      `height: ${frame.height}%`,
      `transform: rotate(${frame.rotation}deg) scale(${frame.scale})`,
      "transform-origin: center",
      `filter: drop-shadow(0 ${Math.round(shadow / 4)}px ${Math.round(shadow / 1.6)}px rgba(0,0,0,${(0.18 + shadow / 180).toFixed(2)}))`,
    ].join("; ");
  }

  function getMockupShellStyle(): string {
    const radius = mockupPreset === "iphone" ? Math.max(stageRounded, 32) : stageRounded;
    return `border-radius: ${radius}px; overflow: hidden; background: #0f172a;`;
  }

  function getMockupContentStyle(): string {
    const inset = getMockupInsetPercent();
    return `left: ${inset.left}%; top: ${inset.top}%; width: ${100 - inset.left - inset.right}%; height: ${100 - inset.top - inset.bottom}%; border-radius: ${Math.max(0, stageRounded - 8)}px;`;
  }

  function resizeOverlay(overlay: OverlayItem, updates: Partial<Pick<OverlayItem, "width" | "height">>): void {
    const frame = getOverlayFrameAtTime(overlay, playhead);
    const nextWidth = clamp(updates.width ?? frame.width, 0.05, 1);
    const nextHeight = clamp(updates.height ?? frame.height, 0.05, 1);
    updateOverlayFrameAtPlayhead(overlay, {
      width: nextWidth,
      height: nextHeight,
      x: clamp(frame.x, 0, Math.max(0, 1 - nextWidth)),
      y: clamp(frame.y, 0, Math.max(0, 1 - nextHeight)),
    });
  }

  function centerSelectedOverlay(): void {
    if (!selectedOverlay) return;
    const frame = getOverlayFrameAtTime(selectedOverlay, playhead);
    updateOverlayFrameAtPlayhead(selectedOverlay, {
      x: Math.max(0, (1 - frame.width) / 2),
      y: Math.max(0, (1 - frame.height) / 2),
    });
  }

  function fitSelectedOverlay(): void {
    if (!selectedOverlay) return;
    const frame = getOverlayFrameAtTime(selectedOverlay, playhead);
    const visualAspect = Math.max((frame.width * outputWidth) / Math.max(frame.height * outputHeight, 0.001), 0.1);
    const nextWidth = 0.8;
    const nextHeight = clamp((nextWidth * outputWidth) / (visualAspect * outputHeight), 0.08, 0.8);
    updateOverlayFrameAtPlayhead(selectedOverlay, {
      width: nextWidth,
      height: nextHeight,
      x: (1 - nextWidth) / 2,
      y: (1 - nextHeight) / 2,
    });
  }

  function duplicateSelectedOverlay(): void {
    if (!selectedOverlay) return;
    const offsetX = 0.03;
    const offsetY = 0.03;
    const copy: OverlayItem = {
      ...selectedOverlay,
      id: makeId("overlay"),
      label: `${selectedOverlay.label} copy`,
      keyframes: selectedOverlay.keyframes.map((keyframe) => ({
        ...keyframe,
        id: makeId("keyframe"),
        x: clamp(keyframe.x + offsetX, 0, Math.max(0, 1 - keyframe.width)),
        y: clamp(keyframe.y + offsetY, 0, Math.max(0, 1 - keyframe.height)),
      })),
      x: clamp(selectedOverlay.x + offsetX, 0, Math.max(0, 1 - selectedOverlay.width)),
      y: clamp(selectedOverlay.y + offsetY, 0, Math.max(0, 1 - selectedOverlay.height)),
    };
    overlays = [...overlays, copy];
    selectedOverlayId = copy.id;
  }

  function normalizeRotation(rotation: number): number {
    let normalized = ((rotation + 180) % 360) - 180;
    if (normalized < -180) normalized += 360;
    return normalized;
  }

  function normalizeRotationDelta(delta: number): number {
    return ((((delta + 180) % 360) + 360) % 360) - 180;
  }

  function nearestRotationDelta(from: number, to: number): number {
    return normalizeRotationDelta(to - from);
  }

  function interpolateRotation(from: number, to: number, progress: number): number {
    return normalizeRotation(from + nearestRotationDelta(from, to) * progress);
  }

  function getOverlayFrameAtTime(overlay: OverlayItem, time: number): OverlayFrame {
    const keyframes = getSortedOverlayKeyframes(overlay);
    if (keyframes.length > 0) {
      if (time <= keyframes[0].time) return overlayFrameFromKeyframe(keyframes[0]);
      const last = keyframes[keyframes.length - 1];
      if (time >= last.time) return overlayFrameFromKeyframe(last);

      for (let index = 0; index < keyframes.length - 1; index++) {
        const from = keyframes[index];
        const to = keyframes[index + 1];
        if (time < from.time || time > to.time) continue;

        const rawProgress = (time - from.time) / Math.max(to.time - from.time, 0.001);
        const progress = smoothStep(clamp(rawProgress, 0, 1));
        return interpolateOverlayFrame(from, to, progress);
      }
    }

    if (overlay.motionEnabled && overlay.end > overlay.start) {
      const progress = smoothStep(clamp((time - overlay.start) / Math.max(overlay.end - overlay.start, 0.001), 0, 1));
      return {
        x: overlay.motionStartX + (overlay.motionEndX - overlay.motionStartX) * progress,
        y: overlay.motionStartY + (overlay.motionEndY - overlay.motionStartY) * progress,
        width: overlay.width,
        height: overlay.height,
        rotation: overlay.rotation,
        opacity: overlay.opacity,
      };
    }

    return {
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      rotation: overlay.rotation,
      opacity: overlay.opacity,
    };
  }

  function getSortedOverlayKeyframes(overlay: OverlayItem): OverlayKeyframe[] {
    return [...(overlay.keyframes ?? [])].sort((a, b) => a.time - b.time);
  }

  function shiftOverlayKeyframes(keyframes: OverlayKeyframe[], delta: number): OverlayKeyframe[] {
    return keyframes.map((keyframe) => ({ ...keyframe, time: Math.max(0, keyframe.time + delta) }));
  }

  function clampOverlayKeyframes(keyframes: OverlayKeyframe[], start: number, end: number): OverlayKeyframe[] {
    const sorted = keyframes
      .map((keyframe) => ({ ...keyframe, time: clamp(keyframe.time, start, end) }))
      .sort((a, b) => a.time - b.time);
    const next: OverlayKeyframe[] = [];
    for (const keyframe of sorted) {
      const existingIndex = next.findIndex((item) => Math.abs(item.time - keyframe.time) < 0.04);
      if (existingIndex >= 0) next[existingIndex] = keyframe;
      else next.push(keyframe);
    }
    return next;
  }

  function overlayFrameFromKeyframe(keyframe: OverlayKeyframe): OverlayFrame {
    return {
      x: keyframe.x,
      y: keyframe.y,
      width: keyframe.width,
      height: keyframe.height,
      rotation: keyframe.rotation,
      opacity: keyframe.opacity,
    };
  }

  function interpolateOverlayFrame(from: OverlayKeyframe, to: OverlayKeyframe, progress: number): OverlayFrame {
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      width: from.width + (to.width - from.width) * progress,
      height: from.height + (to.height - from.height) * progress,
      rotation: interpolateRotation(from.rotation, to.rotation, progress),
      opacity: from.opacity + (to.opacity - from.opacity) * progress,
    };
  }

  function smoothStep(value: number): number {
    return value * value * (3 - 2 * value);
  }

  function createOverlayKeyframeFromFrame(overlay: OverlayItem, time: number, frame: OverlayFrame): OverlayKeyframe {
    return {
      id: makeId("keyframe"),
      time: clamp(time, overlay.start, overlay.end),
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rotation: frame.rotation,
      opacity: frame.opacity,
    };
  }

  function upsertOverlayKeyframe(keyframes: OverlayKeyframe[], keyframe: OverlayKeyframe): OverlayKeyframe[] {
    const existing = keyframes.find((item) => Math.abs(item.time - keyframe.time) < 0.04);
    const next = existing
      ? keyframes.map((item) => (item.id === existing.id ? { ...keyframe, id: existing.id } : item))
      : [...keyframes, keyframe];
    return next.sort((a, b) => a.time - b.time);
  }

  function updateOverlayFrameAtPlayhead(overlay: OverlayItem, updates: Partial<OverlayFrame>): void {
    const currentFrame = getOverlayFrameAtTime(overlay, playhead);
    const nextFrame: OverlayFrame = {
      ...currentFrame,
      ...updates,
      width: clamp(updates.width ?? currentFrame.width, 0.05, 1),
      height: clamp(updates.height ?? currentFrame.height, 0.05, 1),
      opacity: clamp(updates.opacity ?? currentFrame.opacity, 0.1, 1),
      rotation: normalizeRotation(updates.rotation ?? currentFrame.rotation),
    };

    const patch: Partial<OverlayItem> = {
      x: clamp(nextFrame.x, 0, Math.max(0, 1 - nextFrame.width)),
      y: clamp(nextFrame.y, 0, Math.max(0, 1 - nextFrame.height)),
      width: nextFrame.width,
      height: nextFrame.height,
      rotation: nextFrame.rotation,
      opacity: nextFrame.opacity,
    };

    if ((overlay.keyframes ?? []).length > 0) {
      patch.keyframes = upsertOverlayKeyframe(
        overlay.keyframes,
        createOverlayKeyframeFromFrame(overlay, playhead, {
          ...nextFrame,
          x: patch.x ?? nextFrame.x,
          y: patch.y ?? nextFrame.y,
        })
      );
    }

    updateOverlay(overlay.id, patch);
  }

  function updateOverlayFrameAtPlayheadFromDeliver(overlay: OverlayItem, updates: Partial<OverlayFrame>): void {
    const currentFrame = mapFrameToDeliver(getOverlayFrameAtTime(overlay, playhead));
    const nextFrame = mapFrameFromDeliver({
      ...currentFrame,
      ...updates,
      width: clamp(updates.width ?? currentFrame.width, 0.05, 1),
      height: clamp(updates.height ?? currentFrame.height, 0.05, 1),
      opacity: clamp(updates.opacity ?? currentFrame.opacity, 0.1, 1),
      rotation: normalizeRotation(updates.rotation ?? currentFrame.rotation),
    });

    updateOverlayFrameAtPlayhead(overlay, nextFrame);
  }

  function setMotionStartFromCurrent(): void {
    if (!selectedOverlay) return;
    const frame = getOverlayFrameAtTime(selectedOverlay, playhead);
    updateOverlay(selectedOverlay.id, {
      motionEnabled: true,
      motionStartX: frame.x,
      motionStartY: frame.y,
    });
  }

  function setMotionEndFromCurrent(): void {
    if (!selectedOverlay) return;
    const frame = getOverlayFrameAtTime(selectedOverlay, playhead);
    updateOverlay(selectedOverlay.id, {
      motionEnabled: true,
      motionEndX: frame.x,
      motionEndY: frame.y,
    });
  }

  function clearExport(): void {
    exportedUrl = "";
    exportedName = "";
  }

  async function loadVideos(files: File[]): Promise<void> {
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));
    if (videoFiles.length === 0) {
      error = "Please choose one or more video files.";
      return;
    }

    error = "";
    clearExport();
    isPlaying = false;
    if (videoElement) videoElement.pause();

    const newAssets: VideoAsset[] = [];
    const newClips: Clip[] = [];
    let nextClipStart = timelineDuration;

    for (const file of videoFiles) {
      const url = URL.createObjectURL(file);
      try {
        const metadata = await readVideoMetadata(url, file);
        const asset: VideoAsset = {
          id: makeId("video"),
          file,
          url,
          name: file.name,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
        };
        newAssets.push(asset);
        newClips.push(createClipFromAsset(asset, `${file.name.replace(/\.[^/.]+$/, "") || "Video"}`, nextClipStart));
        nextClipStart += asset.duration;
      } catch (caught) {
        URL.revokeObjectURL(url);
        error = caught instanceof Error ? caught.message : "Could not read video metadata.";
      }
    }

    if (newAssets.length === 0) return;

    videos = [...videos, ...newAssets];
    clips = [...clips, ...newClips];
    selectedAssetId = newAssets[0].id;
    selectedClipId = newClips[0]?.id ?? selectedClipId;

    if (videos.length === newAssets.length) {
      programWidth = evenDimension(newAssets[0].width);
      programHeight = evenDimension(newAssets[0].height);
    }

    if (outputSizePreset === "source" && videos.length === newAssets.length) {
      outputWidth = evenDimension(newAssets[0].width);
      outputHeight = evenDimension(newAssets[0].height);
    }

    if (clips.length === newClips.length) {
      playhead = 0;
      selectedOverlayId = null;
    }

    syncPreviewToPlayhead(false);
  }

  function createClipFromAsset(asset: VideoAsset, label = asset.name, start = timelineDuration): Clip {
    const frame = getDefaultClipFrame(start);
    return {
      id: makeId("clip"),
      assetId: asset.id,
      label,
      start: Math.max(0, start),
      sourceStart: 0,
      sourceEnd: asset.duration,
      volume: 1,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rotation: frame.rotation,
      opacity: 1,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      cropBottom: 0,
      keyframes: [],
      effectBrightness: 0,
      effectContrast: 1,
      effectSaturation: 1,
      effectBlur: 0,
      effectGrayscale: false,
    };
  }

  function getKnownVideoDuration(video: HTMLVideoElement): number {
    const metadataDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const seekableEnd = video.seekable.length > 0 ? video.seekable.end(video.seekable.length - 1) : 0;
    const seekableDuration = Number.isFinite(seekableEnd) && seekableEnd > 0 ? seekableEnd : 0;
    if (metadataDuration > 0 || seekableDuration > 0) return Math.max(metadataDuration, seekableDuration);
    return 0;
  }

  function shouldProbeVideoDuration(file: File, duration: number): boolean {
    const isWebmLike = isWebmLikeFile(file);
    return duration <= 0 || !Number.isFinite(duration) || (isWebmLike && duration <= 1.1);
  }

  function isWebmLikeFile(file: File): boolean {
    return file.type.includes("webm") || file.type.includes("matroska") || /\.(webm|mkv)$/i.test(file.name);
  }

  function estimateVideoDurationFromSize(file: File): number {
    const estimatedSeconds = (file.size * 8) / 2_500_000;
    return clamp(estimatedSeconds, 5, 600);
  }

  function findBytes(data: Uint8Array, pattern: number[], start = 0): number {
    for (let index = start; index <= data.length - pattern.length; index++) {
      let matches = true;
      for (let patternIndex = 0; patternIndex < pattern.length; patternIndex++) {
        if (data[index + patternIndex] !== pattern[patternIndex]) {
          matches = false;
          break;
        }
      }
      if (matches) return index;
    }
    return -1;
  }

  function readEbmlVint(data: Uint8Array, offset: number, removeMarker: boolean): { value: number; length: number } | null {
    const firstByte = data[offset];
    if (!firstByte) return null;

    let mask = 0x80;
    let length = 1;
    while (length <= 8 && (firstByte & mask) === 0) {
      mask >>= 1;
      length += 1;
    }
    if (length > 8 || offset + length > data.length) return null;

    let value = removeMarker ? firstByte & (mask - 1) : firstByte;
    for (let index = 1; index < length; index++) {
      value = value * 256 + data[offset + index];
    }
    return { value, length };
  }

  function readEbmlUnsigned(data: Uint8Array, offset: number, length: number): number {
    let value = 0;
    for (let index = 0; index < length; index++) {
      value = value * 256 + data[offset + index];
    }
    return value;
  }

  function readEbmlFloat(data: Uint8Array, offset: number, length: number): number {
    const view = new DataView(data.buffer, data.byteOffset + offset, length);
    if (length === 4) return view.getFloat32(0, false);
    if (length === 8) return view.getFloat64(0, false);
    return Number.NaN;
  }

  function readElementPayload(data: Uint8Array, idOffset: number, idLength: number): { start: number; size: number } | null {
    const sizeInfo = readEbmlVint(data, idOffset + idLength, true);
    if (!sizeInfo) return null;
    const start = idOffset + idLength + sizeInfo.length;
    if (start > data.length) return null;
    return { start, size: Math.min(sizeInfo.value, data.length - start) };
  }

  function readWebmInfoDuration(data: Uint8Array): { duration: number; timestampScale: number } {
    let timestampScale = 1_000_000;
    const scaleOffset = findBytes(data, [0x2a, 0xd7, 0xb1]);
    const scalePayload = scaleOffset >= 0 ? readElementPayload(data, scaleOffset, 3) : null;
    if (scalePayload && scalePayload.size > 0 && scalePayload.size <= 8) {
      timestampScale = readEbmlUnsigned(data, scalePayload.start, scalePayload.size);
    }

    const durationOffset = findBytes(data, [0x44, 0x89]);
    const durationPayload = durationOffset >= 0 ? readElementPayload(data, durationOffset, 2) : null;
    if (durationPayload && (durationPayload.size === 4 || durationPayload.size === 8)) {
      const durationUnits = readEbmlFloat(data, durationPayload.start, durationPayload.size);
      const duration = (durationUnits * timestampScale) / 1_000_000_000;
      if (Number.isFinite(duration) && duration > 0) return { duration, timestampScale };
    }

    return { duration: 0, timestampScale };
  }

  function readBlockRelativeTimecode(data: Uint8Array, payloadStart: number, payloadSize: number): number | null {
    const trackInfo = readEbmlVint(data, payloadStart, true);
    if (!trackInfo) return null;
    const timecodeOffset = payloadStart + trackInfo.length;
    if (timecodeOffset + 2 > payloadStart + payloadSize || timecodeOffset + 2 > data.length) return null;
    const raw = (data[timecodeOffset] << 8) | data[timecodeOffset + 1];
    return raw & 0x8000 ? raw - 0x10000 : raw;
  }

  function readClusterDuration(data: Uint8Array, clusterOffset: number, nextClusterOffset: number, timestampScale: number): number {
    const clusterPayload = readElementPayload(data, clusterOffset, 4);
    if (!clusterPayload) return 0;

    const clusterEnd = Math.min(nextClusterOffset > clusterOffset ? nextClusterOffset : clusterPayload.start + clusterPayload.size, data.length);
    let offset = clusterPayload.start;
    let clusterTimecode = -1;
    let maxBlockTimecode = 0;

    while (offset < clusterEnd) {
      const idInfo = readEbmlVint(data, offset, false);
      if (!idInfo) {
        offset += 1;
        continue;
      }
      const payload = readElementPayload(data, offset, idInfo.length);
      if (!payload) {
        offset += 1;
        continue;
      }

      if (idInfo.value === 0xe7 && payload.size > 0 && payload.size <= 8) {
        clusterTimecode = readEbmlUnsigned(data, payload.start, payload.size);
      }
      if (idInfo.value === 0xa3 || idInfo.value === 0xa1) {
        const blockTimecode = readBlockRelativeTimecode(data, payload.start, payload.size);
        if (blockTimecode !== null) maxBlockTimecode = Math.max(maxBlockTimecode, blockTimecode);
      }

      offset = payload.start + payload.size;
    }

    if (clusterTimecode < 0) return 0;
    return ((clusterTimecode + maxBlockTimecode) * timestampScale) / 1_000_000_000;
  }

  function readWebmClusterDuration(data: Uint8Array, timestampScale: number): number {
    const clusterPattern = [0x1f, 0x43, 0xb6, 0x75];
    let offset = findBytes(data, clusterPattern);
    let duration = 0;

    while (offset >= 0) {
      const nextOffset = findBytes(data, clusterPattern, offset + clusterPattern.length);
      duration = Math.max(duration, readClusterDuration(data, offset, nextOffset, timestampScale));
      offset = nextOffset;
    }

    return duration;
  }

  async function readWebmDurationFromFile(file: File): Promise<number> {
    if (!isWebmLikeFile(file)) return 0;

    try {
      const headerSize = Math.min(file.size, WEBM_INFO_SCAN_BYTES);
      const headerData = new Uint8Array(await file.slice(0, headerSize).arrayBuffer());
      const info = readWebmInfoDuration(headerData);
      if (info.duration > 0) return info.duration;

      const scanStart = file.size <= WEBM_FULL_SCAN_BYTES ? 0 : Math.max(0, file.size - WEBM_TAIL_SCAN_BYTES);
      const clusterData = scanStart === 0 && headerSize === file.size
        ? headerData
        : new Uint8Array(await file.slice(scanStart).arrayBuffer());
      const duration = readWebmClusterDuration(clusterData, info.timestampScale);
      return duration > 0 ? duration + 0.5 : 0;
    } catch {
      return 0;
    }
  }

  function probeVideoDurationBySeeking(video: HTMLVideoElement): Promise<number> {
    return new Promise((resolve) => {
      let resolved = false;
      const cleanup = () => {
        video.removeEventListener("durationchange", handleDurationChange);
        video.removeEventListener("seeked", finish);
        video.removeEventListener("error", finish);
        window.clearTimeout(timeoutId);
      };
      const finish = () => {
        if (resolved) return;
        resolved = true;
        const duration = getKnownVideoDuration(video);
        cleanup();
        resolve(duration);
      };
      const handleDurationChange = () => {
        if (getKnownVideoDuration(video) > 1.1) finish();
      };
      const timeoutId = window.setTimeout(finish, 2500);

      video.addEventListener("durationchange", handleDurationChange);
      video.addEventListener("seeked", finish, { once: true });
      video.addEventListener("error", finish, { once: true });

      try {
        video.currentTime = 1e101;
      } catch {
        try {
          video.currentTime = Number.MAX_SAFE_INTEGER;
        } catch {
          finish();
        }
      }
    });
  }

  function readVideoMetadata(url: string, file: File): Promise<{ duration: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      let loadedMetadata = false;
      let settled = false;
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };
      const resolveMetadata = (metadata: { duration: number; width: number; height: number }) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(metadata);
      };
      const rejectMetadata = (message = "Could not read video metadata.") => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };
      video.onloadedmetadata = () => {
        loadedMetadata = true;
        void (async () => {
          const width = video.videoWidth || 1920;
          const height = video.videoHeight || 1080;
          const initialDuration = getKnownVideoDuration(video);
          const probedDuration = shouldProbeVideoDuration(file, initialDuration)
            ? await probeVideoDurationBySeeking(video)
            : initialDuration;
          const ebmlDuration = shouldProbeVideoDuration(file, Math.max(initialDuration, probedDuration))
            ? await readWebmDurationFromFile(file)
            : 0;
          const knownDuration = [initialDuration, probedDuration, ebmlDuration].reduce(maxFiniteDuration, 0);
          const duration = knownDuration > 0 ? knownDuration : estimateVideoDurationFromSize(file);

          resolveMetadata({ duration, width, height });
        })().catch((caught) => {
          rejectMetadata(caught instanceof Error ? caught.message : "Could not read video metadata.");
        });
      };
      video.onerror = () => {
        if (loadedMetadata) return;
        void (async () => {
          const ebmlDuration = await readWebmDurationFromFile(file);
          if (ebmlDuration > 0 || isWebmLikeFile(file)) {
            resolveMetadata({
              duration: ebmlDuration > 0 ? ebmlDuration : estimateVideoDurationFromSize(file),
              width: 1920,
              height: 1080,
            });
            return;
          }
          rejectMetadata();
        })().catch(() => rejectMetadata());
      };
      video.src = url;
    });
  }

  function readAudioMetadata(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        audio.removeAttribute("src");
        audio.load();
        resolve(duration);
      };
      audio.onerror = () => {
        audio.removeAttribute("src");
        audio.load();
        reject(new Error("Could not read audio metadata."));
      };
      audio.src = url;
    });
  }

  async function loadAudios(files: File[]): Promise<void> {
    const audioFiles = files.filter((file) => file.type.startsWith("audio/"));
    if (audioFiles.length === 0) {
      error = "Please choose one or more audio files.";
      return;
    }

    error = "";
    clearExport();

    const newAssets: AudioAsset[] = [];
    const newClips: AudioClip[] = [];

    for (const file of audioFiles) {
      const url = URL.createObjectURL(file);
      try {
        const duration = await readAudioMetadata(url);
        const waveform = await createWaveform(file, 64);
        const asset: AudioAsset = {
          id: makeId("audio"),
          file,
          url,
          name: file.name,
          duration,
          waveform,
          source: "imported",
        };
        newAssets.push(asset);
        newClips.push(createAudioClipFromAsset(asset, playhead || timelineDuration));
      } catch (caught) {
        URL.revokeObjectURL(url);
        error = caught instanceof Error ? caught.message : "Could not read audio metadata.";
      }
    }

    if (newAssets.length === 0) return;

    audios = [...audios, ...newAssets];
    audioClips = [...audioClips, ...newClips];
    selectedAudioClipId = newClips[0]?.id ?? selectedAudioClipId;
  }

  function createAudioClipFromAsset(asset: AudioAsset, start = 0): AudioClip {
    return {
      id: makeId("audio-clip"),
      assetId: asset.id,
      label: asset.name.replace(/\.[^/.]+$/, "") || asset.name,
      start: clamp(start, 0, Math.max(timelineDisplayDuration, timelineDuration, 0)),
      sourceStart: 0,
      sourceEnd: asset.duration,
      volume: 1,
    };
  }

  async function createWaveform(file: File, buckets = 64): Promise<number[]> {
    let context: AudioContext | null = null;
    try {
      const AudioContextConstructor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Audio decoding is not available.");
      context = new AudioContextConstructor();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const channel = buffer.getChannelData(0);
      const samplesPerBucket = Math.max(1, Math.floor(channel.length / buckets));
      const peaks = Array.from({ length: buckets }, (_, index) => {
        const start = index * samplesPerBucket;
        const end = Math.min(channel.length, start + samplesPerBucket);
        let peak = 0;
        let squareTotal = 0;
        for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
          const sample = Math.abs(channel[sampleIndex]);
          peak = Math.max(peak, sample);
          squareTotal += sample * sample;
        }
        const rms = Math.sqrt(squareTotal / Math.max(end - start, 1));
        return Math.max(peak * 0.7, rms * 1.7);
      });
      const loudest = Math.max(...peaks);
      if (loudest <= 0.0001) throw new Error("Silent or unreadable audio.");
      return peaks.map((peak) => clamp(Math.sqrt(peak / loudest), 0.08, 1));
    } catch {
      return createSyntheticWaveform(`${file.name}-${file.size}-${file.lastModified}`, buckets);
    } finally {
      if (context) void context.close();
    }
  }

  function createSyntheticWaveform(seed: string, buckets = 64): number[] {
    let hash = seed.split("").reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
    return Array.from({ length: buckets }, (_, index) => {
      hash = (hash * 1664525 + 1013904223) >>> 0;
      const random = hash / 4294967295;
      const phrase = Math.sin(index * 0.32 + (hash % 17)) * 0.24;
      const beat = Math.sin(index * 1.18 + (hash % 29)) * 0.18;
      const envelope = 0.62 + Math.sin((index / Math.max(buckets - 1, 1)) * Math.PI) * 0.26;
      return clamp((0.22 + random * 0.42 + phrase + beat) * envelope, 0.1, 1);
    });
  }

  function resampleWaveform(waveform: number[], buckets: number): number[] {
    if (waveform.length === 0) return createSyntheticWaveform("empty", buckets);
    const samplesPerBucket = waveform.length / buckets;
    return Array.from({ length: buckets }, (_, index) => {
      const start = Math.floor(index * samplesPerBucket);
      const end = Math.max(start + 1, Math.ceil((index + 1) * samplesPerBucket));
      const slice = waveform.slice(start, end);
      const peak = slice.reduce((max, value) => Math.max(max, value), 0);
      return clamp(peak, 0.08, 1);
    });
  }

  function getAudioAssetWaveform(asset: AudioAsset, buckets = 28): number[] {
    const waveform = asset.waveform.length ? asset.waveform : createSyntheticWaveform(asset.name, buckets);
    return resampleWaveform(waveform, buckets);
  }

  function getVideoClipWaveform(clip: ClipView): number[] {
    return createSyntheticWaveform(`${clip.id}-${getClipSourceName(clip)}`, 36);
  }

  function getAudioClipWaveform(clip: AudioClipView): number[] {
    const asset = getAudioAsset(clip.assetId);
    const waveform = asset?.waveform.length ? asset.waveform : createSyntheticWaveform(clip.label, 64);
    const duration = Math.max(asset?.duration ?? clip.duration, 0.001);
    const startIndex = clamp(Math.floor((clip.sourceStart / duration) * waveform.length), 0, waveform.length - 1);
    const endIndex = clamp(Math.ceil((clip.sourceEnd / duration) * waveform.length), startIndex + 1, waveform.length);
    const slice = waveform.slice(startIndex, endIndex);
    return resampleWaveform(slice.length >= 4 ? slice : createSyntheticWaveform(clip.label, 36), 36);
  }

  function handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) void loadVideos(files);
    input.value = "";
  }

  function handleAudioFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) void loadAudios(files);
    input.value = "";
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    isDraggingOver = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.some((file) => file.type.startsWith("video/"))) void loadVideos(files);
    if (files.some((file) => file.type.startsWith("audio/"))) void loadAudios(files);
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    isDraggingOver = true;
  }

  function handleDragLeave(): void {
    isDraggingOver = false;
  }

  function handleTimeUpdate(): void {
    if (!videoElement || !isPlaying || !activeClipView) return;
    const active = activeClipView;

    if (videoElement.currentTime >= active.sourceEnd - 0.035) {
      const nextClip = clipViews[active.index + 1];
      if (nextClip && nextClip.sequenceStart <= active.sequenceEnd + 0.05) {
        playhead = nextClip.sequenceStart;
        syncPreviewToPlayhead(true);
      } else if (active.sequenceEnd < timelineDuration - 0.001) {
        playhead = active.sequenceEnd;
        videoElement.pause();
        startTimelineClockPlayback();
      } else {
        playhead = timelineDuration;
        videoElement.pause();
        isPlaying = false;
        cancelTimelinePlaybackFrame();
      }
      return;
    }

    playhead = clamp(
      active.sequenceStart + (videoElement.currentTime - active.sourceStart),
      0,
      timelineDuration
    );
  }

  async function togglePlayback(): Promise<void> {
    if (timelineDuration <= 0) return;

    if (isPlaying) {
      pauseClipPreviewElements();
      cancelTimelinePlaybackFrame();
      isPlaying = false;
      return;
    }

    if (playhead >= timelineDuration) {
      playhead = 0;
    }

    startTimelineClockPlayback();
  }

  function stopPlayback(): void {
    pauseClipPreviewElements();
    cancelTimelinePlaybackFrame();
    isPlaying = false;
    seekTo(0);
  }

  function timelineTimeFromPointer(event: PointerEvent, durationOverride = timelineDisplayDuration): number {
    if (!timelineElement || durationOverride <= 0) return 0;
    const rect = timelineElement.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return snapTimelineTime(ratio * durationOverride, durationOverride);
  }

  function timelineSecondsFromPixelDelta(pixelDelta: number, durationOverride = timelineDisplayDuration): number {
    if (!timelineElement || durationOverride <= 0) return 0;
    const rect = timelineElement.getBoundingClientRect();
    return (pixelDelta / Math.max(rect.width, 1)) * durationOverride;
  }

  function snapTimelineTime(time: number, durationOverride = timelineDisplayDuration): number {
    const threshold = Math.max(0.08, durationOverride * 0.008);
    const markers = [0, timelineDuration];
    for (const clip of clipViews) markers.push(clip.sequenceStart, clip.sequenceEnd);
    for (const clip of audioClipViews) markers.push(clip.sequenceStart, clip.sequenceEnd);
    for (const overlay of overlays) markers.push(overlay.start, overlay.end);
    for (const zoom of zoomFragments) markers.push(zoom.start, zoom.end);

    const closest = markers.reduce(
      (best, marker) => {
        const distance = Math.abs(marker - time);
        return distance < best.distance ? { marker, distance } : best;
      },
      { marker: time, distance: Number.POSITIVE_INFINITY }
    );

    return closest.distance <= threshold ? closest.marker : time;
  }

  function startTimelineDrag(event: PointerEvent): void {
    event.preventDefault();
    dragMode = "timeline";
    seekTo(timelineTimeFromPointer(event));
  }

  function startPlayheadDrag(event: PointerEvent): void {
    event.stopPropagation();
    startTimelineDrag(event);
  }

  function startTrimDrag(event: PointerEvent, clipId: string, mode: "trim-start" | "trim-end"): void {
    event.preventDefault();
    event.stopPropagation();
    const view = clipViews.find((clip) => clip.id === clipId);
    if (!view) return;
    dragMode = mode;
    dragClipId = clipId;
    selectedClipId = clipId;
    dragClipSnapshot = {
      clip: {
        id: view.id,
        assetId: view.assetId,
        label: view.label,
        start: view.start,
        sourceStart: view.sourceStart,
        sourceEnd: view.sourceEnd,
        volume: view.volume,
        effectBrightness: view.effectBrightness,
        effectContrast: view.effectContrast,
        effectSaturation: view.effectSaturation,
        effectBlur: view.effectBlur,
        effectGrayscale: view.effectGrayscale,
      },
      sequenceStart: view.sequenceStart,
      sequenceEnd: view.sequenceEnd,
      timelineDuration: timelineDisplayDuration,
      pointerClientX: event.clientX,
      pointerOffset: 0,
    };
  }

  function startClipMoveDrag(event: PointerEvent, clipId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const view = clipViews.find((clip) => clip.id === clipId);
    if (!view) return;
    const pointerTime = timelineTimeFromPointer(event);
    dragMode = "move-clip";
    dragClipId = clipId;
    selectedClipId = clipId;
    seekTo(view.sequenceStart);
    dragClipSnapshot = {
      clip: {
        id: view.id,
        assetId: view.assetId,
        label: view.label,
        start: view.start,
        sourceStart: view.sourceStart,
        sourceEnd: view.sourceEnd,
        volume: view.volume,
        effectBrightness: view.effectBrightness,
        effectContrast: view.effectContrast,
        effectSaturation: view.effectSaturation,
        effectBlur: view.effectBlur,
        effectGrayscale: view.effectGrayscale,
      },
      sequenceStart: view.sequenceStart,
      sequenceEnd: view.sequenceEnd,
      timelineDuration: timelineDisplayDuration,
      pointerClientX: event.clientX,
      pointerOffset: pointerTime - view.sequenceStart,
    };
  }

  function startAudioTrimDrag(event: PointerEvent, clipId: string, mode: "audio-trim-start" | "audio-trim-end"): void {
    event.preventDefault();
    event.stopPropagation();
    const view = audioClipViews.find((clip) => clip.id === clipId);
    if (!view) return;
    dragMode = mode;
    dragClipId = clipId;
    selectedAudioClipId = clipId;
    audioDragSnapshot = {
      clip: {
        id: view.id,
        assetId: view.assetId,
        label: view.label,
        start: view.start,
        sourceStart: view.sourceStart,
        sourceEnd: view.sourceEnd,
        volume: view.volume,
      },
      sequenceStart: view.sequenceStart,
      sequenceEnd: view.sequenceEnd,
      timelineDuration: timelineDisplayDuration,
      pointerClientX: event.clientX,
      pointerOffset: 0,
    };
  }

  function startAudioMoveDrag(event: PointerEvent, clipId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const view = audioClipViews.find((clip) => clip.id === clipId);
    if (!view) return;
    const pointerTime = timelineTimeFromPointer(event);
    dragMode = "move-audio";
    dragClipId = clipId;
    selectedAudioClipId = clipId;
    seekTo(Math.min(view.sequenceStart, timelineDuration));
    audioDragSnapshot = {
      clip: {
        id: view.id,
        assetId: view.assetId,
        label: view.label,
        start: view.start,
        sourceStart: view.sourceStart,
        sourceEnd: view.sourceEnd,
        volume: view.volume,
      },
      sequenceStart: view.sequenceStart,
      sequenceEnd: view.sequenceEnd,
      timelineDuration: timelineDisplayDuration,
      pointerClientX: event.clientX,
      pointerOffset: pointerTime - view.sequenceStart,
    };
  }

  function startOverlayTimelineDrag(event: PointerEvent, overlayId: string, mode: "move-overlay" | "overlay-trim-start" | "overlay-trim-end"): void {
    event.preventDefault();
    event.stopPropagation();
    const overlay = overlays.find((item) => item.id === overlayId);
    if (!overlay) return;
    const pointerTime = timelineTimeFromPointer(event);
    dragMode = mode;
    dragOverlayId = overlayId;
    selectedOverlayId = overlayId;
    overlayDragSnapshot = {
      overlay: { ...overlay },
      sequenceStart: overlay.start,
      sequenceEnd: overlay.end,
      timelineDuration: timelineDisplayDuration,
      pointerClientX: event.clientX,
      pointerOffset: pointerTime - overlay.start,
    };
  }

  function startZoomTimelineDrag(event: PointerEvent, zoomId: string, mode: "move-zoom" | "zoom-trim-start" | "zoom-trim-end"): void {
    event.preventDefault();
    event.stopPropagation();
    const zoom = zoomFragments.find((item) => item.id === zoomId);
    if (!zoom) return;
    const pointerTime = timelineTimeFromPointer(event);
    dragMode = mode;
    dragClipId = zoomId;
    selectedZoomId = zoomId;
    zoomDragSnapshot = {
      zoom: { ...zoom },
      sequenceStart: zoom.start,
      sequenceEnd: zoom.end,
      timelineDuration: timelineDisplayDuration,
      pointerClientX: event.clientX,
      pointerOffset: pointerTime - zoom.start,
    };
  }

  function handleGlobalPointerMove(event: PointerEvent): void {
    if (!dragMode) return;
    event.preventDefault();

    if (dragMode === "timeline") {
      seekTo(timelineTimeFromPointer(event));
      return;
    }

    if (dragMode === "move-overlay" || dragMode === "overlay-trim-start" || dragMode === "overlay-trim-end") {
      if (!dragOverlayId || !overlayDragSnapshot) return;
      const original = overlayDragSnapshot.overlay;

      if (dragMode === "move-overlay") {
        const pointerTime = timelineTimeFromPointer(event, overlayDragSnapshot.timelineDuration);
        const duration = Math.max(original.end - original.start, 0.1);
        const nextStart = Math.max(0, pointerTime - overlayDragSnapshot.pointerOffset);
        const delta = nextStart - original.start;
        updateOverlay(dragOverlayId, {
          start: nextStart,
          end: nextStart + duration,
          keyframes: shiftOverlayKeyframes(original.keyframes, delta),
        });
        return;
      }

      const delta = timelineSecondsFromPixelDelta(event.clientX - overlayDragSnapshot.pointerClientX, overlayDragSnapshot.timelineDuration);
      if (dragMode === "overlay-trim-start") {
        const nextStart = clamp(original.start + delta, 0, original.end - 0.1);
        updateOverlay(dragOverlayId, {
          start: nextStart,
          keyframes: clampOverlayKeyframes(original.keyframes, nextStart, original.end),
        });
      } else {
        const nextEnd = Math.max(original.start + 0.1, original.end + delta);
        updateOverlay(dragOverlayId, {
          end: nextEnd,
          keyframes: clampOverlayKeyframes(original.keyframes, original.start, nextEnd),
        });
      }
      return;
    }

    if (dragMode === "move-zoom" || dragMode === "zoom-trim-start" || dragMode === "zoom-trim-end") {
      if (!dragClipId || !zoomDragSnapshot) return;
      const original = zoomDragSnapshot.zoom;

      if (dragMode === "move-zoom") {
        const pointerTime = timelineTimeFromPointer(event, zoomDragSnapshot.timelineDuration);
        const duration = Math.max(original.end - original.start, 0.1);
        const nextStart = Math.max(0, pointerTime - zoomDragSnapshot.pointerOffset);
        updateZoom(dragClipId, { start: nextStart, end: nextStart + duration });
        return;
      }

      const delta = timelineSecondsFromPixelDelta(event.clientX - zoomDragSnapshot.pointerClientX, zoomDragSnapshot.timelineDuration);
      if (dragMode === "zoom-trim-start") {
        updateZoom(dragClipId, { start: clamp(original.start + delta, 0, original.end - 0.1) });
      } else {
        updateZoom(dragClipId, { end: Math.max(original.start + 0.1, original.end + delta) });
      }
      return;
    }

    if (dragMode === "move-audio") {
      if (!dragClipId || !audioDragSnapshot) return;
      const pointerTime = timelineTimeFromPointer(event, audioDragSnapshot.timelineDuration);
      const nextStart = Math.max(0, pointerTime - audioDragSnapshot.pointerOffset);
      updateAudioClip(dragClipId, { start: nextStart });
      return;
    }

    if (dragMode === "audio-trim-start" || dragMode === "audio-trim-end") {
      if (!dragClipId || !audioDragSnapshot) return;
      const delta = timelineSecondsFromPixelDelta(event.clientX - audioDragSnapshot.pointerClientX, audioDragSnapshot.timelineDuration);
      const original = audioDragSnapshot.clip;

      if (dragMode === "audio-trim-start") {
        const nextSourceStart = clamp(original.sourceStart + delta, 0, original.sourceEnd - 0.1);
        const nextStart = Math.max(0, original.start + (nextSourceStart - original.sourceStart));
        updateAudioClip(dragClipId, { sourceStart: nextSourceStart, start: nextStart });
      } else {
        const nextEnd = clamp(original.sourceEnd + delta, original.sourceStart + 0.1, getAudioClipSourceDuration(original));
        updateAudioClip(dragClipId, { sourceEnd: nextEnd });
      }
      return;
    }

    if (!dragClipId || !dragClipSnapshot) return;
    const original = dragClipSnapshot.clip;

    if (dragMode === "move-clip") {
      const pointerTime = timelineTimeFromPointer(event, dragClipSnapshot.timelineDuration);
      const targetStart = Math.max(0, pointerTime - dragClipSnapshot.pointerOffset);
      updateClip(dragClipId, { start: targetStart });
      seekTo(targetStart);
      return;
    }

    const delta = timelineSecondsFromPixelDelta(event.clientX - dragClipSnapshot.pointerClientX, dragClipSnapshot.timelineDuration);

    if (dragMode === "trim-start") {
      const nextSourceStart = clamp(original.sourceStart + delta, 0, original.sourceEnd - 0.1);
      const nextTimelineStart = Math.max(0, original.start + (nextSourceStart - original.sourceStart));
      updateClip(dragClipId, { sourceStart: nextSourceStart, start: nextTimelineStart });
      seekTo(nextTimelineStart);
    }

    if (dragMode === "trim-end") {
      const nextEnd = clamp(original.sourceEnd + delta, original.sourceStart + 0.1, getClipSourceDuration(original));
      updateClip(dragClipId, { sourceEnd: nextEnd });
      seekTo(Math.min(dragClipSnapshot.sequenceStart + getClipDuration({ ...original, sourceEnd: nextEnd }), timelineDuration));
    }
  }

  function handleGlobalPointerUp(): void {
    dragMode = null;
    dragClipId = null;
    dragOverlayId = null;
    dragClipSnapshot = null;
    audioDragSnapshot = null;
    overlayDragSnapshot = null;
    zoomDragSnapshot = null;
  }

  function reorderClipByCenter(clipId: string, targetCenter: number): void {
    const movingClip = clips.find((clip) => clip.id === clipId);
    if (!movingClip) return;

    const referenceViews = clipViews.filter((clip) => clip.id !== clipId);
    let insertAt = referenceViews.findIndex((clip) => targetCenter < clip.sequenceStart + clip.duration / 2);
    if (insertAt === -1) insertAt = referenceViews.length;

    const nextClips = clips.filter((clip) => clip.id !== clipId);
    nextClips.splice(insertAt, 0, movingClip);
    if (nextClips.map((clip) => clip.id).join("|") === clips.map((clip) => clip.id).join("|")) return;

    clips = nextClips;
    selectedClipId = clipId;
  }

  function moveSelectedClip(direction: "earlier" | "later"): void {
    if (!selectedClip) return;
    const currentIndex = clips.findIndex((clip) => clip.id === selectedClip.id);
    if (currentIndex < 0) return;

    const nextIndex = clamp(currentIndex + (direction === "earlier" ? -1 : 1), 0, clips.length - 1);
    if (nextIndex === currentIndex) return;

    const nextClips = [...clips];
    [nextClips[currentIndex], nextClips[nextIndex]] = [nextClips[nextIndex], nextClips[currentIndex]];
    clips = nextClips;
    selectedClipId = selectedClip.id;
  }

  function applyClipEffectPreset(preset: (typeof CLIP_EFFECT_PRESETS)[number]): void {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      effectBrightness: preset.brightness,
      effectContrast: preset.contrast,
      effectSaturation: preset.saturation,
      effectBlur: preset.blur,
      effectGrayscale: preset.grayscale,
    });
  }

  function addTextOverlayPreset(preset: (typeof TEXT_PRESETS)[number]): void {
    const overlay = createOverlay("text");
    overlay.label = preset.label;
    overlay.text = preset.text;
    overlay.fontSize = preset.fontSize;
    overlay.fontWeight = preset.weight;
    overlay.backgroundTransparent = preset.transparent;
    overlays = [...overlays, overlay];
    selectedOverlayId = overlay.id;
    mediaPoolTab = "media";
  }

  function moveSelectedOverlay(direction: "backward" | "forward"): void {
    if (!selectedOverlay) return;
    const currentIndex = overlays.findIndex((overlay) => overlay.id === selectedOverlay.id);
    if (currentIndex < 0) return;

    const nextIndex = clamp(currentIndex + (direction === "forward" ? 1 : -1), 0, overlays.length - 1);
    if (nextIndex === currentIndex) return;

    const nextOverlays = [...overlays];
    [nextOverlays[currentIndex], nextOverlays[nextIndex]] = [nextOverlays[nextIndex], nextOverlays[currentIndex]];
    overlays = nextOverlays;
    selectedOverlayId = selectedOverlay.id;
  }

  function copySelectedClip(): void {
    if (!selectedClip) return;
    const selectedView = clipViews.find((clip) => clip.id === selectedClip.id);
    const copy: Clip = {
      ...selectedClip,
      id: makeId("clip"),
      label: `${selectedClip.label} copy`,
      start: selectedView?.sequenceEnd ?? timelineDuration,
    };
    const selectedIndex = clips.findIndex((clip) => clip.id === selectedClip.id);
    const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : clips.length;
    clips = [...clips.slice(0, insertAt), copy, ...clips.slice(insertAt)];
    selectedClipId = copy.id;
    const copiedView = clipViews.find((clip) => clip.id === copy.id);
    if (copiedView) seekTo(copiedView.sequenceStart);
  }

  function removeSelectedClip(): void {
    if (!selectedClip || clips.length <= 1) return;
    const index = clips.findIndex((clip) => clip.id === selectedClip.id);
    clips = clips.filter((clip) => clip.id !== selectedClip.id);
    selectedClipId = clips[Math.max(0, index - 1)]?.id ?? clips[0]?.id ?? null;
    seekTo(Math.min(playhead, timelineDuration));
  }

  function appendAssetToTimeline(asset: VideoAsset): void {
    const clip = createClipFromAsset(asset, asset.name.replace(/\.[^/.]+$/, "") || asset.name);
    clips = [...clips, clip];
    selectedAssetId = asset.id;
    selectedClipId = clip.id;
  }

  function appendAudioToTimeline(asset: AudioAsset): void {
    const clip = createAudioClipFromAsset(asset, playhead || timelineDuration);
    audioClips = [...audioClips, clip];
    selectedAudioClipId = clip.id;
  }

  function selectAudioAsset(asset: AudioAsset): void {
    const firstClip = audioClipViews.find((clip) => clip.assetId === asset.id);
    if (firstClip) {
      selectedAudioClipId = firstClip.id;
      seekTo(Math.min(firstClip.sequenceStart, timelineDuration));
      return;
    }

    const clip = createAudioClipFromAsset(asset, playhead || timelineDuration);
    audioClips = [...audioClips, clip];
    selectedAudioClipId = clip.id;
  }

  async function detachSelectedClipAudio(): Promise<void> {
    if (!selectedClip || !selectedClipView) return;
    const videoAsset = getVideoAsset(selectedClip.assetId);
    if (!videoAsset) return;

    const audioAsset: AudioAsset = {
      id: makeId("audio"),
      file: videoAsset.file,
      url: URL.createObjectURL(videoAsset.file),
      name: `${selectedClip.label} audio`,
      duration: videoAsset.duration,
      waveform: await createWaveform(videoAsset.file, 64),
      source: "detached",
    };
    const audioClip: AudioClip = {
      id: makeId("audio-clip"),
      assetId: audioAsset.id,
      label: audioAsset.name,
      start: selectedClipView.sequenceStart,
      sourceStart: selectedClip.sourceStart,
      sourceEnd: selectedClip.sourceEnd,
      volume: selectedClip.volume,
    };

    audios = [...audios, audioAsset];
    audioClips = [...audioClips, audioClip];
    selectedAudioClipId = audioClip.id;
    updateClip(selectedClip.id, { volume: 0 });
    clearExport();
  }

  function removeVideoAsset(assetId: string): void {
    const asset = getVideoAsset(assetId);
    if (!asset) return;

    if (videoElement && videoElement.src === asset.url) {
      videoElement.pause();
      videoElement.removeAttribute("src");
      videoElement.load();
    }

    URL.revokeObjectURL(asset.url);
    videos = videos.filter((video) => video.id !== assetId);
    clips = clips.filter((clip) => clip.assetId !== assetId);
    selectedAssetId = videos[0]?.id ?? null;
    selectedClipId = clips[0]?.id ?? null;
    playhead = Math.min(playhead, timelineDuration);

    clearExport();
  }

  function removeAudioAsset(assetId: string): void {
    const asset = getAudioAsset(assetId);
    if (!asset) return;

    URL.revokeObjectURL(asset.url);
    audios = audios.filter((audio) => audio.id !== assetId);
    audioClips = audioClips.filter((clip) => clip.assetId !== assetId);
    selectedAudioClipId = audioClips[0]?.id ?? null;
    clearExport();
  }

  function removeSelectedAudioClip(): void {
    if (!selectedAudioClip) return;
    audioClips = audioClips.filter((clip) => clip.id !== selectedAudioClip.id);
    selectedAudioClipId = audioClips[0]?.id ?? null;
  }

  function splitSelectedAudioAtPlayhead(): void {
    const view = selectedAudioClip
      ? audioClipViews.find((clip) => clip.id === selectedAudioClip.id)
      : audioClipViews.find((clip) => playhead > clip.sequenceStart && playhead < clip.sequenceEnd);
    if (!view) return;
    if (playhead <= view.sequenceStart + 0.1 || playhead >= view.sequenceEnd - 0.1) return;

    const sourceTime = view.sourceStart + (playhead - view.sequenceStart);
    const first: AudioClip = {
      id: view.id,
      assetId: view.assetId,
      label: `${view.label} A`,
      start: view.start,
      sourceStart: view.sourceStart,
      sourceEnd: sourceTime,
      volume: view.volume,
    };
    const second: AudioClip = {
      id: makeId("audio-clip"),
      assetId: view.assetId,
      label: `${view.label} B`,
      start: playhead,
      sourceStart: sourceTime,
      sourceEnd: view.sourceEnd,
      volume: view.volume,
    };

    audioClips = audioClips.flatMap((clip) => (clip.id === view.id ? [first, second] : [clip]));
    selectedAudioClipId = second.id;
  }

  function muteSelectedAudioClip(): void {
    if (!selectedAudioClip) return;
    updateAudioClip(selectedAudioClip.id, { volume: 0 });
  }

  function restoreSelectedAudioClipVolume(): void {
    if (!selectedAudioClip) return;
    updateAudioClip(selectedAudioClip.id, { volume: 1 });
  }

  function clearAllVideos(): void {
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute("src");
      videoElement.load();
    }

    for (const video of videos) {
      URL.revokeObjectURL(video.url);
    }
    for (const audio of audios) {
      URL.revokeObjectURL(audio.url);
    }

    videos = [];
    audios = [];
    clips = [];
    audioClips = [];
    overlays = [];
    zoomFragments = [];
    selectedAssetId = null;
    selectedClipId = null;
    selectedAudioClipId = null;
    selectedOverlayId = null;
    selectedZoomId = null;
    playhead = 0;
    isPlaying = false;
    clearExport();
  }

  function splitAtPlayhead(): void {
    const view = findClipViewAt(playhead);
    if (!view) return;
    const sourceTime = sourceTimeForPlayhead(playhead);
    if (sourceTime <= view.sourceStart + 0.1 || sourceTime >= view.sourceEnd - 0.1) return;

    const first: Clip = {
      ...view,
      id: view.id,
      assetId: view.assetId,
      label: `${view.label} A`,
      start: view.start,
      sourceStart: view.sourceStart,
      sourceEnd: sourceTime,
      volume: view.volume,
      effectBrightness: view.effectBrightness,
      effectContrast: view.effectContrast,
      effectSaturation: view.effectSaturation,
      effectBlur: view.effectBlur,
      effectGrayscale: view.effectGrayscale,
    };
    const second: Clip = {
      ...view,
      id: makeId("clip"),
      assetId: view.assetId,
      label: `${view.label} B`,
      start: playhead,
      sourceStart: sourceTime,
      sourceEnd: view.sourceEnd,
      volume: view.volume,
      effectBrightness: view.effectBrightness,
      effectContrast: view.effectContrast,
      effectSaturation: view.effectSaturation,
      effectBlur: view.effectBlur,
      effectGrayscale: view.effectGrayscale,
    };

    clips = clips.flatMap((clip) => (clip.id === view.id ? [first, second] : [clip]));
    selectedClipId = second.id;
  }

  function setClipStartToPlayhead(): void {
    if (!selectedClipView) return;
    const sourceTime = sourceTimeForPlayhead(playhead);
    const nextStart = clamp(sourceTime, 0, selectedClipView.sourceEnd - 0.1);
    updateClip(selectedClipView.id, { sourceStart: nextStart, start: playhead });
  }

  function updateClipSourceStart(clip: Clip, value: number): void {
    const nextSourceStart = clamp(value, 0, clip.sourceEnd - 0.1);
    updateClip(clip.id, {
      sourceStart: nextSourceStart,
      start: Math.max(0, clip.start + (nextSourceStart - clip.sourceStart)),
    });
  }

  function setClipEndToPlayhead(): void {
    if (!selectedClipView) return;
    const sourceTime = sourceTimeForPlayhead(playhead);
    const nextEnd = clamp(sourceTime, selectedClipView.sourceStart + 0.1, getClipSourceDuration(selectedClipView));
    updateClip(selectedClipView.id, { sourceEnd: nextEnd });
  }

  function addTextOverlay(): void {
    const overlay = createOverlay("text");
    overlays = [...overlays, overlay];
    selectedOverlayId = overlay.id;
    isGraphicModalOpen = false;
  }

  function addSvgOverlay(svg = SAMPLE_SVG, label = "SVG badge"): void {
    const overlay = createOverlay("svg");
    overlay.svg = svg;
    overlay.label = label;
    overlays = [...overlays, overlay];
    selectedOverlayId = overlay.id;
    isGraphicModalOpen = false;
  }

  function addImageOverlay(imageSrc: string, label = "Image layer"): void {
    const overlay = createOverlay("image");
    overlay.imageSrc = imageSrc;
    overlay.label = label;
    overlays = [...overlays, overlay];
    selectedOverlayId = overlay.id;
    isGraphicModalOpen = false;
  }

  function createOverlay(kind: OverlayKind): OverlayItem {
    const start = clamp(playhead, 0, Math.max(timelineDuration - 1, 0));
    const end = clamp(start + 3, Math.min(start + 0.5, timelineDuration), timelineDuration || start + 3);
    return {
      id: makeId("overlay"),
      kind,
      label: kind === "text" ? "Text layer" : kind === "svg" ? "SVG layer" : "Image layer",
      text: kind === "text" ? "Your text" : "",
      svg: kind === "svg" ? SAMPLE_SVG : "",
      imageSrc: "",
      x: 0.28,
      y: 0.18,
      width: kind === "image" ? 0.32 : 0.44,
      height: kind === "image" ? 0.24 : 0.16,
      rotation: 0,
      start,
      end: Math.max(end, start + 0.5),
      color: "#ffffff",
      background: "#000000",
      backgroundOpacity: 0.72,
      backgroundTransparent: false,
      fontSize: 64,
      fontWeight: "800",
      opacity: 1,
      keyframes: [],
      motionEnabled: false,
      motionStartX: 0.28,
      motionStartY: 0.18,
      motionEndX: 0.52,
      motionEndY: 0.18,
    };
  }

  function removeSelectedOverlay(): void {
    if (!selectedOverlay) return;
    overlays = overlays.filter((overlay) => overlay.id !== selectedOverlay.id);
    selectedOverlayId = overlays[0]?.id ?? null;
  }

  function setOverlayStartToPlayhead(): void {
    if (!selectedOverlay) return;
    const nextStart = clamp(playhead, 0, Math.max(selectedOverlay.end - 0.1, 0));
    updateOverlay(selectedOverlay.id, {
      start: nextStart,
      keyframes: clampOverlayKeyframes(selectedOverlay.keyframes, nextStart, selectedOverlay.end),
    });
  }

  function setOverlayEndToPlayhead(): void {
    if (!selectedOverlay) return;
    const nextEnd = clamp(playhead, selectedOverlay.start + 0.1, timelineDuration);
    updateOverlay(selectedOverlay.id, {
      end: nextEnd,
      keyframes: clampOverlayKeyframes(selectedOverlay.keyframes, selectedOverlay.start, nextEnd),
    });
  }

  function updateOverlayStartTime(overlay: OverlayItem, value: number): void {
    const nextStart = clamp(value, 0, Math.max(overlay.end - 0.1, 0));
    updateOverlay(overlay.id, {
      start: nextStart,
      keyframes: clampOverlayKeyframes(overlay.keyframes, nextStart, overlay.end),
    });
  }

  function updateOverlayEndTime(overlay: OverlayItem, value: number): void {
    const nextEnd = Math.max(overlay.start + 0.1, value);
    updateOverlay(overlay.id, {
      end: nextEnd,
      keyframes: clampOverlayKeyframes(overlay.keyframes, overlay.start, nextEnd),
    });
  }

  function addZoomFragment(): void {
    const start = clamp(playhead, 0, Math.max(timelineDuration - 0.5, 0));
    const end = Math.max(start + 1.5, Math.min(start + 2.5, Math.max(timelineDisplayDuration, start + 2.5)));
    const zoom: ZoomFragment = {
      id: makeId("zoom"),
      label: `Zoom ${zoomFragments.length + 1}`,
      start,
      end,
      scale: 1.8,
      x: 0,
      y: 0,
      easing: "smooth",
    };
    zoomFragments = [...zoomFragments, zoom];
    selectedZoomId = zoom.id;
  }

  function updateZoom(id: string, updates: Partial<ZoomFragment>): void {
    zoomFragments = zoomFragments.map((zoom) => (zoom.id === id ? { ...zoom, ...updates } : zoom));
  }

  function removeSelectedZoom(): void {
    if (!selectedZoom) return;
    zoomFragments = zoomFragments.filter((zoom) => zoom.id !== selectedZoom.id);
    selectedZoomId = zoomFragments[0]?.id ?? null;
  }

  function updateZoomStartTime(zoom: ZoomFragment, value: number): void {
    updateZoom(zoom.id, { start: clamp(value, 0, Math.max(zoom.end - 0.1, 0)) });
  }

  function updateZoomEndTime(zoom: ZoomFragment, value: number): void {
    updateZoom(zoom.id, { end: Math.max(zoom.start + 0.1, value) });
  }

  function centerSelectedClip(): void {
    if (!selectedClip) return;
    const frame = getClipFrameAtTime(selectedClip, playhead);
    updateClipFrameAtPlayhead(selectedClip, {
      x: (1 - frame.width) / 2,
      y: (1 - frame.height) / 2,
    });
  }

  function fitSelectedClip(): void {
    if (!selectedClip) return;
    updateClipFrameAtPlayhead(selectedClip, {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
  }

  function addOrUpdateClipKeyframe(): void {
    if (!selectedClip) return;
    const frame = getClipFrameAtTime(selectedClip, playhead);
    updateClip(selectedClip.id, {
      keyframes: upsertClipKeyframe(
        selectedClip.keyframes ?? [],
        createClipKeyframeFromFrame(selectedClip, playhead, frame)
      ),
    });
  }

  function removeClipKeyframe(keyframeId: string): void {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      keyframes: (selectedClip.keyframes ?? []).filter((keyframe) => keyframe.id !== keyframeId),
    });
  }

  function clearClipKeyframes(): void {
    if (!selectedClip) return;
    updateClip(selectedClip.id, { keyframes: [] });
  }

  function updateClipCrop(clip: Clip, edge: "cropLeft" | "cropRight" | "cropTop" | "cropBottom", value: number): void {
    const next = clamp(value, 0, 0.9);
    const current = getClipCropValues(clip);
    const updates: Partial<Clip> = { [edge]: next };
    const horizontal = (edge === "cropLeft" ? next : current.left) + (edge === "cropRight" ? next : current.right);
    const vertical = (edge === "cropTop" ? next : current.top) + (edge === "cropBottom" ? next : current.bottom);
    if (horizontal > 0.95 && (edge === "cropLeft" || edge === "cropRight")) {
      updates[edge === "cropLeft" ? "cropRight" : "cropLeft"] = 0.95 - next;
    }
    if (vertical > 0.95 && (edge === "cropTop" || edge === "cropBottom")) {
      updates[edge === "cropTop" ? "cropBottom" : "cropTop"] = 0.95 - next;
    }
    updateClip(clip.id, updates);
  }

  function addOrUpdateOverlayKeyframe(): void {
    if (!selectedOverlay) return;
    const frame = getOverlayFrameAtTime(selectedOverlay, playhead);
    const time = clamp(playhead, selectedOverlay.start, selectedOverlay.end);
    updateOverlay(selectedOverlay.id, {
      keyframes: upsertOverlayKeyframe(
        selectedOverlay.keyframes,
        createOverlayKeyframeFromFrame(selectedOverlay, time, frame)
      ),
      motionEnabled: false,
    });
  }

  function removeOverlayKeyframe(keyframeId: string): void {
    if (!selectedOverlay) return;
    updateOverlay(selectedOverlay.id, {
      keyframes: selectedOverlay.keyframes.filter((keyframe) => keyframe.id !== keyframeId),
    });
  }

  function clearOverlayKeyframes(): void {
    if (!selectedOverlay) return;
    updateOverlay(selectedOverlay.id, { keyframes: [], motionEnabled: false });
  }

  function isOverlayVisible(overlay: OverlayItem): boolean {
    return playhead >= overlay.start && playhead <= overlay.end;
  }

  function getClipBoxStyle(clip: ClipView, useDeliverFrame = false): string {
    const rawFrame = getClipFrameAtTime(clip, playhead);
    const frame = useDeliverFrame ? mapFrameToDeliver(rawFrame) : rawFrame;
    return [
      `left: ${frame.x * 100}%`,
      `top: ${frame.y * 100}%`,
      `width: ${frame.width * 100}%`,
      `height: ${frame.height * 100}%`,
      `opacity: ${frame.opacity}`,
      `transform: rotate(${frame.rotation}deg)`,
    ].join("; ");
  }

  function getOverlayBoxStyle(overlay: OverlayItem, time = playhead, useDeliverFrame = false): string {
    const rawFrame = getOverlayFrameAtTime(overlay, time);
    const frame = useDeliverFrame ? mapFrameToDeliver(rawFrame) : rawFrame;
    return `left: ${frame.x * 100}%; top: ${frame.y * 100}%; width: ${frame.width * 100}%; height: ${frame.height * 100}%; opacity: ${frame.opacity}; transform: rotate(${frame.rotation}deg);`;
  }

  function getClipCropValues(clip: Clip): { left: number; right: number; top: number; bottom: number } {
    let left = clamp(clip.cropLeft ?? 0, 0, 0.9);
    let right = clamp(clip.cropRight ?? 0, 0, 0.9);
    let top = clamp(clip.cropTop ?? 0, 0, 0.9);
    let bottom = clamp(clip.cropBottom ?? 0, 0, 0.9);
    const horizontalTotal = left + right;
    const verticalTotal = top + bottom;
    if (horizontalTotal > 0.95) {
      const scale = 0.95 / horizontalTotal;
      left *= scale;
      right *= scale;
    }
    if (verticalTotal > 0.95) {
      const scale = 0.95 / verticalTotal;
      top *= scale;
      bottom *= scale;
    }
    return { left, right, top, bottom };
  }

  function getClipCropStyle(clip: Clip): string {
    const crop = getClipCropValues(clip);
    const width = Math.max(0.05, 1 - crop.left - crop.right);
    const height = Math.max(0.05, 1 - crop.top - crop.bottom);
    return [
      `left: ${(-crop.left / width) * 100}%`,
      `top: ${(-crop.top / height) * 100}%`,
      `width: ${(1 / width) * 100}%`,
      `height: ${(1 / height) * 100}%`,
    ].join("; ");
  }

  function startClipPreviewDrag(event: PointerEvent, clip: ClipView): void {
    const rect = getClipInteractionRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    selectedClipId = clip.id;
    selectedOverlayId = null;
    clipPreviewDragId = clip.id;
    clipPreviewMode = "move";
    clipPreviewSnapshot = null;
    const frame = mapFrameToDeliver(getClipFrameAtTime(clip, playhead));
    clipPreviewDragOffset = {
      x: (event.clientX - rect.left) / rect.width - frame.x,
      y: (event.clientY - rect.top) / rect.height - frame.y,
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-browser touch support.
    }
  }

  function createClipPreviewSnapshot(event: PointerEvent, clip: ClipView, resizeHandle: OverlayResizeHandle = "se"): PreviewClipSnapshot | null {
    const rect = getClipInteractionRect();
    if (!rect) return null;
    const frame = mapFrameToDeliver(getClipFrameAtTime(clip, playhead));
    const centerX = rect.left + (frame.x + frame.width / 2) * rect.width;
    const centerY = rect.top + (frame.y + frame.height / 2) * rect.height;
    return {
      clip: { ...clip },
      frame,
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
      resizeHandle,
    };
  }

  function startClipPreviewResizeDrag(event: PointerEvent, clip: ClipView, handle: OverlayResizeHandle): void {
    event.preventDefault();
    event.stopPropagation();
    selectedClipId = clip.id;
    selectedOverlayId = null;
    clipPreviewDragId = clip.id;
    clipPreviewMode = "resize";
    clipPreviewSnapshot = createClipPreviewSnapshot(event, clip, handle);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-browser touch support.
    }
  }

  function startClipPreviewRotateDrag(event: PointerEvent, clip: ClipView): void {
    event.preventDefault();
    event.stopPropagation();
    selectedClipId = clip.id;
    selectedOverlayId = null;
    clipPreviewDragId = clip.id;
    clipPreviewMode = "rotate";
    clipPreviewSnapshot = createClipPreviewSnapshot(event, clip);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-browser touch support.
    }
  }

  function resizeClipFromHandle(event: PointerEvent, clip: ClipView, snapshot: PreviewClipSnapshot, rect: DOMRect): void {
    const handle = getOverlayResizeHandle(snapshot.resizeHandle);
    const frame = snapshot.frame;
    const startWidth = frame.width * rect.width;
    const startHeight = frame.height * rect.height;
    const radians = (frame.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const pointerDeltaX = event.clientX - snapshot.pointerX;
    const pointerDeltaY = event.clientY - snapshot.pointerY;
    const localDeltaX = pointerDeltaX * cos + pointerDeltaY * sin;
    const localDeltaY = -pointerDeltaX * sin + pointerDeltaY * cos;
    let nextWidth = handle.scaleX === 0 ? startWidth : startWidth + handle.scaleX * localDeltaX;
    let nextHeight = handle.scaleY === 0 ? startHeight : startHeight + handle.scaleY * localDeltaY;

    if (event.shiftKey) {
      const aspectRatio = startWidth / Math.max(startHeight, 1);
      if (handle.scaleX === 0 && handle.scaleY !== 0) nextWidth = nextHeight * aspectRatio;
      else if (handle.scaleY === 0 && handle.scaleX !== 0) nextHeight = nextWidth / aspectRatio;
      else {
        const widthChange = Math.abs(nextWidth - startWidth) / Math.max(startWidth, 1);
        const heightChange = Math.abs(nextHeight - startHeight) / Math.max(startHeight, 1);
        if (widthChange >= heightChange) nextHeight = nextWidth / aspectRatio;
        else nextWidth = nextHeight * aspectRatio;
      }
    }

    nextWidth = clamp(nextWidth, rect.width * 0.05, rect.width);
    nextHeight = clamp(nextHeight, rect.height * 0.05, rect.height);
    const widthDelta = nextWidth - startWidth;
    const heightDelta = nextHeight - startHeight;
    const centerShiftX = cos * handle.scaleX * widthDelta * 0.5 - sin * handle.scaleY * heightDelta * 0.5;
    const centerShiftY = sin * handle.scaleX * widthDelta * 0.5 + cos * handle.scaleY * heightDelta * 0.5;
    const nextFrameWidth = nextWidth / rect.width;
    const nextFrameHeight = nextHeight / rect.height;
    const nextCenterX = (snapshot.centerX + centerShiftX - rect.left) / rect.width;
    const nextCenterY = (snapshot.centerY + centerShiftY - rect.top) / rect.height;
    updateClipFrameAtPlayheadFromDeliver(clip, {
      x: nextCenterX - nextFrameWidth / 2,
      y: nextCenterY - nextFrameHeight / 2,
      width: nextFrameWidth,
      height: nextFrameHeight,
    });
  }

  function moveClipPreview(event: PointerEvent): void {
    if (!clipPreviewDragId) return;
    const clip = clipViews.find((item) => item.id === clipPreviewDragId);
    if (!clip) return;
    const rect = getClipInteractionRect();
    if (!rect) return;

    if (clipPreviewMode === "resize" && clipPreviewSnapshot) {
      resizeClipFromHandle(event, clip, clipPreviewSnapshot, rect);
      return;
    }

    if (clipPreviewMode === "rotate" && clipPreviewSnapshot) {
      const angle = Math.atan2(event.clientY - clipPreviewSnapshot.centerY, event.clientX - clipPreviewSnapshot.centerX) * 180 / Math.PI;
      updateClipFrameAtPlayheadFromDeliver(clip, {
        rotation: normalizeRotation(clipPreviewSnapshot.frame.rotation + nearestRotationDelta(clipPreviewSnapshot.startAngle, angle)),
      });
      return;
    }

    const nextX = (event.clientX - rect.left) / rect.width - clipPreviewDragOffset.x;
    const nextY = (event.clientY - rect.top) / rect.height - clipPreviewDragOffset.y;
    updateClipFrameAtPlayheadFromDeliver(clip, { x: nextX, y: nextY });
  }

  function finishClipPreviewDrag(event: PointerEvent): void {
    if (!clipPreviewDragId) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors when the browser already released capture.
    }
    clipPreviewDragId = null;
    clipPreviewMode = null;
    clipPreviewSnapshot = null;
  }

  function startOverlayDrag(event: PointerEvent, overlay: OverlayItem): void {
    const rect = getOverlayInteractionRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    selectedOverlayId = overlay.id;
    overlayDragId = overlay.id;
    overlayPreviewMode = "move";
    overlayPreviewSnapshot = null;

    const position = mapFrameToDeliver(getOverlayFrameAtTime(overlay, playhead));
    overlayDragOffset = {
      x: (event.clientX - rect.left) / rect.width - position.x,
      y: (event.clientY - rect.top) / rect.height - position.y,
    };

    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-browser touch support.
    }
  }

  function createOverlayPreviewSnapshot(event: PointerEvent, overlay: OverlayItem, resizeHandle: OverlayResizeHandle = "se"): PreviewOverlaySnapshot | null {
    const rect = getOverlayInteractionRect();
    if (!rect) return null;
    const frame = mapFrameToDeliver(getOverlayFrameAtTime(overlay, playhead));
    const centerX = rect.left + (frame.x + frame.width / 2) * rect.width;
    const centerY = rect.top + (frame.y + frame.height / 2) * rect.height;
    return {
      overlay: { ...overlay, ...frame },
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
      resizeHandle,
    };
  }

  function startOverlayResizeDrag(event: PointerEvent, overlay: OverlayItem, handle: OverlayResizeHandle): void {
    event.preventDefault();
    event.stopPropagation();
    selectedOverlayId = overlay.id;
    overlayDragId = overlay.id;
    overlayPreviewMode = "resize";
    overlayPreviewSnapshot = createOverlayPreviewSnapshot(event, overlay, handle);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-browser touch support.
    }
  }

  function getOverlayResizeHandle(handle: OverlayResizeHandle): (typeof OVERLAY_RESIZE_HANDLES)[number] {
    return OVERLAY_RESIZE_HANDLES.find((item) => item.id === handle) ?? OVERLAY_RESIZE_HANDLES[4];
  }

  function resizeOverlayFromHandle(event: PointerEvent, overlay: OverlayItem, snapshot: PreviewOverlaySnapshot, rect: DOMRect): void {
    const handle = getOverlayResizeHandle(snapshot.resizeHandle);
    const frame = snapshot.overlay;
    const startWidth = frame.width * rect.width;
    const startHeight = frame.height * rect.height;
    const radians = (frame.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const pointerDeltaX = event.clientX - snapshot.pointerX;
    const pointerDeltaY = event.clientY - snapshot.pointerY;
    const localDeltaX = pointerDeltaX * cos + pointerDeltaY * sin;
    const localDeltaY = -pointerDeltaX * sin + pointerDeltaY * cos;

    let nextWidth = handle.scaleX === 0 ? startWidth : startWidth + handle.scaleX * localDeltaX;
    let nextHeight = handle.scaleY === 0 ? startHeight : startHeight + handle.scaleY * localDeltaY;

    if (event.shiftKey) {
      const aspectRatio = startWidth / Math.max(startHeight, 1);
      if (handle.scaleX === 0 && handle.scaleY !== 0) {
        nextWidth = nextHeight * aspectRatio;
      } else if (handle.scaleY === 0 && handle.scaleX !== 0) {
        nextHeight = nextWidth / aspectRatio;
      } else {
        const widthChange = Math.abs(nextWidth - startWidth) / Math.max(startWidth, 1);
        const heightChange = Math.abs(nextHeight - startHeight) / Math.max(startHeight, 1);
        if (widthChange >= heightChange) nextHeight = nextWidth / aspectRatio;
        else nextWidth = nextHeight * aspectRatio;
      }
    }

    nextWidth = clamp(nextWidth, rect.width * 0.05, rect.width);
    nextHeight = clamp(nextHeight, rect.height * 0.05, rect.height);

    const widthDelta = nextWidth - startWidth;
    const heightDelta = nextHeight - startHeight;
    const centerShiftX = cos * handle.scaleX * widthDelta * 0.5 - sin * handle.scaleY * heightDelta * 0.5;
    const centerShiftY = sin * handle.scaleX * widthDelta * 0.5 + cos * handle.scaleY * heightDelta * 0.5;
    const nextFrameWidth = nextWidth / rect.width;
    const nextFrameHeight = nextHeight / rect.height;
    const nextCenterX = (snapshot.centerX + centerShiftX - rect.left) / rect.width;
    const nextCenterY = (snapshot.centerY + centerShiftY - rect.top) / rect.height;

    updateOverlayFrameAtPlayheadFromDeliver(overlay, {
      x: nextCenterX - nextFrameWidth / 2,
      y: nextCenterY - nextFrameHeight / 2,
      width: nextFrameWidth,
      height: nextFrameHeight,
    });
  }

  function startOverlayRotateDrag(event: PointerEvent, overlay: OverlayItem): void {
    event.preventDefault();
    event.stopPropagation();
    selectedOverlayId = overlay.id;
    overlayDragId = overlay.id;
    overlayPreviewMode = "rotate";
    overlayPreviewSnapshot = createOverlayPreviewSnapshot(event, overlay);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-browser touch support.
    }
  }

  function moveOverlay(event: PointerEvent): void {
    if (!overlayDragId) return;
    const overlay = overlays.find((item) => item.id === overlayDragId);
    if (!overlay) return;

    const rect = getOverlayInteractionRect();
    if (!rect) return;

    if (overlayPreviewMode === "resize" && overlayPreviewSnapshot) {
      resizeOverlayFromHandle(event, overlay, overlayPreviewSnapshot, rect);
      return;
    }

    if (overlayPreviewMode === "rotate" && overlayPreviewSnapshot) {
      const angle = Math.atan2(event.clientY - overlayPreviewSnapshot.centerY, event.clientX - overlayPreviewSnapshot.centerX) * 180 / Math.PI;
      updateOverlayFrameAtPlayheadFromDeliver(overlay, {
        rotation: normalizeRotation(overlayPreviewSnapshot.overlay.rotation + nearestRotationDelta(overlayPreviewSnapshot.startAngle, angle)),
      });
      return;
    }

    const nextX = (event.clientX - rect.left) / rect.width - overlayDragOffset.x;
    const nextY = (event.clientY - rect.top) / rect.height - overlayDragOffset.y;
    const frame = mapFrameToDeliver(getOverlayFrameAtTime(overlay, playhead));

    updateOverlayFrameAtPlayheadFromDeliver(overlay, {
      x: clamp(nextX, 0, Math.max(0, 1 - frame.width)),
      y: clamp(nextY, 0, Math.max(0, 1 - frame.height)),
    });
  }

  function finishOverlayDrag(event: PointerEvent): void {
    if (!overlayDragId) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors when the browser already released capture.
    }
    overlayDragId = null;
    overlayPreviewMode = null;
    overlayPreviewSnapshot = null;
  }

  function handleSvgFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const svg = String(reader.result ?? "");
      if (!svg.includes("<svg")) {
        error = "The selected file does not look like an SVG.";
        return;
      }
      error = "";
      addSvgOverlay(svg, file.name.replace(/\.[^/.]+$/, "") || "SVG layer");
    };
    reader.readAsText(file);
    input.value = "";
  }

  function handleImageFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      error = "Please choose an image file.";
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageSrc = String(reader.result ?? "");
      if (!imageSrc.startsWith("data:image/")) {
        error = "Could not read the selected image.";
        return;
      }
      error = "";
      addImageOverlay(imageSrc, file.name.replace(/\.[^/.]+$/, "") || "Image layer");
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function handleBackgroundFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      error = "Please choose an image file for the background.";
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageSrc = String(reader.result ?? "");
      if (!imageSrc.startsWith("data:image/")) {
        error = "Could not read the selected background image.";
        return;
      }
      backgroundImageSrc = imageSrc;
      backgroundMode = "image";
      error = "";
      clearExport();
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function getSupportedRecordingMimeType(): string {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function startScreenRecording(): Promise<void> {
    if (isRecording || recordingCountdown > 0) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error = "Screen recording is not available in this browser.";
      return;
    }

    try {
      error = "";
      recordingStatus = "Choose a tab, window, or screen.";
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: clamp(outputFrameRate, 12, 60) },
        audio: recordSystemAudio,
      });
      recordingStream = stream;

      for (let count = 3; count > 0; count--) {
        recordingCountdown = count;
        recordingStatus = `Recording starts in ${count}...`;
        await wait(1000);
      }
      recordingCountdown = 0;

      const mimeType = getSupportedRecordingMimeType();
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        void finishScreenRecording(mimeType || "video/webm");
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stopScreenRecording(), { once: true });
      mediaRecorder.start(250);
      isRecording = true;
      recordingStatus = "Recording screen...";
    } catch (caught) {
      recordingCountdown = 0;
      recordingStatus = "";
      stopRecordingStream();
      error = caught instanceof Error ? caught.message : "Could not start screen recording.";
    }
  }

  function stopScreenRecording(): void {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      return;
    }
    stopRecordingStream();
    isRecording = false;
    recordingStatus = "";
  }

  async function finishScreenRecording(mimeType: string): Promise<void> {
    const chunks = recordingChunks;
    recordingChunks = [];
    stopRecordingStream();
    isRecording = false;
    recordingStatus = "Preparing recording...";

    if (chunks.length === 0) {
      recordingStatus = "";
      return;
    }

    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: mimeType });
    const file = new File([blob], `screen-recording-${Date.now()}.${extension}`, { type: mimeType });
    await loadVideos([file]);
    recordingStatus = "Recording added to timeline.";
  }

  function stopRecordingStream(): void {
    for (const track of recordingStream?.getTracks() ?? []) {
      track.stop();
    }
    recordingStream = null;
    mediaRecorder = null;
  }

  async function initFFmpeg(): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
    if (ffmpegInstance && ffmpegInitialized) return ffmpegInstance;

    exportStatus = "Loading FFmpeg WASM...";
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      exportProgress = clamp(Math.round(progress * 100), 0, 100);
    });

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    ffmpegInitialized = true;
    return ffmpeg;
  }

  function createVideoRenderSegments(): VideoRenderSegment[] {
    const markers = new Set<number>([0, timelineDuration]);
    for (const clip of clipViews) {
      if (clip.duration < 0.1) continue;
      markers.add(clamp(clip.sequenceStart, 0, timelineDuration));
      markers.add(clamp(clip.sequenceEnd, 0, timelineDuration));
      const keyframes = getSortedClipKeyframes(clip);
      for (let keyframeIndex = 0; keyframeIndex < keyframes.length; keyframeIndex++) {
        markers.add(clamp(keyframes[keyframeIndex].time, 0, timelineDuration));
        const next = keyframes[keyframeIndex + 1];
        if (!next) continue;
        const duration = Math.max(next.time - keyframes[keyframeIndex].time, 0.001);
        const steps = clamp(Math.ceil(duration * 10), 4, 48);
        for (let step = 1; step < steps; step++) {
          markers.add(clamp(keyframes[keyframeIndex].time + (duration * step) / steps, 0, timelineDuration));
        }
      }
    }
    for (const zoom of zoomFragments) {
      if (zoom.end <= zoom.start) continue;
      const duration = Math.max(zoom.end - zoom.start, 0.001);
      const steps = clamp(Math.ceil(duration * 8), 4, 48);
      for (let index = 0; index <= steps; index++) {
        markers.add(clamp(zoom.start + (duration * index) / steps, 0, timelineDuration));
      }
    }

    const times = Array.from(markers)
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => a - b);

    const segments: VideoRenderSegment[] = [];
    for (let index = 0; index < times.length - 1; index++) {
      const start = times[index];
      const end = times[index + 1];
      if (end - start < 0.05) continue;

      const time = start + (end - start) / 2;
      segments.push({
        clips: getVisibleClipViewsAt(time),
        start,
        end,
        time,
      });
    }

    return segments;
  }

  async function exportVideo(): Promise<void> {
    if (!canExport) return;

    isExporting = true;
    exportProgress = 0;
    exportStatus = "Preparing timeline...";
    error = "";
    clearExport();

    const ffmpegFiles: string[] = [];

    try {
      if (isStillExportFormat()) {
        await exportStillFrame();
        return;
      }

      const ffmpeg = await initFFmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      const backgroundName = "background.png";
      const mockupName = "mockup.png";
      await ffmpeg.writeFile(backgroundName, await renderBackgroundPng(outputWidth, outputHeight));
      ffmpegFiles.push(backgroundName);
      if (mockupPreset !== "none") {
        await ffmpeg.writeFile(mockupName, await renderMockupPng(outputWidth, outputHeight));
        ffmpegFiles.push(mockupName);
      }
      const renderSegments = createVideoRenderSegments();
      const segmentClips = renderSegments.flatMap((segment) => segment.clips);
      if (renderSegments.length === 0) throw new Error("No timeline content to export.");

      const usedAssets = Array.from(new Set(segmentClips.map((clip) => clip.assetId)))
        .map((assetId) => getVideoAsset(assetId))
        .filter((asset): asset is VideoAsset => Boolean(asset));
      const sourceNames = new Map<string, string>();

      for (let index = 0; index < usedAssets.length; index++) {
        const asset = usedAssets[index];
        const inputExt = asset.file.name.split(".").pop()?.toLowerCase() || "mp4";
        const inputName = `input-${index}.${inputExt}`;
        exportStatus = `Loading source ${index + 1} of ${usedAssets.length}...`;
        await ffmpeg.writeFile(inputName, await fetchFile(asset.file));
        sourceNames.set(asset.id, inputName);
        ffmpegFiles.push(inputName);
      }

      const segmentNames: string[] = [];
      const outputExt = getTimelineVideoFormat();

      for (let index = 0; index < renderSegments.length; index++) {
        const segment = renderSegments[index];
        const segmentName = `segment-${index}.${outputExt}`;
        segmentNames.push(segmentName);
        ffmpegFiles.push(segmentName);
        exportStatus = `Rendering timeline segment ${index + 1} of ${renderSegments.length}...`;
        await ffmpeg.exec(buildCompositeSegmentArgs(backgroundName, mockupPreset !== "none" ? mockupName : "", sourceNames, segmentName, segment, outputWidth, outputHeight));
      }

      let sequenceName = segmentNames[0];
      if (segmentNames.length > 1) {
        sequenceName = `sequence.${outputExt}`;
        const listName = "clips.txt";
        const listContent = segmentNames.map((name) => `file '${name}'`).join("\n");
        await ffmpeg.writeFile(listName, new TextEncoder().encode(listContent));
        ffmpegFiles.push(listName, sequenceName);
        exportStatus = "Joining clips...";
        await ffmpeg.exec(buildConcatArgs(listName, sequenceName));
      }

      const usableOverlays = overlays.filter((overlay) => overlay.end > overlay.start);
      let outputName = sequenceName;

      if (usableOverlays.length > 0) {
        outputName = `edited.${outputExt}`;
        ffmpegFiles.push(outputName);
        exportStatus = "Compositing overlays...";

        const overlaySegments = createOverlayRenderSegments(usableOverlays);
        const overlayNames: string[] = [];
        for (let index = 0; index < overlaySegments.length; index++) {
          const overlayName = `overlay-${index}.png`;
          overlayNames.push(overlayName);
          ffmpegFiles.push(overlayName);
          await ffmpeg.writeFile(
            overlayName,
            await renderOverlayPng(overlaySegments[index].overlay, outputWidth, outputHeight, overlaySegments[index].time)
          );
        }

        await ffmpeg.exec(buildOverlayArgs(sequenceName, outputName, overlayNames, overlaySegments));
      }

      const usableAudioClips = audioClipViews.filter((clip) => clip.duration > 0 && getAudioAsset(clip.assetId));
      const usableVideoAudioClips = clipViews.filter((clip) => clip.duration > 0 && clip.volume > 0 && sourceNames.has(clip.assetId));
      if ((usableAudioClips.length > 0 || usableVideoAudioClips.length > 0) && exportFormat !== "gif") {
        exportStatus = "Mixing audio tracks...";
        const audioSourceNames = new Map<string, string>();
        const usedAudioAssets = Array.from(new Set(usableAudioClips.map((clip) => clip.assetId)))
          .map((assetId) => getAudioAsset(assetId))
          .filter((asset): asset is AudioAsset => Boolean(asset));

        for (let index = 0; index < usedAudioAssets.length; index++) {
          const asset = usedAudioAssets[index];
          const inputExt = asset.file.name.split(".").pop()?.toLowerCase() || "mp3";
          const inputName = `audio-${index}.${inputExt}`;
          await ffmpeg.writeFile(inputName, await fetchFile(asset.file));
          audioSourceNames.set(asset.id, inputName);
          ffmpegFiles.push(inputName);
        }

        const audioOutputName = `audio-mix.${outputExt}`;
        ffmpegFiles.push(audioOutputName);
        try {
          await ffmpeg.exec(buildAudioMixArgs(outputName, audioOutputName, audioSourceNames, usableAudioClips, false, sourceNames, usableVideoAudioClips));
        } catch {
          if (usableAudioClips.length === 0) throw new Error("Could not mix embedded video audio. Detach audio first if this source has an unusual audio track.");
          await ffmpeg.exec(buildAudioMixArgs(outputName, audioOutputName, audioSourceNames, usableAudioClips, false));
        }
        outputName = audioOutputName;
      }

      if (exportFormat === "gif") {
        const gifName = "animated.gif";
        ffmpegFiles.push(gifName);
        exportStatus = "Rendering GIF...";
        await ffmpeg.exec([
          "-i",
          outputName,
          "-vf",
          `fps=${Math.min(clamp(outputFrameRate, 12, 60), 24)},scale=${outputWidth}:-1:flags=lanczos`,
          "-loop",
          "0",
          "-y",
          gifName,
        ]);
        outputName = gifName;
      }

      exportStatus = "Finalizing export...";
      const data = await ffmpeg.readFile(outputName);
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const blob = new Blob([bytes], { type: getExportMimeType() });
      exportedName = `${getBaseName(videos[0]?.name ?? "timeline")}-edited.${exportFormat}`;
      exportedUrl = URL.createObjectURL(blob);
      exportProgress = 100;
      exportStatus = "Export ready.";
      downloadExport();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Export failed.";
      exportStatus = "";
    } finally {
      if (ffmpegInstance) {
        await cleanupFfmpegFiles(ffmpegInstance, ffmpegFiles);
      }
      isExporting = false;
    }
  }

  function buildVideoFilter(clip: Clip): string {
    const filters = [
      "setsar=1",
      `fps=${clamp(outputFrameRate, 12, 60)}`,
    ];

    if (clip.effectBrightness !== 0 || clip.effectContrast !== 1 || clip.effectSaturation !== 1) {
      filters.push(`eq=brightness=${clip.effectBrightness.toFixed(2)}:contrast=${clip.effectContrast.toFixed(2)}:saturation=${clip.effectSaturation.toFixed(2)}`);
    }
    if (clip.effectGrayscale) filters.push("hue=s=0");
    if (clip.effectBlur > 0) filters.push(`boxblur=${clip.effectBlur.toFixed(1)}:1`);

    return filters.join(",");
  }

  function getClipCssFilter(clip: Clip | null): string {
    if (!clip) return "none";
    const filters = [
      `brightness(${Math.max(0, 1 + clip.effectBrightness)})`,
      `contrast(${clip.effectContrast})`,
      `saturate(${clip.effectSaturation})`,
    ];
    if (clip.effectGrayscale) filters.push("grayscale(1)");
    if (clip.effectBlur > 0) filters.push(`blur(${clip.effectBlur}px)`);
    return filters.join(" ");
  }

  function buildConcatArgs(listName: string, outputName: string): string[] {
    const outputFormat = getTimelineVideoFormat();
    const args = ["-fflags", "+genpts", "-f", "concat", "-safe", "0", "-i", listName];
    if (outputFormat === "mp4") {
      args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(exportCrf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart");
    } else {
      args.push("-c:v", "libvpx-vp9", "-crf", String(exportCrf + 8), "-b:v", "0", "-c:a", "libopus", "-b:a", "128k");
    }
    args.push("-y", outputName);
    return args;
  }

  function buildCompositeSegmentArgs(
    backgroundName: string,
    mockupName: string,
    sourceNames: Map<string, string>,
    outputName: string,
    segment: VideoRenderSegment,
    targetWidth: number,
    targetHeight: number
  ): string[] {
    const duration = Math.max(segment.end - segment.start, 0.05);
    const outputFormat = getTimelineVideoFormat();
    const args = ["-loop", "1", "-t", formatSecondsForFfmpeg(duration), "-i", backgroundName];

    for (const clip of segment.clips) {
      const inputName = sourceNames.get(clip.assetId);
      if (!inputName) throw new Error(`Missing source for ${clip.label}.`);
      const sourceStart = clip.sourceStart + (segment.start - clip.sequenceStart);
      args.push("-ss", formatSecondsForFfmpeg(sourceStart), "-t", formatSecondsForFfmpeg(duration), "-i", inputName);
    }

    if (mockupName) {
      args.push("-loop", "1", "-t", formatSecondsForFfmpeg(duration), "-i", mockupName);
    }

    args.push("-f", "lavfi", "-t", formatSecondsForFfmpeg(duration), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");

    const filters: string[] = [`[0:v]setpts=PTS-STARTPTS,fps=${clamp(outputFrameRate, 12, 60)},format=rgba[base0]`];
    let previous = "[base0]";

    for (let index = 0; index < segment.clips.length; index++) {
      const clip = segment.clips[index];
      const inputIndex = index + 1;
      const layerLabel = `[clip${index}]`;
      const nextLabel = `[base${index + 1}]`;
      const frame = getClipFramePixels(clip, targetWidth, targetHeight, segment.time);
      const crop = getClipCropValues(clip);
      const cropWidth = Math.max(0.05, 1 - crop.left - crop.right).toFixed(4);
      const cropHeight = Math.max(0.05, 1 - crop.top - crop.bottom).toFixed(4);
      const cropLeft = crop.left.toFixed(4);
      const cropTop = crop.top.toFixed(4);
      const width = Math.max(2, evenDimension(frame.width));
      const height = Math.max(2, evenDimension(frame.height));
      const radians = (frame.rotation * Math.PI) / 180;
      filters.push(
        `[${inputIndex}:v]setpts=PTS-STARTPTS,${buildVideoFilter(clip)},crop=iw*${cropWidth}:ih*${cropHeight}:iw*${cropLeft}:ih*${cropTop},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=rgba,colorchannelmixer=aa=${frame.opacity.toFixed(3)},rotate=${radians.toFixed(6)}:c=none:ow=${Math.max(2, evenDimension(frame.rotatedWidth))}:oh=${Math.max(2, evenDimension(frame.rotatedHeight))}${layerLabel}`
      );
      filters.push(`${previous}${layerLabel}overlay=${Math.round(frame.rotatedX)}:${Math.round(frame.rotatedY)}:eof_action=pass:shortest=0${nextLabel}`);
      previous = nextLabel;
    }

    if (mockupName) {
      const mockupInputIndex = 1 + segment.clips.length;
      filters.push(`[${mockupInputIndex}:v]setpts=PTS-STARTPTS,format=rgba[mockup];${previous}[mockup]overlay=0:0:eof_action=pass:shortest=0[vout]`);
    } else {
      filters.push(`${previous}format=rgba[vout]`);
    }

    const silentAudioIndex = 1 + segment.clips.length + (mockupName ? 1 : 0);
    args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-map", `${silentAudioIndex}:a`);

    if (outputFormat === "mp4") {
      args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(exportCrf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart");
    } else {
      args.push("-c:v", "libvpx-vp9", "-crf", String(exportCrf + 8), "-b:v", "0", "-c:a", "libopus", "-b:a", "128k");
    }

    args.push("-shortest", "-y", outputName);
    return args;
  }

  function buildClipArgs(
    inputName: string,
    backgroundName: string,
    mockupName: string,
    outputName: string,
    clip: Clip,
    targetWidth: number,
    targetHeight: number,
    sourceStart = clip.sourceStart,
    duration = getClipDuration(clip),
    timelineTime = playhead
  ): string[] {
    const videoFilter = buildVideoFilter(clip);
    const frame = getMediaFramePixels(targetWidth, targetHeight, timelineTime);
    const outputFormat = getTimelineVideoFormat();
    const args = [
      "-loop",
      "1",
      "-i",
      backgroundName,
      "-ss",
      formatSecondsForFfmpeg(sourceStart),
      "-i",
      inputName,
      "-t",
      formatSecondsForFfmpeg(duration),
    ];

    if (mockupName) {
      args.push("-loop", "1", "-i", mockupName);
    }

    const scaledWidth = Math.max(2, evenDimension(frame.contentWidth));
    const scaledHeight = Math.max(2, evenDimension(frame.contentHeight));
    const filters = [
      `[0:v]setpts=PTS-STARTPTS,format=rgba[base]`,
      `[1:v]setpts=PTS-STARTPTS,${videoFilter},scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease,pad=${scaledWidth}:${scaledHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[media]`,
      `[base][media]overlay=${Math.round(frame.contentX)}:${Math.round(frame.contentY)}:eof_action=pass:shortest=0${mockupName ? "[stage]" : "[vout]"}`,
    ];
    if (mockupName) {
      filters.push(`[2:v]setpts=PTS-STARTPTS,format=rgba[mockup];[stage][mockup]overlay=0:0:eof_action=pass:shortest=0[vout]`);
    }

    args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-map", "1:a?");

    if (clip.volume !== 1) {
      args.push("-af", `volume=${clip.volume.toFixed(2)}`);
    }

    if (outputFormat === "mp4") {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(exportCrf),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart"
      );
    } else {
      args.push(
        "-c:v",
        "libvpx-vp9",
        "-crf",
        String(exportCrf + 8),
        "-b:v",
        "0",
        "-c:a",
        "libopus",
        "-b:a",
        "128k"
      );
    }

    args.push("-shortest", "-y", outputName);
    return args;
  }

  function buildGapArgs(backgroundName: string, mockupName: string, outputName: string, duration: number, _targetWidth: number, _targetHeight: number, _timelineTime = playhead): string[] {
    const outputFormat = getTimelineVideoFormat();
    const args = [
      "-loop",
      "1",
      "-t",
      formatSecondsForFfmpeg(duration),
      "-i",
      backgroundName,
    ];

    if (mockupName) {
      args.push("-loop", "1", "-t", formatSecondsForFfmpeg(duration), "-i", mockupName);
    }

    args.push(
      "-f",
      "lavfi",
      "-t",
      formatSecondsForFfmpeg(duration),
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
    );

    if (mockupName) {
      args.push("-filter_complex", `[0:v]setpts=PTS-STARTPTS,fps=${clamp(outputFrameRate, 12, 60)},format=rgba[base];[1:v]setpts=PTS-STARTPTS,format=rgba[mockup];[base][mockup]overlay=0:0:eof_action=pass:shortest=0[vout]`, "-map", "[vout]", "-map", "2:a");
    } else {
      args.push(
        "-vf",
        `setpts=PTS-STARTPTS,fps=${clamp(outputFrameRate, 12, 60)}`,
        "-map",
        "0:v:0",
        "-map",
        "1:a"
      );
    }

    args.push(
      "-shortest",
    );

    if (outputFormat === "mp4") {
      args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(exportCrf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart");
    } else {
      args.push("-c:v", "libvpx-vp9", "-crf", String(exportCrf + 8), "-b:v", "0", "-c:a", "libopus", "-b:a", "128k");
    }

    args.push("-y", outputName);
    return args;
  }

  function buildOverlayArgs(
    sequenceName: string,
    outputName: string,
    overlayNames: string[],
    overlaySegments: OverlayRenderSegment[]
  ): string[] {
    const outputFormat = getTimelineVideoFormat();
    const args = ["-i", sequenceName];
    for (const overlayName of overlayNames) {
      args.push("-loop", "1", "-i", overlayName);
    }

    let previous = "[overlayBase]";
    const filters = [`[0:v]setpts=PTS-STARTPTS[overlayBase]`];
    filters.push(...overlaySegments.map((segment, index) => {
      const output = index === overlaySegments.length - 1 ? "[vout]" : `[v${index + 1}]`;
      const input = `[overlay${index}]`;
      const start = formatSecondsForFfmpeg(segment.start);
      const end = formatSecondsForFfmpeg(segment.end);
      const filter = `[${index + 1}:v]setpts=PTS-STARTPTS,format=rgba${input};${previous}${input}overlay=0:0:eof_action=pass:shortest=0:enable='between(t,${start},${end})'${output}`;
      previous = output;
      return filter;
    }));

    args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-map", "0:a?");

    if (outputFormat === "mp4") {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(exportCrf),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart"
      );
    } else {
      args.push("-c:v", "libvpx-vp9", "-crf", String(exportCrf + 8), "-b:v", "0", "-c:a", "copy");
    }

    args.push("-y", outputName);
    return args;
  }

  function createOverlayRenderSegments(usableOverlays: OverlayItem[]): OverlayRenderSegment[] {
    return usableOverlays.flatMap((overlay) => {
      const isAnimated = overlay.motionEnabled || overlay.keyframes.length > 1;
      if (!isAnimated) {
        return [{ overlay, start: overlay.start, end: overlay.end, time: overlay.start }];
      }

      const duration = Math.max(overlay.end - overlay.start, 0.001);
      const steps = clamp(Math.ceil(duration * 12), 8, 72);
      return Array.from({ length: steps }, (_, index) => {
        const start = overlay.start + (duration * index) / steps;
        const end = overlay.start + (duration * (index + 1)) / steps;
        return {
          overlay,
          start,
          end,
          time: start + (end - start) / 2,
        };
      });
    });
  }

  function buildAudioMixArgs(
    videoName: string,
    outputName: string,
    audioSourceNames: Map<string, string>,
    clipsToMix: AudioClipView[],
    includeVideoAudio: boolean,
    videoSourceNames = new Map<string, string>(),
    videoClipsToMix: ClipView[] = []
  ): string[] {
    const args = ["-i", videoName];
    if (!includeVideoAudio) {
      args.push(
        "-f",
        "lavfi",
        "-t",
        formatSecondsForFfmpeg(Math.max(timelineDuration, 0.1)),
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100"
      );
    }

    for (const clip of clipsToMix) {
      const inputName = audioSourceNames.get(clip.assetId);
      if (inputName) args.push("-i", inputName);
    }

    const videoAudioAssetIds = Array.from(new Set(videoClipsToMix.map((clip) => clip.assetId))).filter((assetId) => videoSourceNames.has(assetId));
    const videoAudioInputIndexes = new Map<string, number>();
    let nextVideoAudioInputIndex = (includeVideoAudio ? 1 : 2) + clipsToMix.filter((clip) => audioSourceNames.has(clip.assetId)).length;
    for (const assetId of videoAudioAssetIds) {
      const inputName = videoSourceNames.get(assetId);
      if (!inputName) continue;
      videoAudioInputIndexes.set(assetId, nextVideoAudioInputIndex);
      nextVideoAudioInputIndex += 1;
      args.push("-i", inputName);
    }

    const baseInputIndex = includeVideoAudio ? 0 : 1;
    const audioInputStart = includeVideoAudio ? 1 : 2;
    const filters = [`[${baseInputIndex}:a]volume=1[base]`];
    const labels = ["[base]"];
    let inputOffset = 0;

    for (const clip of clipsToMix) {
      if (!audioSourceNames.has(clip.assetId)) continue;
      const inputIndex = audioInputStart + inputOffset;
      const delayMs = Math.max(0, Math.round(clip.sequenceStart * 1000));
      const label = `[a${inputOffset}]`;
      filters.push(
        `[${inputIndex}:a]atrim=start=${formatSecondsForFfmpeg(clip.sourceStart)}:end=${formatSecondsForFfmpeg(clip.sourceEnd)},asetpts=PTS-STARTPTS,volume=${clip.volume.toFixed(2)},adelay=${delayMs}|${delayMs}${label}`
      );
      labels.push(label);
      inputOffset += 1;
    }

    let videoAudioOffset = 0;
    for (const clip of videoClipsToMix) {
      const inputIndex = videoAudioInputIndexes.get(clip.assetId);
      if (inputIndex === undefined) continue;
      const delayMs = Math.max(0, Math.round(clip.sequenceStart * 1000));
      const label = `[va${videoAudioOffset}]`;
      filters.push(
        `[${inputIndex}:a]atrim=start=${formatSecondsForFfmpeg(clip.sourceStart)}:end=${formatSecondsForFfmpeg(clip.sourceEnd)},asetpts=PTS-STARTPTS,volume=${clip.volume.toFixed(2)},adelay=${delayMs}|${delayMs}${label}`
      );
      labels.push(label);
      videoAudioOffset += 1;
    }

    filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=first:dropout_transition=0[aout]`);
    args.push("-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy");

    if (getTimelineVideoFormat() === "mp4") {
      args.push("-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
    } else {
      args.push("-c:a", "libopus", "-b:a", "160k");
    }

    args.push("-shortest", "-y", outputName);
    return args;
  }

  function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = src;
    });
  }

  async function renderBackgroundPng(targetWidth: number, targetHeight: number): Promise<Uint8Array> {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth || 1920;
    canvas.height = targetHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is not available.");

    if (backgroundMode === "image" && backgroundImageSrc) {
      const image = await loadImageElement(backgroundImageSrc);
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height) * (backgroundBlur > 0 ? 1.08 : 1);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.save();
      if (backgroundBlur > 0) ctx.filter = `blur(${backgroundBlur}px)`;
      ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      ctx.restore();
    } else if (backgroundMode === "gradient") {
      const angle = (backgroundAngle * Math.PI) / 180;
      const x = Math.cos(angle) * canvas.width;
      const y = Math.sin(angle) * canvas.height;
      const gradient = ctx.createLinearGradient(canvas.width / 2 - x / 2, canvas.height / 2 - y / 2, canvas.width / 2 + x / 2, canvas.height / 2 + y / 2);
      gradient.addColorStop(0, backgroundColor);
      gradient.addColorStop(1, backgroundColor2);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to render background."));
      }, "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function renderMockupPng(targetWidth: number, targetHeight: number, time = playhead): Promise<Uint8Array> {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth || 1920;
    canvas.height = targetHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is not available.");
    drawMockupFrame(ctx, getMediaFramePixels(canvas.width, canvas.height, time));
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to render mockup."));
      }, "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function drawMockupFrame(ctx: CanvasRenderingContext2D, frame: MediaFrame): void {
    if (mockupPreset === "none") return;
    const x = frame.x;
    const y = frame.y;
    const width = frame.width;
    const height = frame.height;
    const radius = mockupPreset === "iphone" ? Math.max(stageRounded, 44) : stageRounded;

    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${(0.25 + clamp(stageShadow, 0, 100) / 180).toFixed(2)})`;
    ctx.shadowBlur = clamp(stageShadow, 0, 100) * 0.7;
    ctx.shadowOffsetY = clamp(stageShadow, 0, 100) * 0.2;
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.lineWidth = mockupPreset === "iphone" ? Math.max(8, width * 0.026) : Math.max(2, width * 0.006);
    ctx.strokeStyle = mockupPreset === "safari" ? "#e5e7eb" : mockupPreset === "iphone" ? "#050505" : "#111827";
    ctx.stroke();
    ctx.shadowColor = "transparent";

    if (mockupPreset === "iphone") {
      ctx.lineWidth = Math.max(3, width * 0.01);
      ctx.strokeStyle = "#1f2937";
      drawRoundedRect(ctx, x + width * 0.018, y + height * 0.018, width - width * 0.036, height - height * 0.036, radius - 4);
      ctx.stroke();
      ctx.fillStyle = "#050505";
      drawRoundedRect(ctx, x + width * 0.38, y + height * 0.025, width * 0.24, height * 0.026, 999);
      ctx.fill();
    } else {
      const barHeight = height * 0.08;
      ctx.fillStyle = mockupPreset === "chrome" ? "#e5e7eb" : mockupPreset === "safari" ? "#f8fafc" : "#1f2937";
      drawRoundedRect(ctx, x, y, width, barHeight + radius, radius);
      ctx.fill();
      ctx.fillRect(x, y + barHeight * 0.55, width, barHeight * 0.55);
      const dotColors = ["#ef4444", "#f59e0b", "#22c55e"];
      for (let index = 0; index < 3; index++) {
        ctx.beginPath();
        ctx.fillStyle = dotColors[index];
        ctx.arc(x + width * 0.035 + index * width * 0.025, y + barHeight * 0.48, Math.max(4, width * 0.006), 0, Math.PI * 2);
        ctx.fill();
      }
      if (mockupPreset === "chrome" || mockupPreset === "safari") {
        ctx.fillStyle = mockupPreset === "chrome" ? "#f8fafc" : "#e5e7eb";
        drawRoundedRect(ctx, x + width * 0.18, y + barHeight * 0.22, width * 0.58, barHeight * 0.5, 999);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  async function exportStillFrame(): Promise<void> {
    exportStatus = "Rendering still image...";
    syncPreviewToPlayhead(false);
    await wait(80);

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth || 1920;
    canvas.height = outputHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is not available.");

    const backgroundUrl = URL.createObjectURL(new Blob([await renderBackgroundPng(canvas.width, canvas.height)], { type: "image/png" }));
    const background = await loadImageElement(backgroundUrl);
    URL.revokeObjectURL(backgroundUrl);
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    for (const clip of getVisibleClipViewsAt(playhead)) {
      const element = clipPreviewElements.get(clip.id);
      if (!element || element.readyState < 2) continue;
      const frame = getClipFramePixels(clip, canvas.width, canvas.height, playhead);
      const crop = getClipCropValues(clip);
      const sourceWidth = element.videoWidth || element.clientWidth || 1;
      const sourceHeight = element.videoHeight || element.clientHeight || 1;
      const sx = crop.left * sourceWidth;
      const sy = crop.top * sourceHeight;
      const sw = Math.max(1, sourceWidth * (1 - crop.left - crop.right));
      const sh = Math.max(1, sourceHeight * (1 - crop.top - crop.bottom));
      ctx.save();
      ctx.globalAlpha = frame.opacity;
      ctx.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
      ctx.rotate((frame.rotation * Math.PI) / 180);
      drawRoundedRect(ctx, -frame.width / 2, -frame.height / 2, frame.width, frame.height, stageRounded);
      ctx.clip();
      ctx.drawImage(element, sx, sy, sw, sh, -frame.width / 2, -frame.height / 2, frame.width, frame.height);
      ctx.restore();
    }
    drawMockupFrame(ctx, getMediaFramePixels(canvas.width, canvas.height, playhead));

    for (const overlay of overlays) {
      if (!isOverlayVisible(overlay)) continue;
      const frame = mapFrameToDeliver(getOverlayFrameAtTime(overlay, playhead));
      const x = frame.x * canvas.width;
      const y = frame.y * canvas.height;
      const width = frame.width * canvas.width;
      const height = frame.height * canvas.height;
      const renderOverlay = { ...overlay, opacity: frame.opacity };
      ctx.save();
      ctx.globalAlpha = frame.opacity;
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate((frame.rotation * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);
      if (overlay.kind === "text") drawTextOverlay(ctx, renderOverlay, 0, 0, width, height);
      else if (overlay.kind === "svg") await drawSvgOverlay(ctx, renderOverlay, 0, 0, width, height);
      else await drawImageOverlay(ctx, renderOverlay, 0, 0, width, height);
      ctx.restore();
    }

    const mimeType = getExportMimeType();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to render still image."));
      }, mimeType, 0.92);
    });
    exportedUrl = URL.createObjectURL(blob);
    exportedName = `${getBaseName(videos[0]?.name ?? "timeline")}-frame.${exportFormat}`;
    exportProgress = 100;
    exportStatus = "Image ready.";
    downloadExport();
  }

  async function renderOverlayPng(
    overlay: OverlayItem,
    targetWidth: number,
    targetHeight: number,
    time = overlay.start
  ): Promise<Uint8Array> {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth || 1920;
    canvas.height = targetHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is not available.");

    const frame = mapFrameToDeliver(getOverlayFrameAtTime(overlay, time));
    const x = frame.x * canvas.width;
    const y = frame.y * canvas.height;
    const width = frame.width * canvas.width;
    const height = frame.height * canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = frame.opacity;
    const renderOverlay = { ...overlay, opacity: frame.opacity };

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((frame.rotation * Math.PI) / 180);
    ctx.translate(-width / 2, -height / 2);

    if (overlay.kind === "text") {
      drawTextOverlay(ctx, renderOverlay, 0, 0, width, height);
    } else if (overlay.kind === "svg") {
      await drawSvgOverlay(ctx, renderOverlay, 0, 0, width, height);
    } else {
      await drawImageOverlay(ctx, renderOverlay, 0, 0, width, height);
    }

    ctx.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to render overlay."));
      }, "image/png");
    });

    return new Uint8Array(await blob.arrayBuffer());
  }

  function drawTextOverlay(
    ctx: CanvasRenderingContext2D,
    overlay: OverlayItem,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.save();
    if (!overlay.backgroundTransparent && overlay.backgroundOpacity > 0) {
      ctx.globalAlpha = overlay.opacity * overlay.backgroundOpacity;
      ctx.fillStyle = overlay.background;
      drawRoundedRect(ctx, x, y, width, height, Math.min(width, height) * 0.16);
      ctx.fill();
    }
    ctx.globalAlpha = overlay.opacity;
    ctx.fillStyle = overlay.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${overlay.fontWeight} ${overlay.fontSize}px Inter, Arial, sans-serif`;
    drawWrappedText(ctx, overlay.text, x + width / 2, y + height / 2, width * 0.9, overlay.fontSize * 1.14);
    ctx.restore();
  }

  async function drawSvgOverlay(
    ctx: CanvasRenderingContext2D,
    overlay: OverlayItem,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    const svgBlob = new Blob([overlay.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = await loadImage(url);
      ctx.drawImage(image, x, y, width, height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function drawImageOverlay(
    ctx: CanvasRenderingContext2D,
    overlay: OverlayItem,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    const image = await loadImage(overlay.imageSrc);
    ctx.drawImage(image, x, y, width, height);
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to render overlay image."));
      image.src = src;
    });
  }

  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
  }

  function drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) lines.push(line);
    if (lines.length === 0) lines.push(text);

    const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
    for (let index = 0; index < lines.length; index++) {
      ctx.fillText(lines[index], centerX, startY + index * lineHeight);
    }
  }

  async function cleanupFfmpegFiles(
    ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
    files: string[]
  ): Promise<void> {
    for (const file of Array.from(new Set(files))) {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        // Ignore files that were not created because an earlier FFmpeg step failed.
      }
    }
  }

  function downloadExport(): void {
    if (!exportedUrl || !exportedName) return;
    const link = document.createElement("a");
    link.href = exportedUrl;
    link.download = exportedName;
    link.click();
  }
</script>

<div class="video-editor-shell h-full flex flex-col overflow-hidden border border-(--color-border) bg-(--editor-bg)">
  <input
    bind:this={videoInput}
    type="file"
    accept="video/*"
    multiple
    onchange={handleFileChange}
    class="hidden"
  />
  <input
    bind:this={audioInput}
    type="file"
    accept="audio/*"
    multiple
    onchange={handleAudioFileChange}
    class="hidden"
  />
  <input
    bind:this={svgInput}
    type="file"
    accept=".svg,image/svg+xml"
    onchange={handleSvgFileChange}
    class="hidden"
  />
  <input
    bind:this={imageInput}
    type="file"
    accept="image/*"
    onchange={handleImageFileChange}
    class="hidden"
  />
  <input
    bind:this={backgroundInput}
    type="file"
    accept="image/*"
    onchange={handleBackgroundFileChange}
    class="hidden"
  />

  {#if error}
    <div class="flex-none p-3 bg-(--color-error-bg) border-b border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <section
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    class="relative flex-1 min-h-[620px] grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_360px] overflow-hidden bg-(--color-bg)"
  >
      <aside class="min-h-0 overflow-auto border-r border-(--color-border) bg-(--editor-panel)">
        <div class="px-3 py-2 border-b border-(--color-border) flex items-center justify-between">
          <div>
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Media Pool</h3>
            <p class="text-[11px] text-(--color-text-muted)">Master bin · imported sources</p>
          </div>
          <button
            type="button"
            onclick={() => videoInput?.click()}
            class="px-2 py-1 text-xs bg-(--color-accent) text-(--color-btn-text) font-semibold hover:bg-(--color-accent-hover) transition-colors"
          >
            Import
          </button>
        </div>

        <div class="grid grid-cols-3 border-b border-(--color-border) text-[11px] text-(--color-text-muted)">
          <button type="button" onclick={() => (mediaPoolTab = "media")} class="px-3 py-2 transition-colors {mediaPoolTab === 'media' ? 'border-b border-(--color-accent) text-(--color-text)' : 'hover:text-(--color-text)'}">Media</button>
          <button type="button" onclick={() => (mediaPoolTab = "effects")} class="px-3 py-2 transition-colors {mediaPoolTab === 'effects' ? 'border-b border-(--color-accent) text-(--color-text)' : 'hover:text-(--color-text)'}">Effects</button>
          <button type="button" onclick={() => (mediaPoolTab = "text")} class="px-3 py-2 transition-colors {mediaPoolTab === 'text' ? 'border-b border-(--color-accent) text-(--color-text)' : 'hover:text-(--color-text)'}">Text</button>
        </div>

        <div class="px-3 py-2 border-b border-(--color-border) bg-(--editor-panel-strong)">
          <div class="flex items-center justify-between text-[11px] text-(--color-text-muted)">
            <span>Master Bin</span>
            <span>{videos.length + audios.length} item{videos.length + audios.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {#if mediaPoolTab === "media"}
        <div class="p-2 space-y-2">
          <div class="border border-(--color-border) bg-(--editor-panel-strong) p-2 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-(--color-text-light)">Screen recording</p>
                <p class="text-[11px] text-(--color-text-muted)">{recordingStatus || "Record a tab/window directly into the timeline."}</p>
              </div>
              {#if recordingCountdown > 0}
                <span class="grid h-8 w-8 place-items-center border border-(--color-accent) text-sm font-bold text-(--color-accent)">{recordingCountdown}</span>
              {/if}
            </div>
            <label class="flex items-center gap-2 text-[11px] text-(--color-text-muted)">
              <input type="checkbox" bind:checked={recordSystemAudio} class="accent-(--color-accent)" />
              Also request system audio
            </label>
            <button
              type="button"
              onclick={() => (isRecording ? stopScreenRecording() : void startScreenRecording())}
              class="w-full px-3 py-2 text-xs font-semibold {isRecording ? 'border border-(--color-error-border) text-(--color-error-text)' : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'} transition-colors"
            >
              {isRecording ? "Stop recording" : "Record screen"}
            </button>
          </div>
          {#each videos as video (video.id)}
            <div class="group overflow-hidden border {selectedAssetId === video.id ? 'border-(--color-accent) bg-(--editor-selected)' : 'border-(--color-border) bg-(--editor-panel-strong) hover:border-(--color-text-light)'} transition-colors">
              <button
                type="button"
                onclick={() => {
                  selectedAssetId = video.id;
                  const firstClip = clipViews.find((clip) => clip.assetId === video.id);
                  if (firstClip) seekTo(firstClip.sequenceStart);
                  else syncPreviewToPlayhead(false);
                }}
                class="w-full text-left p-2"
              >
                <span class="flex gap-2">
                  <span class="relative h-14 w-20 flex-none overflow-hidden border border-(--color-border) bg-(--editor-preview)">
                    <video src={video.url} muted preload="metadata" class="h-full w-full object-cover"></video>
                    <span class="absolute bottom-1 right-1 border border-(--color-border) bg-(--color-bg-alt) px-1 text-[10px] font-mono text-(--color-text-muted)">{formatTime(video.duration)}</span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-(--color-text) truncate">{video.name}</span>
                    <span class="block text-xs text-(--color-text-muted)">
                      {video.width}x{video.height} · {formatFileSize(video.file.size)}
                    </span>
                    <span class="mt-1 inline-flex border border-(--color-border) px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-(--color-text-muted)">Source clip</span>
                  </span>
                </span>
              </button>
              <div class="px-2 pb-2 flex gap-2">
                <button
                  type="button"
                  onclick={() => appendAssetToTimeline(video)}
                  class="flex-1 px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                >
                  Append
                </button>
                <button
                  type="button"
                  onclick={() => removeVideoAsset(video.id)}
                  class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text) transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          {/each}
          {#each audios as audio (audio.id)}
            <div class="group overflow-hidden border {selectedAudioClip?.assetId === audio.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-(--color-border) bg-(--editor-panel-strong) hover:border-(--color-text-light)'} transition-colors">
              <button
                type="button"
                onclick={() => selectAudioAsset(audio)}
                class="w-full p-2 text-left"
              >
                <div class="flex gap-2">
                  <div class="h-12 w-20 flex-none border border-emerald-300/20 bg-emerald-300/10 p-1">
                    <div class="flex h-full items-center gap-[2px] border-y border-emerald-400/10">
                      {#each getAudioAssetWaveform(audio, 24) as peak}
                        <span class="flex-1 bg-emerald-500/80" style={`height: ${Math.max(10, peak * 100)}%;`}></span>
                      {/each}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-(--color-text) truncate">{audio.name}</span>
                    <span class="block text-xs text-(--color-text-muted)">{formatTime(audio.duration)} · {formatFileSize(audio.file.size)}</span>
                    <span class="mt-1 inline-flex border border-emerald-300/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-100/80">{audio.source === "detached" ? "Detached audio" : "Audio"}</span>
                  </div>
                </div>
              </button>
              <div class="px-2 pb-2 flex gap-2">
                <button
                  type="button"
                  onclick={() => appendAudioToTimeline(audio)}
                  class="flex-1 px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                >
                  Add audio
                </button>
                <button
                  type="button"
                  onclick={() => removeAudioAsset(audio.id)}
                  class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text) transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          {/each}
        </div>
        {:else if mediaPoolTab === "effects"}
          <div class="p-2 space-y-2">
            <p class="text-xs text-(--color-text-muted)">Apply a quick look to the selected video clip.</p>
            {#each CLIP_EFFECT_PRESETS as preset}
              <button
                type="button"
                onclick={() => applyClipEffectPreset(preset)}
                disabled={!selectedClip}
                class="w-full border border-(--color-border) bg-(--editor-panel-strong) px-3 py-2 text-left transition-colors hover:border-(--color-accent) disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span class="block text-sm font-medium text-(--color-text)">{preset.label}</span>
                <span class="block text-[11px] text-(--color-text-muted)">Brightness {preset.brightness} · Contrast {preset.contrast} · Sat {preset.saturation}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="p-2 space-y-2">
            <p class="text-xs text-(--color-text-muted)">Add editable text layers directly to the timeline.</p>
            {#each TEXT_PRESETS as preset}
              <button
                type="button"
                onclick={() => addTextOverlayPreset(preset)}
                class="w-full border border-(--color-border) bg-(--editor-panel-strong) px-3 py-2 text-left transition-colors hover:border-(--color-accent)"
              >
                <span class="block text-sm font-medium text-(--color-text)">{preset.label}</span>
                <span class="block text-[11px] text-(--color-text-muted)">{preset.text}</span>
              </button>
            {/each}
            <button type="button" onclick={() => (isGraphicModalOpen = true)} class="w-full border border-(--color-border) px-3 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text)">Open graphics modal</button>
          </div>
        {/if}
      </aside>

      <div class="min-h-0 flex flex-col gap-3 overflow-hidden p-3">
        <div class="flex-1 min-h-[340px] grid grid-cols-1 2xl:grid-cols-[minmax(260px,0.72fr)_minmax(0,1fr)] gap-3 overflow-hidden">
          <div class="hidden lg:flex min-h-0 flex-col overflow-hidden border border-(--color-border) bg-(--editor-panel)">
            <div class="flex items-center justify-between border-b border-(--color-border) px-3 py-2">
              <div class="min-w-0">
                <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Final Monitor</p>
                <p class="text-[11px] text-(--color-text-muted) truncate">Timeline output · final composition</p>
              </div>
              <span class="text-[11px] font-mono text-(--color-text)">{formatTime(playhead)}</span>
            </div>
            <div class="relative flex-1 min-h-0 bg-(--editor-preview) p-3 flex items-center justify-center overflow-hidden" style="container-type: size;">
              <div
                class="relative overflow-hidden select-none shadow-2xl ring-1 ring-white/10"
                style={getMonitorFrameStyle(outputWidth || 16, outputHeight || 9)}
              >
                <div
                  class="absolute inset-0"
                  style={`${getStageBackgroundStyle()} ${backgroundMode === "image" && backgroundBlur > 0 ? `filter: blur(${backgroundBlur}px); transform: scale(1.06);` : ""}`}
                ></div>

                {#each getVisibleClipViewsAt(playhead) as clip (clip.id)}
                  <div class="absolute overflow-hidden bg-black" style={`${getClipBoxStyle(clip, true)} border-radius: ${stageRounded}px; filter: drop-shadow(0 ${Math.round(clamp(stageShadow, 0, 100) / 4)}px ${Math.round(clamp(stageShadow, 0, 100) / 1.6)}px rgba(0,0,0,${(0.18 + clamp(stageShadow, 0, 100) / 180).toFixed(2)}));`}>
                    <video
                      use:finalPreviewClipNode={clip}
                      muted
                      playsinline
                      class="absolute object-cover"
                      style={`${getClipCropStyle(clip)} filter: ${getClipCssFilter(clip)};`}
                    ></video>
                  </div>
                {/each}

                <div class="pointer-events-none absolute inset-0">
                  {#each overlays as overlay (overlay.id)}
                    {#if isOverlayVisible(overlay)}
                      <div
                        class="absolute overflow-hidden"
                        style={getOverlayBoxStyle(overlay, playhead, true)}
                      >
                        {#if overlay.kind === "text"}
                          <div
                            class="w-full h-full flex items-center justify-center text-center px-3 overflow-hidden"
                            style={`color: ${overlay.color}; background: ${formatOverlayBackground(overlay)}; font-size: ${Math.max(10, overlay.fontSize / 3)}px; font-weight: ${overlay.fontWeight};`}
                          >
                            {overlay.text}
                          </div>
                        {:else if overlay.kind === "svg"}
                          <div class="svg-layer w-full h-full overflow-hidden">
                            {@html overlay.svg}
                          </div>
                        {:else}
                          <img src={overlay.imageSrc} alt={overlay.label} class="w-full h-full object-contain" draggable="false" />
                        {/if}
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between border-t border-(--color-border) px-3 py-2 text-[11px] text-(--color-text-muted)">
              <div class="flex items-center gap-2">
                <button type="button" onclick={togglePlayback} disabled={!hasTimelineContent} class="px-2 py-1 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40 disabled:cursor-not-allowed">
                  {isPlaying ? "Pause" : "Play final"}
                </button>
                <button type="button" onclick={() => (isFinalPreviewExpanded = true)} disabled={!hasTimelineContent} class="px-2 py-1 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40 disabled:cursor-not-allowed">
                  Enlarge
                </button>
              </div>
              <span>{formatTime(playhead)} / {formatTime(timelineDuration)}</span>
            </div>
          </div>

          <div class="min-h-0 flex flex-col overflow-hidden border border-(--color-border) bg-(--editor-panel)">
            <div class="flex items-center justify-between border-b border-(--color-border) px-3 py-2">
              <div class="min-w-0">
                <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Program Monitor</p>
                <p class="text-[11px] text-(--color-text-muted) truncate">{formatFileSize(totalSourceSize + totalAudioSize)} media · overlays visible at playhead</p>
              </div>
              <span class="text-[11px] font-mono text-(--color-text)">{formatTime(playhead)}</span>
            </div>
            <div class="flex-1 min-h-0 bg-(--editor-preview) p-3 flex items-center justify-center overflow-hidden" style="container-type: size;">
              <div
                bind:this={previewElement}
                class="relative overflow-hidden select-none shadow-2xl ring-1 ring-white/10"
                style={getMonitorFrameStyle(programWidth || 16, programHeight || 9)}
              >
                <div
                  class="absolute inset-0"
                  style={`${getStageBackgroundStyle()} ${backgroundMode === "image" && backgroundBlur > 0 ? `filter: blur(${backgroundBlur}px); transform: scale(1.06);` : ""}`}
                ></div>
                <div
                  bind:this={deliverEditElement}
                  class="absolute z-10 overflow-hidden border-2 border-sky-400/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.48)]"
                  style={getDeliverGuideStyle()}
                >
                  {#each getVisibleClipViewsAt(playhead) as clip (clip.id)}
                    <div
                      role="button"
                      tabindex="0"
                      onpointerdown={(event) => startClipPreviewDrag(event, clip)}
                      onpointermove={moveClipPreview}
                      onpointerup={finishClipPreviewDrag}
                      onpointercancel={finishClipPreviewDrag}
                      class="group pointer-events-auto absolute z-10 touch-none cursor-move border transition-colors {selectedClipId === clip.id ? 'border-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.9)]' : 'border-transparent'}"
                      style={getClipBoxStyle(clip, true)}
                    >
                      <div class="absolute inset-0 overflow-hidden bg-transparent" style={`border-radius: ${stageRounded}px; filter: drop-shadow(0 ${Math.round(clamp(stageShadow, 0, 100) / 4)}px ${Math.round(clamp(stageShadow, 0, 100) / 1.6)}px rgba(0,0,0,${(0.18 + clamp(stageShadow, 0, 100) / 180).toFixed(2)}));`}>
                        <video
                          use:clipPreviewNode={clip}
                          muted
                          playsinline
                          class="absolute object-cover"
                          style={`${getClipCropStyle(clip)} filter: ${getClipCssFilter(clip)};`}
                        ></video>
                      </div>
                      {#if selectedClipId === clip.id}
                        <span class="absolute -top-9 left-1/2 h-6 w-px -translate-x-1/2 bg-sky-400"></span>
                        <span
                          role="presentation"
                          onpointerdown={(event) => startClipPreviewRotateDrag(event, clip)}
                          onpointermove={moveClipPreview}
                          onpointerup={finishClipPreviewDrag}
                          onpointercancel={finishClipPreviewDrag}
                          class="absolute -top-12 left-1/2 grid h-6 w-6 -translate-x-1/2 cursor-grab place-items-center border border-sky-400 bg-(--color-bg-alt) text-sky-500 active:cursor-grabbing"
                          title="Rotate video"
                        >
                          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 7l5 5V8a4 4 0 1 1-3.46 6H5.35A7 7 0 1 0 12 5z" /></svg>
                        </span>
                        {#each OVERLAY_RESIZE_HANDLES as handle (handle.id)}
                          <span
                            role="presentation"
                            onpointerdown={(event) => startClipPreviewResizeDrag(event, clip, handle.id)}
                            onpointermove={moveClipPreview}
                            onpointerup={finishClipPreviewDrag}
                            onpointercancel={finishClipPreviewDrag}
                            class="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 border border-sky-400 bg-(--color-bg-alt) shadow-sm"
                            style={`left: ${handle.x}%; top: ${handle.y}%; cursor: ${handle.cursor};`}
                            title={`Resize video from ${handle.label}`}
                          ></span>
                        {/each}
                      {/if}
                    </div>
                  {/each}
                  {#each overlays as overlay (overlay.id)}
                    {#if isOverlayVisible(overlay)}
                      <div
                        role="button"
                        tabindex="0"
                        onpointerdown={(event) => startOverlayDrag(event, overlay)}
                        onpointermove={moveOverlay}
                        onpointerup={finishOverlayDrag}
                        onpointercancel={finishOverlayDrag}
                        class="group pointer-events-auto absolute z-20 touch-none cursor-move border transition-colors {selectedOverlayId === overlay.id ? 'border-(--color-accent) shadow-[0_0_0_1px_var(--color-accent)]' : 'border-transparent'}"
                        style={getOverlayBoxStyle(overlay, playhead, true)}
                      >
                        {#if overlay.kind === "text"}
                          <div
                            class="w-full h-full flex items-center justify-center text-center px-3 overflow-hidden"
                            style={`color: ${overlay.color}; background: ${formatOverlayBackground(overlay)}; font-size: ${Math.max(12, overlay.fontSize / 2)}px; font-weight: ${overlay.fontWeight};`}
                          >
                            {overlay.text}
                          </div>
                        {:else if overlay.kind === "svg"}
                          <div class="svg-layer w-full h-full overflow-hidden">
                            {@html overlay.svg}
                          </div>
                        {:else}
                          <img src={overlay.imageSrc} alt={overlay.label} class="w-full h-full object-contain" draggable="false" />
                        {/if}
                        {#if selectedOverlayId === overlay.id}
                          <span class="absolute -top-9 left-1/2 h-6 w-px -translate-x-1/2 bg-(--color-accent)"></span>
                          <span
                            role="presentation"
                            onpointerdown={(event) => startOverlayRotateDrag(event, overlay)}
                            onpointermove={moveOverlay}
                            onpointerup={finishOverlayDrag}
                            onpointercancel={finishOverlayDrag}
                            class="absolute -top-12 left-1/2 grid h-6 w-6 -translate-x-1/2 cursor-grab place-items-center border border-(--color-accent) bg-(--color-bg-alt) text-(--color-accent) active:cursor-grabbing"
                            title="Rotate"
                          >
                            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 7l5 5V8a4 4 0 1 1-3.46 6H5.35A7 7 0 1 0 12 5z" /></svg>
                          </span>
                          {#each OVERLAY_RESIZE_HANDLES as handle (handle.id)}
                            <span
                              role="presentation"
                              onpointerdown={(event) => startOverlayResizeDrag(event, overlay, handle.id)}
                              onpointermove={moveOverlay}
                              onpointerup={finishOverlayDrag}
                              onpointercancel={finishOverlayDrag}
                              class="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 border border-(--color-accent) bg-(--color-bg-alt) shadow-sm"
                              style={`left: ${handle.x}%; top: ${handle.y}%; cursor: ${handle.cursor};`}
                              title={`Resize from ${handle.label}`}
                            ></span>
                          {/each}
                        {/if}
                      </div>
                    {/if}
                  {/each}
                  <span class="pointer-events-none absolute left-1/3 top-0 z-30 h-full w-px bg-sky-300/45"></span>
                  <span class="pointer-events-none absolute left-2/3 top-0 z-30 h-full w-px bg-sky-300/45"></span>
                  <span class="pointer-events-none absolute left-0 top-1/3 z-30 h-px w-full bg-sky-300/45"></span>
                  <span class="pointer-events-none absolute left-0 top-2/3 z-30 h-px w-full bg-sky-300/45"></span>
                  <span class="pointer-events-none absolute left-2 top-2 z-30 border border-sky-300/60 bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-mono text-sky-100">Deliver {outputWidth}x{outputHeight}</span>
                </div>

                <div class="pointer-events-none absolute inset-[8%] border border-white/10"></div>
                <div class="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/5"></div>
                <div class="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/5"></div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-3 border-t border-(--color-border) px-3 py-2 text-[11px] text-(--color-text-muted)">
              <span>Edit {programWidth}x{programHeight} · Deliver {outputWidth}x{outputHeight} · {outputFrameRate}fps</span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onclick={togglePlayback}
                  disabled={!hasTimelineContent}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  class="grid h-8 w-8 place-items-center border border-(--color-border) bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  {#if isPlaying}
                    <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>
                  {/if}
                </button>
                <button
                  type="button"
                  onclick={stopPlayback}
                  disabled={!hasTimelineContent}
                  aria-label="Reset playhead"
                  class="grid h-8 w-8 place-items-center border border-(--color-border) bg-(--editor-panel-strong) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.1A5 5 0 1 0 12 7z" /></svg>
                </button>
                <button
                  type="button"
                  onclick={() => (isFinalPreviewExpanded = true)}
                  disabled={!hasTimelineContent}
                  aria-label="Open large final monitor"
                  class="h-8 border border-(--color-border) bg-(--editor-panel-strong) px-2 text-[11px] font-semibold text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  Final
                </button>
              </div>
              <span class="font-mono text-(--color-text)">{formatTime(playhead)} / {formatTime(timelineDuration)}</span>
            </div>
          </div>
        </div>

        <div class="flex-none border border-(--color-border) bg-(--editor-panel) p-3">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Timeline</p>
              <p class="text-xs text-(--color-text-muted)">Graphics, zooms, videos, and audio clips each get their own row. Scroll as the edit grows.</p>
            </div>
            <div class="text-xs font-mono text-(--color-text)">{formatTime(playhead)} / {formatTime(timelineDuration)}</div>
          </div>

          <div class="relative max-h-[360px] overflow-auto border border-(--color-border) bg-(--color-bg) touch-none">
            <div class="relative" style={`width: ${timelineContentWidth + 80}px; height: ${timelineContentHeight}px;`}>
              <div class="sticky left-0 top-0 z-20 w-20 border-r border-(--color-border) bg-(--color-bg-alt) text-[10px] uppercase tracking-wide text-(--color-text-muted)" style={`height: ${timelineContentHeight}px;`}>
                <div class="border-b border-(--color-border) px-2 py-2 font-mono" style={`height: ${TIMELINE_RULER_HEIGHT}px;`}>TC</div>
                {#each Array(graphicsLaneCount) as _, index}
                  {@const overlay = overlays[index]}
                  <div class="border-b border-(--color-border) px-2 py-1.5" style={`height: ${GRAPHICS_LANE_HEIGHT}px;`}>
                    <span class="block font-semibold text-(--color-text)">G{index + 1}</span>
                    <span class="block truncate normal-case text-[9px] text-(--color-text-muted)">{overlay ? overlay.label : "Graphics"}</span>
                  </div>
                {/each}
                {#each Array(zoomLaneCount) as _, index}
                  {@const zoom = zoomFragments[index]}
                  <div class="border-b border-(--color-border) px-2 py-1.5" style={`height: ${ZOOM_LANE_HEIGHT}px;`}>
                    <span class="block font-semibold text-(--color-text)">Z{index + 1}</span>
                    <span class="block truncate normal-case text-[9px] text-(--color-text-muted)">{zoom ? zoom.label : "Zoom"}</span>
                  </div>
                {/each}
                {#each clipViews as clip, index (clip.id)}
                  <div class="border-b border-(--color-border) px-2 py-2" style={`height: ${VIDEO_LANE_HEIGHT}px;`}>
                    <span class="block font-semibold text-(--color-text)">V{index + 1}</span>
                    <span class="block truncate normal-case text-[9px] text-(--color-text-muted)">{clip.label}</span>
                  </div>
                {/each}
                {#if clipViews.length === 0}
                  <div class="border-b border-(--color-border) px-2 py-2" style={`height: ${VIDEO_LANE_HEIGHT}px;`}>V1</div>
                {/if}
                {#each audioClipViews as clip, index (clip.id)}
                  <div class="border-b border-(--color-border) px-2 py-2" style={`height: ${AUDIO_LANE_HEIGHT}px;`}>
                    <span class="block font-semibold text-(--color-text)">A{index + 1}</span>
                    <span class="block truncate normal-case text-[9px] text-(--color-text-muted)">{clip.label}</span>
                  </div>
                {/each}
                {#if audioClipViews.length === 0}
                  <div class="px-2 py-2" style={`height: ${AUDIO_LANE_HEIGHT}px;`}>A1</div>
                {/if}
              </div>

              <div
                bind:this={timelineElement}
                role="slider"
                tabindex="0"
                aria-valuemin="0"
                aria-valuemax={timelineDisplayDuration}
                aria-valuenow={playhead}
                onpointerdown={startTimelineDrag}
                class="absolute top-0 cursor-crosshair"
                style={`left: 80px; width: ${timelineContentWidth}px; height: ${timelineContentHeight}px;`}
              >
                <div class="absolute inset-x-0 top-0 border-b border-(--color-border) bg-[linear-gradient(90deg,rgba(128,128,128,0.18)_1px,transparent_1px)] bg-[length:8.333%_100%]" style={`height: ${TIMELINE_RULER_HEIGHT}px;`}>
                  <div class="flex h-full items-end justify-between px-2 pb-1 text-[10px] font-mono text-(--color-text-muted)">
                    <span>0:00</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>{formatTime(timelineDisplayDuration)}</span>
                  </div>
                </div>

                {#each Array(graphicsLaneCount) as _, index}
                  <div class="absolute left-0 right-0 border-b border-(--color-border) {index % 2 === 0 ? 'bg-(--color-bg-alt)' : 'bg-(--color-bg)'}" style={`top: ${graphicsLaneTop + index * GRAPHICS_LANE_HEIGHT}px; height: ${GRAPHICS_LANE_HEIGHT}px;`}></div>
                {/each}
                {#each Array(zoomLaneCount) as _, index}
                  <div class="absolute left-0 right-0 border-b border-(--color-border) {index % 2 === 0 ? 'bg-sky-500/5' : 'bg-(--color-bg)'}" style={`top: ${zoomLaneTop + index * ZOOM_LANE_HEIGHT}px; height: ${ZOOM_LANE_HEIGHT}px;`}></div>
                {/each}
                {#each Array(videoLaneCount) as _, index}
                  <div class="absolute left-0 right-0 border-b border-(--color-border) {index % 2 === 0 ? 'bg-(--color-bg)' : 'bg-(--color-bg-alt)'}" style={`top: ${videoLaneTop + index * VIDEO_LANE_HEIGHT}px; height: ${VIDEO_LANE_HEIGHT}px;`}></div>
                {/each}
                {#each Array(audioLaneCount) as _, index}
                  <div class="absolute left-0 right-0 border-b border-(--color-border) {index % 2 === 0 ? 'bg-(--color-bg-alt)' : 'bg-(--color-bg)'}" style={`top: ${audioLaneTop + index * AUDIO_LANE_HEIGHT}px; height: ${AUDIO_LANE_HEIGHT}px;`}></div>
                {/each}

                {#each overlays as overlay, index (overlay.id)}
                  <button
                    type="button"
                    onpointerdown={(event) => startOverlayTimelineDrag(event, overlay.id, "move-overlay")}
                    onclick={(event) => {
                      event.stopPropagation();
                      selectedOverlayId = overlay.id;
                      seekTo(overlay.start);
                    }}
                    class="absolute overflow-hidden border border-(--color-accent) bg-(--color-accent) px-1.5 text-left text-[10px] leading-6 text-(--color-btn-text) opacity-80 transition-opacity hover:opacity-100 {selectedOverlayId === overlay.id ? 'ring-2 ring-(--color-accent)' : ''}"
                    style={`top: ${graphicsLaneTop + index * GRAPHICS_LANE_HEIGHT + 4}px; height: ${GRAPHICS_LANE_HEIGHT - 8}px; left: ${(overlay.start / Math.max(timelineDisplayDuration, 1)) * 100}%; width: ${Math.max(((overlay.end - overlay.start) / Math.max(timelineDisplayDuration, 1)) * 100, 2)}%;`}
                  >
                    <span class="block truncate pr-2">{overlay.kind.toUpperCase()} · {overlay.label}</span>
                    {#each getSortedOverlayKeyframes(overlay) as keyframe (keyframe.id)}
                      <span
                        class="pointer-events-none absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 bg-(--color-btn-text) shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                        style={`left: ${clamp(((keyframe.time - overlay.start) / Math.max(overlay.end - overlay.start, 0.001)) * 100, 0, 100)}%;`}
                      ></span>
                    {/each}
                    <span role="presentation" onpointerdown={(event) => startOverlayTimelineDrag(event, overlay.id, "overlay-trim-start")} class="absolute left-0 top-0 h-full w-2 bg-current opacity-25 hover:opacity-45 cursor-ew-resize"></span>
                    <span role="presentation" onpointerdown={(event) => startOverlayTimelineDrag(event, overlay.id, "overlay-trim-end")} class="absolute right-0 top-0 h-full w-2 bg-current opacity-25 hover:opacity-45 cursor-ew-resize"></span>
                  </button>
                {/each}

                {#each zoomFragments as zoom, index (zoom.id)}
                  <button
                    type="button"
                    onpointerdown={(event) => startZoomTimelineDrag(event, zoom.id, "move-zoom")}
                    onclick={(event) => {
                      event.stopPropagation();
                      selectedZoomId = zoom.id;
                      seekTo(zoom.start);
                    }}
                    class="absolute overflow-hidden border border-sky-500 bg-sky-500/80 px-1.5 text-left text-[10px] leading-6 text-white opacity-85 transition-opacity hover:opacity-100 {selectedZoomId === zoom.id ? 'ring-2 ring-sky-500' : ''}"
                    style={`top: ${zoomLaneTop + index * ZOOM_LANE_HEIGHT + 4}px; height: ${ZOOM_LANE_HEIGHT - 8}px; left: ${(zoom.start / Math.max(timelineDisplayDuration, 1)) * 100}%; width: ${Math.max(((zoom.end - zoom.start) / Math.max(timelineDisplayDuration, 1)) * 100, 2)}%;`}
                  >
                    <span class="block truncate pr-2">{zoom.label} · {zoom.scale.toFixed(1)}x</span>
                    <span role="presentation" onpointerdown={(event) => startZoomTimelineDrag(event, zoom.id, "zoom-trim-start")} class="absolute left-0 top-0 h-full w-2 bg-current opacity-25 hover:opacity-45 cursor-ew-resize"></span>
                    <span role="presentation" onpointerdown={(event) => startZoomTimelineDrag(event, zoom.id, "zoom-trim-end")} class="absolute right-0 top-0 h-full w-2 bg-current opacity-25 hover:opacity-45 cursor-ew-resize"></span>
                  </button>
                {/each}

                {#each clipViews as clip (clip.id + "-ghost")}
                  <div
                    class="absolute border border-dashed border-(--color-border-dark) bg-(--color-bg-alt) opacity-60 pointer-events-none"
                    title="Original source length"
                    style={`top: ${videoLaneTop + clip.index * VIDEO_LANE_HEIGHT + 5}px; height: ${VIDEO_LANE_HEIGHT - 10}px; left: ${(Math.max(0, clip.sequenceStart - clip.sourceStart) / Math.max(timelineDisplayDuration, 1)) * 100}%; width: ${(getClipSourceDuration(clip) / Math.max(timelineDisplayDuration, 1)) * 100}%;`}
                  ></div>
                {/each}

                {#each clipViews as clip (clip.id)}
                  <button
                    type="button"
                    onpointerdown={(event) => startClipMoveDrag(event, clip.id)}
                    onclick={(event) => {
                      event.stopPropagation();
                      selectedClipId = clip.id;
                      seekTo(clip.sequenceStart);
                    }}
                    class="absolute cursor-grab border text-left overflow-hidden transition-colors active:cursor-grabbing {selectedClipId === clip.id ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)' : 'border-(--color-border-dark) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-text-light)'}"
                    style={`top: ${videoLaneTop + clip.index * VIDEO_LANE_HEIGHT + 5}px; height: ${VIDEO_LANE_HEIGHT - 10}px; left: ${(clip.sequenceStart / Math.max(timelineDisplayDuration, 1)) * 100}%; width: ${Math.max((clip.duration / Math.max(timelineDisplayDuration, 1)) * 100, 2)}%;`}
                  >
                    <span class="block px-2 py-1 text-[11px] font-semibold truncate">{clip.index + 1}. {clip.label}</span>
                    <span class="block px-2 text-[10px] opacity-70 truncate">{getClipSourceName(clip)}</span>
                    <span class="absolute left-2 right-2 bottom-1 h-1 bg-current opacity-25"></span>
                    <span role="presentation" onpointerdown={(event) => startTrimDrag(event, clip.id, "trim-start")} class="absolute left-0 top-0 h-full w-3 bg-current opacity-25 hover:opacity-45 cursor-ew-resize"></span>
                    <span role="presentation" onpointerdown={(event) => startTrimDrag(event, clip.id, "trim-end")} class="absolute right-0 top-0 h-full w-3 bg-current opacity-25 hover:opacity-45 cursor-ew-resize"></span>
                  </button>
                {/each}

                {#each clipViews as clip (clip.id + "-embedded-audio")}
                  {#if clip.volume > 0}
                    <div
                      class="absolute h-7 border border-emerald-500/25 bg-emerald-500/10 overflow-hidden"
                      style={`top: ${videoLaneTop + clip.index * VIDEO_LANE_HEIGHT + 27}px; left: ${(clip.sequenceStart / Math.max(timelineDisplayDuration, 1)) * 100}%; width: ${Math.max((clip.duration / Math.max(timelineDisplayDuration, 1)) * 100, 2)}%;`}
                    >
                      <span class="absolute left-1 top-0 text-[9px] leading-3 text-emerald-700 dark:text-emerald-100">embedded</span>
                      <div class="absolute inset-x-1 bottom-1 top-3 flex items-center gap-[2px] border-y border-emerald-400/15 opacity-80">
                        {#each getVideoClipWaveform(clip) as peak}
                          <span class="flex-1 bg-emerald-500/70" style={`height: ${Math.max(10, peak * 100)}%;`}></span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}

                {#each audioClipViews as clip, index (clip.id)}
                  <button
                    type="button"
                    onpointerdown={(event) => startAudioMoveDrag(event, clip.id)}
                    onclick={(event) => {
                      event.stopPropagation();
                      selectedAudioClipId = clip.id;
                      seekTo(Math.min(clip.sequenceStart, timelineDuration));
                    }}
                    class="absolute cursor-grab border overflow-hidden text-left transition-colors active:cursor-grabbing {selectedAudioClipId === clip.id ? 'border-emerald-500 bg-emerald-500/20' : 'border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-500'}"
                    style={`top: ${audioLaneTop + index * AUDIO_LANE_HEIGHT + 4}px; height: ${AUDIO_LANE_HEIGHT - 8}px; left: ${(clip.sequenceStart / Math.max(timelineDisplayDuration, 1)) * 100}%; width: ${Math.max((clip.duration / Math.max(timelineDisplayDuration, 1)) * 100, 2)}%;`}
                  >
                    <span class="absolute inset-x-1 top-0 truncate text-[10px] leading-4 text-emerald-700 dark:text-emerald-100">{clip.label}</span>
                    <div class="absolute inset-x-1 bottom-1 top-4 flex items-center gap-[2px] border-y border-emerald-400/20 opacity-90">
                      {#each getAudioClipWaveform(clip) as peak}
                        <span class="flex-1 bg-emerald-500" style={`height: ${Math.max(10, peak * 100)}%;`}></span>
                      {/each}
                    </div>
                    <span role="presentation" onpointerdown={(event) => startAudioTrimDrag(event, clip.id, "audio-trim-start")} class="absolute left-0 top-0 h-full w-2 bg-current opacity-20 hover:opacity-40 cursor-ew-resize"></span>
                    <span role="presentation" onpointerdown={(event) => startAudioTrimDrag(event, clip.id, "audio-trim-end")} class="absolute right-0 top-0 h-full w-2 bg-current opacity-20 hover:opacity-40 cursor-ew-resize"></span>
                  </button>
                {/each}

                <div
                  role="presentation"
                  onpointerdown={startPlayheadDrag}
                  class="absolute top-0 bottom-0 w-4 -translate-x-1/2 cursor-ew-resize"
                  style={`left: ${(playhead / Math.max(timelineDisplayDuration, 1)) * 100}%`}
                >
                  <span class="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.55)]"></span>
                  <span class="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rotate-45 bg-red-500"></span>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onclick={splitAtPlayhead}
              class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--editor-panel-strong) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Split at playhead
            </button>
            <button
              type="button"
              onclick={copySelectedClip}
              class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--editor-panel-strong) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Copy selected segment
            </button>
            <button
              type="button"
              onclick={setClipStartToPlayhead}
              class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--editor-panel-strong) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Set start here
            </button>
            <button
              type="button"
              onclick={setClipEndToPlayhead}
              class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--editor-panel-strong) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Set end here
            </button>
          </div>
        </div>
      </div>

      <aside class="min-h-0 overflow-auto flex flex-col gap-3 border-l border-(--color-border) bg-(--editor-panel) p-3">
        <div class="p-4 border border-(--color-border) bg-(--editor-panel-strong)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold mb-3">Background & Mockup</h3>
          <div class="grid grid-cols-2 gap-2 mb-3">
            {#each BACKGROUND_PRESETS as preset}
              <button
                type="button"
                onclick={() => applyBackgroundPreset(preset)}
                class="border border-(--color-border) px-2 py-1.5 text-left text-[11px] text-(--color-text-muted) hover:text-(--color-text)"
              >
                <span class="block h-5 border border-(--color-border)" style={`background: ${preset.mode === "gradient" ? `linear-gradient(${preset.angle}deg, ${preset.color}, ${preset.color2})` : preset.color};`}></span>
                <span>{preset.label}</span>
              </button>
            {/each}
          </div>
          <div class="grid grid-cols-3 gap-2 mb-3">
            <button type="button" onclick={() => (backgroundMode = "solid")} class="border px-2 py-1.5 text-xs {backgroundMode === 'solid' ? 'border-(--color-accent) text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted)'}">Solid</button>
            <button type="button" onclick={() => (backgroundMode = "gradient")} class="border px-2 py-1.5 text-xs {backgroundMode === 'gradient' ? 'border-(--color-accent) text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted)'}">Gradient</button>
            <button type="button" onclick={() => backgroundInput?.click()} class="border px-2 py-1.5 text-xs {backgroundMode === 'image' ? 'border-(--color-accent) text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted)'}">Image</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-(--color-text-muted)">
              Color A
              <input type="color" bind:value={backgroundColor} class="mt-1 h-9 w-full border border-(--color-border) bg-(--color-bg)" />
            </label>
            <label class="text-xs text-(--color-text-muted)">
              Color B
              <input type="color" bind:value={backgroundColor2} class="mt-1 h-9 w-full border border-(--color-border) bg-(--color-bg)" />
            </label>
          </div>
          <label class="mt-3 block text-xs text-(--color-text-muted)">
            Gradient angle {backgroundAngle} deg
            <input type="range" min="0" max="360" step="5" bind:value={backgroundAngle} class="mt-1 w-full accent-(--color-accent)" />
          </label>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <label class="text-xs text-(--color-text-muted)">Padding {stagePadding}%<input type="range" min="0" max="35" step="1" bind:value={stagePadding} class="mt-1 w-full accent-(--color-accent)" /></label>
            <label class="text-xs text-(--color-text-muted)">Round {stageRounded}px<input type="range" min="0" max="64" step="1" bind:value={stageRounded} class="mt-1 w-full accent-(--color-accent)" /></label>
            <label class="text-xs text-(--color-text-muted)">Shadow {stageShadow}%<input type="range" min="0" max="100" step="1" bind:value={stageShadow} class="mt-1 w-full accent-(--color-accent)" /></label>
            <label class="text-xs text-(--color-text-muted)">Blur {backgroundBlur}px<input type="range" min="0" max="40" step="1" bind:value={backgroundBlur} class="mt-1 w-full accent-(--color-accent)" /></label>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <label class="text-xs text-(--color-text-muted)">Media scale {mediaScale.toFixed(2)}x<input type="range" min="0.4" max="2.2" step="0.05" bind:value={mediaScale} class="mt-1 w-full accent-(--color-accent)" /></label>
            <label class="text-xs text-(--color-text-muted)">Rotate {mediaRotation} deg<input type="range" min="-30" max="30" step="1" bind:value={mediaRotation} class="mt-1 w-full accent-(--color-accent)" /></label>
            <label class="text-xs text-(--color-text-muted)">Move X {mediaOffsetX}%<input type="range" min="-30" max="30" step="1" bind:value={mediaOffsetX} class="mt-1 w-full accent-(--color-accent)" /></label>
            <label class="text-xs text-(--color-text-muted)">Move Y {mediaOffsetY}%<input type="range" min="-30" max="30" step="1" bind:value={mediaOffsetY} class="mt-1 w-full accent-(--color-accent)" /></label>
          </div>
          <label class="mt-3 block text-xs text-(--color-text-muted)">
            Mockup
            <select bind:value={mockupPreset} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) focus:outline-none focus:border-(--color-accent)">
              {#each MOCKUP_PRESETS as preset}
                <option value={preset.id}>{preset.label}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="p-4 border border-(--color-border) bg-(--editor-panel-strong)">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Zoom</h3>
            <span class="text-xs text-(--color-text-muted)">{zoomFragments.length} fragment{zoomFragments.length === 1 ? "" : "s"}</span>
          </div>
          <button type="button" onclick={addZoomFragment} class="mb-3 w-full bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition-colors">Add zoom at playhead</button>
          {#if zoomFragments.length > 0}
            <div class="mb-3 max-h-28 space-y-1 overflow-auto">
              {#each zoomFragments as zoom (zoom.id)}
                <button
                  type="button"
                  onclick={() => {
                    selectedZoomId = zoom.id;
                    seekTo(zoom.start);
                  }}
                  class="w-full border px-2 py-1.5 text-left text-xs {selectedZoomId === zoom.id ? 'border-sky-500 bg-sky-500/10 text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                  <span class="block truncate">{zoom.label} · {zoom.scale.toFixed(1)}x</span>
                  <span class="font-mono">{formatTime(zoom.start)}-{formatTime(zoom.end)}</span>
                </button>
              {/each}
            </div>
          {/if}
          {#if selectedZoom}
            <div class="space-y-3 border-t border-(--color-border) pt-3">
              <label class="block text-xs text-(--color-text-muted)">Label<input type="text" bind:value={selectedZoom.label} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) focus:outline-none focus:border-(--color-accent)" /></label>
              <div class="grid grid-cols-2 gap-2">
                <label class="text-xs text-(--color-text-muted)">Start<input type="number" min="0" step="0.1" value={selectedZoom.start.toFixed(1)} oninput={(event) => updateZoomStartTime(selectedZoom, parseFloat((event.target as HTMLInputElement).value) || 0)} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) focus:outline-none focus:border-(--color-accent)" /></label>
                <label class="text-xs text-(--color-text-muted)">End<input type="number" min="0" step="0.1" value={selectedZoom.end.toFixed(1)} oninput={(event) => updateZoomEndTime(selectedZoom, parseFloat((event.target as HTMLInputElement).value) || selectedZoom.end)} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) focus:outline-none focus:border-(--color-accent)" /></label>
              </div>
              <label class="block text-xs text-(--color-text-muted)">Scale {selectedZoom.scale.toFixed(2)}x<input type="range" min="1" max="4" step="0.05" bind:value={selectedZoom.scale} class="mt-1 w-full accent-sky-500" /></label>
              <div class="grid grid-cols-2 gap-2">
                <label class="text-xs text-(--color-text-muted)">Pan X {selectedZoom.x}%<input type="range" min="-40" max="40" step="1" bind:value={selectedZoom.x} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Pan Y {selectedZoom.y}%<input type="range" min="-40" max="40" step="1" bind:value={selectedZoom.y} class="mt-1 w-full accent-sky-500" /></label>
              </div>
              <label class="block text-xs text-(--color-text-muted)">Easing<select bind:value={selectedZoom.easing} class="mt-1 w-full border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) focus:outline-none focus:border-(--color-accent)">{#each ZOOM_EASINGS as easing}<option value={easing.id}>{easing.label}</option>{/each}</select></label>
              <button type="button" onclick={removeSelectedZoom} class="w-full border border-(--color-border) px-3 py-2 text-sm text-(--color-text-muted) hover:text-(--color-error-text)">Remove zoom</button>
            </div>
          {/if}
        </div>

        <div class="p-4 border border-(--color-border) bg-(--editor-panel-strong)">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Clip Properties</h3>
            <span class="text-xs text-(--color-text-muted)">{clips.length} segment{clips.length === 1 ? "" : "s"}</span>
          </div>

          <div class="space-y-2">
            {#each clipViews as clip (clip.id)}
              <button
                type="button"
                onclick={() => {
                  selectedClipId = clip.id;
                  seekTo(clip.sequenceStart);
                }}
                class="w-full text-left p-2 border transition-colors {selectedClipId === clip.id ? 'border-(--color-accent) bg-(--editor-selected)' : 'border-(--color-border) hover:border-(--color-text-light)'}"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium text-(--color-text) truncate">{clip.index + 1}. {clip.label}</span>
                  <span class="text-xs font-mono text-(--color-text-muted)">{formatTime(clip.duration)}</span>
                </div>
                <p class="text-xs text-(--color-text-muted) mt-1">
                  {getClipSourceName(clip)} · {formatTime(clip.sourceStart)} to {formatTime(clip.sourceEnd)}
                </p>
              </button>
            {/each}
            {#if clipViews.length === 0}
              <p class="text-xs text-(--color-text-muted)">Video ekleyince klipler burada görünecek. Aynı videoyu Media Pool'dan tekrar tekrar timeline'a ekleyebilirsin.</p>
            {/if}
          </div>

          {#if selectedClip}
            {@const selectedClipFrame = getClipFrameAtTime(selectedClip, playhead)}
            <div class="mt-4 grid grid-cols-2 gap-2">
              <label class="text-xs text-(--color-text-muted)">
                Source start
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, selectedClip.sourceEnd - 0.1)}
                  step="0.1"
                  value={selectedClip.sourceStart.toFixed(1)}
                  oninput={(event) => updateClipSourceStart(selectedClip, parseFloat((event.target as HTMLInputElement).value) || 0)}
                  class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </label>
              <label class="text-xs text-(--color-text-muted)">
                Source end
                <input
                  type="number"
                  min={selectedClip.sourceStart + 0.1}
                  max={getClipSourceDuration(selectedClip)}
                  step="0.1"
                  value={selectedClip.sourceEnd.toFixed(1)}
                  oninput={(event) => updateClip(selectedClip.id, { sourceEnd: clamp(parseFloat((event.target as HTMLInputElement).value) || getClipSourceDuration(selectedClip), selectedClip.sourceStart + 0.1, getClipSourceDuration(selectedClip)) })}
                  class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </label>
            </div>
            <label class="mt-3 block text-xs text-(--color-text-muted)">
              Clip volume {Math.round(selectedClip.volume * 100)}%
              <input type="range" min="0" max="2" step="0.05" bind:value={selectedClip.volume} class="mt-1 w-full accent-(--color-accent)" />
            </label>
            <div class="mt-3 space-y-2 border border-(--color-border) bg-(--color-bg) p-2">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Video transform</p>
                <button type="button" onclick={addOrUpdateClipKeyframe} class="px-2 py-1 text-[11px] border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Save key</button>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <button type="button" onclick={centerSelectedClip} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Center</button>
                <button type="button" onclick={fitSelectedClip} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Fit</button>
                <button type="button" onclick={clearClipKeyframes} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text)">Clear keys</button>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <label class="text-xs text-(--color-text-muted)">X {Math.round(selectedClipFrame.x * 100)}%<input type="range" min="-100" max="100" step="1" value={selectedClipFrame.x * 100} oninput={(event) => updateClipFrameAtPlayhead(selectedClip, { x: (parseFloat((event.target as HTMLInputElement).value) || 0) / 100 })} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Y {Math.round(selectedClipFrame.y * 100)}%<input type="range" min="-100" max="100" step="1" value={selectedClipFrame.y * 100} oninput={(event) => updateClipFrameAtPlayhead(selectedClip, { y: (parseFloat((event.target as HTMLInputElement).value) || 0) / 100 })} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Width {Math.round(selectedClipFrame.width * 100)}%<input type="range" min="5" max="100" step="1" value={selectedClipFrame.width * 100} oninput={(event) => updateClipFrameAtPlayhead(selectedClip, { width: (parseFloat((event.target as HTMLInputElement).value) || 5) / 100 })} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Height {Math.round(selectedClipFrame.height * 100)}%<input type="range" min="5" max="100" step="1" value={selectedClipFrame.height * 100} oninput={(event) => updateClipFrameAtPlayhead(selectedClip, { height: (parseFloat((event.target as HTMLInputElement).value) || 5) / 100 })} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Rotate {Math.round(selectedClipFrame.rotation)} deg<input type="range" min="-180" max="180" step="1" value={selectedClipFrame.rotation} oninput={(event) => updateClipFrameAtPlayhead(selectedClip, { rotation: parseFloat((event.target as HTMLInputElement).value) || 0 })} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Opacity {Math.round(selectedClipFrame.opacity * 100)}%<input type="range" min="5" max="100" step="1" value={selectedClipFrame.opacity * 100} oninput={(event) => updateClipFrameAtPlayhead(selectedClip, { opacity: (parseFloat((event.target as HTMLInputElement).value) || 100) / 100 })} class="mt-1 w-full accent-sky-500" /></label>
              </div>
              <div class="grid grid-cols-2 gap-2 border-t border-(--color-border) pt-2">
                <label class="text-xs text-(--color-text-muted)">Crop left {Math.round((selectedClip.cropLeft ?? 0) * 100)}%<input type="range" min="0" max="90" step="1" value={(selectedClip.cropLeft ?? 0) * 100} oninput={(event) => updateClipCrop(selectedClip, "cropLeft", (parseFloat((event.target as HTMLInputElement).value) || 0) / 100)} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Crop right {Math.round((selectedClip.cropRight ?? 0) * 100)}%<input type="range" min="0" max="90" step="1" value={(selectedClip.cropRight ?? 0) * 100} oninput={(event) => updateClipCrop(selectedClip, "cropRight", (parseFloat((event.target as HTMLInputElement).value) || 0) / 100)} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Crop top {Math.round((selectedClip.cropTop ?? 0) * 100)}%<input type="range" min="0" max="90" step="1" value={(selectedClip.cropTop ?? 0) * 100} oninput={(event) => updateClipCrop(selectedClip, "cropTop", (parseFloat((event.target as HTMLInputElement).value) || 0) / 100)} class="mt-1 w-full accent-sky-500" /></label>
                <label class="text-xs text-(--color-text-muted)">Crop bottom {Math.round((selectedClip.cropBottom ?? 0) * 100)}%<input type="range" min="0" max="90" step="1" value={(selectedClip.cropBottom ?? 0) * 100} oninput={(event) => updateClipCrop(selectedClip, "cropBottom", (parseFloat((event.target as HTMLInputElement).value) || 0) / 100)} class="mt-1 w-full accent-sky-500" /></label>
              </div>
              {#if (selectedClip.keyframes ?? []).length > 0}
                <div class="max-h-24 space-y-1 overflow-auto border-t border-(--color-border) pt-2">
                  {#each getSortedClipKeyframes(selectedClip) as keyframe (keyframe.id)}
                    <div class="flex items-center justify-between gap-2 text-[11px] text-(--color-text-muted)">
                      <button type="button" onclick={() => seekTo(keyframe.time)} class="truncate text-left hover:text-(--color-text)">{formatTime(keyframe.time)} · X {Math.round(keyframe.x * 100)} · Y {Math.round(keyframe.y * 100)} · R {Math.round(keyframe.rotation)} deg</button>
                      <button type="button" onclick={() => removeClipKeyframe(keyframe.id)} class="text-(--color-text-muted) hover:text-(--color-error-text)">Remove</button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="mt-3 space-y-2 border border-(--color-border) bg-(--color-bg) p-2">
              <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Video effects</p>
              <label class="block text-xs text-(--color-text-muted)">
                Brightness {selectedClip.effectBrightness.toFixed(2)}
                <input type="range" min="-0.5" max="0.5" step="0.05" bind:value={selectedClip.effectBrightness} class="mt-1 w-full accent-(--color-accent)" />
              </label>
              <label class="block text-xs text-(--color-text-muted)">
                Contrast {selectedClip.effectContrast.toFixed(2)}
                <input type="range" min="0.5" max="2" step="0.05" bind:value={selectedClip.effectContrast} class="mt-1 w-full accent-(--color-accent)" />
              </label>
              <label class="block text-xs text-(--color-text-muted)">
                Saturation {selectedClip.effectSaturation.toFixed(2)}
                <input type="range" min="0" max="2" step="0.05" bind:value={selectedClip.effectSaturation} class="mt-1 w-full accent-(--color-accent)" />
              </label>
              <label class="block text-xs text-(--color-text-muted)">
                Blur {selectedClip.effectBlur.toFixed(1)}px
                <input type="range" min="0" max="8" step="0.5" bind:value={selectedClip.effectBlur} class="mt-1 w-full accent-(--color-accent)" />
              </label>
              <label class="flex items-center gap-2 text-xs text-(--color-text-muted)">
                <input type="checkbox" bind:checked={selectedClip.effectGrayscale} class="accent-(--color-accent)" />
                Black and white
              </label>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onclick={() => moveSelectedClip("earlier")}
                disabled={clips.findIndex((clip) => clip.id === selectedClip.id) <= 0}
                class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Move earlier
              </button>
              <button
                type="button"
                onclick={() => moveSelectedClip("later")}
                disabled={clips.findIndex((clip) => clip.id === selectedClip.id) >= clips.length - 1}
                class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Move later
              </button>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onclick={copySelectedClip}
                class="px-3 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
              >
                Copy
              </button>
              <button
                type="button"
                onclick={() => void detachSelectedClipAudio()}
                class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Detach audio
              </button>
              <button
                type="button"
                onclick={removeSelectedClip}
                disabled={clips.length <= 1}
                class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-error-text) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Remove
              </button>
            </div>
          {/if}

          {#if selectedAudioClip}
            <div class="mt-4 border-t border-(--color-border) pt-3 space-y-3">
              <div>
                <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Selected audio</p>
                <p class="text-sm text-(--color-text) truncate">{selectedAudioClip.label}</p>
                <p class="text-xs text-(--color-text-muted) truncate">{getAudioClipSourceName(selectedAudioClip)}</p>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <label class="text-xs text-(--color-text-muted)">
                  Timeline start
                  <input type="number" min="0" step="0.1" value={selectedAudioClip.start.toFixed(1)} oninput={(event) => updateAudioClip(selectedAudioClip.id, { start: Math.max(0, parseFloat((event.target as HTMLInputElement).value) || 0) })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  Source start
                  <input type="number" min="0" max={selectedAudioClip.sourceEnd - 0.1} step="0.1" value={selectedAudioClip.sourceStart.toFixed(1)} oninput={(event) => updateAudioClip(selectedAudioClip.id, { sourceStart: clamp(parseFloat((event.target as HTMLInputElement).value) || 0, 0, selectedAudioClip.sourceEnd - 0.1) })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  Source end
                  <input type="number" min={selectedAudioClip.sourceStart + 0.1} max={getAudioClipSourceDuration(selectedAudioClip)} step="0.1" value={selectedAudioClip.sourceEnd.toFixed(1)} oninput={(event) => updateAudioClip(selectedAudioClip.id, { sourceEnd: clamp(parseFloat((event.target as HTMLInputElement).value) || getAudioClipSourceDuration(selectedAudioClip), selectedAudioClip.sourceStart + 0.1, getAudioClipSourceDuration(selectedAudioClip)) })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
              </div>
              <label class="block text-xs text-(--color-text-muted)">
                Audio volume {Math.round(selectedAudioClip.volume * 100)}%
                <input type="range" min="0" max="2" step="0.05" bind:value={selectedAudioClip.volume} class="mt-1 w-full accent-(--color-accent)" />
              </label>
              <div class="grid grid-cols-3 gap-2">
                <button type="button" onclick={splitSelectedAudioAtPlayhead} class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors">
                  Split audio
                </button>
                <button type="button" onclick={muteSelectedAudioClip} class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors">
                  Mute
                </button>
                <button type="button" onclick={restoreSelectedAudioClipVolume} class="px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors">
                  100%
                </button>
              </div>
              <button type="button" onclick={removeSelectedAudioClip} class="w-full px-3 py-2 border border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-error-text) transition-colors">
                Remove audio clip
              </button>
            </div>
          {/if}
        </div>

        <div class="p-4 border border-(--color-border) bg-(--editor-panel-strong)">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Graphics Layers</h3>
            <span class="text-xs text-(--color-text-muted)">{overlays.length} overlay{overlays.length === 1 ? "" : "s"}</span>
          </div>

          <button
            type="button"
            onclick={() => (isGraphicModalOpen = true)}
            class="mb-3 w-full px-3 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
          >
            Add or edit graphic
          </button>

          {#if overlays.length > 0}
            <div class="space-y-1 mb-3">
              {#each overlays as overlay (overlay.id)}
                <button
                  type="button"
                  onclick={() => {
                    selectedOverlayId = overlay.id;
                    seekTo(overlay.start);
                  }}
                  class="w-full flex items-center justify-between gap-2 px-2 py-1.5 border text-xs transition-colors {selectedOverlayId === overlay.id ? 'border-(--color-accent) bg-(--editor-selected) text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                  <span class="truncate">{overlay.kind.toUpperCase()} · {overlay.label}</span>
                  <span class="font-mono">{formatTime(overlay.start)}-{formatTime(overlay.end)}</span>
                </button>
              {/each}
            </div>
          {/if}

          {#if selectedOverlay}
            {@const selectedOverlayFrame = getOverlayFrameAtTime(selectedOverlay, playhead)}
            <div class="space-y-3 pt-3 border-t border-(--color-border)">
              <label class="block text-xs text-(--color-text-muted)">
                Label
                <input
                  type="text"
                  bind:value={selectedOverlay.label}
                  class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </label>

              <div class="grid grid-cols-2 gap-2">
                <button type="button" onclick={() => moveSelectedOverlay("backward")} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Send back</button>
                <button type="button" onclick={() => moveSelectedOverlay("forward")} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Bring front</button>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <button type="button" onclick={centerSelectedOverlay} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Center</button>
                <button type="button" onclick={fitSelectedOverlay} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Fit</button>
                <button type="button" onclick={duplicateSelectedOverlay} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Duplicate</button>
              </div>

              {#if selectedOverlay.kind === "text"}
                <label class="block text-xs text-(--color-text-muted)">
                  Text
                  <textarea
                    bind:value={selectedOverlay.text}
                    rows="2"
                    class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
                  ></textarea>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs text-(--color-text-muted)">
                    Text color
                    <input type="color" bind:value={selectedOverlay.color} class="mt-1 w-full h-9 border border-(--color-border) bg-(--color-bg)" />
                  </label>
                  <label class="text-xs text-(--color-text-muted)">
                    Background
                    <input type="color" bind:value={selectedOverlay.background} class="mt-1 w-full h-9 border border-(--color-border) bg-(--color-bg)" />
                  </label>
                </div>
                <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
                  <input type="checkbox" bind:checked={selectedOverlay.backgroundTransparent} class="accent-(--color-accent)" />
                  Transparent background
                </label>
                {#if !selectedOverlay.backgroundTransparent}
                  <label class="block text-xs text-(--color-text-muted)">
                    Background opacity {Math.round(selectedOverlay.backgroundOpacity * 100)}%
                    <input type="range" min="0" max="1" step="0.05" bind:value={selectedOverlay.backgroundOpacity} class="mt-1 w-full accent-(--color-accent)" />
                  </label>
                {/if}
                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs text-(--color-text-muted)">
                    Font size
                    <input type="number" min="12" max="240" bind:value={selectedOverlay.fontSize} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                  </label>
                  <label class="text-xs text-(--color-text-muted)">
                    Weight
                    <select bind:value={selectedOverlay.fontWeight} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)">
                      <option value="400">Regular</option>
                      <option value="600">Semi bold</option>
                      <option value="800">Heavy</option>
                    </select>
                  </label>
                </div>
              {:else if selectedOverlay.kind === "svg"}
                <label class="block text-xs text-(--color-text-muted)">
                  SVG markup
                  <textarea
                    bind:value={selectedOverlay.svg}
                    rows="5"
                    spellcheck="false"
                    class="mt-1 w-full px-2 py-1.5 font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs focus:outline-none focus:border-(--color-accent)"
                  ></textarea>
                </label>
              {:else}
                <div class="border border-(--color-border) bg-(--color-bg) p-2">
                  <img src={selectedOverlay.imageSrc} alt={selectedOverlay.label} class="w-full max-h-32 object-contain" />
                </div>
                <button
                  type="button"
                  onclick={() => imageInput?.click()}
                  class="w-full px-3 py-2 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  Import another image layer
                </button>
              {/if}

              <div class="grid grid-cols-2 gap-2">
                <label class="text-xs text-(--color-text-muted)">
                  Start
                  <input type="number" min="0" max={Math.max(timelineDisplayDuration, selectedOverlay.end, 60)} step="0.1" value={selectedOverlay.start.toFixed(1)} oninput={(event) => updateOverlayStartTime(selectedOverlay, parseFloat((event.target as HTMLInputElement).value) || 0)} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  End
                  <input type="number" min="0" max={Math.max(timelineDisplayDuration, selectedOverlay.end, 60)} step="0.1" value={selectedOverlay.end.toFixed(1)} oninput={(event) => updateOverlayEndTime(selectedOverlay, parseFloat((event.target as HTMLInputElement).value) || selectedOverlay.end)} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
              </div>

              <div class="grid grid-cols-4 gap-2">
                <label class="text-xs text-(--color-text-muted)">
                  X %
                  <input type="number" min="0" max="100" step="1" value={(selectedOverlayFrame.x * 100).toFixed(0)} oninput={(event) => updateOverlayFrameAtPlayhead(selectedOverlay, { x: clamp((parseFloat((event.target as HTMLInputElement).value) || 0) / 100, 0, Math.max(0, 1 - selectedOverlayFrame.width)) })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  Y %
                  <input type="number" min="0" max="100" step="1" value={(selectedOverlayFrame.y * 100).toFixed(0)} oninput={(event) => updateOverlayFrameAtPlayhead(selectedOverlay, { y: clamp((parseFloat((event.target as HTMLInputElement).value) || 0) / 100, 0, Math.max(0, 1 - selectedOverlayFrame.height)) })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  W %
                  <input type="number" min="5" max="100" step="1" value={(selectedOverlayFrame.width * 100).toFixed(0)} oninput={(event) => resizeOverlay(selectedOverlay, { width: (parseFloat((event.target as HTMLInputElement).value) || 5) / 100 })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  H %
                  <input type="number" min="5" max="100" step="1" value={(selectedOverlayFrame.height * 100).toFixed(0)} oninput={(event) => resizeOverlay(selectedOverlay, { height: (parseFloat((event.target as HTMLInputElement).value) || 5) / 100 })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>
              </div>

              <label class="block text-xs text-(--color-text-muted)">
                Opacity {Math.round(selectedOverlayFrame.opacity * 100)}%
                <input type="range" min="0.1" max="1" step="0.05" value={selectedOverlayFrame.opacity} oninput={(event) => updateOverlayFrameAtPlayhead(selectedOverlay, { opacity: parseFloat((event.target as HTMLInputElement).value) || selectedOverlayFrame.opacity })} class="mt-1 w-full accent-(--color-accent)" />
              </label>

              <label class="block text-xs text-(--color-text-muted)">
                Rotate {selectedOverlayFrame.rotation.toFixed(0)} deg
                <input type="range" min="-180" max="180" step="1" value={selectedOverlayFrame.rotation} oninput={(event) => updateOverlayFrameAtPlayhead(selectedOverlay, { rotation: parseFloat((event.target as HTMLInputElement).value) || selectedOverlayFrame.rotation })} class="mt-1 w-full accent-(--color-accent)" />
              </label>

              <div class="space-y-2 border border-(--color-border) bg-(--color-bg) p-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold">Keyframes</p>
                  <span class="text-[11px] font-mono text-(--color-text-muted)">{selectedOverlay.keyframes.length}</span>
                </div>
                <p class="text-[11px] text-(--color-text-muted)">Move the playhead, adjust position/size/rotation/opacity, then save the frame. Playback interpolates smoothly between saved points.</p>
                <div class="grid grid-cols-2 gap-2">
                  <button type="button" onclick={addOrUpdateOverlayKeyframe} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Save at playhead</button>
                  <button type="button" onclick={clearOverlayKeyframes} disabled={selectedOverlay.keyframes.length === 0} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text) disabled:opacity-40 disabled:cursor-not-allowed">Clear keys</button>
                </div>
                {#if selectedOverlay.keyframes.length > 0}
                  <div class="max-h-28 space-y-1 overflow-auto">
                    {#each getSortedOverlayKeyframes(selectedOverlay) as keyframe (keyframe.id)}
                      <div class="grid grid-cols-[1fr_auto] gap-1">
                        <button
                          type="button"
                          onclick={() => seekTo(keyframe.time)}
                          class="min-w-0 border border-(--color-border) px-2 py-1 text-left text-[11px] text-(--color-text-muted) hover:text-(--color-text)"
                        >
                          <span class="block font-mono text-(--color-text)">{formatTime(keyframe.time)}</span>
                          <span class="block truncate">X {Math.round(keyframe.x * 100)} · Y {Math.round(keyframe.y * 100)} · R {Math.round(keyframe.rotation)} deg</span>
                        </button>
                        <button
                          type="button"
                          onclick={() => removeOverlayKeyframe(keyframe.id)}
                          class="border border-(--color-border) px-2 py-1 text-[11px] text-(--color-text-muted) hover:text-(--color-error-text)"
                        >
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="grid grid-cols-3 gap-2">
                <button type="button" onclick={setOverlayStartToPlayhead} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Start here</button>
                <button type="button" onclick={setOverlayEndToPlayhead} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">End here</button>
                <button type="button" onclick={removeSelectedOverlay} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text)">Remove</button>
              </div>
            </div>
          {:else}
            <p class="text-xs text-(--color-text-muted)">Add a text, SVG, or image layer, then drag it directly on the preview.</p>
          {/if}
        </div>

        <div class="p-4 border border-(--color-border) bg-(--editor-panel-strong)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-semibold mb-3">Deliver</h3>
          <div class="mb-3 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              {#each OUTPUT_SIZE_PRESETS as preset}
                <button
                  type="button"
                  onclick={() => setOutputSizePreset(preset.id)}
                  class="border px-2 py-1.5 text-left text-[11px] transition-colors {outputSizePreset === preset.id ? 'border-(--color-accent) bg-(--editor-selected) text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                  <span class="block font-medium">{preset.label}</span>
                  <span class="font-mono">{preset.width ? `${preset.width}x${preset.height}` : `${outputWidth}x${outputHeight}`}</span>
                </button>
              {/each}
            </div>
            <div class="grid grid-cols-3 gap-2">
              <label class="text-xs text-(--color-text-muted)">
                Width
                <input type="number" min="128" max="4096" step="2" value={outputWidth} oninput={(event) => updateCustomOutputSize(parseFloat((event.target as HTMLInputElement).value) || outputWidth, outputHeight)} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
              </label>
              <label class="text-xs text-(--color-text-muted)">
                Height
                <input type="number" min="128" max="4096" step="2" value={outputHeight} oninput={(event) => updateCustomOutputSize(outputWidth, parseFloat((event.target as HTMLInputElement).value) || outputHeight)} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
              </label>
              <label class="text-xs text-(--color-text-muted)">
                FPS
                <input type="number" min="12" max="60" step="1" bind:value={outputFrameRate} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <label class="text-xs text-(--color-text-muted)">
              Format
              <select bind:value={exportFormat} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)">
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
                <option value="gif">GIF</option>
                <option value="png">PNG frame</option>
                <option value="webp">WEBP frame</option>
                <option value="jpg">JPG frame</option>
              </select>
            </label>
            <label class="text-xs text-(--color-text-muted)">
              Quality CRF
              <input type="number" min="16" max="36" bind:value={exportCrf} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
            </label>
          </div>

          {#if exportStatus}
            <div class="mb-3 text-xs text-(--color-text-muted)">
              <div class="flex items-center justify-between mb-1">
                <span>{exportStatus}</span>
                <span>{exportProgress}%</span>
              </div>
              <div class="h-1.5 border border-(--color-border) bg-(--color-bg)">
                <div class="h-full bg-(--color-accent) transition-all" style={`width: ${exportProgress}%`}></div>
              </div>
            </div>
          {/if}

          <button
            type="button"
            onclick={exportVideo}
            disabled={!canExport}
            class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-semibold hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? "Exporting..." : isStillExportFormat() ? "Export frame" : "Export video"}
          </button>

          {#if exportedUrl}
            <button
              type="button"
              onclick={downloadExport}
              class="mt-2 w-full px-4 py-2 border border-(--color-border) text-(--color-text) text-sm hover:bg-(--editor-selected) transition-colors"
            >
              Download {exportedName}
            </button>
          {/if}

          <p class="mt-3 text-[11px] text-(--color-text-muted)">
            FFmpeg loads on demand. Large files can be slow, especially on mobile browsers.
          </p>
        </div>
      </aside>
      {#if isDraggingOver}
        <div class="absolute inset-4 z-20 border-2 border-dashed border-(--color-accent) bg-(--color-bg-alt)/90 flex items-center justify-center text-lg font-medium text-(--color-text)">
          Drop video or audio files to add them to the project
        </div>
      {/if}
    </section>

  {#if isGraphicModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add graphic layer">
      <button
        type="button"
        class="absolute inset-0 bg-black/55"
        aria-label="Close graphic layer dialog"
        onclick={() => (isGraphicModalOpen = false)}
      ></button>

      <div class="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-auto border border-(--color-border) bg-(--color-bg-alt) shadow-2xl">
        <div class="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-(--color-text)">Graphic layer</h3>
            <p class="text-xs text-(--color-text-muted)">Add a Shorts-style graphic, import your own asset, or edit the selected layer.</p>
          </div>
          <button
            type="button"
            onclick={() => (isGraphicModalOpen = false)}
            class="px-2 py-1 text-sm text-(--color-text-muted) hover:text-(--color-text)"
          >
            Close
          </button>
        </div>

        <div class="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-4">
            <section>
              <h4 class="mb-2 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Create</h4>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button type="button" onclick={addTextOverlay} class="border border-(--color-border) bg-(--color-bg) p-3 text-left hover:border-(--color-accent) transition-colors">
                  <span class="block text-sm font-medium text-(--color-text)">Text</span>
                  <span class="block text-xs text-(--color-text-muted)">Caption or callout</span>
                </button>
                <button type="button" onclick={() => addSvgOverlay()} class="border border-(--color-border) bg-(--color-bg) p-3 text-left hover:border-(--color-accent) transition-colors">
                  <span class="block text-sm font-medium text-(--color-text)">Badge</span>
                  <span class="block text-xs text-(--color-text-muted)">Default SVG</span>
                </button>
                <button type="button" onclick={() => svgInput?.click()} class="border border-(--color-border) bg-(--color-bg) p-3 text-left hover:border-(--color-accent) transition-colors">
                  <span class="block text-sm font-medium text-(--color-text)">SVG file</span>
                  <span class="block text-xs text-(--color-text-muted)">Import vector</span>
                </button>
                <button type="button" onclick={() => imageInput?.click()} class="border border-(--color-border) bg-(--color-bg) p-3 text-left hover:border-(--color-accent) transition-colors">
                  <span class="block text-sm font-medium text-(--color-text)">Image</span>
                  <span class="block text-xs text-(--color-text-muted)">PNG/JPG/WebP</span>
                </button>
              </div>
            </section>

            <section>
              <h4 class="mb-2 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Presets</h4>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {#each SVG_PRESETS as preset}
                  <button
                    type="button"
                    onclick={() => addSvgOverlay(preset.svg, preset.label)}
                    class="group border border-(--color-border) bg-(--color-bg) p-2 text-left hover:border-(--color-accent) transition-colors"
                  >
                    <span class="grid h-16 place-items-center overflow-hidden bg-(--color-bg-alt) mb-2 svg-layer">
                      {@html preset.svg}
                    </span>
                    <span class="text-xs font-medium text-(--color-text)">{preset.label}</span>
                  </button>
                {/each}
              </div>
            </section>
          </div>

          <div class="border border-(--color-border) bg-(--color-bg) p-3">
            {#if selectedOverlay}
              {@const selectedOverlayModalFrame = getOverlayFrameAtTime(selectedOverlay, playhead)}
              <h4 class="mb-3 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Edit selected</h4>
              <div class="space-y-3">
                <label class="block text-xs text-(--color-text-muted)">
                  Label
                  <input type="text" bind:value={selectedOverlay.label} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                </label>

                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs text-(--color-text-muted)">
                    Start
                    <input type="number" min="0" max={Math.max(timelineDisplayDuration, selectedOverlay.end, 60)} step="0.1" value={selectedOverlay.start.toFixed(1)} oninput={(event) => updateOverlayStartTime(selectedOverlay, parseFloat((event.target as HTMLInputElement).value) || 0)} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                  </label>
                  <label class="text-xs text-(--color-text-muted)">
                    End
                    <input type="number" min="0" max={Math.max(timelineDisplayDuration, selectedOverlay.end, 60)} step="0.1" value={selectedOverlay.end.toFixed(1)} oninput={(event) => updateOverlayEndTime(selectedOverlay, parseFloat((event.target as HTMLInputElement).value) || selectedOverlay.end)} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs text-(--color-text-muted)">
                    Width %
                    <input type="number" min="5" max="100" step="1" value={(selectedOverlayModalFrame.width * 100).toFixed(0)} oninput={(event) => resizeOverlay(selectedOverlay, { width: (parseFloat((event.target as HTMLInputElement).value) || 5) / 100 })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                  </label>
                  <label class="text-xs text-(--color-text-muted)">
                    Height %
                    <input type="number" min="5" max="100" step="1" value={(selectedOverlayModalFrame.height * 100).toFixed(0)} oninput={(event) => resizeOverlay(selectedOverlay, { height: (parseFloat((event.target as HTMLInputElement).value) || 5) / 100 })} class="mt-1 w-full px-2 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
                  </label>
                </div>

                <label class="block text-xs text-(--color-text-muted)">
                  Opacity {Math.round(selectedOverlayModalFrame.opacity * 100)}%
                  <input type="range" min="0.1" max="1" step="0.05" value={selectedOverlayModalFrame.opacity} oninput={(event) => updateOverlayFrameAtPlayhead(selectedOverlay, { opacity: parseFloat((event.target as HTMLInputElement).value) || selectedOverlayModalFrame.opacity })} class="mt-1 w-full accent-(--color-accent)" />
                </label>

                <div class="grid grid-cols-2 gap-2">
                  <button type="button" onclick={addOrUpdateOverlayKeyframe} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)">Save keyframe</button>
                  <button type="button" onclick={clearOverlayKeyframes} disabled={selectedOverlay.keyframes.length === 0} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text) disabled:opacity-40 disabled:cursor-not-allowed">Clear keys</button>
                </div>

                <button type="button" onclick={removeSelectedOverlay} class="w-full px-3 py-2 text-sm border border-(--color-border) text-(--color-text-muted) hover:text-(--color-error-text)">
                  Remove selected layer
                </button>
              </div>
            {:else}
              <div class="py-10 text-center">
                <p class="text-sm font-medium text-(--color-text)">No graphic selected</p>
                <p class="mt-1 text-xs text-(--color-text-muted)">Create or select a layer to edit timing, size, opacity, and motion.</p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if isFinalPreviewExpanded}
    <div class="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 text-white backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Large final monitor">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-wider text-white/60 font-semibold">Final Monitor</p>
          <p class="text-sm text-white/80">Deliver {outputWidth}x{outputHeight} · {formatTime(playhead)} / {formatTime(timelineDuration)}</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick={togglePlayback} disabled={!hasTimelineContent} class="border border-white/20 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onclick={stopPlayback} disabled={!hasTimelineContent} class="border border-white/20 px-3 py-2 text-sm text-white/75 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">
            Reset
          </button>
          <button type="button" onclick={() => (isFinalPreviewExpanded = false)} class="border border-white/20 px-3 py-2 text-sm text-white/75 hover:text-white">
            Close
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden border border-white/10 bg-black p-3 flex items-center justify-center" style="container-type: size;">
        <div
          class="relative overflow-hidden select-none shadow-2xl ring-1 ring-white/20"
          style={getMonitorFrameStyle(outputWidth || 16, outputHeight || 9)}
        >
          <div
            class="absolute inset-0"
            style={`${getStageBackgroundStyle()} ${backgroundMode === "image" && backgroundBlur > 0 ? `filter: blur(${backgroundBlur}px); transform: scale(1.06);` : ""}`}
          ></div>

          {#each getVisibleClipViewsAt(playhead) as clip (clip.id)}
            <div class="absolute overflow-hidden bg-black" style={`${getClipBoxStyle(clip, true)} border-radius: ${stageRounded}px; filter: drop-shadow(0 ${Math.round(clamp(stageShadow, 0, 100) / 4)}px ${Math.round(clamp(stageShadow, 0, 100) / 1.6)}px rgba(0,0,0,${(0.18 + clamp(stageShadow, 0, 100) / 180).toFixed(2)}));`}>
              <video
                use:expandedFinalPreviewClipNode={clip}
                muted
                playsinline
                class="absolute object-cover"
                style={`${getClipCropStyle(clip)} filter: ${getClipCssFilter(clip)};`}
              ></video>
            </div>
          {/each}

          <div class="pointer-events-none absolute inset-0">
            {#each overlays as overlay (overlay.id)}
              {#if isOverlayVisible(overlay)}
                <div
                  class="absolute overflow-hidden"
                  style={getOverlayBoxStyle(overlay, playhead, true)}
                >
                  {#if overlay.kind === "text"}
                    <div
                      class="w-full h-full flex items-center justify-center text-center px-3 overflow-hidden"
                      style={`color: ${overlay.color}; background: ${formatOverlayBackground(overlay)}; font-size: ${Math.max(10, overlay.fontSize / 3)}px; font-weight: ${overlay.fontWeight};`}
                    >
                      {overlay.text}
                    </div>
                  {:else if overlay.kind === "svg"}
                    <div class="svg-layer w-full h-full overflow-hidden">
                      {@html overlay.svg}
                    </div>
                  {:else}
                    <img src={overlay.imageSrc} alt={overlay.label} class="w-full h-full object-contain" draggable="false" />
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>

      <div class="mt-3 border border-white/10 bg-white/5 p-3">
        <div class="mb-2 flex items-center justify-between text-xs font-mono text-white/70">
          <span>{formatTime(playhead)}</span>
          <span>{formatTime(timelineDuration)}</span>
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(timelineDuration, 0.01)}
          step="0.01"
          value={playhead}
          oninput={scrubExpandedFinalPreview}
          disabled={!hasTimelineContent}
          aria-label="Final preview timeline"
          class="final-preview-scrubber w-full disabled:opacity-40 disabled:cursor-not-allowed"
          style={`--progress: ${expandedFinalProgress}%;`}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .video-editor-shell {
    --editor-bg: var(--color-bg);
    --editor-panel: var(--color-bg-alt);
    --editor-panel-strong: color-mix(in srgb, var(--color-bg-alt) 72%, var(--color-bg));
    --editor-selected: color-mix(in srgb, var(--color-accent) 10%, transparent);
    --editor-preview: color-mix(in srgb, var(--color-bg) 86%, #000000 14%);
  }

  :global(:root.dark) .video-editor-shell {
    --editor-panel-strong: color-mix(in srgb, var(--color-bg-alt) 72%, #000000);
    --editor-preview: #050507;
  }

  .svg-layer :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .final-preview-scrubber {
    appearance: none;
    height: 10px;
    border-radius: 9999px;
    background: linear-gradient(90deg, #ffffff var(--progress), rgba(255,255,255,0.16) var(--progress));
    cursor: pointer;
    outline: none;
  }

  .final-preview-scrubber::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border: 2px solid rgba(0,0,0,0.45);
    border-radius: 9999px;
    background: #ffffff;
  }

  .final-preview-scrubber::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(0,0,0,0.45);
    border-radius: 9999px;
    background: #ffffff;
  }

  .final-preview-scrubber::-moz-range-track {
    background: transparent;
    border: 0;
  }
</style>
