<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { fileToUint8Array, formatBytes } from "./shared/pdf-utils";

  type Mode = "visual" | "text";

  interface PdfState {
    file: File;
    bytes: Uint8Array;
    pageCount: number;
  }

  interface PageDiff {
    pageIndex: number;
    leftUrl: string;
    rightUrl: string;
    diffUrl: string;
    diffPercent: number;
    onlyInLeft: boolean;
    onlyInRight: boolean;
  }

  interface TextDiff {
    pageIndex: number;
    leftText: string;
    rightText: string;
    leftLines: string[];
    rightLines: string[];
    same: boolean;
  }

  let leftState = $state<PdfState | null>(null);
  let rightState = $state<PdfState | null>(null);
  let mode = $state<Mode>("visual");
  let processing = $state(false);
  let progress = $state("");
  let error = $state("");
  let pageDiffs = $state<PageDiff[]>([]);
  let textDiffs = $state<TextDiff[]>([]);
  let summary = $state("");

  async function loadInto(side: "left" | "right", files: File[]) {
    const f = files[0];
    if (!f) return;
    try {
      const buf = await fileToUint8Array(f);
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const state = { file: f, bytes: buf, pageCount: doc.getPageCount() };
      if (side === "left") leftState = state;
      else rightState = state;
      pageDiffs = [];
      textDiffs = [];
      summary = "";
      error = "";
    } catch (e: any) {
      error = `Failed to load: ${e.message ?? e}`;
    }
  }

  async function renderPage(pdfDoc: any, pageNum: number, scale = 1.5): Promise<{ canvas: HTMLCanvasElement; data: ImageData }> {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { canvas, data };
  }

  function computeImageDiff(a: ImageData, b: ImageData): { diff: ImageData; pct: number } {
    const w = Math.max(a.width, b.width);
    const h = Math.max(a.height, b.height);
    const out = new Uint8ClampedArray(w * h * 4);
    let diffCount = 0;
    let total = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const aIdx = y < a.height && x < a.width ? (y * a.width + x) * 4 : -1;
        const bIdx = y < b.height && x < b.width ? (y * b.width + x) * 4 : -1;

        const ar = aIdx >= 0 ? a.data[aIdx] : 255;
        const ag = aIdx >= 0 ? a.data[aIdx + 1] : 255;
        const ab = aIdx >= 0 ? a.data[aIdx + 2] : 255;
        const br = bIdx >= 0 ? b.data[bIdx] : 255;
        const bg = bIdx >= 0 ? b.data[bIdx + 1] : 255;
        const bb = bIdx >= 0 ? b.data[bIdx + 2] : 255;

        const dr = Math.abs(ar - br);
        const dg = Math.abs(ag - bg);
        const dbb = Math.abs(ab - bb);
        const isDiff = dr + dg + dbb > 30;
        total++;
        if (isDiff) {
          diffCount++;
          // Highlight diff in red, fade base
          out[idx] = 255;
          out[idx + 1] = 60;
          out[idx + 2] = 60;
          out[idx + 3] = 255;
        } else {
          // Fade original (greyscale, low opacity)
          const grey = Math.round((ar + ag + ab) / 3);
          out[idx] = grey;
          out[idx + 1] = grey;
          out[idx + 2] = grey;
          out[idx + 3] = 80;
        }
      }
    }
    return { diff: new ImageData(out, w, h), pct: (diffCount / total) * 100 };
  }

  function imageDataToUrl(data: ImageData): string {
    const c = document.createElement("canvas");
    c.width = data.width;
    c.height = data.height;
    c.getContext("2d")!.putImageData(data, 0, 0);
    return c.toDataURL("image/png");
  }

  function canvasToUrl(c: HTMLCanvasElement): string {
    return c.toDataURL("image/png");
  }

  async function compareVisual() {
    if (!leftState || !rightState) return;
    processing = true;
    error = "";
    pageDiffs = [];
    textDiffs = [];
    summary = "";
    progress = "Rendering...";
    try {
      const pdfjs = await getPdfjs();
      const lDoc = await pdfjs.getDocument({ data: leftState.bytes.slice(0) }).promise;
      const rDoc = await pdfjs.getDocument({ data: rightState.bytes.slice(0) }).promise;
      const max = Math.max(lDoc.numPages, rDoc.numPages);

      const out: PageDiff[] = [];
      let totalDiff = 0;
      for (let i = 1; i <= max; i++) {
        progress = `Comparing page ${i}/${max}...`;
        const onlyLeft = i > rDoc.numPages;
        const onlyRight = i > lDoc.numPages;
        const lInfo = onlyRight ? null : await renderPage(lDoc, i);
        const rInfo = onlyLeft ? null : await renderPage(rDoc, i);

        let diffUrl = "";
        let pct = 0;
        if (lInfo && rInfo) {
          const { diff, pct: p } = computeImageDiff(lInfo.data, rInfo.data);
          diffUrl = imageDataToUrl(diff);
          pct = p;
          totalDiff += p;
        } else {
          pct = 100;
          totalDiff += 100;
        }

        out.push({
          pageIndex: i - 1,
          leftUrl: lInfo ? canvasToUrl(lInfo.canvas) : "",
          rightUrl: rInfo ? canvasToUrl(rInfo.canvas) : "",
          diffUrl,
          diffPercent: pct,
          onlyInLeft: onlyLeft,
          onlyInRight: onlyRight,
        });
      }
      pageDiffs = out;
      const avg = totalDiff / max;
      summary = `${max} page(s) compared. Average difference: ${avg.toFixed(2)}%`;
      progress = "";
    } catch (e: any) {
      error = `Compare failed: ${e.message ?? e}`;
      progress = "";
    } finally {
      processing = false;
    }
  }

  async function extractText(doc: any, pageNum: number): Promise<string> {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    return tc.items.map((it: any) => it.str).join("\n");
  }

  function lcsDiff(a: string[], b: string[]): { left: ("=" | "-")[]; right: ("=" | "+")[] } {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const left: ("=" | "-")[] = [];
    const right: ("=" | "+")[] = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        left.push("=");
        right.push("=");
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        left.push("-");
        i++;
      } else {
        right.push("+");
        j++;
      }
    }
    while (i < m) {
      left.push("-");
      i++;
    }
    while (j < n) {
      right.push("+");
      j++;
    }
    return { left, right };
  }

  async function compareText() {
    if (!leftState || !rightState) return;
    processing = true;
    error = "";
    textDiffs = [];
    pageDiffs = [];
    summary = "";
    progress = "Extracting text...";
    try {
      const pdfjs = await getPdfjs();
      const lDoc = await pdfjs.getDocument({ data: leftState.bytes.slice(0) }).promise;
      const rDoc = await pdfjs.getDocument({ data: rightState.bytes.slice(0) }).promise;
      const max = Math.max(lDoc.numPages, rDoc.numPages);
      const out: TextDiff[] = [];
      let sameCount = 0;
      for (let i = 1; i <= max; i++) {
        progress = `Comparing text page ${i}/${max}...`;
        const lt = i <= lDoc.numPages ? await extractText(lDoc, i) : "";
        const rt = i <= rDoc.numPages ? await extractText(rDoc, i) : "";
        const same = lt === rt;
        if (same) sameCount++;
        out.push({
          pageIndex: i - 1,
          leftText: lt,
          rightText: rt,
          leftLines: lt.split("\n"),
          rightLines: rt.split("\n"),
          same,
        });
      }
      textDiffs = out;
      summary = `${sameCount}/${max} pages have identical text content.`;
      progress = "";
    } catch (e: any) {
      error = `Text compare failed: ${e.message ?? e}`;
      progress = "";
    } finally {
      processing = false;
    }
  }

  function compare() {
    if (!leftState || !rightState) return;
    if (mode === "visual") compareVisual();
    else compareText();
  }
</script>

<div class="flex flex-col gap-4">
  <div class="grid sm:grid-cols-2 gap-3">
    <div>
      <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">PDF A</div>
      {#if leftState}
        <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
          <div>
            <div class="text-sm text-(--color-text)">{leftState.file.name}</div>
            <div class="text-xs text-(--color-text-muted)">{leftState.pageCount} page(s) · {formatBytes(leftState.file.size)}</div>
          </div>
          <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={() => (leftState = null)}>Clear</button>
        </div>
      {:else}
        <PdfDropzone label="Drop PDF A" onfiles={(f) => loadInto("left", f)} />
      {/if}
    </div>
    <div>
      <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">PDF B</div>
      {#if rightState}
        <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
          <div>
            <div class="text-sm text-(--color-text)">{rightState.file.name}</div>
            <div class="text-xs text-(--color-text-muted)">{rightState.pageCount} page(s) · {formatBytes(rightState.file.size)}</div>
          </div>
          <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={() => (rightState = null)}>Clear</button>
        </div>
      {:else}
        <PdfDropzone label="Drop PDF B" onfiles={(f) => loadInto("right", f)} />
      {/if}
    </div>
  </div>

  {#if leftState && rightState}
    <div class="border border-(--color-border) p-3 flex flex-wrap items-center gap-3">
      <div class="text-xs text-(--color-text-muted)">Mode:</div>
      <label class="flex items-center gap-2 text-sm"><input type="radio" bind:group={mode} value="visual" /> Visual diff</label>
      <label class="flex items-center gap-2 text-sm"><input type="radio" bind:group={mode} value="text" /> Text diff</label>
      <button
        class="ml-auto px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50"
        onclick={compare}
        disabled={processing}
      >
        {processing ? "Comparing..." : "Compare"}
      </button>
    </div>
  {/if}

  {#if progress}
    <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted)">{progress}</div>
  {/if}
  {#if error}
    <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
  {/if}
  {#if summary}
    <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text)">{summary}</div>
  {/if}

  {#if pageDiffs.length > 0}
    <div class="flex flex-col gap-4">
      {#each pageDiffs as diff}
        <div class="border border-(--color-border)">
          <div class="px-3 py-2 bg-(--color-bg-alt) border-b border-(--color-border) flex items-center justify-between">
            <span class="text-sm font-medium">Page {diff.pageIndex + 1}</span>
            {#if diff.onlyInLeft}
              <span class="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-500 border border-orange-500/30">Only in PDF A</span>
            {:else if diff.onlyInRight}
              <span class="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-500 border border-orange-500/30">Only in PDF B</span>
            {:else}
              <span class="text-xs text-(--color-text-muted)">Diff: {diff.diffPercent.toFixed(2)}%</span>
            {/if}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-white">
            <div class="bg-white border border-(--color-border) flex items-center justify-center min-h-32">
              {#if diff.leftUrl}<img src={diff.leftUrl} alt="A" class="max-w-full" />{:else}<span class="text-xs text-(--color-text-muted)">missing</span>{/if}
            </div>
            <div class="bg-white border border-(--color-border) flex items-center justify-center min-h-32">
              {#if diff.diffUrl}<img src={diff.diffUrl} alt="diff" class="max-w-full" />{:else}<span class="text-xs text-(--color-text-muted)">no diff</span>{/if}
            </div>
            <div class="bg-white border border-(--color-border) flex items-center justify-center min-h-32">
              {#if diff.rightUrl}<img src={diff.rightUrl} alt="B" class="max-w-full" />{:else}<span class="text-xs text-(--color-text-muted)">missing</span>{/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if textDiffs.length > 0}
    <div class="flex flex-col gap-4">
      {#each textDiffs as td}
        <div class="border border-(--color-border)">
          <div class="px-3 py-2 bg-(--color-bg-alt) border-b border-(--color-border) flex items-center justify-between">
            <span class="text-sm font-medium">Page {td.pageIndex + 1}</span>
            <span class="text-xs {td.same ? 'text-green-500' : 'text-orange-500'}">
              {td.same ? "Identical text" : "Text differs"}
            </span>
          </div>
          {#if !td.same}
            {@const lcs = lcsDiff(td.leftLines, td.rightLines)}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-0 font-mono text-xs">
              <div class="border-r border-(--color-border) overflow-x-auto">
                {#each td.leftLines as line, idx}
                  <div class="{lcs.left[idx] === '-' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : ''} px-2 whitespace-pre">{line || ' '}</div>
                {/each}
              </div>
              <div class="overflow-x-auto">
                {#each td.rightLines as line, idx}
                  <div class="{lcs.right[idx] === '+' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : ''} px-2 whitespace-pre">{line || ' '}</div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
