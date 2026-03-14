<script lang="ts">
  interface ClipboardEntry {
    id: number;
    timestamp: string;
    formats: ClipboardFormat[];
  }

  interface ClipboardFormat {
    type: string;
    text?: string;
    html?: string;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    size: number;
  }

  let entries = $state<ClipboardEntry[]>([]);
  let error = $state("");
  let reading = $state(false);
  let entryCounter = $state(0);
  let selectedEntryId = $state<number | null>(null);
  let selectedFormatType = $state("");
  let copiedNotice = $state("");

  const selectedEntry = $derived(entries.find((e) => e.id === selectedEntryId) || null);
  const selectedFormat = $derived(selectedEntry?.formats.find((f) => f.type === selectedFormatType) || null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  async function readClipboard() {
    error = "";
    reading = true;
    try {
      const items = await navigator.clipboard.read();
      const formats: ClipboardFormat[] = [];

      for (const item of items) {
        for (const type of item.types) {
          const blob = await item.getType(type);
          const format: ClipboardFormat = { type, size: blob.size };

          if (type === "text/plain") {
            format.text = await blob.text();
          } else if (type === "text/html") {
            format.html = await blob.text();
          } else if (type.startsWith("image/")) {
            const url = URL.createObjectURL(blob);
            format.imageUrl = url;
            // Get dimensions
            const img = new Image();
            img.src = url;
            await new Promise<void>((resolve) => {
              img.onload = () => {
                format.imageWidth = img.naturalWidth;
                format.imageHeight = img.naturalHeight;
                resolve();
              };
              img.onerror = () => resolve();
            });
          }

          formats.push(format);
        }
      }

      if (formats.length === 0) {
        // Fallback to readText
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            formats.push({ type: "text/plain", text, size: new Blob([text]).size });
          }
        } catch {
          // ignore
        }
      }

      if (formats.length === 0) {
        error = "Clipboard is empty or contains unsupported content.";
        reading = false;
        return;
      }

      entryCounter++;
      const entry: ClipboardEntry = {
        id: entryCounter,
        timestamp: new Date().toLocaleTimeString(),
        formats,
      };

      entries = [entry, ...entries].slice(0, 20);
      selectedEntryId = entry.id;
      selectedFormatType = formats[0].type;
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        error = "Clipboard access denied. Please allow clipboard permission in your browser and try again.";
      } else {
        error = err instanceof Error ? err.message : "Failed to read clipboard.";
      }
    }
    reading = false;
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedNotice = label;
      setTimeout(() => { copiedNotice = ""; }, 1500);
    } catch {
      // ignore
    }
  }

  function clearHistory() {
    // Revoke object URLs
    for (const entry of entries) {
      for (const format of entry.formats) {
        if (format.imageUrl) URL.revokeObjectURL(format.imageUrl);
      }
    }
    entries = [];
    selectedEntryId = null;
    selectedFormatType = "";
  }

  function countLines(text: string): number {
    return text.split("\n").length;
  }

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  // Cleanup on unmount
  $effect(() => {
    return () => {
      for (const entry of entries) {
        for (const format of entry.formats) {
          if (format.imageUrl) URL.revokeObjectURL(format.imageUrl);
        }
      }
    };
  });
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Inspect your clipboard contents. View text, HTML, and image data with format details, character counts, and byte sizes.
    </p>
  </header>

  {#if error}
    <div class="flex-none p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Controls -->
  <div class="flex-none flex items-center gap-3">
    <button
      onclick={readClipboard}
      disabled={reading}
      class="px-5 py-2 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
    >
      {reading ? "Reading..." : "Read Clipboard"}
    </button>
    {#if entries.length > 0}
      <button
        onclick={clearHistory}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Clear History
      </button>
    {/if}
    <span class="text-xs text-(--color-text-light) ml-auto">Tip: Copy something, then click Read Clipboard</span>
  </div>

  {#if entries.length > 0}
    <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-auto">
      <!-- History list -->
      <div class="lg:w-56 flex-none flex flex-col gap-0 border border-(--color-border) bg-(--color-bg-alt)">
        {#each entries as entry}
          <button
            onclick={() => { selectedEntryId = entry.id; selectedFormatType = entry.formats[0].type; }}
            class="flex items-center justify-between px-3 py-2 text-left border-b border-(--color-border) last:border-b-0 transition-colors
              {selectedEntryId === entry.id ? 'bg-(--color-accent) text-(--color-btn-text)' : 'hover:bg-(--color-bg)'}"
          >
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-xs font-mono truncate">{entry.formats.map((f) => f.type.split("/")[1]).join(", ")}</span>
              <span class="text-xs opacity-70">{entry.timestamp}</span>
            </div>
            <span class="text-xs opacity-60 shrink-0 ml-2">{entry.formats.length}</span>
          </button>
        {/each}
      </div>

      <!-- Content viewer -->
      {#if selectedEntry}
        <div class="flex-1 flex flex-col gap-3 min-w-0">
          <!-- Format tabs -->
          {#if selectedEntry.formats.length > 1}
            <div class="flex-none flex gap-0 border-b border-(--color-border)">
              {#each selectedEntry.formats as format}
                <button
                  onclick={() => { selectedFormatType = format.type; }}
                  class="px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px {selectedFormatType === format.type
                    ? 'border-(--color-accent) text-(--color-text)'
                    : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                  {format.type}
                </button>
              {/each}
            </div>
          {/if}

          {#if selectedFormat}
            <!-- Format info bar -->
            <div class="flex-none flex items-center gap-4 px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-xs">
              <span class="text-(--color-text-muted)">Type: <span class="font-mono text-(--color-text)">{selectedFormat.type}</span></span>
              <span class="text-(--color-text-muted)">Size: <span class="font-mono text-(--color-text)">{formatBytes(selectedFormat.size)}</span></span>
              {#if selectedFormat.text}
                <span class="text-(--color-text-muted)">Chars: <span class="font-mono text-(--color-text)">{selectedFormat.text.length}</span></span>
                <span class="text-(--color-text-muted)">Words: <span class="font-mono text-(--color-text)">{countWords(selectedFormat.text)}</span></span>
                <span class="text-(--color-text-muted)">Lines: <span class="font-mono text-(--color-text)">{countLines(selectedFormat.text)}</span></span>
              {/if}
              {#if selectedFormat.imageWidth}
                <span class="text-(--color-text-muted)">Dimensions: <span class="font-mono text-(--color-text)">{selectedFormat.imageWidth} x {selectedFormat.imageHeight}</span></span>
              {/if}
            </div>

            <!-- Content display -->
            <div class="flex-1 min-h-0 overflow-auto">
              {#if selectedFormat.type === "text/plain" && selectedFormat.text}
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Plain Text</span>
                    <button
                      onclick={() => copyText(selectedFormat?.text || "", "text")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      {copiedNotice === "text" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre class="p-3 bg-(--color-bg) border border-(--color-border) font-mono text-sm text-(--color-text) whitespace-pre-wrap break-all overflow-auto max-h-96">{selectedFormat.text}</pre>
                </div>

              {:else if selectedFormat.type === "text/html" && selectedFormat.html}
                <div class="flex flex-col gap-3">
                  <!-- Rendered preview -->
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Rendered Preview</span>
                    </div>
                    <div class="p-3 bg-white border border-(--color-border) text-sm text-black overflow-auto max-h-48">
                      {@html selectedFormat.html}
                    </div>
                  </div>
                  <!-- Raw HTML source -->
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">HTML Source</span>
                      <button
                        onclick={() => copyText(selectedFormat?.html || "", "html")}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                      >
                        {copiedNotice === "html" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre class="p-3 bg-(--color-bg) border border-(--color-border) font-mono text-xs text-(--color-text) whitespace-pre-wrap break-all overflow-auto max-h-64">{selectedFormat.html}</pre>
                  </div>
                </div>

              {:else if selectedFormat.imageUrl}
                <div class="flex flex-col gap-2">
                  <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Image Preview</span>
                  <div class="p-3 bg-(--color-bg) border border-(--color-border) flex items-center justify-center" style="background-image: repeating-conic-gradient(#d0d0d0 0% 25%, #f0f0f0 0% 50%); background-size: 16px 16px;">
                    <img src={selectedFormat.imageUrl} alt="Clipboard image" class="max-w-full max-h-80 object-contain" />
                  </div>
                </div>

              {:else}
                <div class="p-3 bg-(--color-bg) border border-(--color-border) text-sm text-(--color-text-muted)">
                  Binary content ({selectedFormat.type}) - {formatBytes(selectedFormat.size)}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center text-(--color-text-muted)">
        <p class="text-sm">No clipboard data read yet.</p>
        <p class="text-xs mt-1">Copy something to your clipboard, then click "Read Clipboard" above.</p>
      </div>
    </div>
  {/if}
</div>
