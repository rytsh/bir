<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, stripPdfExtension } from "./shared/pdf-utils";

  interface PageItem {
    id: number;
    originalIndex: number;
    rotation: number; // 0/90/180/270
    thumbnail: string; // data URL
  }

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let signatures = $state<DetectedSignature[]>([]);
  let pages = $state<PageItem[]>([]);
  let loading = $state(false);
  let processing = $state(false);
  let error = $state("");
  let info = $state("");
  let dragId = $state<number | null>(null);
  let nextId = 0;

  async function handleFiles(files: File[]) {
    error = "";
    info = "";
    const f = files[0];
    if (!f) return;
    loading = true;
    try {
      const buf = await fileToUint8Array(f);
      file = f;
      bytes = buf;
      signatures = await detectSignatures(buf);

      const pdfjs = await getPdfjs();
      const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
      const items: PageItem[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        items.push({
          id: ++nextId,
          originalIndex: i - 1,
          rotation: 0,
          thumbnail: canvas.toDataURL("image/jpeg", 0.7),
        });
      }
      pages = items;
    } catch (e: any) {
      error = `Failed to load PDF: ${e.message ?? e}`;
    } finally {
      loading = false;
    }
  }

  function reset() {
    file = null;
    bytes = null;
    signatures = [];
    pages = [];
    error = "";
    info = "";
  }

  function rotate(id: number) {
    pages = pages.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p));
  }

  function remove(id: number) {
    pages = pages.filter((p) => p.id !== id);
  }

  function move(id: number, dir: -1 | 1) {
    const idx = pages.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= pages.length) return;
    const next = [...pages];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    pages = next;
  }

  function onDragStart(id: number, e: DragEvent) {
    dragId = id;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }
  function onDrop(targetId: number, e: DragEvent) {
    e.preventDefault();
    if (dragId === null || dragId === targetId) {
      dragId = null;
      return;
    }
    const fromIdx = pages.findIndex((p) => p.id === dragId);
    const toIdx = pages.findIndex((p) => p.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...pages];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    pages = next;
    dragId = null;
  }

  async function apply() {
    if (!bytes || !file || pages.length === 0) {
      error = "Add at least one page.";
      return;
    }
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const indices = pages.map((p) => p.originalIndex);
      const copied = await out.copyPages(src, indices);
      copied.forEach((page, i) => {
        const item = pages[i];
        if (item.rotation) {
          const current = page.getRotation().angle ?? 0;
          page.setRotation(degrees((current + item.rotation) % 360));
        }
        out.addPage(page);
      });
      const result = await out.save();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(result, `${base}-organized.pdf`);
      info = `Saved ${pages.length} page(s).`;
    } catch (e: any) {
      error = `Organize failed: ${e.message ?? e}`;
    } finally {
      processing = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if signatures.length > 0}
    <SignatureBanner {signatures} showDestructiveWarning />
  {/if}

  {#if !file}
    <PdfDropzone label="Drop a PDF here to reorganize pages" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pages.length} page{pages.length !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    {#if loading}
      <div class="p-4 text-sm text-(--color-text-muted)">Rendering thumbnails...</div>
    {:else}
      <p class="text-xs text-(--color-text-muted)">
        Drag pages to reorder, click ↻ to rotate, click ✕ to remove. Then click Save.
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {#each pages as page, i (page.id)}
          <div
            class="relative border border-(--color-border) bg-(--color-bg-alt) p-2 flex flex-col items-center cursor-move {dragId === page.id ? 'opacity-50' : ''}"
            draggable="true"
            ondragstart={(e) => onDragStart(page.id, e)}
            ondragover={onDragOver}
            ondrop={(e) => onDrop(page.id, e)}
            role="listitem"
          >
            <div class="w-full aspect-[3/4] bg-white flex items-center justify-center overflow-hidden mb-2">
              <img
                src={page.thumbnail}
                alt="Page {page.originalIndex + 1}"
                class="max-w-full max-h-full object-contain"
                style="transform: rotate({page.rotation}deg);"
                draggable="false"
              />
            </div>
            <div class="text-xs text-(--color-text-muted)">
              {i + 1} <span class="text-(--color-text-light)">(orig p.{page.originalIndex + 1})</span>
            </div>
            <div class="flex gap-1 mt-1">
              <button
                class="px-1.5 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-30"
                disabled={i === 0}
                onclick={() => move(page.id, -1)}
                title="Move left"
              >
                ←
              </button>
              <button
                class="px-1.5 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)"
                onclick={() => rotate(page.id)}
                title="Rotate 90°"
              >
                ↻
              </button>
              <button
                class="px-1.5 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-30"
                disabled={i === pages.length - 1}
                onclick={() => move(page.id, 1)}
                title="Move right"
              >
                →
              </button>
              <button
                class="px-1.5 py-0.5 text-xs border border-(--color-border) text-red-500 hover:bg-red-500/10"
                onclick={() => remove(page.id)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>
        {/each}
      </div>

      {#if error}
        <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
      {/if}
      {#if info}
        <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
      {/if}

      <button
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
        onclick={apply}
        disabled={processing || pages.length === 0}
      >
        {processing ? "Saving..." : "Save organized PDF"}
      </button>
    {/if}
  {/if}
</div>
