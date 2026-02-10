<script lang="ts">
  import { nanoid } from "nanoid";
  import SearchableDropdown from "../ui/SearchableDropdown.svelte";

  // Types
  type FileType = "image" | "video" | "audio" | "unknown";
  type ConversionStatus = "pending" | "processing" | "done" | "error";

  interface ConversionFile {
    id: string;
    file: File;
    type: FileType;
    status: ConversionStatus;
    progress: number;
    result?: Blob;
    outputName?: string;
    error?: string;
  }

  interface ImageSettings {
    quality: number;
    maxWidth: number;
    maxHeight: number;
    preserveAspect: boolean;
    stripMetadata: boolean;
    backgroundColor: string;
    resizeFilter: "lanczos" | "cubic" | "linear" | "nearest";
  }

  interface VideoSettings {
    crf: number;
    resolution: "original" | "2160p" | "1080p" | "720p" | "480p";
    fps: "original" | "60" | "30" | "24" | "15";
    videoCodec: "auto" | "h264" | "vp9";
    audioBitrate: "320k" | "256k" | "192k" | "128k" | "96k";
    removeAudio: boolean;
    audioCodec: "auto" | "aac" | "opus" | "mp3";
  }

  interface AudioSettings {
    bitrate: "320k" | "256k" | "192k" | "128k" | "96k";
    sampleRate: "original" | "48000" | "44100" | "22050";
    channels: "original" | "stereo" | "mono";
    normalize: boolean;
  }

  interface GifSettings {
    width: number;
    fps: number;
    colors: 256 | 128 | 64 | 32;
    loop: number; // 0 = forever, -1 = once, n = n times
    dither: boolean;
  }

  interface Preset {
    id: string;
    name: string;
    type: FileType;
    settings: Partial<ImageSettings | VideoSettings | AudioSettings>;
  }

  interface FileMetadata {
    // Common
    mimeType: string;
    lastModified: Date;
    extension: string;
    estimatedBitrate?: number; // file.size / duration
    // Image-specific
    width?: number;
    height?: number;
    aspectRatio?: string;
    hasAlpha?: boolean;
    pixelCount?: number;
    // Video-specific (browser APIs only)
    duration?: number;
    videoWidth?: number;
    videoHeight?: number;
    videoAspectRatio?: string;
    // Audio-specific (Web Audio API)
    audioDuration?: number;
    sampleRate?: number;
    channels?: number;
    channelLayout?: string; // e.g., "stereo", "mono"
  }

  // Format category types for SearchableDropdown
  interface FormatOption {
    value: string;
    label: string;
    description: string;
    details?: string;
  }

  interface FormatCategory {
    id: string;
    label: string;
    formats: FormatOption[];
  }

  // Supported input formats (for file detection)
  const IMAGE_EXTENSIONS = [
    // Common
    "png", "jpg", "jpeg", "webp", "gif", "bmp",
    // Professional
    "tiff", "tif", "psd", "exr", "hdr",
    // Modern/Web
    "avif", "heic", "heif", "jxl", "qoi",
    // Legacy
    "tga", "pcx", "ppm", "pgm", "pbm",
    // Specialized
    "jp2", "j2k", "jpf", "jpm", "mj2"
  ];
  const VIDEO_EXTENSIONS = [
    "mp4", "webm", "mkv", "avi", "mov", "flv", "wmv", "m4v", "3gp",
    "ts", "mts", "m2ts", "ogv", "mpg", "mpeg", "vob"
  ];
  const AUDIO_EXTENSIONS = [
    "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus",
    "aiff", "aif", "wv", "ac3", "oga"
  ];

  // Comprehensive output format categories
  const IMAGE_FORMAT_CATEGORIES: FormatCategory[] = [
    {
      id: "common",
      label: "Common",
      formats: [
        { value: "png", label: "PNG", description: "Portable Network Graphics", details: "Lossless, transparency support" },
        { value: "jpg", label: "JPG", description: "JPEG Image", details: "Lossy compression, small files, universal support" },
        { value: "webp", label: "WebP", description: "Web Picture Format", details: "Modern web format, lossy/lossless, transparency" },
        { value: "gif", label: "GIF", description: "Graphics Interchange Format", details: "Animation support, 256 colors max" },
        { value: "bmp", label: "BMP", description: "Bitmap Image", details: "Uncompressed, large files" },
      ],
    },
    {
      id: "professional",
      label: "Professional",
      formats: [
        { value: "tiff", label: "TIFF", description: "Tagged Image File Format", details: "Lossless, print/archive standard" },
        { value: "psd", label: "PSD", description: "Photoshop Document", details: "Adobe format, layers preserved" },
        { value: "exr", label: "EXR", description: "OpenEXR", details: "HDR imaging, VFX industry standard" },
        { value: "hdr", label: "HDR", description: "High Dynamic Range", details: "Wide color/brightness range" },
      ],
    },
    {
      id: "modern",
      label: "Modern / Web",
      formats: [
        { value: "avif", label: "AVIF", description: "AV1 Image Format", details: "Best compression, newer browser support" },
        { value: "heic", label: "HEIC", description: "High Efficiency Image", details: "Apple format, excellent compression" },
        { value: "jxl", label: "JXL", description: "JPEG XL", details: "Next-gen format, lossy/lossless" },
        { value: "qoi", label: "QOI", description: "Quite OK Image", details: "Fast lossless compression" },
      ],
    },
    {
      id: "legacy",
      label: "Legacy",
      formats: [
        { value: "tga", label: "TGA", description: "Truevision TGA", details: "Game/graphics industry legacy" },
        { value: "pcx", label: "PCX", description: "PC Paintbrush", details: "DOS-era format" },
        { value: "ppm", label: "PPM", description: "Portable Pixmap", details: "Simple uncompressed color" },
        { value: "pgm", label: "PGM", description: "Portable Graymap", details: "Simple grayscale format" },
        { value: "pbm", label: "PBM", description: "Portable Bitmap", details: "Simple 1-bit format" },
      ],
    },
    {
      id: "specialized",
      label: "Specialized",
      formats: [
        { value: "jp2", label: "JP2", description: "JPEG 2000", details: "Wavelet compression, archival use" },
      ],
    },
  ];

  const VIDEO_FORMAT_CATEGORIES: FormatCategory[] = [
    {
      id: "common",
      label: "Common",
      formats: [
        { value: "mp4", label: "MP4", description: "MPEG-4 Part 14", details: "Universal compatibility, H.264/H.265" },
        { value: "webm", label: "WebM", description: "Web Media", details: "Web-optimized, VP8/VP9 codec" },
        { value: "mkv", label: "MKV", description: "Matroska Video", details: "Flexible container, multiple tracks" },
        { value: "avi", label: "AVI", description: "Audio Video Interleave", details: "Legacy Windows format" },
        { value: "mov", label: "MOV", description: "QuickTime Movie", details: "Apple format, professional use" },
      ],
    },
    {
      id: "web",
      label: "Web / Streaming",
      formats: [
        { value: "ts", label: "TS", description: "MPEG Transport Stream", details: "Broadcast/streaming format" },
        { value: "ogv", label: "OGV", description: "Ogg Video", details: "Open format, Theora codec" },
        { value: "flv", label: "FLV", description: "Flash Video", details: "Legacy web video format" },
      ],
    },
    {
      id: "mobile",
      label: "Mobile",
      formats: [
        { value: "3gp", label: "3GP", description: "3GPP Multimedia", details: "Mobile phone format" },
      ],
    },
    {
      id: "animation",
      label: "Animation",
      formats: [
        { value: "gif", label: "GIF", description: "Animated GIF", details: "Convert video to animated GIF" },
      ],
    },
  ];

  const AUDIO_FORMAT_CATEGORIES: FormatCategory[] = [
    {
      id: "common",
      label: "Common",
      formats: [
        { value: "mp3", label: "MP3", description: "MPEG Audio Layer 3", details: "Universal lossy format" },
        { value: "wav", label: "WAV", description: "Waveform Audio", details: "Uncompressed, lossless" },
        { value: "ogg", label: "OGG", description: "Ogg Vorbis", details: "Open lossy format, good quality" },
        { value: "flac", label: "FLAC", description: "Free Lossless Audio", details: "Lossless compression, audiophile choice" },
        { value: "aac", label: "AAC", description: "Advanced Audio Coding", details: "Better than MP3 at same bitrate" },
      ],
    },
    {
      id: "modern",
      label: "Modern",
      formats: [
        { value: "opus", label: "Opus", description: "Opus Audio", details: "Best quality at low bitrates, voice/music" },
        { value: "wv", label: "WV", description: "WavPack", details: "Hybrid lossy/lossless compression" },
      ],
    },
    {
      id: "professional",
      label: "Professional",
      formats: [
        { value: "aiff", label: "AIFF", description: "Audio Interchange Format", details: "Apple lossless, studio use" },
      ],
    },
    {
      id: "surround",
      label: "Surround",
      formats: [
        { value: "ac3", label: "AC3", description: "Dolby Digital", details: "5.1 surround sound" },
      ],
    },
  ];

  // Flatten formats for backward compatibility
  const IMAGE_OUTPUT_FORMATS = IMAGE_FORMAT_CATEGORIES.flatMap((c) => c.formats.map((f) => f.value));
  const VIDEO_OUTPUT_FORMATS = VIDEO_FORMAT_CATEGORIES.flatMap((c) => c.formats.map((f) => f.value));
  const AUDIO_OUTPUT_FORMATS = AUDIO_FORMAT_CATEGORIES.flatMap((c) => c.formats.map((f) => f.value));

  // Presets
  const IMAGE_PRESETS: Preset[] = [
    { id: "web", name: "Web Optimized", type: "image", settings: { quality: 80, maxWidth: 1920, maxHeight: 1080, stripMetadata: true } },
    { id: "high", name: "High Quality", type: "image", settings: { quality: 95, maxWidth: 0, maxHeight: 0, stripMetadata: false } },
    { id: "small", name: "Small File", type: "image", settings: { quality: 60, maxWidth: 1280, maxHeight: 720, stripMetadata: true } },
    { id: "social", name: "Social Media", type: "image", settings: { quality: 85, maxWidth: 1200, maxHeight: 1200, stripMetadata: true } },
    { id: "thumb", name: "Thumbnail", type: "image", settings: { quality: 70, maxWidth: 300, maxHeight: 300, stripMetadata: true } },
  ];

  const VIDEO_PRESETS: Preset[] = [
    { id: "web", name: "Web Optimized", type: "video", settings: { crf: 28, resolution: "720p", fps: "30", audioBitrate: "128k" } },
    { id: "high", name: "High Quality", type: "video", settings: { crf: 18, resolution: "original", fps: "original", audioBitrate: "256k" } },
    { id: "small", name: "Small File", type: "video", settings: { crf: 35, resolution: "480p", fps: "24", audioBitrate: "96k" } },
    { id: "social", name: "Social Media", type: "video", settings: { crf: 23, resolution: "1080p", fps: "30", audioBitrate: "192k" } },
  ];

  const AUDIO_PRESETS: Preset[] = [
    { id: "high", name: "High Quality", type: "audio", settings: { bitrate: "320k", sampleRate: "48000", channels: "stereo" } },
    { id: "standard", name: "Standard", type: "audio", settings: { bitrate: "192k", sampleRate: "44100", channels: "stereo" } },
    { id: "small", name: "Small File", type: "audio", settings: { bitrate: "128k", sampleRate: "44100", channels: "stereo" } },
    { id: "voice", name: "Voice/Podcast", type: "audio", settings: { bitrate: "96k", sampleRate: "44100", channels: "mono" } },
  ];

  // State
  let files = $state<ConversionFile[]>([]);
  let outputFormat = $state("");
  let selectedPreset = $state("");
  let isProcessing = $state(false);
  let overallProgress = $state(0);
  let statusMessage = $state("");
  let error = $state("");

  // Settings state
  let imageSettings = $state<ImageSettings>({
    quality: 85,
    maxWidth: 0,
    maxHeight: 0,
    preserveAspect: true,
    stripMetadata: false,
    backgroundColor: "#ffffff",
    resizeFilter: "lanczos",
  });

  let videoSettings = $state<VideoSettings>({
    crf: 23,
    resolution: "original",
    fps: "original",
    videoCodec: "auto",
    audioBitrate: "192k",
    removeAudio: false,
    audioCodec: "auto",
  });

  let audioSettings = $state<AudioSettings>({
    bitrate: "192k",
    sampleRate: "original",
    channels: "original",
    normalize: false,
  });

  let gifSettings = $state<GifSettings>({
    width: 480,
    fps: 10,
    colors: 256,
    loop: 0,
    dither: true,
  });

  // Collapsible sections
  let showAdvancedImage = $state(false);
  let showAdvancedVideo = $state(false);
  let showAdvancedAudio = $state(false);

  // Tabs and selection state
  let activeTab = $state<"files" | "exports">("files");
  let selectedFileIds = $state<Set<string>>(new Set());
  let selectedExportIds = $state<Set<string>>(new Set());

  // File details panel state
  let selectedDetailFileId = $state<string | null>(null);
  let fileMetadata = $state<Map<string, FileMetadata>>(new Map());

  // Library state - lazy loaded
  let magickInitialized = $state(false);
  let ffmpegInitialized = $state(false);
  let magickModule: typeof import("@imagemagick/magick-wasm") | null = null;
  let ffmpegInstance: import("@ffmpeg/ffmpeg").FFmpeg | null = null;

  // Derived state
  let hasFiles = $derived(files.length > 0);
  let fileTypes = $derived(() => {
    const types = new Set(files.map((f) => f.type));
    types.delete("unknown");
    return Array.from(types) as FileType[];
  });
  let dominantType = $derived(() => {
    const types = fileTypes();
    if (types.length === 1) return types[0];
    if (types.length === 0) return null;
    const counts = { image: 0, video: 0, audio: 0 };
    files.forEach((f) => {
      if (f.type !== "unknown") counts[f.type]++;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as FileType;
  });
  let availableFormats = $derived(() => {
    const type = dominantType();
    if (type === "image") return IMAGE_OUTPUT_FORMATS;
    if (type === "video") return VIDEO_OUTPUT_FORMATS;
    if (type === "audio") return AUDIO_OUTPUT_FORMATS;
    return [];
  });
  let currentPresets = $derived(() => {
    const type = dominantType();
    if (type === "image") return IMAGE_PRESETS;
    if (type === "video") return VIDEO_PRESETS;
    if (type === "audio") return AUDIO_PRESETS;
    return [];
  });
  let currentFormatCategories = $derived(() => {
    const type = dominantType();
    if (type === "image") return IMAGE_FORMAT_CATEGORIES;
    if (type === "video") return VIDEO_FORMAT_CATEGORIES;
    if (type === "audio") return AUDIO_FORMAT_CATEGORIES;
    return [];
  });
  let pendingFiles = $derived(files.filter((f) => f.status === "pending"));
  let completedFiles = $derived(files.filter((f) => f.status === "done"));
  let selectedPendingFiles = $derived(
    files.filter((f) => f.status === "pending" && selectedFileIds.has(f.id))
  );
  let canConvert = $derived(selectedPendingFiles.length > 0 && outputFormat && !isProcessing);
  let isMixedTypes = $derived(fileTypes().length > 1);
  let isGifOutput = $derived(outputFormat === "gif" && dominantType() === "video");
  let selectedDetailFile = $derived(
    selectedDetailFileId ? files.find((f) => f.id === selectedDetailFileId) : null
  );

  // File type detection
  function getFileType(file: File): FileType {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (IMAGE_EXTENSIONS.includes(ext)) return "image";
    if (VIDEO_EXTENSIONS.includes(ext)) return "video";
    if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "unknown";
  }

  function getFileIcon(type: FileType): string {
    switch (type) {
      case "image": return "🖼️";
      case "video": return "🎬";
      case "audio": return "🎵";
      default: return "📄";
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDuration(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "Unknown";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Metadata extraction functions
  async function extractImageMetadata(file: File): Promise<Partial<FileMetadata>> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(img.width, img.height);
        const hasAlpha = file.type === "image/png" || file.type === "image/webp" || 
                         file.type === "image/gif" || file.type === "image/avif";
        URL.revokeObjectURL(url);
        resolve({
          width: img.width,
          height: img.height,
          aspectRatio: `${img.width / divisor}:${img.height / divisor}`,
          hasAlpha,
          pixelCount: img.width * img.height,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      img.src = url;
    });
  }

  async function extractAudioMetadataBasic(file: File): Promise<Partial<FileMetadata>> {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          audioDuration: audio.duration,
        });
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      audio.src = url;
    });
  }

  // Helper to add timeout to any promise
  function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
    ]);
  }

  // Web Audio API for detailed audio metadata (skip for large files)
  async function extractAudioWithWebAudio(file: File): Promise<Partial<FileMetadata>> {
    // Skip for files larger than 50MB - decoding is too slow
    if (file.size > 50 * 1024 * 1024) {
      return {};
    }
    
    try {
      const audioContext = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      
      // Add timeout - decodeAudioData can be slow
      const audioBuffer = await withTimeout(
        audioContext.decodeAudioData(arrayBuffer),
        10000, // 10 second timeout
        null
      );
      
      await audioContext.close();
      
      if (!audioBuffer) {
        return {};
      }
      
      return {
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        audioDuration: audioBuffer.duration,
        channelLayout: audioBuffer.numberOfChannels === 1 ? "mono" :
                       audioBuffer.numberOfChannels === 2 ? "stereo" :
                       audioBuffer.numberOfChannels === 6 ? "5.1" :
                       audioBuffer.numberOfChannels === 8 ? "7.1" :
                       `${audioBuffer.numberOfChannels}ch`,
      };
    } catch {
      return {};
    }
  }

  // Video metadata extraction (browser only - fast and reliable)
  async function extractVideoMetadata(file: File): Promise<Partial<FileMetadata>> {
    // Get browser metadata (fast, always works)
    const browserMeta = await new Promise<Partial<FileMetadata>>((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve({});
      }, 5000);
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve({
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
      };
      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve({});
      };
      video.src = url;
    });

    // Calculate aspect ratio from browser metadata
    const width = browserMeta.videoWidth;
    const height = browserMeta.videoHeight;
    let videoAspectRatio: string | undefined;
    if (width && height) {
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(width, height);
      videoAspectRatio = `${width / divisor}:${height / divisor}`;
    }

    // Calculate estimated bitrate from file size and duration
    let estimatedBitrate: number | undefined;
    if (browserMeta.duration && browserMeta.duration > 0) {
      estimatedBitrate = Math.round((file.size * 8) / browserMeta.duration / 1000); // kbps
    }

    return {
      ...browserMeta,
      videoAspectRatio,
      estimatedBitrate,
    };
  }

  // Audio metadata extraction (browser + Web Audio - fast and reliable)
  async function extractAudioMetadata(file: File): Promise<Partial<FileMetadata>> {
    // Get basic browser metadata (fast)
    const basicMeta = await extractAudioMetadataBasic(file);

    // Try Web Audio API for sample rate and channels
    const webAudioMeta = await extractAudioWithWebAudio(file);

    // Calculate estimated bitrate
    let estimatedBitrate: number | undefined;
    const duration = webAudioMeta.audioDuration || basicMeta.audioDuration;
    if (duration && duration > 0) {
      estimatedBitrate = Math.round((file.size * 8) / duration / 1000); // kbps
    }

    return {
      ...basicMeta,
      ...webAudioMeta,
      audioDuration: webAudioMeta.audioDuration || basicMeta.audioDuration,
      estimatedBitrate,
    };
  }

  async function getFileMetadata(convFile: ConversionFile): Promise<FileMetadata> {
    const cached = fileMetadata.get(convFile.id);
    if (cached) return cached;

    const base: FileMetadata = {
      mimeType: convFile.file.type || "unknown",
      lastModified: new Date(convFile.file.lastModified),
      extension: convFile.file.name.split(".").pop()?.toLowerCase() || "",
    };

    let typeSpecific: Partial<FileMetadata> = {};
    if (convFile.type === "image") {
      typeSpecific = await extractImageMetadata(convFile.file);
    } else if (convFile.type === "video") {
      typeSpecific = await extractVideoMetadata(convFile.file);
    } else if (convFile.type === "audio") {
      typeSpecific = await extractAudioMetadata(convFile.file);
    }

    const metadata = { ...base, ...typeSpecific };
    fileMetadata.set(convFile.id, metadata);
    fileMetadata = new Map(fileMetadata);
    return metadata;
  }

  async function showFileDetails(convFile: ConversionFile) {
    selectedDetailFileId = convFile.id;
    await getFileMetadata(convFile);
  }

  function closeFileDetails() {
    selectedDetailFileId = null;
  }

  // File handling
  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));
    }
    target.value = "";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function addFiles(newFiles: File[]) {
    error = "";
    const converted: ConversionFile[] = newFiles.map((file) => ({
      id: nanoid(),
      file,
      type: getFileType(file),
      status: "pending" as ConversionStatus,
      progress: 0,
    }));

    const validFiles = converted.filter((f) => f.type !== "unknown");
    const invalidCount = converted.length - validFiles.length;

    if (invalidCount > 0) {
      error = `${invalidCount} file(s) skipped - unsupported format`;
    }

    files = [...files, ...validFiles];

    // Auto-select all new files for conversion
    validFiles.forEach((f) => selectedFileIds.add(f.id));
    selectedFileIds = new Set(selectedFileIds);

    if (!outputFormat && validFiles.length > 0) {
      const type = validFiles[0].type;
      if (type === "image") outputFormat = "png";
      else if (type === "video") outputFormat = "mp4";
      else if (type === "audio") outputFormat = "mp3";
    }
  }

  function removeFile(id: string) {
    files = files.filter((f) => f.id !== id);
    selectedFileIds.delete(id);
    selectedFileIds = new Set(selectedFileIds);
    if (files.length === 0) {
      outputFormat = "";
      selectedPreset = "";
    }
  }

  // Selection helpers
  function toggleFileSelection(id: string) {
    if (selectedFileIds.has(id)) {
      selectedFileIds.delete(id);
    } else {
      selectedFileIds.add(id);
    }
    selectedFileIds = new Set(selectedFileIds);
  }

  function toggleExportSelection(id: string) {
    if (selectedExportIds.has(id)) {
      selectedExportIds.delete(id);
    } else {
      selectedExportIds.add(id);
    }
    selectedExportIds = new Set(selectedExportIds);
  }

  function selectAllFiles() {
    if (selectedFileIds.size === files.length) {
      selectedFileIds = new Set();
    } else {
      selectedFileIds = new Set(files.map((f) => f.id));
    }
  }

  function selectAllExports() {
    const completed = files.filter((f) => f.status === "done");
    if (selectedExportIds.size === completed.length) {
      selectedExportIds = new Set();
    } else {
      selectedExportIds = new Set(completed.map((f) => f.id));
    }
  }

  function deleteSelectedFiles() {
    files = files.filter((f) => !selectedFileIds.has(f.id));
    selectedFileIds = new Set();
    if (files.length === 0) {
      outputFormat = "";
      selectedPreset = "";
    }
  }

  function deleteSelectedExports() {
    files = files.filter((f) => !selectedExportIds.has(f.id));
    selectedExportIds = new Set();
  }

  async function useExportsForConversion() {
    const selected = files.filter((f) => selectedExportIds.has(f.id) && f.status === "done" && f.result);
    if (selected.length === 0) return;

    for (const convFile of selected) {
      if (convFile.result && convFile.outputName) {
        // Create a new File object from the Blob
        const newFile = new File([convFile.result], convFile.outputName, { type: convFile.result.type });
        const newConvFile: ConversionFile = {
          id: nanoid(),
          file: newFile,
          type: getFileType(newFile),
          status: "pending",
          progress: 0,
        };
        files = [...files, newConvFile];
      }
    }

    selectedExportIds = new Set();
    activeTab = "files";
  }

  function clearAll() {
    files = [];
    outputFormat = "";
    selectedPreset = "";
    error = "";
    statusMessage = "";
    overallProgress = 0;
  }

  function applyPreset(preset: Preset) {
    selectedPreset = preset.id;
    const type = dominantType();
    if (type === "image") {
      imageSettings = { ...imageSettings, ...(preset.settings as Partial<ImageSettings>) };
    } else if (type === "video") {
      videoSettings = { ...videoSettings, ...(preset.settings as Partial<VideoSettings>) };
    } else if (type === "audio") {
      audioSettings = { ...audioSettings, ...(preset.settings as Partial<AudioSettings>) };
    }
  }

  // Library initialization
  async function initImageMagick(): Promise<typeof import("@imagemagick/magick-wasm")> {
    if (magickModule && magickInitialized) return magickModule;

    statusMessage = "Loading ImageMagick...";
    const module = await import("@imagemagick/magick-wasm");
    
    const wasmUrl = "https://unpkg.com/@imagemagick/magick-wasm@0.0.38/dist/magick.wasm";
    const wasmResponse = await fetch(wasmUrl);
    const wasmBytes = await wasmResponse.arrayBuffer();
    
    await module.initializeImageMagick(wasmBytes);
    
    magickModule = module;
    magickInitialized = true;
    statusMessage = "";
    return module;
  }

  async function initFFmpeg(): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
    if (ffmpegInstance && ffmpegInitialized) return ffmpegInstance;

    statusMessage = "Loading FFmpeg (this may take a moment)...";
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
      const currentFile = files.find((f) => f.status === "processing");
      if (currentFile) {
        const idx = files.indexOf(currentFile);
        files[idx] = { ...currentFile, progress: Math.round(progress * 100) };
      }
    });

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    ffmpegInitialized = true;
    statusMessage = "";
    return ffmpeg;
  }

  // Conversion functions
  async function convertImage(convFile: ConversionFile, format: string): Promise<Blob> {
    const magick = await initImageMagick();
    const { ImageMagick, MagickFormat, MagickGeometry, FilterType, Gravity } = magick;

    const arrayBuffer = await convFile.file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const formatMap: Record<string, keyof typeof MagickFormat> = {
      // Common
      png: "Png",
      jpg: "Jpeg",
      jpeg: "Jpeg",
      webp: "WebP",
      gif: "Gif",
      bmp: "Bmp",
      // Professional
      tiff: "Tiff",
      psd: "Psd",
      exr: "Exr",
      hdr: "Hdr",
      // Modern/Web
      avif: "Avif",
      heic: "Heic",
      jxl: "Jxl",
      qoi: "Qoi",
      // Legacy
      tga: "Tga",
      pcx: "Pcx",
      ppm: "Ppm",
      pgm: "Pgm",
      pbm: "Pbm",
      // Specialized
      jp2: "Jp2",
    };

    const magickFormat = MagickFormat[formatMap[format] || "Png"];
    const settings = imageSettings;

    return new Promise((resolve, reject) => {
      try {
        ImageMagick.read(uint8Array, (image) => {
          // Apply resize if needed
          if (settings.maxWidth > 0 || settings.maxHeight > 0) {
            const targetWidth = settings.maxWidth || image.width;
            const targetHeight = settings.maxHeight || image.height;
            
            if (image.width > targetWidth || image.height > targetHeight) {
              const geometry = new MagickGeometry(targetWidth, targetHeight);
              if (settings.preserveAspect) {
                geometry.ignoreAspectRatio = false;
              }
              
              // Apply resize filter
              const filterMap: Record<string, FilterType> = {
                lanczos: FilterType.Lanczos,
                cubic: FilterType.Cubic,
                linear: FilterType.Triangle,
                nearest: FilterType.Point,
              };
              image.filterType = filterMap[settings.resizeFilter] || FilterType.Lanczos;
              image.resize(geometry);
            }
          }

          // Set quality for lossy formats
          if (format === "jpg" || format === "jpeg" || format === "webp" || format === "avif") {
            image.quality = settings.quality;
          }

          // Handle transparency for JPEG (add background)
          if ((format === "jpg" || format === "jpeg") && image.hasAlpha) {
            image.backgroundColor = magick.MagickColors.White;
            image.alpha(magick.AlphaOption.Remove);
          }

          // Strip metadata if requested
          if (settings.stripMetadata) {
            image.strip();
          }

          image.write(magickFormat, (data) => {
            const blob = new Blob([data], { type: `image/${format === "jpg" ? "jpeg" : format}` });
            resolve(blob);
          });
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function convertMedia(convFile: ConversionFile, format: string): Promise<Blob> {
    const ffmpeg = await initFFmpeg();
    const { fetchFile } = await import("@ffmpeg/util");

    const inputExt = convFile.file.name.split(".").pop() || "dat";
    const inputName = `input.${inputExt}`;
    const outputName = `output.${format}`;

    await ffmpeg.writeFile(inputName, await fetchFile(convFile.file));

    let args: string[] = ["-i", inputName];

    if (convFile.type === "video") {
      if (format === "gif") {
        // GIF conversion with settings
        const gs = gifSettings;
        const palette = "palette.png";
        
        // Generate palette first for better colors
        const paletteArgs = [
          "-i", inputName,
          "-vf", `fps=${gs.fps},scale=${gs.width}:-1:flags=lanczos,palettegen=max_colors=${gs.colors}`,
          "-y", palette
        ];
        await ffmpeg.exec(paletteArgs);
        
        // Generate GIF using palette
        let filterComplex = `fps=${gs.fps},scale=${gs.width}:-1:flags=lanczos[x];[x][1:v]paletteuse`;
        if (gs.dither) {
          filterComplex += "=dither=bayer:bayer_scale=5";
        }
        
        args = [
          "-i", inputName,
          "-i", palette,
          "-filter_complex", filterComplex,
          "-loop", gs.loop === -1 ? "1" : String(gs.loop),
        ];
      } else {
        const vs = videoSettings;
        
        // Video filters
        const vFilters: string[] = [];
        
        // Resolution
        if (vs.resolution !== "original") {
          const resMap: Record<string, string> = {
            "2160p": "3840:2160",
            "1080p": "1920:1080",
            "720p": "1280:720",
            "480p": "854:480",
          };
          vFilters.push(`scale=${resMap[vs.resolution]}:force_original_aspect_ratio=decrease`);
        }
        
        // Frame rate
        if (vs.fps !== "original") {
          vFilters.push(`fps=${vs.fps}`);
        }
        
        if (vFilters.length > 0) {
          args.push("-vf", vFilters.join(","));
        }
        
        // Video codec and quality
        if (format === "webm") {
          args.push("-c:v", vs.videoCodec === "vp9" || vs.videoCodec === "auto" ? "libvpx-vp9" : "libvpx");
          args.push("-crf", String(vs.crf), "-b:v", "0");
        } else if (format === "mp4" || format === "mov") {
          args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(vs.crf));
        } else if (format === "mkv") {
          args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(vs.crf));
        } else if (format === "avi") {
          args.push("-c:v", "mpeg4", "-q:v", String(Math.round(vs.crf / 2)));
        } else if (format === "ogv") {
          args.push("-c:v", "libtheora", "-q:v", String(10 - Math.round(vs.crf / 5)));
        } else if (format === "ts") {
          args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(vs.crf));
        } else if (format === "flv") {
          args.push("-c:v", "flv1", "-q:v", String(Math.round(vs.crf / 2)));
        } else if (format === "3gp") {
          args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(vs.crf));
          args.push("-s", "352x288"); // Standard 3GP resolution
        } else {
          args.push("-crf", String(vs.crf));
        }
        
        // Audio
        if (vs.removeAudio) {
          args.push("-an");
        } else {
          if (format === "webm") {
            args.push("-c:a", vs.audioCodec === "opus" || vs.audioCodec === "auto" ? "libopus" : "libvorbis");
          } else {
            args.push("-c:a", "aac");
          }
          args.push("-b:a", vs.audioBitrate);
        }
      }
    } else if (convFile.type === "audio") {
      const as = audioSettings;
      
      // Audio codec based on format
      if (format === "mp3") {
        args.push("-c:a", "libmp3lame");
        if (as.bitrate !== "320k") {
          args.push("-b:a", as.bitrate);
        } else {
          args.push("-q:a", "0"); // Best quality VBR for 320k
        }
      } else if (format === "ogg") {
        args.push("-c:a", "libvorbis", "-q:a", "6");
      } else if (format === "flac") {
        args.push("-c:a", "flac");
      } else if (format === "aac") {
        args.push("-c:a", "aac", "-b:a", as.bitrate);
      } else if (format === "wav") {
        args.push("-c:a", "pcm_s16le");
      } else if (format === "opus") {
        args.push("-c:a", "libopus", "-b:a", as.bitrate);
      } else if (format === "wv") {
        args.push("-c:a", "wavpack");
      } else if (format === "aiff") {
        args.push("-c:a", "pcm_s16be");
      } else if (format === "ac3") {
        args.push("-c:a", "ac3", "-b:a", as.bitrate);
      }
      
      // Sample rate
      if (as.sampleRate !== "original") {
        args.push("-ar", as.sampleRate);
      }
      
      // Channels
      if (as.channels === "mono") {
        args.push("-ac", "1");
      } else if (as.channels === "stereo") {
        args.push("-ac", "2");
      }
      
      // Normalize
      if (as.normalize) {
        args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
      }
    }

    args.push("-y", outputName);

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outputName);
    
    // Clean up
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    try {
      await ffmpeg.deleteFile("palette.png");
    } catch {}

    // Determine MIME type
    let mimeType = "application/octet-stream";
    if (convFile.type === "video" || format === "gif") {
      const mimeMap: Record<string, string> = {
        mp4: "video/mp4",
        webm: "video/webm",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
        mov: "video/quicktime",
        gif: "image/gif",
        ts: "video/mp2t",
        ogv: "video/ogg",
        flv: "video/x-flv",
        "3gp": "video/3gpp",
      };
      mimeType = mimeMap[format] || mimeType;
    } else if (convFile.type === "audio") {
      const mimeMap: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
        aac: "audio/aac",
        opus: "audio/opus",
        wv: "audio/x-wavpack",
        aiff: "audio/aiff",
        ac3: "audio/ac3",
      };
      mimeType = mimeMap[format] || mimeType;
    }

    return new Blob([data], { type: mimeType });
  }

  async function convertFile(convFile: ConversionFile, format: string): Promise<Blob> {
    if (convFile.type === "image") {
      return convertImage(convFile, format);
    } else {
      return convertMedia(convFile, format);
    }
  }

  async function convertAll() {
    if (!canConvert) return;

    isProcessing = true;
    error = "";
    overallProgress = 0;

    // Only convert selected pending files
    const toConvert = files.filter((f) => f.status === "pending" && selectedFileIds.has(f.id));
    let completed = 0;

    for (const convFile of toConvert) {
      const idx = files.findIndex((f) => f.id === convFile.id);
      files[idx] = { ...convFile, status: "processing", progress: 0 };

      try {
        const result = await convertFile(convFile, outputFormat);
        const baseName = convFile.file.name.replace(/\.[^/.]+$/, "");
        const outputName = `${baseName}.${outputFormat}`;

        files[idx] = {
          ...files[idx],
          status: "done",
          progress: 100,
          result,
          outputName,
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Conversion failed";
        files[idx] = {
          ...files[idx],
          status: "error",
          progress: 0,
          error: errorMsg,
        };
      }

      completed++;
      overallProgress = Math.round((completed / toConvert.length) * 100);
    }

    isProcessing = false;
    statusMessage = "";
  }

  function downloadFile(convFile: ConversionFile) {
    if (!convFile.result || !convFile.outputName) return;

    const url = URL.createObjectURL(convFile.result);
    const a = document.createElement("a");
    a.href = url;
    a.download = convFile.outputName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAllAsZip() {
    const completed = files.filter((f) => f.status === "done" && f.result);
    if (completed.length === 0) return;

    if (completed.length === 1) {
      downloadFile(completed[0]);
      return;
    }

    statusMessage = "Creating ZIP archive...";
    
    try {
      const JSZip = (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
      const zip = new JSZip();

      for (const convFile of completed) {
        if (convFile.result && convFile.outputName) {
          zip.file(convFile.outputName, convFile.result);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "converted-files.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      error = "Failed to create ZIP archive. Downloading files individually...";
      for (const convFile of completed) {
        downloadFile(convFile);
      }
    }
    
    statusMessage = "";
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert images, videos, and audio files between formats. Runs entirely in your browser using ImageMagick and FFmpeg WASM.
    </p>
  </header>

  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  {#if statusMessage}
    <div class="mb-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm flex items-center gap-2">
      <span class="inline-block animate-spin">⏳</span>
      {statusMessage}
    </div>
  {/if}

  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- LEFT SIDEBAR - Settings -->
    <div class="lg:w-72 flex-shrink-0 flex flex-col gap-3">
      {#if !hasFiles}
        <!-- Capabilities Overview -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Supported Formats</h3>
          
          <div class="space-y-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span>🖼️</span>
                <span class="text-sm font-medium text-(--color-text)">Images</span>
              </div>
              <p class="text-xs text-(--color-text-muted)">PNG, JPG, WebP, GIF, BMP, TIFF, AVIF, ICO, HEIC</p>
            </div>
            
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span>🎬</span>
                <span class="text-sm font-medium text-(--color-text)">Videos</span>
              </div>
              <p class="text-xs text-(--color-text-muted)">MP4, WebM, MKV, AVI, MOV, FLV, WMV</p>
            </div>
            
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span>🎵</span>
                <span class="text-sm font-medium text-(--color-text)">Audio</span>
              </div>
              <p class="text-xs text-(--color-text-muted)">MP3, WAV, OGG, FLAC, AAC, M4A</p>
            </div>
          </div>
        </div>

        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Features</h3>
          <ul class="space-y-2 text-xs text-(--color-text-muted)">
            <li class="flex items-start gap-2">
              <span class="text-(--color-accent)">✓</span>
              <span>Runs entirely in browser</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-(--color-accent)">✓</span>
              <span>No file uploads to servers</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-(--color-accent)">✓</span>
              <span>Batch conversion support</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-(--color-accent)">✓</span>
              <span>Quality & size controls</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-(--color-accent)">✓</span>
              <span>Video to GIF conversion</span>
            </li>
          </ul>
        </div>

        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Libraries</h3>
          <div class="space-y-2 text-xs">
            <div class="flex items-center gap-2">
              <span class={magickInitialized ? "text-green-500" : "text-(--color-text-muted)"}>
                {magickInitialized ? "●" : "○"}
              </span>
              <span class="text-(--color-text-muted)">ImageMagick</span>
              <span class="text-(--color-text-muted) text-[10px]">~5MB</span>
            </div>
            <div class="flex items-center gap-2">
              <span class={ffmpegInitialized ? "text-green-500" : "text-(--color-text-muted)"}>
                {ffmpegInitialized ? "●" : "○"}
              </span>
              <span class="text-(--color-text-muted)">FFmpeg</span>
              <span class="text-(--color-text-muted) text-[10px]">~30MB</span>
            </div>
            <p class="text-[10px] text-(--color-text-muted) mt-2">Loaded on-demand when you convert</p>
          </div>
        </div>
      {:else}
        <!-- Output Format -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Output Format</h3>
          <SearchableDropdown
            categories={currentFormatCategories()}
            value={outputFormat}
            onchange={(v) => outputFormat = v}
            placeholder="Select output format..."
          />
        </div>

        <!-- Presets -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Presets</h3>
          <div class="flex flex-wrap gap-1.5">
            {#each currentPresets() as preset}
              <button
                onclick={() => applyPreset(preset)}
                class="px-2.5 py-1 text-xs font-medium transition-colors {selectedPreset === preset.id
                  ? 'bg-(--color-text) text-(--color-btn-text)'
                  : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
              >
                {preset.name}
              </button>
            {/each}
          </div>
        </div>

        <!-- Image Settings -->
        {#if dominantType() === "image"}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Image Settings</h3>
            
            <!-- Quality -->
            <div class="mb-4">
              <div class="flex justify-between items-center mb-1">
                <label class="text-xs text-(--color-text-muted)">Quality</label>
                <span class="text-xs text-(--color-text)">{imageSettings.quality}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                bind:value={imageSettings.quality}
                class="w-full accent-(--color-accent)"
              />
            </div>

            <!-- Max Dimensions -->
            <div class="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Max Width</label>
                <input
                  type="number"
                  min="0"
                  bind:value={imageSettings.maxWidth}
                  placeholder="0 = auto"
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Max Height</label>
                <input
                  type="number"
                  min="0"
                  bind:value={imageSettings.maxHeight}
                  placeholder="0 = auto"
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                />
              </div>
            </div>

            <!-- Checkboxes -->
            <div class="space-y-2 mb-3">
              <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
                <input type="checkbox" bind:checked={imageSettings.preserveAspect} class="accent-(--color-accent)" />
                Preserve aspect ratio
              </label>
              <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
                <input type="checkbox" bind:checked={imageSettings.stripMetadata} class="accent-(--color-accent)" />
                Strip metadata (EXIF)
              </label>
            </div>

            <!-- Advanced Toggle -->
            <button
              onclick={() => showAdvancedImage = !showAdvancedImage}
              class="text-xs text-(--color-accent) hover:underline"
            >
              {showAdvancedImage ? "▼" : "▶"} Advanced
            </button>

            {#if showAdvancedImage}
              <div class="mt-3 pt-3 border-t border-(--color-border) space-y-3">
                <div>
                  <label class="text-xs text-(--color-text-muted) mb-1 block">Resize Filter</label>
                  <select
                    bind:value={imageSettings.resizeFilter}
                    class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                  >
                    <option value="lanczos">Lanczos (Best)</option>
                    <option value="cubic">Cubic</option>
                    <option value="linear">Linear</option>
                    <option value="nearest">Nearest (Fastest)</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs text-(--color-text-muted) mb-1 block">Background Color</label>
                  <div class="flex gap-2">
                    <input
                      type="color"
                      bind:value={imageSettings.backgroundColor}
                      class="w-8 h-8 border border-(--color-border) cursor-pointer"
                    />
                    <input
                      type="text"
                      bind:value={imageSettings.backgroundColor}
                      class="flex-1 px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                    />
                  </div>
                  <p class="text-[10px] text-(--color-text-muted) mt-1">Used when converting transparent images to JPEG</p>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Video Settings -->
        {#if dominantType() === "video"}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Video Settings</h3>
            
            {#if isGifOutput}
              <!-- GIF-specific settings -->
              <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                  <label class="text-xs text-(--color-text-muted)">Width</label>
                  <span class="text-xs text-(--color-text)">{gifSettings.width}px</span>
                </div>
                <input
                  type="range"
                  min="120"
                  max="1280"
                  step="40"
                  bind:value={gifSettings.width}
                  class="w-full accent-(--color-accent)"
                />
              </div>

              <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                  <label class="text-xs text-(--color-text-muted)">Frame Rate</label>
                  <span class="text-xs text-(--color-text)">{gifSettings.fps} FPS</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  bind:value={gifSettings.fps}
                  class="w-full accent-(--color-accent)"
                />
              </div>

              <div class="mb-3">
                <label class="text-xs text-(--color-text-muted) mb-1 block">Colors</label>
                <select
                  bind:value={gifSettings.colors}
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                >
                  <option value={256}>256 (Best quality)</option>
                  <option value={128}>128</option>
                  <option value={64}>64</option>
                  <option value={32}>32 (Smallest file)</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="text-xs text-(--color-text-muted) mb-1 block">Loop</label>
                <select
                  bind:value={gifSettings.loop}
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                >
                  <option value={0}>Forever</option>
                  <option value={-1}>Once</option>
                  <option value={2}>2 times</option>
                  <option value={3}>3 times</option>
                  <option value={5}>5 times</option>
                </select>
              </div>

              <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
                <input type="checkbox" bind:checked={gifSettings.dither} class="accent-(--color-accent)" />
                Dithering (better gradients)
              </label>
            {:else}
              <!-- Regular video settings -->
              <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                  <label class="text-xs text-(--color-text-muted)">Quality (CRF)</label>
                  <span class="text-xs text-(--color-text)">{videoSettings.crf}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="51"
                  bind:value={videoSettings.crf}
                  class="w-full accent-(--color-accent)"
                />
                <div class="flex justify-between text-[10px] text-(--color-text-muted) mt-1">
                  <span>Best</span>
                  <span>Smallest</span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label class="text-xs text-(--color-text-muted) mb-1 block">Resolution</label>
                  <select
                    bind:value={videoSettings.resolution}
                    class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                  >
                    <option value="original">Original</option>
                    <option value="2160p">4K (2160p)</option>
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs text-(--color-text-muted) mb-1 block">Frame Rate</label>
                  <select
                    bind:value={videoSettings.fps}
                    class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                  >
                    <option value="original">Original</option>
                    <option value="60">60 FPS</option>
                    <option value="30">30 FPS</option>
                    <option value="24">24 FPS</option>
                    <option value="15">15 FPS</option>
                  </select>
                </div>
              </div>

              <!-- Audio options -->
              <div class="mb-3">
                <label class="text-xs text-(--color-text-muted) mb-1 block">Audio Bitrate</label>
                <select
                  bind:value={videoSettings.audioBitrate}
                  disabled={videoSettings.removeAudio}
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
                >
                  <option value="320k">320 kbps</option>
                  <option value="256k">256 kbps</option>
                  <option value="192k">192 kbps</option>
                  <option value="128k">128 kbps</option>
                  <option value="96k">96 kbps</option>
                </select>
              </div>

              <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
                <input type="checkbox" bind:checked={videoSettings.removeAudio} class="accent-(--color-accent)" />
                Remove audio track
              </label>

              <!-- Advanced Toggle -->
              <button
                onclick={() => showAdvancedVideo = !showAdvancedVideo}
                class="text-xs text-(--color-accent) hover:underline mt-3"
              >
                {showAdvancedVideo ? "▼" : "▶"} Advanced
              </button>

              {#if showAdvancedVideo}
                <div class="mt-3 pt-3 border-t border-(--color-border) space-y-3">
                  <div>
                    <label class="text-xs text-(--color-text-muted) mb-1 block">Video Codec</label>
                    <select
                      bind:value={videoSettings.videoCodec}
                      class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                    >
                      <option value="auto">Auto</option>
                      <option value="h264">H.264</option>
                      <option value="vp9">VP9</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-xs text-(--color-text-muted) mb-1 block">Audio Codec</label>
                    <select
                      bind:value={videoSettings.audioCodec}
                      disabled={videoSettings.removeAudio}
                      class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
                    >
                      <option value="auto">Auto</option>
                      <option value="aac">AAC</option>
                      <option value="opus">Opus</option>
                      <option value="mp3">MP3</option>
                    </select>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Audio Settings -->
        {#if dominantType() === "audio"}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Audio Settings</h3>
            
            <div class="mb-3">
              <label class="text-xs text-(--color-text-muted) mb-1 block">Bitrate</label>
              <select
                bind:value={audioSettings.bitrate}
                class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              >
                <option value="320k">320 kbps (Best)</option>
                <option value="256k">256 kbps</option>
                <option value="192k">192 kbps</option>
                <option value="128k">128 kbps</option>
                <option value="96k">96 kbps</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Sample Rate</label>
                <select
                  bind:value={audioSettings.sampleRate}
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                >
                  <option value="original">Original</option>
                  <option value="48000">48 kHz</option>
                  <option value="44100">44.1 kHz</option>
                  <option value="22050">22.05 kHz</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Channels</label>
                <select
                  bind:value={audioSettings.channels}
                  class="w-full px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                >
                  <option value="original">Original</option>
                  <option value="stereo">Stereo</option>
                  <option value="mono">Mono</option>
                </select>
              </div>
            </div>

            <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
              <input type="checkbox" bind:checked={audioSettings.normalize} class="accent-(--color-accent)" />
              Normalize audio levels
            </label>
          </div>
        {/if}

        <!-- Library Status (when files added) -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">Libraries</h3>
          <div class="space-y-2 text-xs">
            <div class="flex items-center gap-2">
              <span class={magickInitialized ? "text-green-500" : "text-(--color-text-muted)"}>
                {magickInitialized ? "●" : "○"}
              </span>
              <span class="text-(--color-text-muted)">ImageMagick</span>
              <span class="text-(--color-text-muted) text-[10px]">{magickInitialized ? "Ready" : "On demand"}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class={ffmpegInitialized ? "text-green-500" : "text-(--color-text-muted)"}>
                {ffmpegInitialized ? "●" : "○"}
              </span>
              <span class="text-(--color-text-muted)">FFmpeg</span>
              <span class="text-(--color-text-muted) text-[10px]">{ffmpegInitialized ? "Ready" : "On demand"}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- RIGHT PANEL - Files -->
    <div class="flex-1 flex flex-col min-h-[300px]">
      {#if !hasFiles}
        <!-- Empty state with drop zone -->
        <div class="flex-1 flex flex-col">
          <!-- Drop Zone -->
          <div
            ondrop={handleDrop}
            ondragover={handleDragOver}
            class="flex-1 border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center p-8 hover:border-(--color-accent) transition-colors cursor-pointer min-h-[200px]"
          >
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              onchange={handleFileChange}
              class="hidden"
              id="media-input"
            />
            <label for="media-input" class="cursor-pointer text-center">
              <div class="text-5xl mb-4">📁</div>
              <p class="text-base text-(--color-text) font-medium mb-2">Drop files here or click to browse</p>
              <p class="text-xs text-(--color-text-muted)">
                Supports batch conversion - add multiple files at once
              </p>
            </label>
          </div>

          <!-- How it works -->
          <div class="mt-4 p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3">How It Works</h3>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div class="text-2xl mb-1">1️⃣</div>
                <p class="text-xs text-(--color-text-muted)">Add files</p>
              </div>
              <div>
                <div class="text-2xl mb-1">2️⃣</div>
                <p class="text-xs text-(--color-text-muted)">Choose format</p>
              </div>
              <div>
                <div class="text-2xl mb-1">3️⃣</div>
                <p class="text-xs text-(--color-text-muted)">Adjust settings</p>
              </div>
              <div>
                <div class="text-2xl mb-1">4️⃣</div>
                <p class="text-xs text-(--color-text-muted)">Convert & download</p>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <!-- Tabs Header -->
        <div class="flex items-center justify-between border-b border-(--color-border) mb-3">
          <div class="flex">
            <button
              onclick={() => activeTab = "files"}
              class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'files'
                ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              Files ({files.length})
            </button>
            <button
              onclick={() => activeTab = "exports"}
              class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'exports'
                ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              Exports ({completedFiles.length})
            </button>
          </div>
          <button
            onclick={clearAll}
            class="px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear All
          </button>
        </div>

        {#if isMixedTypes && activeTab === "files"}
          <div class="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs">
            Mixed file types detected. Only files matching the output type will be converted.
          </div>
        {/if}

        <!-- FILES TAB -->
        {#if activeTab === "files"}
          <!-- Selection Actions for Files -->
          {#if files.length > 0}
            <div class="flex items-center gap-2 mb-2">
              <button
                onclick={selectAllFiles}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {selectedFileIds.size === files.length ? "Deselect All" : "Select All"}
              </button>
              {#if selectedFileIds.size > 0}
                <span class="text-xs text-(--color-text-muted)">|</span>
                <button
                  onclick={deleteSelectedFiles}
                  class="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Delete Selected ({selectedFileIds.size})
                </button>
              {/if}
            </div>
          {/if}

          <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-auto">
            {#if files.length === 0}
              <div class="p-8 text-center text-(--color-text-muted)">
                <p class="text-sm">No files</p>
                <p class="text-xs mt-1">Add files to convert</p>
              </div>
            {:else}
              <div class="divide-y divide-(--color-border)">
                {#each files as convFile (convFile.id)}
                  <div 
                    class="p-3 flex items-center gap-3 hover:bg-(--color-bg) cursor-pointer transition-colors {convFile.status === 'processing' ? 'bg-(--color-accent)/5' : ''} {selectedDetailFileId === convFile.id ? 'bg-(--color-accent)/10 border-l-2 border-l-(--color-accent)' : ''}"
                    onclick={() => showFileDetails(convFile)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => e.key === 'Enter' && showFileDetails(convFile)}
                  >
                    <!-- Checkbox -->
                    <div onclick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(convFile.id)}
                        onchange={() => toggleFileSelection(convFile.id)}
                        disabled={isProcessing}
                        class="accent-(--color-accent) flex-shrink-0"
                      />
                    </div>

                    <!-- Icon -->
                    <span class="text-xl flex-shrink-0">{getFileIcon(convFile.type)}</span>

                    <!-- File Info -->
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-(--color-text) truncate">{convFile.file.name}</p>
                      <p class="text-xs text-(--color-text-muted)">{formatFileSize(convFile.file.size)}</p>
                    </div>

                    <!-- Status -->
                    <div class="flex items-center gap-2 flex-shrink-0">
                      {#if convFile.status === "pending"}
                        <span class="text-xs text-(--color-text-muted) px-2 py-0.5 bg-(--color-bg) border border-(--color-border)">Ready</span>
                      {:else if convFile.status === "processing"}
                        <div class="flex items-center gap-2">
                          <div class="w-16 h-1.5 bg-(--color-border) rounded-full overflow-hidden">
                            <div
                              class="h-full bg-(--color-accent) transition-all duration-300"
                              style="width: {convFile.progress}%"
                            ></div>
                          </div>
                          <span class="text-xs text-(--color-text-muted) w-8">{convFile.progress}%</span>
                        </div>
                      {:else if convFile.status === "done"}
                        <span class="text-xs text-green-600 dark:text-green-400 px-2 py-0.5 bg-green-500/10 border border-green-500/30">Done</span>
                      {:else if convFile.status === "error"}
                        <span class="text-xs text-red-500 px-2 py-0.5 bg-red-500/10 border border-red-500/30" title={convFile.error}>Error</span>
                      {/if}
                    </div>

                    <!-- Remove Button -->
                    {#if !isProcessing}
                      <button
                        onclick={(e) => { e.stopPropagation(); removeFile(convFile.id); }}
                        class="text-(--color-text-muted) hover:text-(--color-text) transition-colors p-1 flex-shrink-0"
                        title="Remove"
                      >
                        ✕
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- File Details Panel -->
          {#if selectedDetailFile}
            {@const metadata = fileMetadata.get(selectedDetailFileId!)}
            <div class="mt-3 border border-(--color-border) bg-(--color-bg-alt)">
              <div class="flex justify-between items-center p-3 border-b border-(--color-border)">
                <h4 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">File Details</h4>
                <button 
                  onclick={closeFileDetails} 
                  class="text-(--color-text-muted) hover:text-(--color-text) transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
              
              <div class="p-3 space-y-2 text-xs">
                <!-- Common info -->
                <div class="flex justify-between">
                  <span class="text-(--color-text-muted)">Name</span>
                  <span class="text-(--color-text) truncate max-w-[180px] text-right" title={selectedDetailFile.file.name}>{selectedDetailFile.file.name}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-(--color-text-muted)">Size</span>
                  <span class="text-(--color-text)">{formatFileSize(selectedDetailFile.file.size)}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-(--color-text-muted)">Type</span>
                  <span class="text-(--color-text)">{metadata?.mimeType || selectedDetailFile.file.type || "Unknown"}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-(--color-text-muted)">Extension</span>
                  <span class="text-(--color-text) uppercase">{metadata?.extension || "—"}</span>
                </div>
                {#if metadata?.lastModified}
                  <div class="flex justify-between">
                    <span class="text-(--color-text-muted)">Modified</span>
                    <span class="text-(--color-text)">{metadata.lastModified.toLocaleDateString()}</span>
                  </div>
                {/if}

                <!-- Image-specific -->
                {#if selectedDetailFile.type === "image" && metadata?.width}
                  <div class="border-t border-(--color-border) pt-2 mt-2">
                    <div class="text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-2">Image Details</div>
                    <div class="flex justify-between">
                      <span class="text-(--color-text-muted)">Dimensions</span>
                      <span class="text-(--color-text)">{metadata.width} × {metadata.height} px</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-(--color-text-muted)">Aspect Ratio</span>
                      <span class="text-(--color-text)">{metadata.aspectRatio}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-(--color-text-muted)">Megapixels</span>
                      <span class="text-(--color-text)">{((metadata.pixelCount || 0) / 1000000).toFixed(2)} MP</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-(--color-text-muted)">Transparency</span>
                      <span class="text-(--color-text)">{metadata.hasAlpha ? "Yes (Alpha)" : "No"}</span>
                    </div>
                  </div>
                {/if}

                <!-- Video-specific -->
                {#if selectedDetailFile.type === "video" && metadata?.duration !== undefined}
                  <div class="border-t border-(--color-border) pt-2 mt-2">
                    <div class="text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-2">Video Details</div>
                    <div class="flex justify-between">
                      <span class="text-(--color-text-muted)">Duration</span>
                      <span class="text-(--color-text)">{formatDuration(metadata.duration)}</span>
                    </div>
                    {#if metadata.videoWidth && metadata.videoHeight}
                      <div class="flex justify-between">
                        <span class="text-(--color-text-muted)">Resolution</span>
                        <span class="text-(--color-text)">{metadata.videoWidth} × {metadata.videoHeight} px</span>
                      </div>
                    {/if}
                    {#if metadata.videoAspectRatio}
                      <div class="flex justify-between">
                        <span class="text-(--color-text-muted)">Aspect Ratio</span>
                        <span class="text-(--color-text)">{metadata.videoAspectRatio}</span>
                      </div>
                    {/if}
                    {#if metadata.estimatedBitrate}
                      <div class="flex justify-between">
                        <span class="text-(--color-text-muted)">Est. Bitrate</span>
                        <span class="text-(--color-text)">{metadata.estimatedBitrate.toLocaleString()} kb/s</span>
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- Audio-specific -->
                {#if selectedDetailFile.type === "audio" && metadata?.audioDuration !== undefined}
                  <div class="border-t border-(--color-border) pt-2 mt-2">
                    <div class="text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-2">Audio Details</div>
                    <div class="flex justify-between">
                      <span class="text-(--color-text-muted)">Duration</span>
                      <span class="text-(--color-text)">{formatDuration(metadata.audioDuration)}</span>
                    </div>
                    {#if metadata.sampleRate}
                      <div class="flex justify-between">
                        <span class="text-(--color-text-muted)">Sample Rate</span>
                        <span class="text-(--color-text)">{(metadata.sampleRate / 1000).toFixed(1)} kHz</span>
                      </div>
                    {/if}
                    {#if metadata.channelLayout}
                      <div class="flex justify-between">
                        <span class="text-(--color-text-muted)">Channels</span>
                        <span class="text-(--color-text) capitalize">{metadata.channelLayout}{metadata.channels ? ` (${metadata.channels})` : ""}</span>
                      </div>
                    {/if}
                    {#if metadata.estimatedBitrate}
                      <div class="flex justify-between">
                        <span class="text-(--color-text-muted)">Est. Bitrate</span>
                        <span class="text-(--color-text)">{metadata.estimatedBitrate} kb/s</span>
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- Loading state -->
                {#if !metadata}
                  <div class="text-center py-2 text-(--color-text-muted)">
                    <span class="inline-block animate-spin mr-1">⏳</span> Loading details...
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Convert Button -->
          {#if pendingFiles.length > 0}
            <div class="mt-3">
              <button
                onclick={convertAll}
                disabled={!canConvert}
                class="w-full px-4 py-2.5 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if isProcessing}
                  Converting... {overallProgress}%
                {:else if selectedPendingFiles.length === 0}
                  Select files to convert
                {:else}
                  Convert {selectedPendingFiles.length} File{selectedPendingFiles.length !== 1 ? "s" : ""}
                {/if}
              </button>
              {#if selectedPendingFiles.length !== pendingFiles.length && selectedPendingFiles.length > 0}
                <p class="text-[10px] text-(--color-text-muted) mt-1 text-center">
                  {pendingFiles.length - selectedPendingFiles.length} file{pendingFiles.length - selectedPendingFiles.length !== 1 ? "s" : ""} not selected
                </p>
              {/if}
            </div>
          {/if}

        <!-- EXPORTS TAB -->
        {:else}
          <!-- Selection Actions for Exports -->
          {#if completedFiles.length > 0}
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <button
                onclick={selectAllExports}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {selectedExportIds.size === completedFiles.length ? "Deselect All" : "Select All"}
              </button>
              {#if selectedExportIds.size > 0}
                <span class="text-xs text-(--color-text-muted)">|</span>
                <button
                  onclick={useExportsForConversion}
                  class="text-xs text-(--color-accent) hover:underline transition-colors"
                >
                  Use for Conversion ({selectedExportIds.size})
                </button>
                <span class="text-xs text-(--color-text-muted)">|</span>
                <button
                  onclick={deleteSelectedExports}
                  class="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Delete ({selectedExportIds.size})
                </button>
              {/if}
              <div class="flex-1"></div>
              <button
                onclick={downloadAllAsZip}
                disabled={isProcessing}
                class="text-xs px-2 py-1 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
              >
                Download All ({completedFiles.length})
              </button>
            </div>
          {/if}

          <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-auto">
            {#if completedFiles.length === 0}
              <div class="p-8 text-center text-(--color-text-muted)">
                <p class="text-sm">No exports yet</p>
                <p class="text-xs mt-1">Convert files to see them here</p>
              </div>
            {:else}
              <div class="divide-y divide-(--color-border)">
                {#each completedFiles as convFile (convFile.id)}
                  <div class="p-3 flex items-center gap-3 hover:bg-(--color-bg)">
                    <!-- Checkbox -->
                    <input
                      type="checkbox"
                      checked={selectedExportIds.has(convFile.id)}
                      onchange={() => toggleExportSelection(convFile.id)}
                      class="accent-(--color-accent) flex-shrink-0"
                    />

                    <!-- Icon -->
                    <span class="text-xl flex-shrink-0">{getFileIcon(convFile.type)}</span>

                    <!-- File Info -->
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-(--color-text) truncate">{convFile.outputName}</p>
                      <p class="text-xs text-(--color-text-muted)">
                        {formatFileSize(convFile.file.size)}
                        <span class="text-(--color-accent)">→ {convFile.result ? formatFileSize(convFile.result.size) : ""}</span>
                      </p>
                    </div>

                    <!-- Download Button -->
                    <button
                      onclick={() => downloadFile(convFile)}
                      class="text-xs text-(--color-accent) hover:underline px-2 py-0.5 bg-(--color-accent)/10 border border-(--color-accent)/30 flex-shrink-0"
                    >
                      Download
                    </button>

                    <!-- Remove Button -->
                    <button
                      onclick={() => { files = files.filter((f) => f.id !== convFile.id); selectedExportIds.delete(convFile.id); selectedExportIds = new Set(selectedExportIds); }}
                      class="text-(--color-text-muted) hover:text-(--color-text) transition-colors p-1 flex-shrink-0"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Error Files -->
          {@const errorFiles = files.filter((f) => f.status === "error")}
          {#if errorFiles.length > 0}
            <div class="mt-2 border border-red-500/30 bg-red-500/5">
              <div class="px-3 py-2 text-xs text-red-500 font-medium border-b border-red-500/30">
                Failed ({errorFiles.length})
              </div>
              {#each errorFiles as convFile (convFile.id)}
                <div class="p-3 flex items-center gap-3">
                  <span class="text-xl flex-shrink-0">{getFileIcon(convFile.type)}</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-(--color-text) truncate">{convFile.file.name}</p>
                    <p class="text-xs text-red-500">{convFile.error || "Conversion failed"}</p>
                  </div>
                  <button
                    onclick={() => files = files.filter((f) => f.id !== convFile.id)}
                    class="text-(--color-text-muted) hover:text-(--color-text) transition-colors p-1 flex-shrink-0"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- Add More Files -->
        <div class="mt-3">
          <div
            ondrop={handleDrop}
            ondragover={handleDragOver}
            class="border border-dashed border-(--color-border) p-3 text-center hover:border-(--color-accent) transition-colors cursor-pointer"
          >
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              onchange={handleFileChange}
              class="hidden"
              id="media-input-add"
            />
            <label for="media-input-add" class="cursor-pointer text-xs text-(--color-text-muted) hover:text-(--color-accent)">
              + Drop more files or click to add
            </label>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
    display: inline-block;
  }
</style>
