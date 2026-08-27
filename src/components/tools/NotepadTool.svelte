<script lang="ts">
  import { onMount } from "svelte";
  import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
  import { EditorView } from "@codemirror/view";
  import { markdown } from "@codemirror/lang-markdown";
  import Binary from "@lucide/svelte/icons/binary";
  import Eye from "@lucide/svelte/icons/eye";
  import FileArchive from "@lucide/svelte/icons/file-archive";
  import FileAudio from "@lucide/svelte/icons/file-audio";
  import FileImage from "@lucide/svelte/icons/file-image";
  import FileQuestion from "@lucide/svelte/icons/file-question";
  import FileText from "@lucide/svelte/icons/file-text";
  import FileVideo from "@lucide/svelte/icons/file-video";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createEditor,
    updateEditorContent,
    type DarkModeCleanup,
    type SelectionInfo,
  } from "../../lib/codemirror.js";
  import { registerPageMcp, type ToolManifest } from "../../lib/pageMcp.js";
  import { buildZip } from "./pdf/shared/zip-store";

  type NodeType = "folder" | "note" | "file";
  type ViewMode = "split" | "editor" | "preview";
  type FileViewMode = "preview" | "raw";
  type FilePreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "archive" | "document" | "unknown";
  type LoadStatus = "idle" | "loading" | "ready" | "error";

  interface NodeMeta {
    id: string;
    type: NodeType;
    name: string;
    parentId: string | null;
    order: number;
    expanded?: boolean;
    mimeType?: string;
    size?: number;
    createdAt: number;
    updatedAt: number;
  }

  const INDEX_KEY = "notepad-index";
  const ACTIVE_KEY = "notepad-active";
  const noteKey = (id: string) => `notepad-note-${id}`;
  const fileKey = (id: string) => `notepad-file-${id}`;
  const TEXT_PREVIEW_LIMIT = 1024 * 1024;
  const RAW_PREVIEW_LIMIT = 64 * 1024;

  const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "ico", "jfif", "jpeg", "jpg", "png", "svg", "webp"]);
  const VIDEO_EXTENSIONS = new Set(["3gp", "avi", "m4v", "mkv", "mov", "mp4", "ogv", "webm"]);
  const AUDIO_EXTENSIONS = new Set(["aac", "aif", "aiff", "flac", "m4a", "mid", "midi", "mp3", "oga", "ogg", "opus", "wav", "weba"]);
  const TEXT_EXTENSIONS = new Set([
    "c", "conf", "cpp", "cs", "css", "csv", "env", "go", "h", "hpp", "htm", "html", "ini", "java", "js", "json",
    "jsx", "log", "mjs", "php", "properties", "py", "rb", "rs", "sh", "sql", "srt", "toml", "ts", "tsv", "tsx", "vtt",
    "xml", "yaml", "yml",
  ]);
  const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "tgz", "txz", "xz", "zip"]);
  const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "epub", "odp", "ods", "odt", "pages", "ppt", "pptx", "rtf", "xls", "xlsx"]);

  const MIME_BY_EXTENSION: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    ico: "image/x-icon",
    jfif: "image/jpeg",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
    "3gp": "video/3gpp",
    avi: "video/x-msvideo",
    m4v: "video/mp4",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp4: "video/mp4",
    ogv: "video/ogg",
    webm: "video/webm",
    aac: "audio/aac",
    aif: "audio/aiff",
    aiff: "audio/aiff",
    flac: "audio/flac",
    m4a: "audio/mp4",
    mid: "audio/midi",
    midi: "audio/midi",
    mp3: "audio/mpeg",
    oga: "audio/ogg",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    wav: "audio/wav",
    weba: "audio/webm",
    pdf: "application/pdf",
    "7z": "application/x-7z-compressed",
    bz2: "application/x-bzip2",
    gz: "application/gzip",
    rar: "application/vnd.rar",
    tar: "application/x-tar",
    tgz: "application/gzip",
    txz: "application/x-xz",
    xz: "application/x-xz",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odt: "application/vnd.oasis.opendocument.text",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rtf: "application/rtf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    c: "text/x-c",
    conf: "text/plain",
    cpp: "text/x-c",
    cs: "text/x-csharp",
    css: "text/css",
    csv: "text/csv",
    env: "text/plain",
    go: "text/x-go",
    h: "text/x-c",
    hpp: "text/x-c",
    htm: "text/html",
    html: "text/html",
    ini: "text/plain",
    java: "text/x-java",
    jsx: "text/javascript",
    mjs: "text/javascript",
    php: "text/x-php",
    properties: "text/plain",
    py: "text/x-python",
    rb: "text/x-ruby",
    rs: "text/x-rust",
    sh: "text/x-shellscript",
    sql: "text/x-sql",
    srt: "text/plain",
    tsx: "text/typescript",
    vtt: "text/vtt",
    js: "text/javascript",
    json: "application/json",
    log: "text/plain",
    toml: "text/plain",
    ts: "text/typescript",
    tsv: "text/tab-separated-values",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    zip: "application/zip",
  };

  const WELCOME = `# Welcome to Notepad

This is your personal **markdown notebook**. Everything you type is saved automatically in your browser (IndexedDB) — there is no save button, your notes are always saved.

## Getting started

- Use **+ Note** and **+ Folder** in the sidebar to organize your notes.
- Notes go inside the **selected folder** (or the root if none is selected).
- Import any file to keep a local copy alongside your notes. Text and Markdown files remain editable.
- **Drag and drop** notes and folders to move or reorder them.
- Double-click a name to rename it.
- Toggle **Split / Editor / Preview** to control the live preview.

## Markdown is supported

\`\`\`js
console.log("Code blocks are highlighted");
\`\`\`

| Feature | Supported |
|---------|-----------|
| GFM tables | yes |
| Task lists | yes |
| Math (KaTeX) | yes |

> Tip: your notes never leave this device.
`;

  // ---- State ----
  let nodes = $state<NodeMeta[]>([]);
  let activeId = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let loaded = $state(false);

  let currentContent = $state("");
  let cursorLine = $state(1);
  let cursorColumn = $state(1);
  let selectionLength = $state(0);
  let selectedLines = $state(0);
  let saveStatus = $state<"saved" | "saving">("saved");
  let viewMode = $state<ViewMode>("editor");
  let sidebarOpen = $state(true);
  let splitPct = $state(50);
  let gridEl = $state<HTMLDivElement | undefined>(undefined);

  let editingId = $state<string | null>(null);
  let editingName = $state("");
  let titleNameBeforeEdit = "";

  let dragId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);

  let contextMenu = $state<{ x: number; y: number; nodeId: string | null } | null>(null);
  let importParentId: string | null = null;

  let isDark = $state(getInitialDarkMode());
  let editorContainer = $state<HTMLDivElement | undefined>(undefined);
  let previewContainer = $state<HTMLDivElement | undefined>(undefined);
  let editor = $state<EditorView | undefined>(undefined);
  let previewHtml = $state("");
  let fileInput: HTMLInputElement;

  let activeFileBlob = $state<Blob | null>(null);
  let activeFileUrl = $state("");
  let fileViewMode = $state<FileViewMode>("preview");
  let fileLoadStatus = $state<LoadStatus>("idle");
  let fileLoadError = $state("");
  let fileText = $state("");
  let fileTextStatus = $state<LoadStatus>("idle");
  let fileTextTruncated = $state(false);
  let rawPreview = $state("");
  let rawLoadStatus = $state<LoadStatus>("idle");
  let rawPreviewTruncated = $state(false);
  let mediaPreviewError = $state(false);

  let darkModeCleanup: DarkModeCleanup | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let indexTimer: ReturnType<typeof setTimeout> | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let programmatic = false;
  let mermaidLoaded = false;
  let hljs: typeof import("highlight.js") | undefined;
  let comarkRender: ((markdown: string) => Promise<string>) | undefined;
  let fileLoadGeneration = 0;
  let openRequestGeneration = 0;
  let componentDisposed = false;

  const VIEW_MODES: { val: ViewMode; label: string }[] = [
    { val: "editor", label: "Editor" },
    { val: "split", label: "Split" },
    { val: "preview", label: "Preview" },
  ];

  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  // ---- Derived ----
  let activeNode = $derived(nodes.find((n) => n.id === activeId && n.type !== "folder"));
  let activeNote = $derived(activeNode?.type === "note" ? activeNode : undefined);
  let activeFile = $derived(activeNode?.type === "file" ? activeNode : undefined);
  let charCount = $derived(currentContent.length);
  let wordCount = $derived(currentContent.trim() ? currentContent.trim().split(/\s+/).length : 0);
  let hasNotes = $derived(nodes.some((n) => n.type === "note"));
  let menuNode = $derived(contextMenu ? (nodes.find((n) => n.id === contextMenu!.nodeId) ?? null) : null);
  let activeFileKind = $derived(activeFile ? filePreviewKind(activeFile) : "unknown");
  let activeFileMime = $derived(activeFile ? effectiveMimeType(activeFile) : "application/octet-stream");
  let activeFileTypeLabel = $derived(activeFile ? fileTypeLabel(activeFile) : "File");

  // ---- File preview helpers ----
  function fileExtension(name: string): string {
    const basename = name.split(/[\\/]/).pop() ?? name;
    const dot = basename.lastIndexOf(".");
    return dot > 0 && dot < basename.length - 1 ? basename.slice(dot + 1).toLowerCase() : "";
  }

  function effectiveMimeType(node: NodeMeta): string {
    const stored = (node.mimeType || "").split(";", 1)[0].trim().toLowerCase();
    if (stored && stored !== "application/octet-stream") return stored;
    return MIME_BY_EXTENSION[fileExtension(node.name)] || stored || "application/octet-stream";
  }

  function filePreviewKind(node: NodeMeta): FilePreviewKind {
    const storedMime = (node.mimeType || "").split(";", 1)[0].trim().toLowerCase();
    const canInferFromExtension = !storedMime || storedMime === "application/octet-stream";
    const mime = effectiveMimeType(node);
    const extension = fileExtension(node.name);
    if (mime.startsWith("image/") || (canInferFromExtension && IMAGE_EXTENSIONS.has(extension))) return "image";
    if (mime.startsWith("video/") || (canInferFromExtension && VIDEO_EXTENSIONS.has(extension))) return "video";
    if (mime.startsWith("audio/") || (canInferFromExtension && AUDIO_EXTENSIONS.has(extension))) return "audio";
    if (mime === "application/pdf" || (canInferFromExtension && extension === "pdf")) return "pdf";
    if (
      mime.startsWith("text/") ||
      ["application/json", "application/ld+json", "application/toml", "application/xml", "application/x-yaml", "application/yaml"].includes(mime) ||
      mime.endsWith("+json") ||
      mime.endsWith("+xml") ||
      (canInferFromExtension && TEXT_EXTENSIONS.has(extension))
    ) return "text";
    if (
      ["application/zip", "application/x-7z-compressed", "application/x-bzip2", "application/x-rar-compressed", "application/x-tar", "application/x-zip-compressed", "application/gzip", "application/vnd.rar"].includes(mime) ||
      (canInferFromExtension && ARCHIVE_EXTENSIONS.has(extension))
    ) return "archive";
    if (
      ["application/epub+zip", "application/msword", "application/rtf", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/vnd.oasis.opendocument.presentation", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.text"].includes(mime) ||
      mime.includes("officedocument") ||
      (canInferFromExtension && DOCUMENT_EXTENSIONS.has(extension))
    ) return "document";
    return "unknown";
  }

  function fileTypeLabel(node: NodeMeta): string {
    const extension = fileExtension(node.name);
    const labels: Record<FilePreviewKind, string> = {
      image: "Image",
      video: "Video",
      audio: "Audio",
      pdf: "PDF document",
      text: "Text / code",
      archive: "Archive",
      document: "Document",
      unknown: extension ? `${extension.toUpperCase()} file` : "Unknown file",
    };
    return labels[filePreviewKind(node)];
  }

  function resetActiveFilePreview(): void {
    fileLoadGeneration++;
    if (activeFileUrl) URL.revokeObjectURL(activeFileUrl);
    activeFileBlob = null;
    activeFileUrl = "";
    fileViewMode = "preview";
    fileLoadStatus = "idle";
    fileLoadError = "";
    fileText = "";
    fileTextStatus = "idle";
    fileTextTruncated = false;
    rawPreview = "";
    rawLoadStatus = "idle";
    rawPreviewTruncated = false;
    mediaPreviewError = false;
  }

  async function loadTextFile(blob: Blob, generation: number): Promise<void> {
    fileTextStatus = "loading";
    try {
      const limit = Math.min(blob.size, TEXT_PREVIEW_LIMIT);
      const text = await blob.slice(0, limit).text();
      if (generation !== fileLoadGeneration) return;
      fileText = text;
      fileTextTruncated = blob.size > limit;
      fileTextStatus = "ready";
    } catch {
      if (generation !== fileLoadGeneration) return;
      fileTextStatus = "error";
    }
  }

  function formatHexDump(bytes: Uint8Array): string {
    if (bytes.length === 0) return "(empty file)";
    const lines: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 16) {
      const row = bytes.subarray(offset, offset + 16);
      const hex = Array.from(row, (byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
      const ascii = Array.from(row, (byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");
      lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  |${ascii}|`);
    }
    return lines.join("\n");
  }

  async function showRawFile(): Promise<void> {
    fileViewMode = "raw";
    if (rawLoadStatus === "loading" || rawLoadStatus === "ready") return;
    const blob = activeFileBlob;
    if (!blob) {
      rawLoadStatus = "error";
      return;
    }

    const generation = fileLoadGeneration;
    rawLoadStatus = "loading";
    try {
      const limit = Math.min(blob.size, RAW_PREVIEW_LIMIT);
      const bytes = new Uint8Array(await blob.slice(0, limit).arrayBuffer());
      if (generation !== fileLoadGeneration) return;
      rawPreview = formatHexDump(bytes);
      rawPreviewTruncated = blob.size > limit;
      rawLoadStatus = "ready";
    } catch {
      if (generation !== fileLoadGeneration) return;
      rawLoadStatus = "error";
    }
  }

  function showFilePreview(): void {
    fileViewMode = "preview";
  }

  function handleMediaPreviewError(event: Event): void {
    const target = event.currentTarget as HTMLImageElement | HTMLMediaElement;
    if (target.src === activeFileUrl) mediaPreviewError = true;
  }

  // ---- Tree helpers ----
  // Ensures a name is unique among same-type siblings in the same folder,
  // appending " (2)", " (3)", … when a collision is found.
  function uniqueName(parentId: string | null, type: NodeType, base: string, excludeId: string | null = null): string {
    const taken = new Set(
      nodes
        .filter((n) => n.parentId === parentId && n.type === type && n.id !== excludeId)
        .map((n) => n.name.toLowerCase()),
    );
    if (!taken.has(base.toLowerCase())) return base;
    const match = base.match(/^(.*?)(?: \((\d+)\))?$/);
    const stem = match ? match[1] : base;
    let i = 2;
    let candidate = `${stem} (${i})`;
    while (taken.has(candidate.toLowerCase())) {
      i++;
      candidate = `${stem} (${i})`;
    }
    return candidate;
  }

  function childrenOf(parentId: string | null): NodeMeta[] {
    return nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  function nextOrder(parentId: string | null): number {
    const siblings = nodes.filter((n) => n.parentId === parentId);
    return siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  }

  function targetParentId(): string | null {
    if (!selectedId) return null;
    const sel = nodes.find((n) => n.id === selectedId);
    if (!sel) return null;
    return sel.type === "folder" ? sel.id : sel.parentId;
  }

  function expandFolder(id: string | null): void {
    if (!id) return;
    const n = nodes.find((x) => x.id === id);
    if (n && n.type === "folder" && !n.expanded) {
      n.expanded = true;
      schedulePersistIndex();
    }
  }

  function collectSubtree(id: string): NodeMeta[] {
    const root = nodes.find((x) => x.id === id);
    if (!root) return [];
    const result: NodeMeta[] = [root];
    const stack = [id];
    while (stack.length) {
      const pid = stack.pop();
      for (const child of nodes.filter((x) => x.parentId === pid)) {
        result.push(child);
        stack.push(child.id);
      }
    }
    return result;
  }

  function isDescendant(ancestorId: string, nodeId: string): boolean {
    let cur = nodes.find((n) => n.id === nodeId);
    while (cur && cur.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = nodes.find((n) => n.id === cur!.parentId);
    }
    return false;
  }

  // ---- Persistence ----
  function persistIndex(): void {
    idbSet(INDEX_KEY, $state.snapshot(nodes)).catch(() => {});
  }

  function schedulePersistIndex(): void {
    if (indexTimer) clearTimeout(indexTimer);
    indexTimer = setTimeout(persistIndex, 400);
  }

  function scheduleSave(): void {
    saveStatus = "saving";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = undefined;
      const id = activeId;
      if (id) {
        await idbSet(noteKey(id), currentContent).catch(() => {});
        const node = nodes.find((n) => n.id === id);
        if (node) {
          node.updatedAt = Date.now();
          persistIndex();
        }
      }
      saveStatus = "saved";
    }, 400);
  }

  async function flushSave(): Promise<void> {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const id = activeId;
    if (id) {
      await idbSet(noteKey(id), currentContent).catch(() => {});
      const node = nodes.find((n) => n.id === id);
      if (node) {
        node.updatedAt = Date.now();
        persistIndex();
      }
    }
    saveStatus = "saved";
  }

  // ---- Create / open / rename / delete ----
  function addNote(parentId: string | null, name = "Untitled", content = ""): NodeMeta {
    const node: NodeMeta = {
      id: crypto.randomUUID(),
      type: "note",
      name: uniqueName(parentId, "note", name),
      parentId,
      order: nextOrder(parentId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    nodes = [...nodes, node];
    idbSet(noteKey(node.id), content).catch(() => {});
    return node;
  }

  function addFolder(parentId: string | null, name = "New Folder"): NodeMeta {
    const node: NodeMeta = {
      id: crypto.randomUUID(),
      type: "folder",
      name: uniqueName(parentId, "folder", name),
      parentId,
      order: nextOrder(parentId),
      expanded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    nodes = [...nodes, node];
    return node;
  }

  async function addFile(parentId: string | null, file: File): Promise<NodeMeta> {
    const node: NodeMeta = {
      id: crypto.randomUUID(),
      type: "file",
      name: uniqueName(parentId, "file", file.name || "Untitled file"),
      parentId,
      order: nextOrder(parentId),
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await idbSet(fileKey(node.id), file);
    nodes = [...nodes, node];
    return node;
  }

  function newNote(): void {
    const parentId = targetParentId();
    expandFolder(parentId);
    const node = addNote(parentId);
    persistIndex();
    openNote(node.id);
    startRename(node.id);
  }

  function newFolder(): void {
    const parentId = targetParentId();
    expandFolder(parentId);
    const node = addFolder(parentId);
    selectedId = node.id;
    persistIndex();
    startRename(node.id);
  }

  async function openNote(id: string): Promise<void> {
    const openGeneration = ++openRequestGeneration;
    await flushSave();
    if (componentDisposed || openGeneration !== openRequestGeneration) return;
    const node = nodes.find((n) => n.id === id && n.type === "note");
    if (!node) return;
    resetActiveFilePreview();
    selectedId = id;
    activeId = id;
    idbSet(ACTIVE_KEY, id).catch(() => {});
    const content = ((await idbGet(noteKey(id))) as string | undefined) ?? "";
    if (componentDisposed || openGeneration !== openRequestGeneration || activeId !== id) return;
    currentContent = content;
    programmatic = true;
    updateEditorContent(editor, content);
    programmatic = false;
    saveStatus = "saved";
    scheduleRender(content);
  }

  async function openFile(id: string): Promise<void> {
    const openGeneration = ++openRequestGeneration;
    await flushSave();
    if (componentDisposed || openGeneration !== openRequestGeneration) return;
    const node = nodes.find((n) => n.id === id && n.type === "file");
    if (!node) return;
    resetActiveFilePreview();
    const generation = fileLoadGeneration;
    selectedId = id;
    activeId = id;
    idbSet(ACTIVE_KEY, id).catch(() => {});
    currentContent = "";
    previewHtml = "";
    programmatic = true;
    updateEditorContent(editor, "");
    programmatic = false;
    saveStatus = "saved";

    fileLoadStatus = "loading";
    try {
      const content = await fileContent(id);
      if (componentDisposed || openGeneration !== openRequestGeneration || generation !== fileLoadGeneration || activeId !== id) return;
      if (!content) {
        fileLoadStatus = "error";
        fileLoadError = "The file data is missing from browser storage.";
        return;
      }

      activeFileBlob = content;
      const mimeType = effectiveMimeType(node);
      const previewBlob = content.type === mimeType ? content : content.slice(0, content.size, mimeType);
      activeFileUrl = URL.createObjectURL(previewBlob);
      fileLoadStatus = "ready";
      if (filePreviewKind(node) === "text") void loadTextFile(content, generation);
    } catch {
      if (generation !== fileLoadGeneration) return;
      fileLoadStatus = "error";
      fileLoadError = "The file could not be read from browser storage.";
    }
  }

  function onRowClick(node: NodeMeta): void {
    selectedId = node.id;
    if (node.type === "folder") {
      node.expanded = !node.expanded;
      schedulePersistIndex();
    } else if (node.type === "note") {
      openNote(node.id);
    } else {
      openFile(node.id);
    }
  }

  function startRename(id: string): void {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    editingId = id;
    editingName = n.name;
  }

  async function refreshPreviewAfterRename(node: NodeMeta): Promise<void> {
    if (node.type === "file" && node.id === activeId) {
      await openFile(node.id);
    }
  }

  function commitRename(): void {
    if (!editingId) return;
    const n = nodes.find((x) => x.id === editingId);
    if (n) {
      const previousName = n.name;
      const name = (editingName.trim() || (n.type === "folder" ? "New Folder" : "Untitled"));
      n.name = uniqueName(n.parentId, n.type, name, n.id);
      n.updatedAt = Date.now();
      nodes = [...nodes];
      persistIndex();
      if (n.name !== previousName) void refreshPreviewAfterRename(n);
    }
    editingId = null;
  }

  function cancelRename(): void {
    editingId = null;
  }

  function onRenameKey(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  async function deleteNode(id: string, confirmed = false): Promise<NodeMeta | null> {
    const n = nodes.find((x) => x.id === id);
    if (!n) return null;
    const label = n.type === "folder" ? `folder "${n.name}" and all its contents` : `${n.type} "${n.name}"`;
    if (!confirmed && !confirm(`Delete ${label}? This cannot be undone.`)) return null;

    const subtree = collectSubtree(id);
    const ids = new Set(subtree.map((x) => x.id));
    if (activeId && ids.has(activeId)) {
      await flushSave();
    }
    await Promise.all(
      subtree
        .filter((x) => x.type !== "folder")
        .map((x) => idbDel(x.type === "note" ? noteKey(x.id) : fileKey(x.id))),
    );
    nodes = nodes.filter((x) => !ids.has(x.id));
    await idbSet(INDEX_KEY, $state.snapshot(nodes));

    if (selectedId && ids.has(selectedId)) selectedId = null;
    if (activeId && ids.has(activeId)) {
      activeId = null;
      const next = nodes.find((x) => x.type !== "folder");
      if (next?.type === "note") await openNote(next.id);
      else if (next) await openFile(next.id);
      else clearEditor();
    }
    return n;
  }

  function clearEditor(): void {
    openRequestGeneration++;
    resetActiveFilePreview();
    activeId = null;
    currentContent = "";
    previewHtml = "";
    programmatic = true;
    updateEditorContent(editor, "");
    programmatic = false;
    idbDel(ACTIVE_KEY).catch(() => {});
  }

  // ---- Drag and drop ----
  function moveNode(id: string, newParentId: string | null, insertBeforeId: string | null): void {
    if (id === newParentId) return;
    const dragNode = nodes.find((n) => n.id === id);
    if (!dragNode) return;
    if (dragNode.type === "folder" && newParentId) {
      if (newParentId === id || isDescendant(id, newParentId)) return;
    }
    dragNode.parentId = newParentId;
    const siblings = nodes
      .filter((n) => n.parentId === newParentId && n.id !== id)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    let insertIndex = siblings.length;
    if (insertBeforeId) {
      const idx = siblings.findIndex((s) => s.id === insertBeforeId);
      if (idx !== -1) insertIndex = idx;
    }
    siblings.splice(insertIndex, 0, dragNode);
    siblings.forEach((s, i) => (s.order = i));
    nodes = [...nodes];
    persistIndex();
  }

  function onRowDragStart(e: DragEvent, node: NodeMeta): void {
    dragId = node.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", node.id);
      } catch {
        /* ignore */
      }
    }
  }

  function onRowDragOver(e: DragEvent, node: NodeMeta): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dropTargetId = node.id;
  }

  function onRowDrop(e: DragEvent, node: NodeMeta): void {
    e.preventDefault();
    e.stopPropagation();
    const src = dragId;
    dropTargetId = null;
    dragId = null;
    if (!src || src === node.id) return;
    if (node.type === "folder") {
      moveNode(src, node.id, null);
      expandFolder(node.id);
    } else {
      moveNode(src, node.parentId, node.id);
    }
  }

  function onRowDragEnd(): void {
    dragId = null;
    dropTargetId = null;
  }

  function onRootDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  function onRootDrop(e: DragEvent): void {
    e.preventDefault();
    const src = dragId;
    dropTargetId = null;
    dragId = null;
    if (!src) return;
    moveNode(src, null, null);
  }

  // ---- Title / editor input ----
  function onTitleInput(e: Event): void {
    const node = activeNode;
    if (!node) return;
    node.name = (e.target as HTMLInputElement).value;
    node.updatedAt = Date.now();
    schedulePersistIndex();
  }

  function onTitleFocus(): void {
    titleNameBeforeEdit = activeNode?.name ?? "";
  }

  function onTitleBlur(): void {
    const node = activeNode;
    if (!node) return;
    const name = node.name.trim() || "Untitled";
    node.name = uniqueName(node.parentId, node.type, name, node.id);
    nodes = [...nodes];
    persistIndex();
    const nameChanged = node.name !== titleNameBeforeEdit;
    titleNameBeforeEdit = "";
    if (nameChanged) void refreshPreviewAfterRename(node);
  }

  function onUpdate(content: string): void {
    currentContent = content;
    scheduleRender(content);
    if (!programmatic && activeId) scheduleSave();
  }

  function onSelectionChange(info: SelectionInfo): void {
    cursorLine = info.line;
    cursorColumn = info.column;
    selectionLength = info.selectionLength;
    selectedLines = info.selectedLines;
  }

  // ---- Beautify (markdown table formatter) ----
  type ColAlign = "none" | "left" | "right" | "center";

  // Width in display columns; counts code points (CJK is treated as 1 for simplicity).
  function cellWidth(text: string): number {
    return [...text].length;
  }

  // Split a table row into trimmed cells, honoring escaped pipes (\|).
  function splitTableRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells: string[] = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\" && s[i + 1] === "|") {
        cur += "\\|";
        i++;
        continue;
      }
      if (ch === "|") {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  // A delimiter row is one whose cells are all like ---, :--, --:, :-:.
  function isDelimiterRow(line: string): boolean {
    if (!line.includes("-") || !line.includes("|")) return false;
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
  }

  function alignOf(delimiterCell: string): ColAlign {
    const left = delimiterCell.startsWith(":");
    const right = delimiterCell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  }

  function padCell(text: string, width: number, align: ColAlign): string {
    const space = Math.max(0, width - cellWidth(text));
    if (align === "right") return " ".repeat(space) + text;
    if (align === "center") {
      const l = Math.floor(space / 2);
      return " ".repeat(l) + text + " ".repeat(space - l);
    }
    return text + " ".repeat(space);
  }

  function delimiterCell(width: number, align: ColAlign): string {
    const w = Math.max(width, align === "center" ? 5 : 3);
    if (align === "center") return ":" + "-".repeat(w - 2) + ":";
    if (align === "right") return "-".repeat(w - 1) + ":";
    if (align === "left") return ":" + "-".repeat(w - 1);
    return "-".repeat(w);
  }

  // Reformat a contiguous block of table lines (header, delimiter, body rows).
  function formatTable(lines: string[], indent: string): string[] {
    const rows = lines.map(splitTableRow);
    const aligns = rows[1].map(alignOf);
    const cols = Math.max(...rows.map((r) => r.length), aligns.length);

    // Column content widths (delimiter row excluded from width calc).
    const widths = new Array(cols).fill(3);
    rows.forEach((row, rowIdx) => {
      if (rowIdx === 1) return;
      for (let c = 0; c < cols; c++) {
        widths[c] = Math.max(widths[c], cellWidth(row[c] ?? ""));
      }
    });

    const out: string[] = [];
    rows.forEach((row, rowIdx) => {
      let cells: string[];
      if (rowIdx === 1) {
        cells = widths.map((w, c) => delimiterCell(w, aligns[c] ?? "none"));
      } else {
        cells = widths.map((w, c) => padCell(row[c] ?? "", w, aligns[c] ?? "none"));
      }
      out.push(`${indent}| ${cells.join(" | ")} |`);
    });
    return out;
  }

  // Trim trailing whitespace and align all GFM tables. Code fences are left untouched.
  function beautifyMarkdown(input: string): string {
    const lines = input.split("\n");
    const result: string[] = [];
    let fence: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fenceMatch = line.match(/^(\s*)(```+|~~~+)/);

      if (fence) {
        result.push(line.replace(/[ \t]+$/, ""));
        if (fenceMatch && line.trim().startsWith(fence)) fence = null;
        continue;
      }
      if (fenceMatch) {
        fence = fenceMatch[2][0] === "`" ? "```" : "~~~";
        result.push(line.replace(/[ \t]+$/, ""));
        continue;
      }

      // Detect a table: current line has a pipe and the next line is a delimiter.
      const next = lines[i + 1];
      if (line.includes("|") && next !== undefined && isDelimiterRow(next)) {
        const indent = line.match(/^\s*/)?.[0] ?? "";
        const block = [line, next];
        let j = i + 2;
        while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "" && !/^(\s*)(```+|~~~+)/.test(lines[j])) {
          block.push(lines[j]);
          j++;
        }
        result.push(...formatTable(block, indent));
        i = j - 1;
        continue;
      }

      result.push(line.replace(/[ \t]+$/, ""));
    }

    return result.join("\n");
  }

  function beautify(): void {
    if (!activeNote) return;
    const formatted = beautifyMarkdown(currentContent);
    if (formatted === currentContent) return;
    currentContent = formatted;
    programmatic = true;
    updateEditorContent(editor, formatted);
    programmatic = false;
    scheduleRender(formatted);
    scheduleSave();
  }

  // ---- Context menu ----
  function openContextMenu(e: MouseEvent, node: NodeMeta | null): void {
    e.preventDefault();
    e.stopPropagation();
    if (editingId) return;
    selectedId = node ? node.id : null;
    contextMenu = { x: e.clientX, y: e.clientY, nodeId: node ? node.id : null };
  }

  function closeContextMenu(): void {
    contextMenu = null;
  }

  function menuImportTarget(): string | null {
    const node = menuNode;
    if (!node) return null;
    return node.type === "folder" ? node.id : node.parentId;
  }

  $effect(() => {
    if (!contextMenu) return;
    const close = () => closeContextMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    const t = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("blur", close);
      window.addEventListener("resize", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  });

  // ---- Split resizer ----
  function startResize(e: PointerEvent): void {
    e.preventDefault();
    const container = gridEl;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const usable = Math.max(1, rect.width);

    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (x / usable) * 100));
      splitPct = pct;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ---- Import / export ----
  function triggerBlobDownload(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function sanitizeSegment(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, "-").trim() || "untitled";
  }

  async function noteContent(id: string): Promise<string> {
    if (id === activeId) return currentContent;
    return ((await idbGet(noteKey(id))) as string | undefined) ?? "";
  }

  async function fileContent(id: string): Promise<Blob | null> {
    const value = await idbGet(fileKey(id));
    if (value instanceof Blob) return value;
    if (value instanceof ArrayBuffer) return new Blob([value]);
    return null;
  }

  function formatBytes(bytes = 0): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = units[0];
    for (let i = 1; i < units.length && value >= 1024; i++) {
      value /= 1024;
      unit = units[i];
    }
    return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
  }

  function downloadActiveNode(): void {
    if (activeNode) downloadNode(activeNode);
  }

  async function downloadNoteById(id: string): Promise<void> {
    const node = nodes.find((n) => n.id === id && n.type === "note");
    if (!node) return;
    const content = await noteContent(id);
    triggerBlobDownload(
      `${sanitizeSegment(node.name) || "note"}.md`,
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
    );
  }

  async function downloadFileById(id: string): Promise<void> {
    const node = nodes.find((n) => n.id === id && n.type === "file");
    if (!node) return;
    const content = await fileContent(id);
    if (!content) {
      alert(`"${node.name}" could not be read from browser storage.`);
      return;
    }
    triggerBlobDownload(sanitizeSegment(node.name), content);
  }

  // Relative path of an item within the given root folder, e.g. "Sub/Note.md".
  function relativePath(node: NodeMeta, rootId: string): string {
    const filename = node.type === "note" ? `${sanitizeSegment(node.name)}.md` : sanitizeSegment(node.name);
    const parts: string[] = [filename];
    let cur = nodes.find((n) => n.id === node.parentId);
    while (cur && cur.id !== rootId) {
      parts.unshift(sanitizeSegment(cur.name));
      cur = nodes.find((n) => n.id === cur!.parentId);
    }
    return parts.join("/");
  }

  async function downloadFolderZip(id: string): Promise<void> {
    const folder = nodes.find((n) => n.id === id && n.type === "folder");
    if (!folder) return;
    const encoder = new TextEncoder();
    const used = new Set<string>();
    const entries: { name: string; bytes: Uint8Array }[] = [];
    for (const n of collectSubtree(id)) {
      if (n.type === "folder") continue;
      let path = relativePath(n, id);
      if (used.has(path)) {
        const dot = path.lastIndexOf(".");
        const stem = dot >= 0 ? path.slice(0, dot) : path;
        const ext = dot >= 0 ? path.slice(dot) : "";
        let i = 2;
        while (used.has(`${stem} (${i})${ext}`)) i++;
        path = `${stem} (${i})${ext}`;
      }
      used.add(path);
      if (n.type === "note") {
        entries.push({ name: path, bytes: encoder.encode(await noteContent(n.id)) });
      } else {
        const content = await fileContent(n.id);
        if (content) entries.push({ name: path, bytes: new Uint8Array(await content.arrayBuffer()) });
      }
    }
    if (entries.length === 0) {
      alert("This folder has no notes or files to export.");
      return;
    }
    const zip = buildZip(entries);
    triggerBlobDownload(`${sanitizeSegment(folder.name) || "folder"}.zip`, new Blob([zip], { type: "application/zip" }));
  }

  function downloadNode(node: NodeMeta): void {
    if (node.type === "folder") downloadFolderZip(node.id);
    else if (node.type === "note") downloadNoteById(node.id);
    else downloadFileById(node.id);
  }

  function triggerImport(parentId: string | null): void {
    importParentId = parentId;
    fileInput.click();
  }

  async function handleImport(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    const parentId = importParentId;
    importParentId = null;
    expandFolder(parentId);
    let lastId: string | null = null;
    const failures: string[] = [];
    void navigator.storage?.persist?.();
    for (const file of Array.from(files)) {
      let node: NodeMeta | null = null;
      try {
        if (/\.(md|markdown|txt)$/i.test(file.name)) {
          const text = await file.text();
          const name = file.name.replace(/\.(md|markdown|txt)$/i, "");
          node = addNote(parentId, name || "Untitled", text);
          await idbSet(noteKey(node.id), text);
        } else {
          node = await addFile(parentId, file);
        }
        lastId = node.id;
      } catch (error) {
        if (node) {
          nodes = nodes.filter((candidate) => candidate.id !== node!.id);
          await idbDel(node.type === "note" ? noteKey(node.id) : fileKey(node.id)).catch(() => {});
        }
        const reason = error instanceof DOMException && error.name === "QuotaExceededError"
          ? "browser storage is full"
          : "the file could not be stored";
        failures.push(`${file.name}: ${reason}`);
      }
    }
    await idbSet(INDEX_KEY, $state.snapshot(nodes)).catch(() => {});
    if (lastId) {
      const last = nodes.find((node) => node.id === lastId);
      if (last?.type === "note") await openNote(last.id);
      else if (last) await openFile(last.id);
    }
    input.value = "";
    if (failures.length > 0) {
      alert(`Some files were not imported:\n\n${failures.join("\n")}\n\nFree browser storage and try again.`);
    }
  }

  // ---- Preview rendering ----
  async function loadHljs(): Promise<typeof import("highlight.js")> {
    if (!hljs) hljs = await import("highlight.js");
    return hljs;
  }

  async function loadComarkRender(): Promise<(markdown: string) => Promise<string>> {
    if (!comarkRender) {
      const [{ createRender }, mathPlugin] = await Promise.all([
        import("@comark/html"),
        import("@comark/html/plugins/math"),
      ]);
      comarkRender = createRender({
        plugins: [mathPlugin.default()],
        components: { Math: mathPlugin.Math },
      });
    }
    return comarkRender;
  }

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
  }

  async function highlightRenderedCodeBlocks(): Promise<void> {
    if (!previewContainer) return;
    const codeBlocks = previewContainer.querySelectorAll("pre code");
    if (codeBlocks.length === 0) return;
    const hljsMod = await loadHljs();
    for (const codeBlock of codeBlocks) {
      const codeEl = codeBlock as HTMLElement;
      if (codeEl.classList.contains("language-mermaid") || codeEl.classList.contains("hljs")) continue;
      const languageClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
      const language = languageClass?.replace("language-", "");
      const source = codeEl.textContent || "";
      if (language && hljsMod.default.getLanguage(language)) {
        codeEl.innerHTML = hljsMod.default.highlight(source, { language }).value;
      } else {
        codeEl.innerHTML = hljsMod.default.highlightAuto(source).value;
      }
      codeEl.classList.add("hljs");
    }
  }

  async function renderMermaidBlocks(): Promise<void> {
    if (!previewContainer) return;
    const mermaidBlocks = previewContainer.querySelectorAll("code.language-mermaid");
    if (mermaidBlocks.length === 0) return;
    try {
      const mermaidMod = await import("mermaid");
      const mermaid = mermaidMod.default;
      mermaid.initialize({ startOnLoad: false, theme: isDark ? "dark" : "default", securityLevel: "loose" });
      mermaidLoaded = true;
      for (let i = 0; i < mermaidBlocks.length; i++) {
        const codeEl = mermaidBlocks[i] as HTMLElement;
        const preEl = codeEl.parentElement;
        if (!preEl || preEl.tagName !== "PRE") continue;
        const graphDefinition = codeEl.textContent || "";
        const id = `notepad-mermaid-${Date.now()}-${i}`;
        try {
          const { svg } = await mermaid.render(id, graphDefinition);
          const wrapper = document.createElement("div");
          wrapper.className = "mermaid-diagram";
          wrapper.innerHTML = svg;
          preEl.replaceWith(wrapper);
        } catch {
          /* leave as-is */
        }
      }
    } catch {
      /* mermaid failed to load */
    }
  }

  async function updatePreview(input: string): Promise<void> {
    if (viewMode === "editor") return;
    try {
      const render = await loadComarkRender();
      previewHtml = await render(input);
      await new Promise((r) => setTimeout(r, 0));
      await highlightRenderedCodeBlocks();
      await renderMermaidBlocks();
    } catch (error) {
      const message = error instanceof Error ? escapeHtml(error.message) : "Unknown error";
      previewHtml = `<p class="error">Error rendering markdown: ${message}</p>`;
    }
  }

  function scheduleRender(content: string): void {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => updatePreview(content), 150);
  }

  // Re-render preview when switching back to a view that shows it
  $effect(() => {
    if (viewMode !== "editor" && loaded) {
      scheduleRender(currentContent);
    }
  });

  // ---- Lifecycle ----
  function buildEditor(content: string): void {
    if (!editorContainer) return;
    editor = createEditor({
      container: editorContainer,
      config: {
        dark: isDark,
        placeholderText: "Start writing your note in Markdown…",
        language: markdown(),
        onUpdate,
        onSelectionChange,
      },
      initialContent: content,
    });
  }

  async function loadAll(): Promise<void> {
    const idx = (await idbGet(INDEX_KEY)) as NodeMeta[] | undefined;
    if (componentDisposed) return;
    if (Array.isArray(idx) && idx.length > 0) {
      nodes = idx;
    } else {
      const welcome = addNote(null, "Welcome", WELCOME);
      persistIndex();
      activeId = welcome.id;
    }

    const storedActive = (await idbGet(ACTIVE_KEY)) as string | null | undefined;
    if (componentDisposed) return;
    let openId: string | null = null;
    if (storedActive && nodes.some((n) => n.id === storedActive && n.type !== "folder")) {
      openId = storedActive;
    } else if (activeId && nodes.some((n) => n.id === activeId && n.type !== "folder")) {
      openId = activeId;
    } else {
      const first = nodes.find((n) => n.type !== "folder");
      openId = first ? first.id : null;
    }

    loaded = true;
    if (openId) {
      const node = nodes.find((candidate) => candidate.id === openId);
      if (node?.type === "note") await openNote(openId);
      else if (node?.type === "file") await openFile(openId);
    } else {
      scheduleRender("");
    }
  }

  function nodePath(node: NodeMeta): string {
    const parts = [node.name];
    let parentId = node.parentId;
    while (parentId) {
      const parent = nodes.find((n) => n.id === parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parentId;
    }
    return parts.join("/");
  }

  function nodeSummary(node: NodeMeta): Record<string, unknown> {
    return {
      id: node.id,
      type: node.type,
      name: node.name,
      path: nodePath(node),
      parentId: node.parentId,
      ...(node.type === "file" ? { mimeType: node.mimeType, size: node.size } : {}),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      active: node.id === activeId,
    };
  }

  function orderedNodes(parentId: string | null = null): NodeMeta[] {
    return childrenOf(parentId).flatMap((node) => [node, ...orderedNodes(node.id)]);
  }

  function requireNode(id: unknown, type?: NodeType): NodeMeta {
    const node = nodes.find((n) => n.id === String(id ?? ""));
    if (!node || (type && node.type !== type)) {
      throw new Error(type ? `${type} not found: ${id}` : `Node not found: ${id}`);
    }
    return node;
  }

  function parentFolderId(value: unknown): string | null {
    if (value == null || value === "") return null;
    return requireNode(value, "folder").id;
  }

  async function writeNoteContent(node: NodeMeta, content: string): Promise<void> {
    if (node.id === activeId && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    await idbSet(noteKey(node.id), content);
    node.updatedAt = Date.now();
    nodes = [...nodes];
    await idbSet(INDEX_KEY, $state.snapshot(nodes));

    if (node.id === activeId) {
      currentContent = content;
      programmatic = true;
      updateEditorContent(editor, content);
      programmatic = false;
      saveStatus = "saved";
      scheduleRender(content);
    }
  }

  function registerNotepadMcp(): () => void {
    const nullableIdSchema = {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Folder id, or null for the notebook root",
    };
    const tools: Record<string, ToolManifest> = {
      listNotes: {
        description:
          "List every note and folder in tree order. Returns ids and paths for use with the other Notepad tools.",
        handler: () => ({
          activeId,
          nodes: orderedNodes().map(nodeSummary),
        }),
      },
      readNote: {
        description: "Read a Markdown note by id without changing the active note.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Note id from listNotes" } },
          required: ["id"],
        },
        handler: async (args) => {
          const node = requireNode(args.id, "note");
          return { ...nodeSummary(node), content: await noteContent(node.id) };
        },
      },
      openNote: {
        description: "Open a note by id in the visible Notepad editor and return its content.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Note id from listNotes" } },
          required: ["id"],
        },
        handler: async (args) => {
          const node = requireNode(args.id, "note");
          await openNote(node.id);
          return { ...nodeSummary(node), content: currentContent };
        },
      },
      createNote: {
        description: "Create and open a Markdown note. Names are made unique within the destination folder.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Note name" },
            content: { type: "string", description: "Initial Markdown content (default empty)" },
            parentId: nullableIdSchema,
          },
          required: ["name"],
        },
        handler: async (args) => {
          const parentId = parentFolderId(args.parentId);
          const node = addNote(parentId, String(args.name || "Untitled"), String(args.content ?? ""));
          expandFolder(parentId);
          await Promise.all([
            idbSet(noteKey(node.id), String(args.content ?? "")),
            idbSet(INDEX_KEY, $state.snapshot(nodes)),
          ]);
          await openNote(node.id);
          return { ...nodeSummary(node), content: currentContent };
        },
      },
      updateNote: {
        description: "Replace a note's complete Markdown content by id.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Note id from listNotes" },
            content: { type: "string", description: "Complete replacement Markdown" },
          },
          required: ["id", "content"],
        },
        handler: async (args) => {
          const node = requireNode(args.id, "note");
          await writeNoteContent(node, String(args.content ?? ""));
          return { ...nodeSummary(node), content: await noteContent(node.id) };
        },
      },
      appendNote: {
        description: "Append Markdown text to a note by id.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Note id from listNotes" },
            text: { type: "string", description: "Text to append exactly as provided" },
          },
          required: ["id", "text"],
        },
        handler: async (args) => {
          const node = requireNode(args.id, "note");
          const content = (await noteContent(node.id)) + String(args.text ?? "");
          await writeNoteContent(node, content);
          return { ...nodeSummary(node), content };
        },
      },
      createFolder: {
        description: "Create a folder in the notebook. Names are made unique within the parent folder.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Folder name" },
            parentId: nullableIdSchema,
          },
          required: ["name"],
        },
        handler: async (args) => {
          const parentId = parentFolderId(args.parentId);
          const node = addFolder(parentId, String(args.name || "New Folder"));
          expandFolder(parentId);
          selectedId = node.id;
          await idbSet(INDEX_KEY, $state.snapshot(nodes));
          return nodeSummary(node);
        },
      },
      renameNode: {
        description: "Rename a note, file, or folder by id. The final name is made unique among its siblings.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Note or folder id from listNotes" },
            name: { type: "string", description: "New name" },
          },
          required: ["id", "name"],
        },
        handler: async (args) => {
          const node = requireNode(args.id);
          const previousName = node.name;
          const fallback = node.type === "folder" ? "New Folder" : "Untitled";
          node.name = uniqueName(node.parentId, node.type, String(args.name).trim() || fallback, node.id);
          node.updatedAt = Date.now();
          nodes = [...nodes];
          await idbSet(INDEX_KEY, $state.snapshot(nodes));
          if (node.name !== previousName) await refreshPreviewAfterRename(node);
          return nodeSummary(node);
        },
      },
      moveNode: {
        description: "Move a note or folder into another folder, or to the notebook root.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Note or folder id from listNotes" },
            parentId: nullableIdSchema,
          },
          required: ["id", "parentId"],
        },
        handler: async (args) => {
          const node = requireNode(args.id);
          const parentId = parentFolderId(args.parentId);
          if (node.type === "folder" && parentId && (parentId === node.id || isDescendant(node.id, parentId))) {
            throw new Error("A folder cannot be moved into itself or one of its descendants.");
          }
          moveNode(node.id, parentId, null);
          node.name = uniqueName(parentId, node.type, node.name, node.id);
          node.updatedAt = Date.now();
          expandFolder(parentId);
          await idbSet(INDEX_KEY, $state.snapshot(nodes));
          return nodeSummary(node);
        },
      },
      deleteNode: {
        description:
          "Permanently delete a note or folder and all notes inside it. Requires confirm=true; this cannot be undone.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Note or folder id from listNotes" },
            confirm: { type: "boolean", description: "Must be true to allow permanent deletion" },
          },
          required: ["id", "confirm"],
        },
        handler: async (args) => {
          const node = requireNode(args.id);
          if (args.confirm !== true) throw new Error("Set confirm=true to permanently delete this node.");
          const deleted = nodeSummary(node);
          await deleteNode(node.id, true);
          return { deleted };
        },
      },
    };

    return registerPageMcp("notepad", tools);
  }

  onMount(() => {
    componentDisposed = false;
    let disposed = false;
    let unregisterMcp = () => {};
    buildEditor("");

    darkModeCleanup = createDarkModeObserver((dark) => {
      isDark = dark;
      if (editor && editorContainer) {
        const content = currentContent;
        editor.destroy();
        programmatic = true;
        buildEditor(content);
        programmatic = false;
        mermaidLoaded = false;
        scheduleRender(content);
      }
    });

    void loadAll().then(() => {
      if (!disposed) unregisterMcp = registerNotepadMcp();
    });

    return () => {
      disposed = true;
      componentDisposed = true;
      unregisterMcp();
      void flushSave();
      resetActiveFilePreview();
      if (darkModeCleanup) darkModeCleanup();
      if (editor) editor.destroy();
      if (saveTimer) clearTimeout(saveTimer);
      if (indexTimer) clearTimeout(indexTimer);
      if (renderTimer) clearTimeout(renderTimer);
    };
  });

  // Action: focus + select text when a rename input mounts
  function selectAllOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css" />
</svelte:head>

{#snippet fileKindIcon(kind: FilePreviewKind, className: string)}
  {#if kind === "image"}
    <FileImage class={className} />
  {:else if kind === "video"}
    <FileVideo class={className} />
  {:else if kind === "audio"}
    <FileAudio class={className} />
  {:else if kind === "archive"}
    <FileArchive class={className} />
  {:else if kind === "text" || kind === "pdf" || kind === "document"}
    <FileText class={className} />
  {:else}
    <FileQuestion class={className} />
  {/if}
{/snippet}

{#snippet fileDetails(node: NodeMeta, kind: FilePreviewKind, issue: string)}
  <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-1 py-8 sm:px-6">
    <div class="border-y border-(--color-border) py-6 sm:py-8">
      <div class="flex items-start gap-4 sm:gap-6">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) sm:h-14 sm:w-14">
          {@render fileKindIcon(kind, "h-6 w-6 sm:h-7 sm:w-7")}
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="break-words text-lg font-semibold leading-tight text-(--color-text)" title={node.name}>{node.name}</h2>
          <p class="mt-1 text-sm text-(--color-text-muted)">{fileTypeLabel(node)}</p>
          {#if issue}
            <p role="alert" class="mt-3 border border-(--color-error-border) bg-(--color-error-bg) px-3 py-2 text-sm text-(--color-error-text)">
              {issue}
            </p>
          {/if}
          <dl class="mt-5 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm tabular-nums">
            <dt class="text-(--color-text-light)">Size</dt>
            <dd class="text-(--color-text-muted)">{formatBytes(node.size)}</dd>
            <dt class="text-(--color-text-light)">Format</dt>
            <dd class="min-w-0 break-all text-(--color-text-muted)">{effectiveMimeType(node)}</dd>
            <dt class="text-(--color-text-light)">Storage</dt>
            <dd class="text-(--color-text-muted)">This browser only</dd>
          </dl>
          <div class="mt-6 flex flex-wrap gap-2">
            <button
              onclick={showRawFile}
              disabled={!activeFileBlob}
              class="inline-flex items-center gap-2 border border-(--color-border) px-3 py-2 text-sm font-medium text-(--color-text) transition-colors hover:bg-(--color-bg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Binary class="h-4 w-4" />
              Inspect raw bytes
            </button>
            <button
              onclick={downloadActiveNode}
              class="inline-flex items-center gap-2 bg-(--color-accent) px-3 py-2 text-sm font-medium text-(--color-btn-text) transition-colors hover:bg-(--color-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" />
              </svg>
              Download file
            </button>
          </div>
        </div>
      </div>
    </div>
    <p class="mt-4 max-w-xl text-xs leading-5 text-(--color-text-light)">
      The original bytes stay in IndexedDB and are never uploaded. Clearing this site's browser data removes this file.
    </p>
  </div>
{/snippet}

{#snippet treeNode(node: NodeMeta, depth: number)}
  <div
    role="treeitem"
    aria-selected={selectedId === node.id}
    tabindex="-1"
    draggable={editingId !== node.id}
    class="group flex items-center gap-1 pr-1 py-1 cursor-pointer select-none text-sm transition-colors {selectedId ===
    node.id
      ? 'bg-(--color-border) text-(--color-text)'
      : 'text-(--color-text-muted) hover:bg-(--color-bg) hover:text-(--color-text)'} {dropTargetId === node.id
      ? 'outline outline-1 outline-(--color-accent)'
      : ''}"
    style:padding-left="{depth * 14 + 6}px"
    onclick={() => onRowClick(node)}
    ondblclick={() => startRename(node.id)}
    onkeydown={(e) => {
      if (e.key === "Enter") onRowClick(node);
    }}
    ondragstart={(e) => onRowDragStart(e, node)}
    ondragover={(e) => onRowDragOver(e, node)}
    ondragleave={() => (dropTargetId === node.id ? (dropTargetId = null) : null)}
    ondrop={(e) => onRowDrop(e, node)}
    ondragend={onRowDragEnd}
    oncontextmenu={(e) => openContextMenu(e, node)}
  >
    {#if node.type === "folder"}
      <svg
        class="w-3 h-3 shrink-0 transition-transform {node.expanded ? 'rotate-90' : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      <span class="shrink-0" aria-hidden="true">{node.expanded ? "📂" : "📁"}</span>
    {:else if node.type === "note"}
      <span class="w-3 shrink-0"></span>
      <span class="shrink-0" aria-hidden="true">📄</span>
    {:else}
      <span class="w-3 shrink-0"></span>
      <span class="shrink-0" aria-hidden="true">
        {@render fileKindIcon(filePreviewKind(node), "h-4 w-4")}
      </span>
    {/if}

    {#if editingId === node.id}
      <input
        use:selectAllOnMount
        bind:value={editingName}
        onkeydown={onRenameKey}
        onblur={commitRename}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
        class="flex-1 min-w-0 px-1 py-0.5 text-sm bg-(--color-bg-alt) text-(--color-text) border border-(--color-accent) focus:outline-none"
      />
    {:else}
      <span class="flex-1 min-w-0 truncate">{node.name}</span>
      <span class="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          title={node.type === "folder" ? "Download as .zip" : node.type === "note" ? "Download as .md" : "Download file"}
          aria-label="Download"
          class="p-0.5 text-(--color-text-light) hover:text-(--color-text)"
          onclick={(e) => {
            e.stopPropagation();
            downloadNode(node);
          }}
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" />
          </svg>
        </button>
        <button
          title="Rename"
          aria-label="Rename"
          class="p-0.5 text-(--color-text-light) hover:text-(--color-text)"
          onclick={(e) => {
            e.stopPropagation();
            startRename(node.id);
          }}
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        <button
          title="Delete"
          aria-label="Delete"
          class="p-0.5 text-(--color-text-light) hover:text-(--color-error-text)"
          onclick={(e) => {
            e.stopPropagation();
            deleteNode(node.id);
          }}
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </span>
    {/if}
  </div>

  {#if node.type === "folder" && node.expanded}
    {#each childrenOf(node.id) as child (child.id)}
      {@render treeNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<div class="relative h-full min-h-[75vh] overflow-hidden lg:min-h-0">
  <div class="absolute inset-0 flex flex-col">
    <div class="flex-1 min-h-0 flex border border-(--color-border)">
      <!-- Sidebar: file tree -->
      <aside
        class="flex flex-col w-60 shrink-0 border-r border-(--color-border) bg-(--color-bg-alt) min-h-0"
        class:hidden={!sidebarOpen}
      >
        <div class="shrink-0 flex items-center gap-1 p-2 h-[47px] border-b border-(--color-border)">
          <button
            onclick={newNote}
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
            title="New note"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Note
          </button>
          <button
            onclick={newFolder}
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
            title="New folder"
          >
            <span aria-hidden="true">📁</span>+
          </button>
          <div class="flex-1"></div>
          <button
            onclick={() => triggerImport(targetParentId())}
            class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            title="Import notes or files into the selected folder"
            aria-label="Import notes or files"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
            </svg>
          </button>
        </div>

        <div
          role="tree"
          aria-label="Notes"
          class="flex-1 overflow-auto py-1"
          ondragover={onRootDragOver}
          ondrop={onRootDrop}
          oncontextmenu={(e) => openContextMenu(e, null)}
        >
          {#if loaded && childrenOf(null).length === 0}
            <p class="px-3 py-4 text-xs text-(--color-text-light)">No notes yet. Create your first note.</p>
          {/if}
          {#each childrenOf(null) as root (root.id)}
            {@render treeNode(root, 0)}
          {/each}
        </div>
      </aside>

      <!-- Editor + preview -->
      <section class="relative flex-1 flex flex-col min-w-0 min-h-0">
        <div class="shrink-0 flex items-center gap-2 p-2 h-[47px] border-b border-(--color-border) bg-(--color-bg-alt)">
          <button
            onclick={() => (sidebarOpen = !sidebarOpen)}
            class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
            title={sidebarOpen ? "Hide files" : "Show files"}
            aria-label="Toggle file tree"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {#if activeNode}
            <input
              value={activeNode.name}
              oninput={onTitleInput}
              onfocus={onTitleFocus}
              onblur={onTitleBlur}
              class="flex-1 min-w-0 px-2 py-1 text-sm font-medium bg-transparent text-(--color-text) border border-transparent hover:border-(--color-border) focus:border-(--color-accent) focus:bg-(--color-bg) focus:outline-none transition-colors"
              placeholder="Untitled"
            />
            {#if activeNote}
              <span
                class="shrink-0 text-xs {saveStatus === 'saving' ? 'text-(--color-text-light)' : 'text-(--color-text-muted)'}"
                title="Notes are saved automatically"
              >
                {saveStatus === "saving" ? "Saving…" : "Saved"}
              </span>
            {:else if activeFile}
              <span class="hidden shrink-0 text-xs text-(--color-text-muted) sm:inline" title="Stored locally in this browser">
                {formatBytes(activeFile.size)}
              </span>
            {/if}
          {:else}
            <span class="flex-1 text-sm text-(--color-text-light)">No note open</span>
          {/if}

          <!-- View toggle -->
          {#if activeNote}
            <div class="hidden sm:flex p-0.5 bg-(--color-border) gap-0.5 shrink-0">
              {#each VIEW_MODES as vm (vm.val)}
                <button
                  class="px-2 py-1 text-xs font-medium transition-colors {viewMode === vm.val
                    ? 'bg-(--color-text) text-(--color-btn-text)'
                    : 'text-(--color-text-muted) hover:text-(--color-text)'}"
                  onclick={() => (viewMode = vm.val)}
                >
                  {vm.label}
                </button>
              {/each}
            </div>
          {:else if activeFile}
            <div class="flex shrink-0 items-center border border-(--color-border)">
              <button
                onclick={showFilePreview}
                disabled={fileLoadStatus !== "ready"}
                aria-pressed={fileViewMode === "preview"}
                class="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-(--color-accent) disabled:opacity-40 {fileViewMode === 'preview'
                  ? 'bg-(--color-text) text-(--color-btn-text)'
                  : 'text-(--color-text-muted) hover:bg-(--color-bg) hover:text-(--color-text)'}"
                title="File preview"
              >
                <Eye class="h-3.5 w-3.5" />
                <span class="hidden md:inline">Preview</span>
              </button>
              <button
                onclick={showRawFile}
                disabled={fileLoadStatus !== "ready"}
                aria-pressed={fileViewMode === "raw"}
                class="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-(--color-accent) disabled:opacity-40 {fileViewMode === 'raw'
                  ? 'bg-(--color-text) text-(--color-btn-text)'
                  : 'text-(--color-text-muted) hover:bg-(--color-bg) hover:text-(--color-text)'}"
                title="Inspect raw bytes"
              >
                <Binary class="h-3.5 w-3.5" />
                <span class="hidden md:inline">Raw</span>
              </button>
            </div>
          {/if}

          {#if activeNote}
            <button
              onclick={beautify}
              class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
              title="Beautify (align tables, trim trailing spaces)"
              aria-label="Beautify markdown"
            >
              <Sparkles class="w-4 h-4" />
            </button>
          {/if}

          <button
            onclick={downloadActiveNode}
            disabled={!activeNode}
            class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-40 shrink-0"
            title={activeFile ? "Download file" : "Download as .md"}
            aria-label={activeFile ? "Download file" : "Download note as markdown"}
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" />
            </svg>
          </button>
        </div>

        {#if activeFile}
          <div class="flex-1 min-h-0 overflow-auto bg-(--color-bg-alt)">
            {#if fileLoadStatus === "loading"}
              <div role="status" class="flex min-h-full items-center justify-center gap-2 p-6 text-sm text-(--color-text-muted)">
                <LoaderCircle class="h-4 w-4 animate-spin" />
                Opening {activeFile.name}…
              </div>
            {:else if fileLoadStatus === "error"}
              <div class="min-h-full p-5 sm:p-8">
                {@render fileDetails(activeFile, activeFileKind, fileLoadError)}
              </div>
            {:else if fileViewMode === "raw"}
              <div class="flex min-h-full flex-col bg-(--color-bg)">
                <div class="sticky top-0 z-10 flex items-center gap-3 border-b border-(--color-border) bg-(--color-bg-alt) px-3 py-2 sm:px-4">
                  <Binary class="h-4 w-4 shrink-0 text-(--color-text-muted)" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-semibold text-(--color-text)">Raw bytes</p>
                    <p class="truncate text-[11px] text-(--color-text-light)">
                      {rawPreviewTruncated ? "Showing the first 64 KB" : formatBytes(activeFile.size)} · hexadecimal + ASCII
                    </p>
                  </div>
                  <button
                    onclick={showFilePreview}
                    class="inline-flex shrink-0 items-center gap-1.5 border border-(--color-border) px-2.5 py-1.5 text-xs font-medium text-(--color-text) transition-colors hover:bg-(--color-bg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)"
                  >
                    <Eye class="h-3.5 w-3.5" />
                    Preview
                  </button>
                </div>
                {#if rawLoadStatus === "loading"}
                  <div role="status" class="flex grow items-center justify-center gap-2 p-6 text-sm text-(--color-text-muted)">
                    <LoaderCircle class="h-4 w-4 animate-spin" />
                    Reading raw bytes…
                  </div>
                {:else if rawLoadStatus === "error"}
                  <div role="alert" class="m-auto border border-(--color-error-border) bg-(--color-error-bg) px-4 py-3 text-sm text-(--color-error-text)">
                    Raw bytes could not be read. Download the file to inspect it locally.
                  </div>
                {:else}
                  <pre class="raw-file-viewer grow overflow-auto p-3 text-xs leading-5 text-(--color-text) sm:p-4">{rawPreview}</pre>
                {/if}
              </div>
            {:else if mediaPreviewError}
              <div class="min-h-full p-5 sm:p-8">
                {@render fileDetails(activeFile, activeFileKind, "This browser cannot preview the file's encoding. The original file is still available.")}
              </div>
            {:else if activeFileKind === "image"}
              <div class="flex min-h-full items-center justify-center bg-[#111111] p-3 sm:p-6">
                <img
                  src={activeFileUrl}
                  alt={activeFile.name}
                  class="max-h-[70vh] max-w-full object-contain"
                  onerror={handleMediaPreviewError}
                />
              </div>
            {:else if activeFileKind === "video"}
              <div class="flex min-h-full items-center justify-center bg-black p-2 sm:p-5">
                <video
                  src={activeFileUrl}
                  controls
                  playsinline
                  preload="metadata"
                  class="max-h-[70vh] w-full max-w-full"
                  onerror={handleMediaPreviewError}
                ></video>
              </div>
            {:else if activeFileKind === "audio"}
              <div class="flex min-h-full items-center justify-center p-5 sm:p-10">
                <div class="w-full max-w-2xl border-y border-(--color-border) py-8 sm:py-10">
                  <div class="flex items-center gap-4 sm:gap-6">
                    <div class="flex h-14 w-14 shrink-0 items-center justify-center border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) sm:h-20 sm:w-20">
                      <FileAudio class="h-7 w-7 sm:h-9 sm:w-9" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h2 class="truncate text-base font-semibold text-(--color-text)" title={activeFile.name}>{activeFile.name}</h2>
                      <p class="mt-1 text-sm text-(--color-text-muted)">{formatBytes(activeFile.size)} · {activeFileMime}</p>
                    </div>
                  </div>
                  <audio
                    src={activeFileUrl}
                    controls
                    preload="metadata"
                    class="mt-6 w-full"
                    onerror={handleMediaPreviewError}
                  ></audio>
                </div>
              </div>
            {:else if activeFileKind === "pdf"}
              <div class="flex h-full min-h-[30rem] flex-col">
                <div class="flex items-center gap-3 border-b border-(--color-border) bg-(--color-bg-alt) px-3 py-2 sm:px-4">
                  <FileText class="h-4 w-4 shrink-0 text-(--color-text-muted)" />
                  <p class="min-w-0 flex-1 truncate text-xs text-(--color-text-muted)">
                    Browser PDF preview · If the page stays blank, download the original file.
                  </p>
                  <button
                    onclick={downloadActiveNode}
                    class="shrink-0 border border-(--color-border) px-2.5 py-1.5 text-xs font-medium text-(--color-text) transition-colors hover:bg-(--color-bg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)"
                  >
                    Download
                  </button>
                </div>
                <iframe
                  src={activeFileUrl}
                  title={`Preview of ${activeFile.name}`}
                  sandbox=""
                  class="min-h-[26rem] w-full grow border-0 bg-white"
                ></iframe>
              </div>
            {:else if activeFileKind === "text"}
              <div class="flex min-h-full flex-col bg-(--color-bg)">
                <div class="sticky top-0 z-10 flex items-center gap-3 border-b border-(--color-border) bg-(--color-bg-alt) px-3 py-2 sm:px-4">
                  <FileText class="h-4 w-4 shrink-0 text-(--color-text-muted)" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-semibold text-(--color-text)">Text preview</p>
                    <p class="truncate text-[11px] text-(--color-text-light)">
                      {fileTextTruncated ? "Showing the first 1 MB" : formatBytes(activeFile.size)} · {activeFileMime}
                    </p>
                  </div>
                </div>
                {#if fileTextStatus === "loading"}
                  <div role="status" class="flex grow items-center justify-center gap-2 p-6 text-sm text-(--color-text-muted)">
                    <LoaderCircle class="h-4 w-4 animate-spin" />
                    Reading text…
                  </div>
                {:else if fileTextStatus === "error"}
                  <div role="alert" class="m-auto border border-(--color-error-border) bg-(--color-error-bg) px-4 py-3 text-sm text-(--color-error-text)">
                    This text file could not be decoded. Use Raw to inspect its bytes.
                  </div>
                {:else}
                  <pre class="text-file-viewer grow overflow-auto p-3 text-sm leading-6 text-(--color-text) sm:p-5">{fileText || "(empty file)"}</pre>
                {/if}
              </div>
            {:else}
              <div class="min-h-full p-5 sm:p-8">
                {@render fileDetails(activeFile, activeFileKind, "")}
              </div>
            {/if}
          </div>
        {/if}
        <div
          bind:this={gridEl}
          class="flex-1 grid min-h-0 overflow-hidden"
          class:hidden={!!activeFile}
          style:grid-template-columns={viewMode === "split"
            ? `${splitPct}% 0.375rem minmax(0, 1fr)`
            : "1fr"}
          style:grid-template-rows="1fr"
        >
          <!-- Editor (always mounted) -->
          <div
            class="flex flex-col min-h-0 min-w-0 overflow-hidden"
            class:hidden={viewMode === "preview"}
          >
            <div bind:this={editorContainer} class="flex-1 overflow-hidden min-h-0"></div>
          </div>

          <!-- Draggable splitter -->
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor and preview"
            tabindex="-1"
            class="group flex items-center justify-center cursor-col-resize touch-none"
            class:hidden={viewMode !== "split"}
            onpointerdown={startResize}
            ondblclick={() => (splitPct = 50)}
          >
            <div class="w-px h-full bg-(--color-border) group-hover:w-full group-hover:bg-[#dc2626] transition-colors"></div>
          </div>

          <!-- Preview (always mounted) -->
          <div
            class="flex flex-col min-h-0 min-w-0 overflow-hidden"
            class:hidden={viewMode === "editor"}
          >
            <div
              bind:this={previewContainer}
              class="markdown-body flex-1 bg-(--color-bg-alt) p-5 overflow-auto min-h-0"
            >
              {@html previewHtml}
            </div>
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-3 px-3 py-1 text-xs text-(--color-text-light) border-t border-(--color-border)">
          {#if activeFile}
            <span class="truncate" title={activeFileMime}>{activeFileTypeLabel} · {activeFileMime}</span>
            <div class="flex-1"></div>
            <span class="shrink-0 tabular-nums">{formatBytes(activeFile.size)}</span>
          {:else}
            <span>Ln {cursorLine}, Col {cursorColumn}</span>
            {#if selectionLength > 0}
              <span>
                {selectionLength} selected{selectedLines > 1 ? ` (${selectedLines} lines)` : ""}
              </span>
            {/if}
            <div class="flex-1"></div>
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
          {/if}
        </div>

        <!-- Empty state overlay -->
        {#if loaded && !activeNode}
          <div class="absolute inset-0 top-[47px] flex flex-col items-center justify-center gap-3 bg-(--color-bg) text-center p-6">
            <span class="text-4xl" aria-hidden="true">📓</span>
            <p class="text-sm text-(--color-text-muted)">
              {hasNotes ? "Select a note from the sidebar to start editing." : "Create your first note to get started."}
            </p>
            <button
              onclick={newNote}
              class="px-3 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
            >
              New Note
            </button>
          </div>
        {/if}
      </section>
    </div>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    multiple
    onchange={handleImport}
    class="hidden"
  />

  {#if contextMenu}
    <div
      role="menu"
      tabindex="-1"
      class="fixed z-50 min-w-44 py-1 bg-(--color-bg-alt) border border-(--color-border) shadow-lg text-sm"
      style="left: {Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 190)}px; top: {Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 240)}px;"
    >
      {#if !menuNode || menuNode.type === "folder"}
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-(--color-text) hover:bg-(--color-border) transition-colors"
          onclick={() => {
            closeContextMenu();
            newNote();
          }}
        >
          <span aria-hidden="true">📄</span> New note
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-(--color-text) hover:bg-(--color-border) transition-colors"
          onclick={() => {
            closeContextMenu();
            newFolder();
          }}
        >
          <span aria-hidden="true">📁</span> New folder
        </button>
        <div class="my-1 h-px bg-(--color-border)"></div>
      {/if}

      <button
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-(--color-text) hover:bg-(--color-border) transition-colors"
        onclick={() => {
          const target = menuImportTarget();
          closeContextMenu();
          triggerImport(target);
        }}
      >
        <span aria-hidden="true">⬆️</span>
        {menuNode && menuNode.type === "folder" ? "Import into folder…" : "Import notes or files…"}
      </button>

      {#if menuNode}
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-(--color-text) hover:bg-(--color-border) transition-colors"
          onclick={() => {
            const node = menuNode;
            closeContextMenu();
            if (node) downloadNode(node);
          }}
        >
          <span aria-hidden="true">⬇️</span>
          {menuNode.type === "folder" ? "Download as .zip" : menuNode.type === "note" ? "Download as .md" : "Download file"}
        </button>
        <div class="my-1 h-px bg-(--color-border)"></div>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-(--color-text) hover:bg-(--color-border) transition-colors"
          onclick={() => {
            const id = contextMenu?.nodeId;
            closeContextMenu();
            if (id) startRename(id);
          }}
        >
          <span aria-hidden="true">✏️</span> Rename
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-(--color-error-text) hover:bg-(--color-border) transition-colors"
          onclick={() => {
            const id = contextMenu?.nodeId;
            closeContextMenu();
            if (id) deleteNode(id);
          }}
        >
          <span aria-hidden="true">🗑️</span> Delete
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .raw-file-viewer,
  .text-file-viewer {
    margin: 0;
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    tab-size: 2;
    scrollbar-width: thin;
    scrollbar-color: var(--color-text-light) transparent;
  }

  .raw-file-viewer {
    min-width: max-content;
    font-variant-numeric: tabular-nums;
  }

  /* GitHub-like markdown body styling */
  :global(.markdown-body) {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.7;
    color: var(--color-text);
    word-wrap: break-word;
  }

  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3),
  :global(.markdown-body h4),
  :global(.markdown-body h5),
  :global(.markdown-body h6) {
    margin-top: 1.5em;
    margin-bottom: 1em;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-text);
  }

  :global(.markdown-body h1) {
    font-size: 1.8em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--color-border);
  }

  :global(.markdown-body h2) {
    font-size: 1.4em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid var(--color-border);
  }

  :global(.markdown-body h3) {
    font-size: 1.15em;
  }

  :global(.markdown-body h4) {
    font-size: 1em;
  }

  :global(.markdown-body p) {
    margin-top: 0;
    margin-bottom: 1em;
  }

  :global(.markdown-body a) {
    color: #2563eb;
    text-decoration: none;
  }

  :global(.markdown-body a:hover) {
    text-decoration: underline;
  }

  :global(.markdown-body strong) {
    font-weight: 600;
  }

  :global(.markdown-body em) {
    font-style: italic;
  }

  :global(.markdown-body del) {
    text-decoration: line-through;
    opacity: 0.7;
  }

  :global(.markdown-body blockquote) {
    margin: 0 0 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid var(--color-accent);
    background: var(--color-bg);
    color: var(--color-text-muted);
  }

  :global(.markdown-body blockquote p:last-child) {
    margin-bottom: 0;
  }

  /* GitHub-style: first/last block has no outer margin so the
     preview padding alone controls the top/bottom whitespace */
  :global(.markdown-body > *:first-child) {
    margin-top: 0;
  }

  :global(.markdown-body > *:last-child) {
    margin-bottom: 0;
  }

  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    margin-top: 0;
    margin-bottom: 1em;
    padding-left: 2em;
  }

  :global(.markdown-body ul) {
    list-style-type: square;
  }

  :global(.markdown-body ol) {
    list-style-type: decimal;
  }

  :global(.markdown-body li) {
    margin-bottom: 0.25em;
  }

  :global(.markdown-body li + li) {
    margin-top: 0.25em;
  }

  :global(.markdown-body input[type="checkbox"]) {
    margin-right: 0.5em;
    vertical-align: middle;
  }

  :global(.markdown-body li:has(> input[type="checkbox"])) {
    list-style: none;
    margin-left: -1.5em;
  }

  :global(.markdown-body code) {
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.875em;
    padding: 0.2em 0.4em;
    background: var(--color-bg);
    border-radius: 3px;
  }

  :global(.markdown-body pre) {
    margin-top: 0;
    margin-bottom: 1em;
    padding: 1em;
    overflow-x: auto;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    line-height: 1.5;
  }

  :global(.markdown-body pre code) {
    padding: 0;
    background: transparent;
    font-size: 0.85em;
    line-height: 1.6;
  }

  :global(.markdown-body .hljs) {
    background: transparent;
    color: inherit;
  }

  :global(.markdown-body table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1em;
  }

  :global(.markdown-body th),
  :global(.markdown-body td) {
    padding: 0.5em 1em;
    border: 1px solid var(--color-border);
    text-align: left;
  }

  :global(.markdown-body th) {
    font-weight: 600;
    background: var(--color-bg);
  }

  :global(.markdown-body tr:nth-child(even)) {
    background: var(--color-bg);
  }

  :global(.markdown-body hr) {
    height: 2px;
    margin: 1.5em 0;
    background-color: var(--color-border);
    border: 0;
  }

  :global(.markdown-body img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    display: block;
  }

  :global(.markdown-body .mermaid-diagram) {
    margin: 1em 0;
    text-align: center;
    overflow-x: auto;
  }

  :global(.markdown-body .mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
  }

  :global(.markdown-body .katex-block),
  :global(.markdown-body .math.block) {
    margin: 1em 0;
    text-align: center;
    overflow-x: auto;
    padding: 0.5em 0;
  }

  :global(.markdown-body .katex-error) {
    color: var(--color-error-text);
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.85em;
  }

  :global(.markdown-body .error) {
    color: var(--color-error-text);
  }

  :root.dark :global(.markdown-body a) {
    color: #60a5fa;
  }

  :root.dark :global(.markdown-body .hljs-keyword),
  :root.dark :global(.markdown-body .hljs-selector-tag),
  :root.dark :global(.markdown-body .hljs-built_in) {
    color: #c678dd;
  }

  :root.dark :global(.markdown-body .hljs-string),
  :root.dark :global(.markdown-body .hljs-attr) {
    color: #98c379;
  }

  :root.dark :global(.markdown-body .hljs-number),
  :root.dark :global(.markdown-body .hljs-literal) {
    color: #d19a66;
  }

  :root.dark :global(.markdown-body .hljs-comment) {
    color: #5c6370;
    font-style: italic;
  }

  :root.dark :global(.markdown-body .hljs-title),
  :root.dark :global(.markdown-body .hljs-function) {
    color: #61afef;
  }

  :root.dark :global(.markdown-body .hljs-type),
  :root.dark :global(.markdown-body .hljs-class) {
    color: #e5c07b;
  }

  :root:not(.dark) :global(.markdown-body .hljs-keyword),
  :root:not(.dark) :global(.markdown-body .hljs-selector-tag),
  :root:not(.dark) :global(.markdown-body .hljs-built_in) {
    color: #8959a8;
  }

  :root:not(.dark) :global(.markdown-body .hljs-string),
  :root:not(.dark) :global(.markdown-body .hljs-attr) {
    color: #718c00;
  }

  :root:not(.dark) :global(.markdown-body .hljs-number),
  :root:not(.dark) :global(.markdown-body .hljs-literal) {
    color: #f5871f;
  }

  :root:not(.dark) :global(.markdown-body .hljs-comment) {
    color: #8e908c;
    font-style: italic;
  }

  :root:not(.dark) :global(.markdown-body .hljs-title),
  :root:not(.dark) :global(.markdown-body .hljs-function) {
    color: #4271ae;
  }

  :root:not(.dark) :global(.markdown-body .hljs-type),
  :root:not(.dark) :global(.markdown-body .hljs-class) {
    color: #c18401;
  }
</style>
