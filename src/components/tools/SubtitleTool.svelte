<script lang="ts">
  import { untrack } from "svelte";
  
  type Tab = "editor" | "timeline";
  type SubtitleFormat = "srt" | "vtt" | "ass";
  type ModalType = "shift" | "search" | "settings" | null;

  interface Subtitle {
    id: number;
    startTime: number; // milliseconds
    endTime: number;
    text: string;
  }

  interface SearchState {
    query: string;
    replacement: string;
    caseSensitive: boolean;
    results: number[];
    currentIndex: number;
  }

  // State
  let activeTab = $state<Tab>("editor");
  let subtitles = $state<Subtitle[]>([]);
  let selectedId = $state<number | null>(null);
  let format = $state<SubtitleFormat>("srt");
  let copied = $state<string | null>(null);
  let activeModal = $state<ModalType>(null);
  let fileName = $state("subtitles");

  // Shift modal state
  let shiftAmount = $state(0);
  let shiftUnit = $state<"ms" | "s">("s");
  let shiftDirection = $state<"forward" | "backward">("forward");

  // Search state
  let search = $state<SearchState>({
    query: "",
    replacement: "",
    caseSensitive: false,
    results: [],
    currentIndex: -1,
  });

  // Settings state
  let settings = $state({
    maxCharsPerLine: 42,
    maxLines: 2,
    minGapMs: 100,
  });

  // Timeline state
  let timelineZoom = $state(0.5);
  let timelineScroll = $state(0);
  let isDragging = $state(false);
  let dragSubtitleId = $state<number | null>(null);
  let dragType = $state<"move" | "start" | "end" | null>(null);
  let dragStartX = $state(0);
  let dragStartTime = $state(0);

  // File input ref
  let fileInput = $state<HTMLInputElement | null>(null);
  
  // Track if initial load from localStorage is done (not reactive)
  let initialLoadDone = false;

  // Derived values
  let totalDuration = $derived(
    subtitles.length > 0 ? Math.max(...subtitles.map((s) => s.endTime)) : 0
  );

  let overlaps = $derived(findOverlaps());

  let selectedSubtitle = $derived(
    subtitles.find((s) => s.id === selectedId) ?? null
  );

  let stats = $derived({
    count: subtitles.length,
    duration: totalDuration,
    overlaps: overlaps.length,
    warnings: subtitles.filter((s) => {
      const lines = s.text.split("\n");
      if (lines.length > settings.maxLines) return true;
      return lines.some((line) => line.length > settings.maxCharsPerLine);
    }).length,
  });

  // Load from localStorage on mount (runs once)
  $effect(() => {
    if (initialLoadDone) return;
    initialLoadDone = true;
    
    untrack(() => {
      const stored = localStorage.getItem("subtitle-editor-data");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.subtitles && parsed.subtitles.length > 0) {
            subtitles = parsed.subtitles;
          }
          if (parsed.format) format = parsed.format;
          if (parsed.fileName) fileName = parsed.fileName;
          if (parsed.settings) settings = { ...settings, ...parsed.settings };
        } catch {
          // Ignore parse errors
        }
      }
    });
  });

  // Save to localStorage when data changes
  $effect(() => {
    // Read the reactive values to track them
    const data = { subtitles, format, fileName, settings };
    
    // Don't save during initial load
    if (!initialLoadDone) return;
    
    untrack(() => {
      if (data.subtitles.length > 0) {
        localStorage.setItem("subtitle-editor-data", JSON.stringify(data));
      }
    });
  });

  // Keyboard shortcuts
  $effect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Ignore if in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "o":
            e.preventDefault();
            fileInput?.click();
            break;
          case "s":
            e.preventDefault();
            exportSubtitles();
            break;
          case "f":
            e.preventDefault();
            if (e.shiftKey) {
              activeModal = "search";
            } else {
              activeModal = "search";
            }
            break;
        }
      } else {
        switch (e.key) {
          case "Delete":
            if (selectedId !== null) {
              deleteSubtitle(selectedId);
            }
            break;
          case "Escape":
            activeModal = null;
            selectedId = null;
            break;
          case "ArrowUp":
            e.preventDefault();
            selectPrevious();
            break;
          case "ArrowDown":
            e.preventDefault();
            selectNext();
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  // Format time for display (HH:MM:SS,mmm)
  function formatTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${millis.toString().padStart(3, "0")}`;
  }

  // Format time for VTT (HH:MM:SS.mmm)
  function formatTimeVTT(ms: number): string {
    return formatTime(ms).replace(",", ".");
  }

  // Parse time string to milliseconds
  function parseTime(str: string): number {
    // Support both comma and dot for milliseconds
    const normalized = str.replace(".", ",");
    const match = normalized.match(/(\d+):(\d+):(\d+),(\d+)/);
    if (!match) return 0;
    const [, h, m, s, ms] = match;
    return (
      parseInt(h) * 3600000 +
      parseInt(m) * 60000 +
      parseInt(s) * 1000 +
      parseInt(ms.padEnd(3, "0").slice(0, 3))
    );
  }

  // Format duration for display
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    return `${seconds.toFixed(1)}s`;
  }

  // Find overlapping subtitles
  function findOverlaps(): number[] {
    const overlapping: number[] = [];
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].endTime > sorted[i + 1].startTime) {
        if (!overlapping.includes(sorted[i].id)) {
          overlapping.push(sorted[i].id);
        }
        if (!overlapping.includes(sorted[i + 1].id)) {
          overlapping.push(sorted[i + 1].id);
        }
      }
    }

    return overlapping;
  }

  // Check if subtitle has character warning
  function hasCharWarning(sub: Subtitle): boolean {
    const lines = sub.text.split("\n");
    if (lines.length > settings.maxLines) return true;
    return lines.some((line) => line.length > settings.maxCharsPerLine);
  }

  // Get character count info
  function getCharInfo(sub: Subtitle): { lines: number; maxChars: number } {
    const lines = sub.text.split("\n");
    const maxChars = Math.max(...lines.map((l) => l.length));
    return { lines: lines.length, maxChars };
  }

  // Generate next ID
  function nextId(): number {
    return subtitles.length > 0
      ? Math.max(...subtitles.map((s) => s.id)) + 1
      : 1;
  }

  // Add new subtitle
  function addSubtitle() {
    const lastSub = subtitles[subtitles.length - 1];
    const startTime = lastSub ? lastSub.endTime + 1000 : 0;
    const newSub: Subtitle = {
      id: nextId(),
      startTime,
      endTime: startTime + 3000,
      text: "",
    };
    subtitles = [...subtitles, newSub];
    selectedId = newSub.id;
  }

  // Delete subtitle
  function deleteSubtitle(id: number) {
    subtitles = subtitles.filter((s) => s.id !== id);
    if (selectedId === id) {
      selectedId = null;
    }
    renumberSubtitles();
  }

  // Renumber subtitles sequentially
  function renumberSubtitles() {
    subtitles = subtitles
      .sort((a, b) => a.startTime - b.startTime)
      .map((s, i) => ({ ...s, id: i + 1 }));
  }

  // Update subtitle
  function updateSubtitle(id: number, updates: Partial<Subtitle>) {
    subtitles = subtitles.map((s) => (s.id === id ? { ...s, ...updates } : s));
  }

  // Split subtitle at cursor
  function splitSubtitle(id: number) {
    const sub = subtitles.find((s) => s.id === id);
    if (!sub) return;

    const midTime = Math.floor((sub.startTime + sub.endTime) / 2);
    const lines = sub.text.split("\n");
    const midLine = Math.floor(lines.length / 2);

    const firstText =
      lines.length > 1 ? lines.slice(0, midLine).join("\n") : sub.text;
    const secondText =
      lines.length > 1 ? lines.slice(midLine).join("\n") : "";

    updateSubtitle(id, { endTime: midTime, text: firstText });

    const newSub: Subtitle = {
      id: nextId(),
      startTime: midTime,
      endTime: sub.endTime,
      text: secondText,
    };

    const index = subtitles.findIndex((s) => s.id === id);
    subtitles = [
      ...subtitles.slice(0, index + 1),
      newSub,
      ...subtitles.slice(index + 1),
    ];

    renumberSubtitles();
  }

  // Merge with next subtitle
  function mergeWithNext(id: number) {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    const index = sorted.findIndex((s) => s.id === id);
    if (index < 0 || index >= sorted.length - 1) return;

    const current = sorted[index];
    const next = sorted[index + 1];

    updateSubtitle(current.id, {
      endTime: next.endTime,
      text: current.text + "\n" + next.text,
    });

    deleteSubtitle(next.id);
  }

  // Select previous subtitle
  function selectPrevious() {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    if (selectedId === null && sorted.length > 0) {
      selectedId = sorted[0].id;
      return;
    }
    const index = sorted.findIndex((s) => s.id === selectedId);
    if (index > 0) {
      selectedId = sorted[index - 1].id;
    }
  }

  // Select next subtitle
  function selectNext() {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    if (selectedId === null && sorted.length > 0) {
      selectedId = sorted[0].id;
      return;
    }
    const index = sorted.findIndex((s) => s.id === selectedId);
    if (index < sorted.length - 1) {
      selectedId = sorted[index + 1].id;
    }
  }

  // Apply time shift
  function applyTimeShift() {
    const shiftMs =
      shiftUnit === "s" ? shiftAmount * 1000 : shiftAmount;
    const actualShift =
      shiftDirection === "forward" ? shiftMs : -shiftMs;

    subtitles = subtitles.map((s) => ({
      ...s,
      startTime: Math.max(0, s.startTime + actualShift),
      endTime: Math.max(0, s.endTime + actualShift),
    }));

    activeModal = null;
  }

  // Auto-fix overlaps
  function autoFixOverlaps() {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].endTime > sorted[i + 1].startTime) {
        sorted[i].endTime = sorted[i + 1].startTime - settings.minGapMs;
      }
    }

    subtitles = sorted;
  }

  // Search functions
  function performSearch() {
    if (!search.query) {
      search.results = [];
      search.currentIndex = -1;
      return;
    }

    const flags = search.caseSensitive ? "" : "i";
    const regex = new RegExp(search.query, flags);

    search.results = subtitles
      .filter((s) => regex.test(s.text))
      .map((s) => s.id);

    search.currentIndex = search.results.length > 0 ? 0 : -1;

    if (search.results.length > 0) {
      selectedId = search.results[0];
    }
  }

  function searchNext() {
    if (search.results.length === 0) return;
    search.currentIndex = (search.currentIndex + 1) % search.results.length;
    selectedId = search.results[search.currentIndex];
  }

  function searchPrev() {
    if (search.results.length === 0) return;
    search.currentIndex =
      (search.currentIndex - 1 + search.results.length) % search.results.length;
    selectedId = search.results[search.currentIndex];
  }

  function replaceOne() {
    if (selectedId === null || !search.query) return;
    const sub = subtitles.find((s) => s.id === selectedId);
    if (!sub) return;

    const flags = search.caseSensitive ? "" : "i";
    const regex = new RegExp(search.query, flags);
    const newText = sub.text.replace(regex, search.replacement);

    updateSubtitle(selectedId, { text: newText });
    performSearch();
  }

  function replaceAll() {
    if (!search.query) return;

    const flags = search.caseSensitive ? "g" : "gi";
    const regex = new RegExp(search.query, flags);

    subtitles = subtitles.map((s) => ({
      ...s,
      text: s.text.replace(regex, search.replacement),
    }));

    performSearch();
  }

  // ==================== PARSERS ====================

  // Detect format from content
  function detectFormat(content: string): SubtitleFormat {
    const trimmed = content.trim();
    if (trimmed.startsWith("WEBVTT")) return "vtt";
    if (trimmed.includes("[Script Info]") || trimmed.includes("[V4+ Styles]"))
      return "ass";
    return "srt";
  }

  // Parse SRT format
  function parseSRT(content: string): Subtitle[] {
    // Normalize line endings (handle Windows \r\n and Mac \r)
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalized.trim().split(/\n\n+/);
    const result: Subtitle[] = [];

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 2) continue;

      // Find the timestamp line
      let timestampLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timestampLine = i;
          break;
        }
      }

      if (timestampLine < 0) continue;

      const timeMatch = lines[timestampLine].match(
        /(\d+:\d+:\d+[,\.]\d+)\s*-->\s*(\d+:\d+:\d+[,\.]\d+)/
      );
      if (!timeMatch) continue;

      const startTime = parseTime(timeMatch[1]);
      const endTime = parseTime(timeMatch[2]);
      const text = lines.slice(timestampLine + 1).join("\n").trim();

      result.push({
        id: result.length + 1,
        startTime,
        endTime,
        text,
      });
    }

    return result;
  }

  // Parse WebVTT format
  function parseVTT(content: string): Subtitle[] {
    // Normalize line endings
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    
    // Find start of cues (skip WEBVTT header and any metadata)
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        // Go back to find the cue identifier if present
        startIndex = i > 0 && /^\d+$/.test(lines[i - 1].trim()) ? i - 1 : i;
        break;
      }
    }

    // Re-join and parse similar to SRT
    const remaining = lines.slice(startIndex).join("\n");
    return parseSRT(remaining);
  }

  // Parse ASS/SSA format
  function parseASS(content: string): Subtitle[] {
    const result: Subtitle[] = [];
    const lines = content.split("\n");

    let inEvents = false;
    let formatOrder: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === "[Events]") {
        inEvents = true;
        continue;
      }

      if (trimmed.startsWith("[") && trimmed !== "[Events]") {
        inEvents = false;
        continue;
      }

      if (inEvents) {
        if (trimmed.startsWith("Format:")) {
          formatOrder = trimmed
            .substring(7)
            .split(",")
            .map((s) => s.trim().toLowerCase());
          continue;
        }

        if (trimmed.startsWith("Dialogue:")) {
          const parts = trimmed.substring(9).split(",");
          const startIdx = formatOrder.indexOf("start");
          const endIdx = formatOrder.indexOf("end");
          const textIdx = formatOrder.indexOf("text");

          if (startIdx >= 0 && endIdx >= 0 && textIdx >= 0) {
            // ASS time format: H:MM:SS.cc
            const parseASSTime = (t: string): number => {
              const match = t.trim().match(/(\d+):(\d+):(\d+)\.(\d+)/);
              if (!match) return 0;
              return (
                parseInt(match[1]) * 3600000 +
                parseInt(match[2]) * 60000 +
                parseInt(match[3]) * 1000 +
                parseInt(match[4]) * 10
              );
            };

            // Text is everything from textIdx onwards (may contain commas)
            const text = parts
              .slice(textIdx)
              .join(",")
              .replace(/\\N/g, "\n")
              .replace(/\{[^}]*\}/g, ""); // Remove style tags

            result.push({
              id: result.length + 1,
              startTime: parseASSTime(parts[startIdx]),
              endTime: parseASSTime(parts[endIdx]),
              text: text.trim(),
            });
          }
        }
      }
    }

    return result;
  }

  // ==================== EXPORTERS ====================

  // Export to SRT format
  function exportSRT(): string {
    return subtitles
      .sort((a, b) => a.startTime - b.startTime)
      .map(
        (s, i) =>
          `${i + 1}\n${formatTime(s.startTime)} --> ${formatTime(s.endTime)}\n${s.text}`
      )
      .join("\n\n");
  }

  // Export to WebVTT format
  function exportVTT(): string {
    const cues = subtitles
      .sort((a, b) => a.startTime - b.startTime)
      .map(
        (s, i) =>
          `${i + 1}\n${formatTimeVTT(s.startTime)} --> ${formatTimeVTT(s.endTime)}\n${s.text}`
      )
      .join("\n\n");

    return `WEBVTT\n\n${cues}`;
  }

  // Export to ASS format
  function exportASS(): string {
    const formatASSTime = (ms: number): string => {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const centis = Math.floor((ms % 1000) / 10);
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
    };

    const header = `[Script Info]
Title: Exported from Subtitle Editor
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    const events = subtitles
      .sort((a, b) => a.startTime - b.startTime)
      .map(
        (s) =>
          `Dialogue: 0,${formatASSTime(s.startTime)},${formatASSTime(s.endTime)},Default,,0,0,0,,${s.text.replace(/\n/g, "\\N")}`
      )
      .join("\n");

    return `${header}\n${events}`;
  }

  // ==================== FILE OPERATIONS ====================

  // Import file
  function handleFileImport(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    fileName = file.name.replace(/\.[^.]+$/, "");

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        return;
      }
      
      const detectedFormat = detectFormat(content);
      format = detectedFormat;

      let parsed: Subtitle[] = [];
      switch (detectedFormat) {
        case "vtt":
          parsed = parseVTT(content);
          break;
        case "ass":
          parsed = parseASS(content);
          break;
        default:
          parsed = parseSRT(content);
      }

      // Update state
      subtitles = parsed;
      selectedId = parsed.length > 0 ? parsed[0].id : null;
    };
    
    reader.readAsText(file);

    // Reset input to allow re-importing same file
    target.value = "";
  }

  // Export subtitles
  function exportSubtitles() {
    let content: string;
    let extension: string;
    let mimeType: string;

    switch (format) {
      case "vtt":
        content = exportVTT();
        extension = "vtt";
        mimeType = "text/vtt";
        break;
      case "ass":
        content = exportASS();
        extension = "ass";
        mimeType = "text/plain";
        break;
      default:
        content = exportSRT();
        extension = "srt";
        mimeType = "text/plain";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Copy to clipboard
  function copyToClipboard() {
    let content: string;
    switch (format) {
      case "vtt":
        content = exportVTT();
        break;
      case "ass":
        content = exportASS();
        break;
      default:
        content = exportSRT();
    }

    navigator.clipboard.writeText(content);
    copied = "content";
    setTimeout(() => (copied = null), 2000);
  }

  // Clear all
  function clearAll() {
    if (
      subtitles.length > 0 &&
      !confirm("Are you sure you want to clear all subtitles?")
    ) {
      return;
    }
    subtitles = [];
    selectedId = null;
    fileName = "subtitles";
    localStorage.removeItem("subtitle-editor-data");
  }

  // ==================== TIMELINE ====================

  // Calculate pixel position from time
  function timeToPixel(ms: number): number {
    // Base: 50 pixels per second at zoom 1.0
    const pixelsPerSecond = 50 * timelineZoom;
    return (ms / 1000) * pixelsPerSecond;
  }

  // Calculate time from pixel position
  function pixelToTime(px: number): number {
    const pixelsPerSecond = 50 * timelineZoom;
    return Math.round((px / pixelsPerSecond) * 1000);
  }

  // Timeline drag handlers
  function handleTimelineDragStart(
    e: MouseEvent,
    id: number,
    type: "move" | "start" | "end"
  ) {
    e.preventDefault();
    isDragging = true;
    dragSubtitleId = id;
    dragType = type;
    dragStartX = e.clientX;

    const sub = subtitles.find((s) => s.id === id);
    if (sub) {
      dragStartTime = type === "end" ? sub.endTime : sub.startTime;
    }
  }

  function handleTimelineDrag(e: MouseEvent) {
    if (!isDragging || dragSubtitleId === null || !dragType) return;

    const deltaX = e.clientX - dragStartX;
    const deltaTime = pixelToTime(deltaX);

    const sub = subtitles.find((s) => s.id === dragSubtitleId);
    if (!sub) return;

    if (dragType === "move") {
      const newStart = Math.max(0, dragStartTime + deltaTime);
      const duration = sub.endTime - sub.startTime;
      updateSubtitle(dragSubtitleId, {
        startTime: newStart,
        endTime: newStart + duration,
      });
    } else if (dragType === "start") {
      const newStart = Math.max(
        0,
        Math.min(sub.endTime - 100, dragStartTime + deltaTime)
      );
      updateSubtitle(dragSubtitleId, { startTime: newStart });
    } else if (dragType === "end") {
      const newEnd = Math.max(sub.startTime + 100, dragStartTime + deltaTime);
      updateSubtitle(dragSubtitleId, { endTime: newEnd });
    }
  }

  function handleTimelineDragEnd() {
    isDragging = false;
    dragSubtitleId = null;
    dragType = null;
    renumberSubtitles();
  }

  // Add timeline event listeners
  $effect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleTimelineDrag);
      window.addEventListener("mouseup", handleTimelineDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleTimelineDrag);
        window.removeEventListener("mouseup", handleTimelineDragEnd);
      };
    }
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Edit and convert subtitle files (SRT, WebVTT, ASS) with visual timeline, time sync, and format conversion.
    </p>
  </header>

  <!-- Hidden file input -->
  <input
    type="file"
    accept=".srt,.vtt,.ass,.ssa,.sub,text/plain,text/vtt,application/x-subrip"
    onchange={handleFileImport}
    bind:this={fileInput}
    class="hidden"
  />

  <!-- Tabs -->
  <div class="flex border-b border-(--color-border) mb-4">
    <button
      onclick={() => (activeTab = "editor")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'editor'
        ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Editor
    </button>
    <button
      onclick={() => (activeTab = "timeline")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'timeline'
        ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Timeline
    </button>
  </div>

  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <!-- Import -->
    <button
      onclick={() => fileInput?.click()}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      Import
    </button>

    <!-- Export dropdown -->
    <div class="flex">
      <button
        onclick={exportSubtitles}
        class="px-3 py-1.5 text-sm border border-r-0 border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Export
      </button>
      <select
        bind:value={format}
        class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      >
        <option value="srt">SRT</option>
        <option value="vtt">VTT</option>
        <option value="ass">ASS</option>
      </select>
    </div>

    <!-- Copy -->
    <button
      onclick={copyToClipboard}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      {copied === "content" ? "Copied!" : "Copy"}
    </button>

    <div class="w-px h-6 bg-(--color-border)"></div>

    <!-- Add -->
    <button
      onclick={addSubtitle}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      + Add
    </button>

    <!-- Shift -->
    <button
      onclick={() => (activeModal = "shift")}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      Shift
    </button>

    <!-- Find -->
    <button
      onclick={() => (activeModal = "search")}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      Find
    </button>

    {#if overlaps.length > 0}
      <button
        onclick={autoFixOverlaps}
        class="px-3 py-1.5 text-sm border border-orange-500 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors"
      >
        Fix {overlaps.length} Overlap{overlaps.length > 1 ? "s" : ""}
      </button>
    {/if}

    <div class="flex-1"></div>

    <!-- Settings -->
    <button
      onclick={() => (activeModal = "settings")}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      Settings
    </button>

    <!-- Clear -->
    <button
      onclick={clearAll}
      class="px-3 py-1.5 text-sm border border-(--color-border) text-red-500 hover:bg-red-500/10 transition-colors"
    >
      Clear
    </button>
  </div>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col min-h-0 gap-4">
    {#if activeTab === "editor"}
      <!-- Editor Tab -->
      <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <!-- Subtitle List -->
        <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-hidden flex flex-col min-h-0">
          <div class="flex-1 overflow-y-auto">
            {#if subtitles.length === 0}
              <div class="h-full flex items-center justify-center text-(--color-text-muted) p-8">
                <div class="text-center">
                  <p class="mb-2">No subtitles loaded</p>
                  <p class="text-sm">Import a file or click "Add" to create a new subtitle</p>
                </div>
              </div>
            {:else}
              <div class="divide-y divide-(--color-border)">
                {#each [...subtitles].sort((a, b) => a.startTime - b.startTime) as sub (sub.id)}
                  {@const isOverlap = overlaps.includes(sub.id)}
                  {@const hasWarning = hasCharWarning(sub)}
                  {@const charInfo = getCharInfo(sub)}
                  <div
                    onclick={() => (selectedId = sub.id)}
                    onkeydown={(e) => e.key === 'Enter' && (selectedId = sub.id)}
                    role="button"
                    tabindex="0"
                    class="w-full text-left p-3 hover:bg-(--color-bg) transition-colors cursor-pointer {selectedId === sub.id
                      ? 'bg-(--color-bg) ring-2 ring-inset ring-(--color-accent)'
                      : ''} {isOverlap ? 'border-l-4 border-l-orange-500' : ''}"
                  >
                    <div class="flex items-start gap-3">
                      <span class="text-xs font-mono text-(--color-text-muted) w-6 shrink-0">
                        #{sub.id}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1 text-xs font-mono text-(--color-text-light)">
                          <span>{formatTime(sub.startTime)}</span>
                          <span class="text-(--color-text-muted)">→</span>
                          <span>{formatTime(sub.endTime)}</span>
                          <span class="text-(--color-text-muted)">({formatDuration(sub.endTime - sub.startTime)})</span>
                        </div>
                        <p class="text-sm whitespace-pre-wrap break-words {sub.text ? '' : 'text-(--color-text-muted) italic'}">
                          {sub.text || "(empty)"}
                        </p>
                        {#if hasWarning}
                          <p class="mt-1 text-xs text-orange-500">
                            {charInfo.lines} line{charInfo.lines > 1 ? "s" : ""}, {charInfo.maxChars} chars max
                            {#if charInfo.maxChars > settings.maxCharsPerLine}
                              (>{settings.maxCharsPerLine})
                            {/if}
                          </p>
                        {/if}
                      </div>
                      <div class="flex gap-1 shrink-0">
                        <button
                          onclick={(e) => { e.stopPropagation(); splitSubtitle(sub.id); }}
                          class="p-1 text-xs text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-border) transition-colors"
                          title="Split"
                        >
                          ✂
                        </button>
                        <button
                          onclick={(e) => { e.stopPropagation(); mergeWithNext(sub.id); }}
                          class="p-1 text-xs text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-border) transition-colors"
                          title="Merge with next"
                        >
                          ⊕
                        </button>
                        <button
                          onclick={(e) => { e.stopPropagation(); deleteSubtitle(sub.id); }}
                          class="p-1 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Edit Panel -->
        {#if selectedSubtitle}
          <div class="lg:w-80 shrink-0 border border-(--color-border) bg-(--color-bg-alt) p-4 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
                Edit #{selectedSubtitle.id}
              </span>
              <button
                onclick={() => (selectedId = null)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
              >
                Close
              </button>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <button
                onclick={() => splitSubtitle(selectedSubtitle.id)}
                class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors"
              >
                Split
              </button>
              <button
                onclick={() => mergeWithNext(selectedSubtitle.id)}
                class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors"
              >
                Merge
              </button>
              <button
                onclick={() => deleteSubtitle(selectedSubtitle.id)}
                class="px-3 py-1.5 text-sm border border-(--color-border) text-red-500 hover:bg-red-500/10 transition-colors"
              >
                Delete
              </button>
            </div>

            <!-- Time inputs -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs text-(--color-text-muted) mb-1">Start</label>
                <input
                  type="text"
                  value={formatTime(selectedSubtitle.startTime)}
                  onchange={(e) => updateSubtitle(selectedSubtitle.id, { startTime: parseTime(e.currentTarget.value) })}
                  class="w-full px-2 py-1.5 text-sm font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <div>
                <label class="block text-xs text-(--color-text-muted) mb-1">End</label>
                <input
                  type="text"
                  value={formatTime(selectedSubtitle.endTime)}
                  onchange={(e) => updateSubtitle(selectedSubtitle.id, { endTime: parseTime(e.currentTarget.value) })}
                  class="w-full px-2 py-1.5 text-sm font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                />
              </div>
            </div>

            <div class="text-xs text-(--color-text-muted)">
              Duration: {formatDuration(selectedSubtitle.endTime - selectedSubtitle.startTime)}
            </div>

            <!-- Text input -->
            <div class="flex-1 flex flex-col">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-(--color-text-muted)">Text</label>
                <button
                  onclick={() => updateSubtitle(selectedSubtitle.id, { text: "" })}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  Clear
                </button>
              </div>
              <textarea
                value={selectedSubtitle.text}
                oninput={(e) => updateSubtitle(selectedSubtitle.id, { text: e.currentTarget.value })}
                class="flex-1 min-h-24 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) resize-none focus:outline-none focus:border-(--color-accent)"
                placeholder="Enter subtitle text..."
              ></textarea>
              {#if selectedSubtitle}
                {@const info = getCharInfo(selectedSubtitle)}
                <div class="mt-1 text-xs {hasCharWarning(selectedSubtitle) ? 'text-orange-500' : 'text-(--color-text-muted)'}">
                  {info.lines} line{info.lines > 1 ? "s" : ""}, {info.maxChars} chars max
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Timeline Tab -->
      <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
        <!-- Timeline controls -->
        <div class="p-2 border-b border-(--color-border) flex items-center gap-4 shrink-0">
          <span class="text-xs text-(--color-text-muted)">Zoom:</span>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            bind:value={timelineZoom}
            class="w-32"
          />
          <span class="text-xs font-mono text-(--color-text-muted)">{timelineZoom.toFixed(1)}x</span>
          <div class="flex gap-1">
            <button
              onclick={() => timelineZoom = Math.max(0.1, timelineZoom - 0.1)}
              class="px-2 py-0.5 text-xs border border-(--color-border) hover:bg-(--color-border)"
            >-</button>
            <button
              onclick={() => timelineZoom = Math.min(2, timelineZoom + 0.1)}
              class="px-2 py-0.5 text-xs border border-(--color-border) hover:bg-(--color-border)"
            >+</button>
            <button
              onclick={() => timelineZoom = 0.5}
              class="px-2 py-0.5 text-xs border border-(--color-border) hover:bg-(--color-border)"
            >Fit</button>
          </div>
          <span class="text-xs text-(--color-text-muted)">
            Duration: {formatTime(totalDuration)}
          </span>
        </div>

        <!-- Timeline horizontal scroll area - fixed height with internal scroll -->
        <div class="h-full overflow-x-auto overflow-y-hidden relative">
          {#if subtitles.length === 0}
            <div class="h-full flex items-center justify-center text-(--color-text-muted) p-4">
              <p>No subtitles to display</p>
            </div>
          {:else}
            {@const timelineWidth = timeToPixel(totalDuration + 5000)}
            {@const markerInterval = timelineZoom < 0.3 ? 30000 : timelineZoom < 0.5 ? 15000 : timelineZoom < 1 ? 10000 : 5000}
            <div class="absolute inset-0 p-4" style="width: {Math.max(timelineWidth, 100)}px;">
              <!-- Time markers -->
              <div class="absolute top-0 left-0 h-6 border-b border-(--color-border)" style="width: {timelineWidth}px;">
                {#each Array(Math.ceil((totalDuration + 5000) / markerInterval)) as _, i}
                  {@const time = i * markerInterval}
                  <div
                    class="absolute top-0 bottom-0 border-l border-(--color-border)"
                    style="left: {timeToPixel(time)}px;"
                  >
                    <span class="absolute top-0 left-1 text-xs font-mono text-(--color-text-muted) whitespace-nowrap">
                      {Math.floor(time / 60000)}:{((time % 60000) / 1000).toFixed(0).padStart(2, "0")}
                    </span>
                  </div>
                {/each}
              </div>

              <!-- Subtitle blocks -->
              <div class="absolute top-8 left-0 right-0 bottom-0" style="width: {timelineWidth}px;">
                {#each subtitles as sub, index (sub.id)}
                  {@const left = timeToPixel(sub.startTime)}
                  {@const width = Math.max(timeToPixel(sub.endTime - sub.startTime), 4)}
                  {@const isOverlap = overlaps.includes(sub.id)}
                  {@const row = index % 3}
                  <div
                    class="absolute h-12 border cursor-move transition-colors {selectedId === sub.id
                      ? 'border-(--color-accent) bg-(--color-accent)/20 z-10'
                      : isOverlap
                        ? 'border-orange-500 bg-orange-500/20'
                        : 'border-(--color-border) bg-(--color-bg) hover:border-(--color-accent)'}"
                    style="left: {left}px; width: {width}px; top: {row * 38}px;"
                    onmousedown={(e) => handleTimelineDragStart(e, sub.id, "move")}
                    onclick={() => (selectedId = sub.id)}
                    role="button"
                    tabindex="0"
                  >
                    <!-- Start handle -->
                    <div
                      class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-(--color-accent)/50"
                      onmousedown={(e) => { e.stopPropagation(); handleTimelineDragStart(e, sub.id, "start"); }}
                      role="button"
                      tabindex="0"
                    ></div>
                    <!-- End handle -->
                    <div
                      class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-(--color-accent)/50"
                      onmousedown={(e) => { e.stopPropagation(); handleTimelineDragStart(e, sub.id, "end"); }}
                      role="button"
                      tabindex="0"
                    ></div>
                    <!-- Content -->
                    <div class="px-2 py-1 overflow-hidden h-full">
                      <div class="text-xs font-mono text-(--color-text-muted)">#{sub.id}</div>
                      <div class="text-xs truncate">{sub.text || "(empty)"}</div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Status Bar -->
    <div class="flex items-center gap-4 text-xs text-(--color-text-muted) px-1">
      <span>{stats.count} subtitle{stats.count !== 1 ? "s" : ""}</span>
      {#if stats.duration > 0}
        <span>Duration: {formatTime(stats.duration)}</span>
      {/if}
      {#if stats.overlaps > 0}
        <span class="text-orange-500">{stats.overlaps} overlap{stats.overlaps !== 1 ? "s" : ""}</span>
      {/if}
      {#if stats.warnings > 0}
        <span class="text-orange-500">{stats.warnings} warning{stats.warnings !== 1 ? "s" : ""}</span>
      {/if}
      <span class="flex-1"></span>
      <span class="text-(--color-text-muted)">
        Ctrl+O: Import | Ctrl+S: Export | Ctrl+F: Find | Del: Delete | Esc: Close
      </span>
    </div>
  </div>

  <!-- Modals -->
  {#if activeModal === "shift"}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => (activeModal = null)}>
      <div class="bg-(--color-bg) border border-(--color-border) p-6 w-96 max-w-full" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-medium mb-4">Shift All Subtitles</h3>
        <div class="flex gap-2 mb-4">
          <input
            type="number"
            bind:value={shiftAmount}
            class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            placeholder="Amount"
          />
          <select
            bind:value={shiftUnit}
            class="px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none"
          >
            <option value="s">seconds</option>
            <option value="ms">milliseconds</option>
          </select>
        </div>
        <div class="flex gap-2 mb-4">
          <button
            onclick={() => (shiftDirection = "forward")}
            class="flex-1 px-3 py-2 border transition-colors {shiftDirection === 'forward'
              ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
              : 'border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
          >
            Forward (+)
          </button>
          <button
            onclick={() => (shiftDirection = "backward")}
            class="flex-1 px-3 py-2 border transition-colors {shiftDirection === 'backward'
              ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
              : 'border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
          >
            Backward (-)
          </button>
        </div>
        <div class="flex justify-end gap-2">
          <button
            onclick={() => (activeModal = null)}
            class="px-4 py-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={applyTimeShift}
            class="px-4 py-2 bg-(--color-accent) text-white hover:opacity-90 transition-opacity"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if activeModal === "search"}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => (activeModal = null)}>
      <div class="bg-(--color-bg) border border-(--color-border) p-6 w-[28rem] max-w-full" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-medium mb-4">Find & Replace</h3>
        <div class="space-y-3 mb-4">
          <div>
            <label class="block text-xs text-(--color-text-muted) mb-1">Find</label>
            <input
              type="text"
              bind:value={search.query}
              oninput={performSearch}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              placeholder="Search text..."
            />
          </div>
          <div>
            <label class="block text-xs text-(--color-text-muted) mb-1">Replace with</label>
            <input
              type="text"
              bind:value={search.replacement}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              placeholder="Replacement text..."
            />
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={search.caseSensitive} onchange={performSearch} />
            Case sensitive
          </label>
        </div>
        {#if search.results.length > 0}
          <div class="mb-4 text-sm text-(--color-text-muted)">
            Found {search.results.length} match{search.results.length !== 1 ? "es" : ""}
            {#if search.currentIndex >= 0}
              (showing {search.currentIndex + 1} of {search.results.length})
            {/if}
          </div>
        {:else if search.query}
          <div class="mb-4 text-sm text-(--color-text-muted)">No matches found</div>
        {/if}
        <div class="flex gap-2">
          <button
            onclick={searchPrev}
            disabled={search.results.length === 0}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onclick={searchNext}
            disabled={search.results.length === 0}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50"
          >
            Next
          </button>
          <div class="flex-1"></div>
          <button
            onclick={replaceOne}
            disabled={search.results.length === 0 || !search.replacement}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50"
          >
            Replace
          </button>
          <button
            onclick={replaceAll}
            disabled={search.results.length === 0 || !search.replacement}
            class="px-3 py-2 bg-(--color-accent) text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if activeModal === "settings"}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => (activeModal = null)}>
      <div class="bg-(--color-bg) border border-(--color-border) p-6 w-96 max-w-full" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-medium mb-4">Settings</h3>
        <div class="space-y-4 mb-6">
          <div>
            <label class="block text-xs text-(--color-text-muted) mb-1">Max characters per line</label>
            <input
              type="number"
              bind:value={settings.maxCharsPerLine}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
            <p class="text-xs text-(--color-text-muted) mt-1">Recommended: 42 for TV, 68 for web</p>
          </div>
          <div>
            <label class="block text-xs text-(--color-text-muted) mb-1">Max lines per subtitle</label>
            <input
              type="number"
              bind:value={settings.maxLines}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div>
            <label class="block text-xs text-(--color-text-muted) mb-1">Minimum gap between subtitles (ms)</label>
            <input
              type="number"
              bind:value={settings.minGapMs}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
            <p class="text-xs text-(--color-text-muted) mt-1">Used when auto-fixing overlaps</p>
          </div>
        </div>
        <div class="flex justify-end">
          <button
            onclick={() => (activeModal = null)}
            class="px-4 py-2 bg-(--color-accent) text-white hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
