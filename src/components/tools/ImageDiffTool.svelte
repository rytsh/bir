<script lang="ts">
  import { onDestroy } from "svelte";
  import { ArrowLeftRight, Download, RotateCcw, X } from "@lucide/svelte";
  import ComparisonViewport from "./image-diff/ComparisonViewport.svelte";
  import FileDropZone from "../ui/FileDropZone.svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { comparePixels } from "../../lib/image-diff.ts";
  import { canvasBlob, downloadBlob, errorMessage, formatBytes, isEditing, loadLocalImage } from "../../lib/workbench.ts";

  interface ImageAsset { id: string; name: string; image: HTMLImageElement; url: string; size: number; }
  type Mode = "slider" | "overlay" | "difference" | "side" | "grid" | "row";
  let images = $state<ImageAsset[]>([]);
  let aId = $state<string>("");
  let bId = $state<string>("");
  let mode = $state<Mode>("slider");
  let position = $state<number>(50);
  let vertical = $state<boolean>(false);
  let showDivider = $state<boolean>(true);
  let zoom = $state<number>(100);
  let previewHeight = $state<number>(0);
  let threshold = $state<number>(12);
  let opacity = $state<number>(50);
  let busy = $state<boolean>(false);
  let error = $state<string>("");
  let diffCanvas = $state<HTMLCanvasElement>();
  let changed = $state<number>(0);
  let meanError = $state<number>(0);
  let resolution = $state<string>("");
  const a = $derived(images.find((image) => image.id === aId));
  const b = $derived(images.find((image) => image.id === bId));
  const modes: { value: Mode; label: string }[] = [{ value: "slider", label: "Slider" }, { value: "overlay", label: "Overlay" }, { value: "difference", label: "Pixel diff" }, { value: "side", label: "Side by side" }, { value: "grid", label: "All images" }, { value: "row", label: "All side by side" }];

  onDestroy(() => images.forEach((image) => URL.revokeObjectURL(image.url)));

  async function add(files: File[]): Promise<void> {
    if (busy) return;
    busy = true; error = "";
    const added: ImageAsset[] = [];
    try {
      for (const file of files) {
        const image: HTMLImageElement = await loadLocalImage(file, null);
        added.push({ id: crypto.randomUUID(), name: file.name, image, url: URL.createObjectURL(file), size: file.size });
      }
      images = [...images, ...added];
      if (!aId) aId = images[0]?.id ?? "";
      if (!bId || bId === aId) bId = images.find((image) => image.id !== aId)?.id ?? "";
    } catch (issue) { added.forEach((asset) => URL.revokeObjectURL(asset.url)); error = errorMessage(issue); }
    finally { busy = false; }
  }

  function remove(id: string): void {
    const asset: ImageAsset | undefined = images.find((image) => image.id === id);
    if (asset) URL.revokeObjectURL(asset.url);
    images = images.filter((image) => image.id !== id);
    if (aId === id) aId = images.find((image) => image.id !== bId)?.id ?? images[0]?.id ?? "";
    if (bId === id) bId = images.find((image) => image.id !== aId)?.id ?? "";
  }

  function swap(): void { [aId, bId] = [bId, aId]; position = 100 - position; }

  function resetView(): void { zoom = 100; previewHeight = 0; position = 50; opacity = 50; showDivider = true; }

  function dragDivider(event: PointerEvent): void {
    const input: HTMLInputElement = event.currentTarget as HTMLInputElement;
    const rect: DOMRect = input.getBoundingClientRect();
    position = Math.round(Math.max(0, Math.min(100, vertical ? (event.clientY - rect.top) / rect.height * 100 : (event.clientX - rect.left) / rect.width * 100)));
  }

  $effect(() => {
    const first: ImageAsset | undefined = a;
    const second: ImageAsset | undefined = b;
    const target: HTMLCanvasElement | undefined = diffCanvas;
    const cutoff: number = threshold;
    if (!first || !second || !target || mode !== "difference") return;
    const scale: number = Math.min(1, Math.sqrt(4_000_000 / (first.image.naturalWidth * first.image.naturalHeight)));
    const width: number = Math.max(1, Math.round(first.image.naturalWidth * scale));
    const height: number = Math.max(1, Math.round(first.image.naturalHeight * scale));
    const render = (image: HTMLImageElement): Uint8ClampedArray => {
      const canvas: HTMLCanvasElement = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx: CanvasRenderingContext2D = canvas.getContext("2d", { willReadFrequently: true })!;
      const fit: number = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const w: number = image.naturalWidth * fit; const h: number = image.naturalHeight * fit;
      ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const result = comparePixels(render(first.image), render(second.image), cutoff);
    target.width = width; target.height = height;
    target.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(result.pixels), width, height), 0, 0);
    changed = result.total ? result.changed / result.total * 100 : 0; meanError = result.meanError;
    resolution = `${width} × ${height}${scale < 1 ? " (downsampled to 4 MP)" : ""}`;
  });

  function shortcut(event: KeyboardEvent): void {
    if (isEditing(event) || !a || !b) return;
    const step: number = event.shiftKey ? 10 : 1;
    if (mode === "slider" && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); position = Math.max(0, Math.min(100, position + (event.key === "ArrowLeft" ? -step : step))); }
    if (event.key.toLowerCase() === "h" && mode === "slider") showDivider = !showDivider;
    if (event.key.toLowerCase() === "s") swap();
    if (event.key.toLowerCase() === "r") resetView();
    if (event.key.toLowerCase() === "n") {
      const candidates: ImageAsset[] = images.filter((image) => image.id !== aId);
      bId = candidates[(candidates.findIndex((image) => image.id === bId) + 1) % candidates.length]?.id ?? bId;
    }
    const index: number = Number(event.key) - 1;
    if (index >= 0 && index < modes.length) mode = modes[index].value;
  }

  async function exportDiff(): Promise<void> {
    try { if (diffCanvas) downloadBlob(await canvasBlob(diffCanvas), "image-difference.png"); } catch (issue) { error = errorMessage(issue); }
  }
</script>

<svelte:window onkeydown={shortcut} />
<ToolWorkbench description="Compare a whole set of images. Choose an A/B pair, drag the divider to reveal changes, blend layers, inspect pixel differences, or view all images in a grid or a single row.">
  <FileDropZone accept="image/*" multiple compact={images.length > 0} title={images.length ? "Add more images to this comparison" : "Drop two or more images to compare"} hint="No upload size or image count limits · local processing. Large images may use significant memory. Animated images are compared as stills." disabled={busy} onfiles={add} />
  {#if error}<p class="wb-error" role="alert">{error}</p>{/if}
  {#if busy}<p class="wb-small wb-muted" role="status">Decoding images…</p>{/if}
  {#if images.length}
    <div class="filmstrip" aria-label="Loaded images">
      {#each images as image, index (image.id)}
        <div class="image-tile" class:is-a={aId === image.id} class:is-b={bId === image.id}>
          <button class="wb-plain thumb" title={`${image.name} — click to compare as B`} onclick={() => { if (image.id !== aId) bId = image.id; }}>
            <img src={image.url} alt={image.name} />
            {#if aId === image.id}<span class="role-badge">A</span>{:else if bId === image.id}<span class="role-badge b">B</span>{:else}<span class="index-badge">{index + 1}</span>{/if}
          </button>
          <div class="tile-name" title={image.name}>{image.name}</div>
          <div class="tile-meta wb-small wb-muted">{image.image.naturalWidth}×{image.image.naturalHeight} · {formatBytes(image.size)}</div>
          <div class="tile-actions">
            <button aria-pressed={aId === image.id} aria-label={`Use ${image.name} as A`} onclick={() => aId === image.id ? undefined : bId === image.id ? swap() : aId = image.id}>A</button>
            <button aria-pressed={bId === image.id} aria-label={`Use ${image.name} as B`} onclick={() => bId === image.id ? undefined : aId === image.id ? swap() : bId = image.id}>B</button>
            <span class="wb-spacer"></span>
            <button class="wb-icon" disabled={busy} aria-label={`Remove ${image.name}`} title="Remove" onclick={() => remove(image.id)}><X size={14} /></button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if a && b}
    <div class="control-bar wb-panel">
      <div class="segmented" role="group" aria-label="Comparison mode">
        {#each modes as item, index}<button aria-pressed={mode === item.value} title={`${item.label} (${index + 1})`} onclick={() => mode = item.value}>{item.label}</button>{/each}
      </div>
      <div class="mode-options">
        {#if mode === "slider"}
          <label class="wb-check wb-small"><input type="checkbox" bind:checked={vertical} /> Horizontal</label>
          <label class="wb-check wb-small"><input type="checkbox" bind:checked={showDivider} /> Divider</label>
          <span class="wb-small wb-muted readout">{position}%</span>
        {:else if mode === "overlay"}
          <label class="wb-check wb-small">B opacity<input type="range" min="0" max="100" bind:value={opacity} aria-label="B opacity" /><span class="readout">{opacity}%</span></label>
        {:else if mode === "difference"}
          <label class="wb-check wb-small">Tolerance<input type="range" min="0" max="100" bind:value={threshold} aria-label="Difference tolerance" /><span class="readout">{threshold}</span></label>
          <button onclick={exportDiff}><Download size={14} /> PNG</button>
        {/if}
      </div>
      <span class="wb-spacer"></span>
      <div class="view-options">
        <label class="wb-check wb-small">Height<select bind:value={previewHeight} aria-label="Preview height"><option value={0}>Auto</option><option value={240}>240 px</option><option value={400}>400 px</option><option value={600}>600 px</option><option value={800}>800 px</option></select></label>
        <label class="wb-check wb-small">Zoom<select bind:value={zoom} aria-label="Zoom"><option value={50}>50%</option><option value={75}>75%</option><option value={100}>Fit</option><option value={150}>150%</option><option value={200}>200%</option><option value={300}>300%</option></select></label>
        <button class="wb-icon" onclick={swap} aria-label="Swap A and B" title="Swap A/B (S)"><ArrowLeftRight size={15} /></button>
        <button class="wb-icon" onclick={resetView} aria-label="Reset view" title="Reset view (R)"><RotateCcw size={15} /></button>
      </div>
    </div>
    {#if a.image.naturalWidth !== b.image.naturalWidth || a.image.naturalHeight !== b.image.naturalHeight}<p class="wb-note wb-small">Dimensions differ. B is centered and proportionally fitted inside A’s frame, without stretching. Pixel diff uses the same alignment; it is not an original-size pixel comparison.</p>{/if}
    {#if mode === "row"}<p class="wb-small wb-muted">All {images.length} images in upload order. Scroll horizontally when they do not fit; preview height and zoom apply to every image.</p>{/if}
    {#if mode === "slider" && !showDivider}<p class="wb-small wb-muted" id="image-diff-divider-hint">Divider hidden. Drag anywhere on the image or use the arrow keys to adjust the reveal. Press H to show it again.</p>{/if}
    {#if mode === "grid" || mode === "side" || mode === "row"}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (The horizontal scroll region needs keyboard focus for native arrow-key scrolling.) -->
      <div class="comparison-grid" class:pair={mode === "side"} class:comparison-row={mode === "row"} class:wb-scroll={mode === "row"} role="region" aria-label={mode === "row" ? "All images side by side" : "Image comparison gallery"} tabindex={mode === "row" ? 0 : undefined}>
        {#each mode === "side" ? [a, b] : images as image (image.id)}<figure class="wb-panel"><div class="wb-panel-heading image-heading">{image.id === aId ? "A · " : image.id === bId ? "B · " : ""}{image.name}</div><ComparisonViewport width={image.image.naturalWidth} height={image.image.naturalHeight} {zoom} {previewHeight}><img class="comparison-image" src={image.url} alt={image.name} /></ComparisonViewport><figcaption class="wb-small wb-muted wb-padded">{image.image.naturalWidth} × {image.image.naturalHeight}</figcaption></figure>{/each}
      </div>
    {:else}
      <div class="wb-panel"><div class="wb-panel-heading"><span class="pair-name">A · {a.name}</span><span class="wb-spacer"></span><span class="pair-name">B · {b.name}</span></div>
        <ComparisonViewport width={a.image.naturalWidth} height={a.image.naturalHeight} {zoom} {previewHeight}>
          {#if mode === "difference"}<canvas bind:this={diffCanvas} class="diff-canvas" aria-label="Pixel differences shown in pink, unchanged pixels in charcoal"></canvas>
          {:else}
            <img class="comparison-image" src={a.url} alt={`A: ${a.name}`} draggable="false" />
            <img class="comparison-image" src={b.url} alt={`B: ${b.name}`} draggable="false" style:opacity={mode === "overlay" ? opacity / 100 : 1} style:clip-path={mode === "slider" ? vertical ? `inset(${position}% 0 0 0)` : `inset(0 0 0 ${position}%)` : "none"} />
            {#if mode === "slider"}
              {#if showDivider}<div class="divider" class:horizontal={vertical} style:left={vertical ? "0" : `${position}%`} style:top={vertical ? `${position}%` : "0"} aria-hidden="true"><span><ArrowLeftRight size={22} style={vertical ? "transform: rotate(90deg);" : ""} /></span></div>{/if}
              <input class="compare-range" class:vertical type="range" min="0" max="100" step="1" bind:value={position} aria-label="Comparison divider position" aria-valuetext={`${position}% A, ${100 - position}% B`} aria-describedby={!showDivider ? "image-diff-divider-hint" : undefined}
                onpointerdown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragDivider(event); }}
                onpointermove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) dragDivider(event); }}
                onpointerup={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
            {/if}
          {/if}
        </ComparisonViewport>
      </div>
    {/if}
    {#if mode === "difference"}<div class="wb-stats"><span><strong>{changed.toFixed(2)}%</strong> changed pixels</span><span><strong>{meanError.toFixed(2)}%</strong> mean RGB error</span><span>{resolution}</span><span>Pink = changed · Charcoal = unchanged</span></div>{/if}
    <div class="wb-shortcuts"><span><kbd>←</kbd> <kbd>→</kbd> Move divider (Shift: 10%)</span><span><kbd>1</kbd>–<kbd>6</kbd> View mode</span><span><kbd>H</kbd> Show / hide divider</span><span><kbd>S</kbd> Swap</span><span><kbd>N</kbd> Next B image</span><span><kbd>R</kbd> Reset</span></div>
  {:else if images.length}<p class="wb-empty">Add another image to start comparing.</p>{/if}
</ToolWorkbench>

<style>
  .filmstrip { display: flex; gap: .6rem; overflow-x: auto; padding: 2px 2px .5rem; }
  .image-tile { flex: 0 0 150px; border: 1px solid var(--color-border); background: var(--color-bg-alt); padding: .45rem; display: flex; flex-direction: column; gap: .25rem; }
  .image-tile.is-a, .image-tile.is-b { border-color: var(--color-accent); }
  .thumb { position: relative; display: block; width: 100%; padding: 0; border: 0; background: var(--color-bg); cursor: pointer; }
  .thumb img { width: 100%; height: 72px; object-fit: contain; display: block; }
  .role-badge, .index-badge { position: absolute; top: 4px; left: 4px; min-width: 1.3rem; height: 1.3rem; padding: 0 .3rem; display: grid; place-items: center; font-size: .7rem; font-weight: 600; background: var(--color-accent); color: var(--color-btn-text); }
  .index-badge { background: var(--color-bg-alt); color: var(--color-text-muted); border: 1px solid var(--color-border); font-weight: 500; }
  .tile-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: .8rem; }
  .tile-meta { font-variant-numeric: tabular-nums; }
  .tile-actions { display: flex; gap: .3rem; }
  :global(.workbench) .tile-actions button { min-height: 1.9rem; padding: .2rem .6rem; }
  .control-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; padding: .5rem; position: sticky; top: 0; z-index: 4; }
  .segmented { display: flex; flex-wrap: wrap; }
  :global(.workbench) .segmented button { margin-right: -1px; min-height: 2.1rem; padding: .3rem .7rem; font-size: .82rem; }
  .mode-options, .view-options { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .9rem; }
  .mode-options input[type="range"] { width: 7rem; }
  .readout { min-width: 2.6rem; font-variant-numeric: tabular-nums; }
  .view-options select { padding: .3rem .4rem; }
  .comparison-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; }
  .comparison-grid.pair { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .comparison-grid.comparison-row { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); padding: 3px 3px .65rem; }
  .comparison-row:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .image-heading { overflow-wrap: anywhere; min-height: 3rem; }
  .comparison-image, .diff-canvas { position: absolute; width: 100%; height: 100%; inset: 0; object-fit: contain; user-select: none; }
  .divider { position: absolute; height: 100%; width: 2px; background: white; filter: drop-shadow(0 1px 2px #0009); pointer-events: none; z-index: 1; }
  .divider.horizontal { width: 100%; height: 2px; }
  .divider span { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; color: #1a1a1a; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-size: 23px; }
  .compare-range { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; margin: 0; cursor: ew-resize; z-index: 2; touch-action: none; }
  .compare-range.vertical { writing-mode: vertical-lr; cursor: ns-resize; }
  .pair-name { max-width: 45%; overflow-wrap: anywhere; font-size: .8rem; }
  @media (max-width: 600px) { .comparison-grid.pair { grid-template-columns: minmax(0, 1fr); } }
</style>
