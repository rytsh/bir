import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  DocxEditor,
  createEmptyDocument,
  type DocxEditorRef,
  type EditorMode,
} from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const NAVBAR_ACTIONS_ID = "navbar-tool-actions";

type EditorDocument = ReturnType<typeof createEmptyDocument>;
type StatusKind = "idle" | "loading" | "saving" | "success" | "error";

interface StatusState {
  kind: StatusKind;
  message: string;
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], { type: DOCX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.toLowerCase().endsWith(".docx") ? fileName : `${fileName}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isDocxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".docx") || file.type === DOCX_MIME;
}

function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export default function DocxEditorTool() {
  const editorRef = useRef<DocxEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentDocument, setCurrentDocument] = useState<EditorDocument | null>(() => createEmptyDocument());
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | null>(null);
  const [documentName, setDocumentName] = useState("Untitled.docx");
  const [mode, setMode] = useState<EditorMode>("editing");
  const [status, setStatus] = useState<StatusState>({ kind: "idle", message: "Ready" });
  const [isDirty, setIsDirty] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [navbarActionsTarget, setNavbarActionsTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setNavbarActionsTarget(document.getElementById(NAVBAR_ACTIONS_ID));
  }, []);

  const loadDocumentFile = useCallback(async (file: File): Promise<void> => {
    if (!isDocxFile(file)) {
      setStatus({ kind: "error", message: "Please choose a .docx file." });
      return;
    }

    try {
      setStatus({ kind: "loading", message: "Loading document..." });
      const buffer = await file.arrayBuffer();
      setCurrentDocument(null);
      setDocumentBuffer(buffer);
      setDocumentName(file.name);
      setIsDirty(false);
      setEditorKey((value) => value + 1);
      setStatus({ kind: "success", message: "Document loaded." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to load document.",
      });
    }
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.currentTarget.files?.[0];
      if (file) {
        void loadDocumentFile(file);
      }
      event.currentTarget.value = "";
    },
    [loadDocumentFile],
  );

  const handleNewDocument = useCallback((): void => {
    setCurrentDocument(createEmptyDocument());
    setDocumentBuffer(null);
    setDocumentName("Untitled.docx");
    setIsDirty(false);
    setEditorKey((value) => value + 1);
    setStatus({ kind: "success", message: "New document created." });
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!editorRef.current) {
      setStatus({ kind: "error", message: "Editor is not ready yet." });
      return;
    }

    try {
      setStatus({ kind: "saving", message: "Preparing DOCX..." });
      const buffer = await editorRef.current.save();
      if (!buffer) {
        setStatus({ kind: "error", message: "Nothing to download yet." });
        return;
      }

      downloadBuffer(buffer, documentName || "document.docx");
      setIsDirty(false);
      setStatus({ kind: "success", message: "DOCX downloaded." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to save document.",
      });
    }
  }, [documentName]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void loadDocumentFile(file);
      }
    },
    [loadDocumentFile],
  );

  const statusClass = status.kind === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : status.kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

  const navbarStatusClass = status.kind === "error"
    ? "border-red-400/40 bg-red-500/20 text-red-100"
    : status.kind === "success"
      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100"
      : "border-white/15 bg-white/10 text-white/70";

  const navbarActions = (
    <div className="flex min-w-0 items-center gap-1 border border-white/10 bg-white/[0.04] px-1 py-0.5 text-xs text-white/80" title={status.message}>
      <span className="hidden max-w-48 truncate border border-white/10 bg-white/10 px-2.5 py-1 font-medium text-white/90 xl:inline-block">
        {documentName}{isDirty ? " *" : ""}
      </span>
      <span className={`hidden max-w-40 truncate border px-2.5 py-1 2xl:inline-block ${navbarStatusClass}`}>
        {status.message || (isDirty ? "Unsaved changes" : "Ready")}
      </span>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="h-7 whitespace-nowrap bg-white px-3 text-xs font-medium text-slate-950 transition-colors hover:bg-white/90"
        onClick={() => fileInputRef.current?.click()}
      >
        Open
      </button>
      <button
        type="button"
        className="h-7 whitespace-nowrap border border-white/20 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/15"
        onClick={handleNewDocument}
      >
        New
      </button>
      <button
        type="button"
        className="h-7 whitespace-nowrap border border-white/20 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
        disabled={status.kind === "saving" || status.kind === "loading"}
        onClick={() => void handleSave()}
      >
        Download
      </button>
      <select
        aria-label="DOCX editor mode"
        value={mode}
        className="h-7 w-28 border border-white/20 bg-white px-3 text-xs text-slate-900 focus:outline-none"
        onChange={(event) => setMode(event.currentTarget.value as EditorMode)}
      >
        <option value="editing">Editing</option>
        <option value="suggesting">Suggesting</option>
        <option value="viewing">Viewing</option>
      </select>
    </div>
  );

  return (
    <>
      {navbarActionsTarget ? createPortal(navbarActions, navbarActionsTarget) : null}
      <div
        className="relative flex min-h-[calc(100dvh-2.25rem)] flex-col overflow-hidden bg-slate-100 text-slate-900 lg:h-full lg:min-h-0"
        onDragOver={(event) => {
          if (!hasDraggedFiles(event)) {
            return;
          }

          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!hasDraggedFiles(event)) {
            return;
          }

          if (event.currentTarget === event.target) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        {!navbarActionsTarget && (
          <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 truncate font-medium text-slate-700">
              {documentName}{isDirty ? " *" : ""}
            </div>
            <div className={`w-fit rounded-full border px-2.5 py-1 ${statusClass}`}>
              {status.message || (isDirty ? "Unsaved changes" : "Ready")}
            </div>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-hidden">
          <DocxEditor
            key={editorKey}
            ref={editorRef}
            document={documentBuffer ? undefined : currentDocument}
            documentBuffer={documentBuffer}
            documentName={documentName}
            documentNameEditable={true}
            mode={mode}
            onChange={() => setIsDirty(true)}
            onDocumentNameChange={setDocumentName}
            onError={(error) => {
              setStatus({ kind: "error", message: error.message });
            }}
            author="1.tools"
            showToolbar={true}
            showRuler={true}
            showZoomControl={true}
            showOutline={true}
            initialZoom={1}
            style={{ height: "100%", minHeight: 0 }}
          />
        </main>

        {isDragging && (
          <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-xl border-2 border-dashed border-slate-400 bg-white/80 text-sm font-medium text-slate-700 shadow-lg backdrop-blur-sm">
            Drop a DOCX file to open it
          </div>
        )}
      </div>
    </>
  );
}
