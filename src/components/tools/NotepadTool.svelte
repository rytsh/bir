<script lang="ts">
  import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
  import { EditorView } from "@codemirror/view";
  import { markdown } from "@codemirror/lang-markdown";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createEditor,
    updateEditorContent,
    type DarkModeCleanup,
    type SelectionInfo,
  } from "../../lib/codemirror.js";
  import { buildZip } from "./pdf/shared/zip-store";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import { onMount } from "svelte";

  type NodeType = "folder" | "note";
  type ViewMode = "split" | "editor" | "preview";

  interface NodeMeta {
    id: string;
    type: NodeType;
    name: string;
    parentId: string | null;
    order: number;
    expanded?: boolean;
    createdAt: number;
    updatedAt: number;
  }

  const INDEX_KEY = "notepad-index";
  const ACTIVE_KEY = "notepad-active";
  const noteKey = (id: string) => `notepad-note-${id}`;

  const WELCOME = `# Welcome to Notepad

This is your personal **markdown notebook**. Everything you type is saved automatically in your browser (IndexedDB) — there is no save button, your notes are always saved.

## Getting started

- Use **+ Note** and **+ Folder** in the sidebar to organize your notes.
- Notes go inside the **selected folder** (or the root if none is selected).
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

  let darkModeCleanup: DarkModeCleanup | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let indexTimer: ReturnType<typeof setTimeout> | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let programmatic = false;
  let mermaidLoaded = false;
  let hljs: typeof import("highlight.js") | undefined;
  let comarkRender: ((markdown: string) => Promise<string>) | undefined;

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
  let activeNode = $derived(nodes.find((n) => n.id === activeId && n.type === "note"));
  let charCount = $derived(currentContent.length);
  let wordCount = $derived(currentContent.trim() ? currentContent.trim().split(/\s+/).length : 0);
  let hasNotes = $derived(nodes.some((n) => n.type === "note"));
  let menuNode = $derived(contextMenu ? (nodes.find((n) => n.id === contextMenu!.nodeId) ?? null) : null);

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
    await flushSave();
    const node = nodes.find((n) => n.id === id && n.type === "note");
    if (!node) return;
    selectedId = id;
    activeId = id;
    idbSet(ACTIVE_KEY, id).catch(() => {});
    const content = ((await idbGet(noteKey(id))) as string | undefined) ?? "";
    currentContent = content;
    programmatic = true;
    updateEditorContent(editor, content);
    programmatic = false;
    saveStatus = "saved";
    scheduleRender(content);
  }

  function onRowClick(node: NodeMeta): void {
    selectedId = node.id;
    if (node.type === "folder") {
      node.expanded = !node.expanded;
      schedulePersistIndex();
    } else {
      openNote(node.id);
    }
  }

  function startRename(id: string): void {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    editingId = id;
    editingName = n.name;
  }

  function commitRename(): void {
    if (!editingId) return;
    const n = nodes.find((x) => x.id === editingId);
    if (n) {
      const name = (editingName.trim() || (n.type === "folder" ? "New Folder" : "Untitled"));
      n.name = uniqueName(n.parentId, n.type, name, n.id);
      n.updatedAt = Date.now();
      nodes = [...nodes];
      persistIndex();
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

  function deleteNode(id: string): void {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    const label = n.type === "folder" ? `folder "${n.name}" and all its contents` : `note "${n.name}"`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    const subtree = collectSubtree(id);
    const ids = new Set(subtree.map((x) => x.id));
    for (const x of subtree) {
      if (x.type === "note") idbDel(noteKey(x.id)).catch(() => {});
    }
    nodes = nodes.filter((x) => !ids.has(x.id));
    persistIndex();

    if (selectedId && ids.has(selectedId)) selectedId = null;
    if (activeId && ids.has(activeId)) {
      const next = nodes.find((x) => x.type === "note");
      if (next) openNote(next.id);
      else clearEditor();
    }
  }

  function clearEditor(): void {
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

  function onTitleBlur(): void {
    const node = activeNode;
    if (!node) return;
    const name = node.name.trim() || "Untitled";
    node.name = uniqueName(node.parentId, "note", name, node.id);
    nodes = [...nodes];
    persistIndex();
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
    if (!activeNode) return;
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

  function downloadNote(): void {
    if (activeNode) downloadNoteById(activeNode.id);
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

  // Relative path of a note within the given root folder, e.g. "Sub/Note.md"
  function relativePath(node: NodeMeta, rootId: string): string {
    const parts: string[] = [`${sanitizeSegment(node.name)}.md`];
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
      if (n.type !== "note") continue;
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
      entries.push({ name: path, bytes: encoder.encode(await noteContent(n.id)) });
    }
    if (entries.length === 0) {
      alert("This folder has no notes to export.");
      return;
    }
    const zip = buildZip(entries);
    triggerBlobDownload(`${sanitizeSegment(folder.name) || "folder"}.zip`, new Blob([zip], { type: "application/zip" }));
  }

  function downloadNode(node: NodeMeta): void {
    if (node.type === "folder") downloadFolderZip(node.id);
    else downloadNoteById(node.id);
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
    for (const file of Array.from(files)) {
      const text = await file.text();
      const name = file.name.replace(/\.(md|markdown|txt)$/i, "");
      const node = addNote(parentId, name || "Untitled", text);
      lastId = node.id;
    }
    persistIndex();
    if (lastId) openNote(lastId);
    input.value = "";
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
    if (Array.isArray(idx) && idx.length > 0) {
      nodes = idx;
    } else {
      const welcome = addNote(null, "Welcome", WELCOME);
      persistIndex();
      activeId = welcome.id;
    }

    const storedActive = (await idbGet(ACTIVE_KEY)) as string | null | undefined;
    let openId: string | null = null;
    if (storedActive && nodes.some((n) => n.id === storedActive && n.type === "note")) {
      openId = storedActive;
    } else if (activeId && nodes.some((n) => n.id === activeId && n.type === "note")) {
      openId = activeId;
    } else {
      const first = nodes.find((n) => n.type === "note");
      openId = first ? first.id : null;
    }

    loaded = true;
    if (openId) {
      await openNote(openId);
    } else {
      scheduleRender("");
    }
  }

  onMount(() => {
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

    loadAll();

    return () => {
      flushSave();
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
    {:else}
      <span class="w-3 shrink-0"></span>
      <span class="shrink-0" aria-hidden="true">📄</span>
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
          title={node.type === "folder" ? "Download as .zip" : "Download as .md"}
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

<div class="relative h-full min-h-0 overflow-hidden">
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
            title="Import .md files into the selected folder"
            aria-label="Import markdown files"
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
              onblur={onTitleBlur}
              class="flex-1 min-w-0 px-2 py-1 text-sm font-medium bg-transparent text-(--color-text) border border-transparent hover:border-(--color-border) focus:border-(--color-accent) focus:bg-(--color-bg) focus:outline-none transition-colors"
              placeholder="Untitled"
            />
            <span
              class="shrink-0 text-xs {saveStatus === 'saving' ? 'text-(--color-text-light)' : 'text-(--color-text-muted)'}"
              title="Notes are saved automatically"
            >
              {saveStatus === "saving" ? "Saving…" : "Saved"}
            </span>
          {:else}
            <span class="flex-1 text-sm text-(--color-text-light)">No note open</span>
          {/if}

          <!-- View toggle -->
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

          <button
            onclick={beautify}
            disabled={!activeNode}
            class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-40 shrink-0"
            title="Beautify (align tables, trim trailing spaces)"
            aria-label="Beautify markdown"
          >
            <Sparkles class="w-4 h-4" />
          </button>

          <button
            onclick={downloadNote}
            disabled={!activeNode}
            class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-40 shrink-0"
            title="Download as .md"
            aria-label="Download note as markdown"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" />
            </svg>
          </button>
        </div>

        <div
          bind:this={gridEl}
          class="flex-1 grid min-h-0 overflow-hidden"
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
          <span>Ln {cursorLine}, Col {cursorColumn}</span>
          {#if selectionLength > 0}
            <span>
              {selectionLength} selected{selectedLines > 1 ? ` (${selectedLines} lines)` : ""}
            </span>
          {/if}
          <div class="flex-1"></div>
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
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
    accept=".md,.markdown,.txt"
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
        {menuNode && menuNode.type === "folder" ? "Import into folder…" : "Import .md…"}
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
          {menuNode.type === "folder" ? "Download as .zip" : "Download as .md"}
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
