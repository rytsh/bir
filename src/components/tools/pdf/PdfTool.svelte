<script lang="ts">
  import { onMount } from "svelte";
  import PdfMergeTab from "./PdfMergeTab.svelte";
  import PdfSplitTab from "./PdfSplitTab.svelte";
  import PdfOrganizeTab from "./PdfOrganizeTab.svelte";
  import PdfRotateTab from "./PdfRotateTab.svelte";
  import PdfJpgToPdfTab from "./PdfJpgToPdfTab.svelte";
  import PdfPdfToJpgTab from "./PdfPdfToJpgTab.svelte";
  import PdfWatermarkTab from "./PdfWatermarkTab.svelte";
  import PdfPageNumbersTab from "./PdfPageNumbersTab.svelte";
  import PdfCompressTab from "./PdfCompressTab.svelte";
  import PdfCropTab from "./PdfCropTab.svelte";
  import PdfRedactTab from "./PdfRedactTab.svelte";
  import PdfExtractImagesTab from "./PdfExtractImagesTab.svelte";
  import PdfSignTab from "./PdfSignTab.svelte";
  import PdfCompareTab from "./PdfCompareTab.svelte";
  import PdfHtmlToPdfTab from "./PdfHtmlToPdfTab.svelte";
  import PdfOcrTab from "./PdfOcrTab.svelte";

  type TabId =
    | "merge"
    | "split"
    | "organize"
    | "rotate"
    | "compress"
    | "crop"
    | "jpg-to-pdf"
    | "pdf-to-jpg"
    | "html-to-pdf"
    | "extract-images"
    | "watermark"
    | "page-numbers"
    | "redact"
    | "sign"
    | "ocr"
    | "compare";

  interface TabDef {
    id: TabId;
    name: string;
    description: string;
    group: "Organize" | "Convert" | "Edit" | "Advanced";
  }

  const TABS: TabDef[] = [
    { id: "merge", name: "Merge", description: "Combine multiple PDFs into one document.", group: "Organize" },
    { id: "split", name: "Split", description: "Split a PDF by ranges or extract pages.", group: "Organize" },
    { id: "organize", name: "Organize", description: "Reorder, delete, and rotate pages with thumbnails.", group: "Organize" },
    { id: "rotate", name: "Rotate", description: "Rotate all pages or specific ranges.", group: "Organize" },
    { id: "compress", name: "Compress", description: "Reduce PDF file size by re-encoding embedded images.", group: "Organize" },
    { id: "crop", name: "Crop", description: "Crop pages to a specific region.", group: "Organize" },

    { id: "jpg-to-pdf", name: "JPG to PDF", description: "Combine images into a single PDF.", group: "Convert" },
    { id: "pdf-to-jpg", name: "PDF to JPG", description: "Render PDF pages as JPG/PNG images.", group: "Convert" },
    { id: "html-to-pdf", name: "HTML to PDF", description: "Convert an HTML page or snippet to PDF.", group: "Convert" },
    { id: "extract-images", name: "Extract Images", description: "Pull all embedded images out of a PDF.", group: "Convert" },

    { id: "watermark", name: "Watermark", description: "Add a text or image watermark to pages.", group: "Edit" },
    { id: "page-numbers", name: "Page Numbers", description: "Stamp page numbers on every page.", group: "Edit" },
    { id: "redact", name: "Redact", description: "Black out sensitive regions on pages.", group: "Edit" },
    { id: "sign", name: "Sign", description: "Draw, type, or upload a signature and embed it.", group: "Edit" },

    { id: "ocr", name: "OCR", description: "Recognize text in scanned PDFs and add a searchable text layer.", group: "Advanced" },
    { id: "compare", name: "Compare", description: "Compare two PDFs visually and by text.", group: "Advanced" },
  ];

  const GROUP_ORDER: Array<TabDef["group"]> = ["Organize", "Convert", "Edit", "Advanced"];
  const GROUP_ICONS: Record<TabDef["group"], string> = {
    Organize: "🗂️",
    Convert: "🔄",
    Edit: "✏️",
    Advanced: "⚡",
  };

  function isValidTab(value: string): value is TabId {
    return TABS.some((t) => t.id === value);
  }

  function readInitialTab(): TabId {
    if (typeof window === "undefined") return "merge";
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("tab");
    if (fromUrl && isValidTab(fromUrl)) return fromUrl;
    const fromStorage = localStorage.getItem("pdf-tool-active-tab");
    if (fromStorage && isValidTab(fromStorage)) return fromStorage;
    return "merge";
  }

  let activeTab = $state<TabId>("merge");

  onMount(() => {
    activeTab = readInitialTab();

    const onPop = () => {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("tab");
      if (t && isValidTab(t)) activeTab = t;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  function setActiveTab(id: TabId) {
    activeTab = id;
    if (typeof window !== "undefined") {
      localStorage.setItem("pdf-tool-active-tab", id);
      const url = new URL(window.location.href);
      if (url.searchParams.get("tab") !== id) {
        url.searchParams.set("tab", id);
        history.replaceState({}, "", url.toString());
      }
    }
  }

  let activeTabDef = $derived(TABS.find((t) => t.id === activeTab) ?? TABS[0]);
</script>

<div class="h-full flex flex-col">
  <header class="mb-3">
    <p class="text-sm text-(--color-text-muted)">
      A complete PDF toolkit — merge, split, compress, convert, watermark, sign, OCR, and more. All
      processing runs in your browser; your files never leave your device.
    </p>
  </header>

  <!-- Grouped tab nav -->
  <nav class="flex-none border-b border-(--color-border) mb-4">
    <div class="flex flex-col gap-1 pb-1">
      {#each GROUP_ORDER as group}
        <div class="flex items-center gap-1 flex-wrap">
          <span class="text-[11px] uppercase tracking-wider text-(--color-text-light) w-20 shrink-0 px-2">
            <span class="mr-1">{GROUP_ICONS[group]}</span>{group}
          </span>
          <div class="flex flex-wrap gap-0.5">
            {#each TABS.filter((t) => t.group === group) as tab}
              <button
                onclick={() => setActiveTab(tab.id)}
                class="px-3 py-1.5 text-sm transition-colors border {activeTab === tab.id
                  ? 'border-(--color-accent) text-(--color-accent) bg-(--color-accent)/10'
                  : 'border-transparent text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt)'}"
                title={tab.description}
              >
                {tab.name}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </nav>

  <!-- Active tab description -->
  <div class="mb-3 px-3 py-2 bg-(--color-bg-alt) border-l-2 border-(--color-accent) text-sm text-(--color-text)">
    <span class="font-medium">{activeTabDef.name}:</span>
    <span class="text-(--color-text-muted)">{activeTabDef.description}</span>
  </div>

  <!-- Tab content -->
  <div class="flex-1 min-h-0">
    {#if activeTab === "merge"}
      <PdfMergeTab />
    {:else if activeTab === "split"}
      <PdfSplitTab />
    {:else if activeTab === "organize"}
      <PdfOrganizeTab />
    {:else if activeTab === "rotate"}
      <PdfRotateTab />
    {:else if activeTab === "compress"}
      <PdfCompressTab />
    {:else if activeTab === "crop"}
      <PdfCropTab />
    {:else if activeTab === "jpg-to-pdf"}
      <PdfJpgToPdfTab />
    {:else if activeTab === "pdf-to-jpg"}
      <PdfPdfToJpgTab />
    {:else if activeTab === "html-to-pdf"}
      <PdfHtmlToPdfTab />
    {:else if activeTab === "extract-images"}
      <PdfExtractImagesTab />
    {:else if activeTab === "watermark"}
      <PdfWatermarkTab />
    {:else if activeTab === "page-numbers"}
      <PdfPageNumbersTab />
    {:else if activeTab === "redact"}
      <PdfRedactTab />
    {:else if activeTab === "sign"}
      <PdfSignTab />
    {:else if activeTab === "ocr"}
      <PdfOcrTab />
    {:else if activeTab === "compare"}
      <PdfCompareTab />
    {/if}
  </div>
</div>
