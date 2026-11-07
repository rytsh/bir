<script lang="ts">
  import { onDestroy } from "svelte";
  import { ChevronLeft, ChevronRight, Download, Pause, Play, SkipBack, SkipForward, X } from "@lucide/svelte";
  import FileDropZone from "../ui/FileDropZone.svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { packSprites, sliceSheet, type SpritePlacement } from "../../lib/sprite-sheet.ts";
  import { writeArchive } from "../../lib/archive.ts";
  import { canvasBlob, downloadBlob, errorMessage, isEditing, loadLocalImage } from "../../lib/workbench.ts";

  interface Source { id: string; name: string; image: HTMLImageElement; url: string; }
  interface Frame { name: string; image: HTMLImageElement; rect: SpritePlacement; }
  let mode = $state<"pack" | "slice">("pack");
  let sources = $state<Source[]>([]);
  let sheet = $state<Source | null>(null);
  let layout = $state<"grid" | "shelf">("grid");
  let columns = $state<number>(4);
  let padding = $state<number>(2);
  let maxWidth = $state<number>(1024);
  let powerOfTwo = $state<boolean>(false);
  let cellWidth = $state<number>(32);
  let cellHeight = $state<number>(32);
  let margin = $state<number>(0);
  let spacing = $state<number>(0);
  let fps = $state<number>(8);
  let playing = $state<boolean>(true);
  let frameIndex = $state<number>(0);
  let pixelated = $state<boolean>(true);
  let previewScale = $state<number>(0);
  let atlasZoom = $state<number>(0);
  let output = $state<HTMLCanvasElement>();
  let animation = $state<HTMLCanvasElement>();
  let busy = $state<boolean>(false);
  let error = $state<string>("");
  let status = $state<string>("");
  let dragId = $state<string>("");

  const frames = $derived.by((): Frame[] => {
    if (mode === "pack") return sources.map((source, index) => ({ name: `${String(index).padStart(3, "0")}_${source.name.replace(/\.[^.]+$/, "")}`, image: source.image, rect: { x: 0, y: 0, width: source.image.naturalWidth, height: source.image.naturalHeight } }));
    if (!sheet) return [];
    try { return sliceSheet(sheet.image.naturalWidth, sheet.image.naturalHeight, cellWidth, cellHeight, margin, spacing).map((rect, index) => ({ name: `frame_${String(index).padStart(4, "0")}`, image: sheet!.image, rect })); } catch { return []; }
  });
  const packed = $derived.by(() => {
    try { return { result: packSprites(frames.map((frame) => frame.rect), layout, columns, padding, maxWidth, powerOfTwo), error: "" }; }
    catch (issue) { return { result: null, error: errorMessage(issue) }; }
  });
  const settingsError = $derived.by(() => {
    if (mode === "pack") return frames.length ? packed.error : "";
    if (!sheet) return "";
    try { sliceSheet(sheet.image.naturalWidth, sheet.image.naturalHeight, cellWidth, cellHeight, margin, spacing); return ""; } catch (issue) { return errorMessage(issue); }
  });
  const canvasSize = $derived(mode === "slice" && sheet ? { w: sheet.image.naturalWidth, h: sheet.image.naturalHeight } : packed.result ? { w: packed.result.width, h: packed.result.height } : { w: 0, h: 0 });
  const current = $derived(frames.length ? frames[frameIndex % frames.length] : null);
  const hasInput = $derived(mode === "pack" ? sources.length > 0 : !!sheet);

  $effect(() => {
    if (!playing || frames.length < 2) return;
    const timer: ReturnType<typeof setInterval> = setInterval(() => frameIndex = (frameIndex + 1) % frames.length, 1000 / Math.max(1, Math.min(60, fps || 8)));
    return () => clearInterval(timer);
  });
  $effect(() => {
    if (!output) return;
    const ctx: CanvasRenderingContext2D = output.getContext("2d")!;
    const active: number = frameIndex % Math.max(1, frames.length);
    if (mode === "slice" && sheet) {
      output.width = sheet.image.naturalWidth; output.height = sheet.image.naturalHeight;
      ctx.drawImage(sheet.image, 0, 0); ctx.lineWidth = Math.max(1, Math.round(output.width / 800));
      frames.forEach((frame, index) => { ctx.strokeStyle = index === active ? "#2d9871" : "#f43f5e"; ctx.strokeRect(frame.rect.x + .5, frame.rect.y + .5, frame.rect.width - 1, frame.rect.height - 1); });
    } else if (packed.result) {
      output.width = packed.result.width; output.height = packed.result.height;
      ctx.clearRect(0, 0, output.width, output.height);
      frames.forEach((frame, index) => ctx.drawImage(frame.image, packed.result!.frames[index].x, packed.result!.frames[index].y));
      const box: SpritePlacement | undefined = packed.result.frames[active];
      if (box && frames.length > 1) { ctx.strokeStyle = "#2d9871"; ctx.lineWidth = 1; ctx.strokeRect(box.x + .5, box.y + .5, box.width - 1, box.height - 1); }
    } else { output.width = 1; output.height = 1; }
  });
  $effect(() => {
    if (!animation || !current) return;
    animation.width = current.rect.width; animation.height = current.rect.height;
    const ctx: CanvasRenderingContext2D = animation.getContext("2d")!;
    ctx.clearRect(0, 0, animation.width, animation.height);
    ctx.drawImage(current.image, current.rect.x, current.rect.y, current.rect.width, current.rect.height, 0, 0, current.rect.width, current.rect.height);
  });
  onDestroy(() => { sources.forEach((source) => URL.revokeObjectURL(source.url)); if (sheet) URL.revokeObjectURL(sheet.url); });

  async function add(files: File[]): Promise<void> {
    busy = true; error = "";
    const added: Source[] = [];
    try {
      const chosen: File[] = (mode === "slice" ? files.slice(0, 1) : files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (mode === "pack" && sources.length + chosen.length > 256) throw new Error("Pack up to 256 sprites at a time.");
      let pixels: number = mode === "pack" ? sources.reduce((sum, source) => sum + source.image.naturalWidth * source.image.naturalHeight, 0) : 0;
      for (const file of chosen) {
        if (file.size > 32 * 1024 * 1024) throw new Error("Choose images smaller than 32 MB.");
        const image: HTMLImageElement = await loadLocalImage(file);
        pixels += image.naturalWidth * image.naturalHeight;
        if (pixels > 32_000_000) throw new Error("Combined source images exceed 32 megapixels.");
        added.push({ id: crypto.randomUUID(), name: file.name, image, url: URL.createObjectURL(file) });
      }
      if (mode === "slice") {
        if (sheet) URL.revokeObjectURL(sheet.url);
        sheet = added[0];
        guessCells(sheet.image);
      } else sources = [...sources, ...added];
      frameIndex = 0; status = "";
    } catch (issue) { added.forEach((source) => URL.revokeObjectURL(source.url)); error = errorMessage(issue); }
    finally { busy = false; }
  }

  function guessCells(image: HTMLImageElement): void {
    // Square cells sized to the shorter side are the most common layout for strips and grids.
    const side: number = Math.min(image.naturalWidth, image.naturalHeight);
    const candidate: number | undefined = [16, 24, 32, 48, 64, 96, 128, 256].reverse().find((size) => size <= side && image.naturalWidth % size === 0 && image.naturalHeight % size === 0);
    cellWidth = cellHeight = candidate ?? side; margin = 0; spacing = 0;
  }

  function move(from: number, to: number): void {
    if (to < 0 || to >= sources.length || from === to) return;
    const next: Source[] = [...sources];
    const [item] = next.splice(from, 1); next.splice(to, 0, item); sources = next; frameIndex = to;
  }
  function remove(id: string): void { const source: Source | undefined = sources.find((item) => item.id === id); if (source) URL.revokeObjectURL(source.url); sources = sources.filter((item) => item.id !== id); frameIndex = 0; }
  function clearAll(): void {
    if (mode === "pack") { sources.forEach((source) => URL.revokeObjectURL(source.url)); sources = []; }
    else { if (sheet) URL.revokeObjectURL(sheet.url); sheet = null; }
    frameIndex = 0; status = ""; error = "";
  }
  function step(direction: number): void { if (!frames.length) return; playing = false; frameIndex = (frameIndex % frames.length + direction + frames.length) % frames.length; }

  async function exportFiles(): Promise<void> {
    if (!frames.length || settingsError || busy) return;
    busy = true; error = ""; status = "Preparing export…";
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      const encoder: TextEncoder = new TextEncoder();
      if (mode === "pack" && packed.result) {
        const canvas: HTMLCanvasElement = document.createElement("canvas"); canvas.width = packed.result.width; canvas.height = packed.result.height;
        const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;
        frames.forEach((frame, index) => ctx.drawImage(frame.image, packed.result!.frames[index].x, packed.result!.frames[index].y));
        files.push({ name: "sprites.png", data: new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()) });
        const metadata = { frames: Object.fromEntries(frames.map((frame, index) => [frame.name, { frame: { x: packed.result!.frames[index].x, y: packed.result!.frames[index].y, w: frame.rect.width, h: frame.rect.height }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: frame.rect.width, h: frame.rect.height }, sourceSize: { w: frame.rect.width, h: frame.rect.height }, duration: Math.round(1000 / fps) }])), meta: { app: "1.tools", image: "sprites.png", format: "RGBA8888", size: { w: packed.result.width, h: packed.result.height }, scale: "1" } };
        files.push({ name: "sprites.json", data: encoder.encode(JSON.stringify(metadata, null, 2)) });
        const css: string = frames.map((frame, index) => { const rect: SpritePlacement = packed.result!.frames[index]; return `.sprite-${index} { display: inline-block; width: ${rect.width}px; height: ${rect.height}px; background: url("sprites.png") -${rect.x}px -${rect.y}px no-repeat; }`; }).join("\n");
        files.push({ name: "sprites.css", data: encoder.encode(css) });
      } else {
        for (let index: number = 0; index < frames.length; index++) {
          const frame: Frame = frames[index];
          const canvas: HTMLCanvasElement = document.createElement("canvas"); canvas.width = frame.rect.width; canvas.height = frame.rect.height;
          canvas.getContext("2d")!.drawImage(frame.image, frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height, 0, 0, canvas.width, canvas.height);
          files.push({ name: `${frame.name}.png`, data: new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()) });
          status = `Exporting frame ${index + 1} / ${frames.length}…`;
        }
        files.push({ name: "frames.json", data: encoder.encode(JSON.stringify({ fps, frames: frames.map((frame) => ({ name: `${frame.name}.png`, ...frame.rect })) }, null, 2)) });
      }
      downloadBlob(await writeArchive(files, "zip", 6), mode === "pack" ? "sprite-atlas.zip" : "sprite-frames.zip");
      status = mode === "pack" ? "Downloaded sprite-atlas.zip (PNG + JSON + CSS)." : `Downloaded sprite-frames.zip (${frames.length} PNG frames + JSON).`;
    } catch (issue) { error = errorMessage(issue); status = ""; }
    finally { busy = false; }
  }

  function shortcut(event: KeyboardEvent): void {
    if (isEditing(event) || !frames.length) return;
    if (event.code === "Space" && event.target instanceof HTMLElement && event.target.closest("button, a, summary, [role='button'], [draggable='true']")) return;
    if (event.code === "Space") { event.preventDefault(); playing = !playing; }
    if (["ArrowLeft", "ArrowRight"].includes(event.key) && !(event.target instanceof HTMLElement && event.target.closest("[draggable='true']"))) { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); }
    if (event.key.toLowerCase() === "e") void exportFiles();
  }
</script>

<svelte:window onkeydown={shortcut} />
<ToolWorkbench description="Pack images into a sprite atlas, or slice a regular sprite sheet into individual PNG frames. Preview the animation and export images with JSON and CSS metadata.">
  <div class="wb-toolbar" role="group" aria-label="Mode">
    <button aria-pressed={mode === "pack"} disabled={busy} onclick={() => { mode = "pack"; frameIndex = 0; error = ""; }}>Pack sprites → atlas</button>
    <button aria-pressed={mode === "slice"} disabled={busy} onclick={() => { mode = "slice"; frameIndex = 0; error = ""; }}>Slice sheet → frames</button>
    <span class="wb-spacer"></span>
    {#if hasInput}<button disabled={busy} onclick={clearAll}>Clear {mode === "pack" ? "sprites" : "sheet"}</button>{/if}
  </div>
  <FileDropZone accept="image/*" multiple={mode === "pack"} compact={hasInput} title={mode === "pack" ? (hasInput ? "Add more sprites" : "Drop sprite images to build an atlas") : (hasInput ? "Replace the sprite sheet" : "Drop a sprite sheet to slice")} hint={mode === "pack" ? "Files are ordered by name (frame_2 before frame_10) · transparent PNG recommended" : "Regular grids only · cell size is guessed automatically and can be adjusted"} disabled={busy} onfiles={add} />
  {#if error || settingsError}<p class="wb-error" role="alert">{error || settingsError}</p>{/if}

  {#if hasInput}
    <div class="studio">
      <aside class="wb-panel settings" aria-label="Settings">
        <h2 class="wb-panel-heading">{mode === "pack" ? "Atlas layout" : "Grid"}</h2>
        <div class="wb-padded settings-body">
          {#if mode === "pack"}
            <label class="wb-field">Layout<select bind:value={layout}><option value="grid">Uniform grid</option><option value="shelf">Compact rows</option></select></label>
            {#if layout === "grid"}<label class="wb-field">Columns<input type="number" min="1" max="256" bind:value={columns} /></label>{:else}<label class="wb-field">Max width (px)<input type="number" min="1" max="8192" bind:value={maxWidth} /></label>{/if}
            <label class="wb-field">Padding (px)<input type="number" min="0" max="128" bind:value={padding} /></label>
            <label class="wb-check"><input type="checkbox" bind:checked={powerOfTwo} /> Power-of-two size</label>
          {:else}
            <div class="pair"><label class="wb-field">Cell width<input type="number" min="1" bind:value={cellWidth} /></label><label class="wb-field">Cell height<input type="number" min="1" bind:value={cellHeight} /></label></div>
            <div class="pair"><label class="wb-field">Outer margin<input type="number" min="0" bind:value={margin} /></label><label class="wb-field">Spacing<input type="number" min="0" bind:value={spacing} /></label></div>
            {#if sheet}<button onclick={() => guessCells(sheet!.image)}>Auto-detect cells</button>{/if}
          {/if}
          <label class="wb-check"><input type="checkbox" bind:checked={pixelated} /> Pixel-art rendering</label>
          <dl class="summary">
            <dt>Frames</dt><dd>{frames.length}</dd>
            <dt>{mode === "pack" ? "Atlas" : "Sheet"}</dt><dd>{canvasSize.w} × {canvasSize.h}</dd>
          </dl>
          <button class="primary" disabled={busy || !!settingsError || !frames.length} onclick={exportFiles}><Download size={16} /> {busy ? "Exporting…" : "Export ZIP"}</button>
          <p class="wb-small wb-muted" role="status">{status || (mode === "pack" ? "sprites.png + sprites.json + sprites.css" : "One PNG per frame + frames.json")}</p>
        </div>
      </aside>

      <div class="stage">
        <section class="wb-panel">
          <div class="wb-panel-heading">
            <span>Animation</span>
            <span class="wb-spacer"></span>
            <label class="wb-check wb-small">Scale<select aria-label="Preview scale" bind:value={previewScale}><option value={0}>Fit</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option><option value={8}>8×</option></select></label>
          </div>
          <div class="animation wb-checker">
            {#if current}<canvas bind:this={animation} class:pixelated aria-label="Sprite animation preview" style:width={previewScale ? `${current.rect.width * previewScale}px` : undefined} style:max-width={previewScale ? "none" : undefined} style:max-height={previewScale ? "none" : undefined}></canvas>{:else}<p class="wb-muted wb-small">No complete frames with these settings.</p>{/if}
          </div>
          <div class="wb-padded player">
            <button class="wb-icon" aria-label="First frame" onclick={() => { playing = false; frameIndex = 0; }}><SkipBack size={15} /></button>
            <button class="wb-icon" aria-label="Previous frame" onclick={() => step(-1)}><ChevronLeft size={15} /></button>
            <button class="primary wb-icon" aria-label={playing ? "Pause animation" : "Play animation"} onclick={() => playing = !playing}>{#if playing}<Pause size={15} />{:else}<Play size={15} />{/if}</button>
            <button class="wb-icon" aria-label="Next frame" onclick={() => step(1)}><ChevronRight size={15} /></button>
            <button class="wb-icon" aria-label="Last frame" onclick={() => { playing = false; frameIndex = Math.max(0, frames.length - 1); }}><SkipForward size={15} /></button>
            <input type="range" min="0" max={Math.max(0, frames.length - 1)} bind:value={frameIndex} oninput={() => playing = false} aria-label="Animation frame" class="scrubber" />
            <span class="wb-small frame-count">{frames.length ? (frameIndex % frames.length) + 1 : 0} / {frames.length}</span>
            <label class="wb-check wb-small"><input type="number" min="1" max="60" bind:value={fps} aria-label="Frames per second" class="fps" /> FPS</label>
          </div>
        </section>

        <section class="wb-panel">
          <div class="wb-panel-heading">
            <span>{mode === "pack" ? "Atlas" : "Slice grid"}</span>
            <span class="wb-small wb-muted">{mode === "pack" ? "Green box = current frame" : "Red = cells · green = current frame"}</span>
            <span class="wb-spacer"></span>
            <label class="wb-check wb-small">Zoom<select aria-label="Atlas zoom" bind:value={atlasZoom}><option value={0}>Fit</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
          </div>
          <div class="atlas wb-scroll wb-checker"><canvas bind:this={output} class:pixelated class:fit={!atlasZoom} style:width={atlasZoom ? `${canvasSize.w * atlasZoom}px` : undefined} aria-label={mode === "pack" ? "Packed sprite atlas" : "Source sheet with slicing boundaries"}></canvas></div>
        </section>
      </div>
    </div>

    {#if mode === "pack"}
      <section class="wb-panel">
        <h2 class="wb-panel-heading">Frame order <span class="wb-small wb-muted">Drag to reorder, or focus a frame and use Alt+←/→. Click to preview.</span></h2>
        <ol class="frame-strip wb-scroll">
          {#each sources as source, index (source.id)}
            <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role (Each card is a draggable, focusable frame selector inside the ordered list.) -->
            <li class="frame-card" class:active={index === frameIndex % Math.max(1, frames.length)} class:drop-target={dragId && dragId !== source.id}
              draggable="true" tabindex="0" role="button" aria-label={`Frame ${index + 1}: ${source.name}. Press Enter to preview, Alt+Arrow to reorder.`}
              ondragstart={(event) => { dragId = source.id; event.dataTransfer?.setData("text/plain", source.id); }}
              ondragend={() => dragId = ""}
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => { event.preventDefault(); const from: number = sources.findIndex((item) => item.id === dragId); move(from, index); dragId = ""; }}
              onclick={() => { playing = false; frameIndex = index; }}
              onkeydown={(event) => { if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); move(index, index + (event.key === "ArrowRight" ? 1 : -1)); } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); playing = false; frameIndex = index; } }}>
              <span class="frame-number">{index + 1}</span>
              <img src={source.url} alt="" class:pixelated draggable="false" />
              <span class="frame-name" title={source.name}>{source.name}</span>
              <span class="wb-small wb-muted">{source.image.naturalWidth}×{source.image.naturalHeight}</span>
              <button class="wb-icon remove" disabled={busy} aria-label={`Remove ${source.name}`} onclick={(event) => { event.stopPropagation(); remove(source.id); }}><X size={13} /></button>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  {/if}
  <div class="wb-shortcuts"><span><kbd>Space</kbd> Play / pause</span><span><kbd>←</kbd> <kbd>→</kbd> Step frame</span><span><kbd>Alt</kbd>+<kbd>←</kbd> <kbd>→</kbd> Reorder focused frame</span><span><kbd>E</kbd> Export ZIP</span></div>
</ToolWorkbench>

<style>
  .studio { display: grid; grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); gap: 1rem; align-items: start; }
  .settings { position: sticky; top: 1rem; }
  .settings-body { display: flex; flex-direction: column; gap: .9rem; }
  .settings-body input[type="number"] { width: 100%; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: .3rem 1rem; padding-top: .8rem; border-top: 1px solid var(--color-border); font-variant-numeric: tabular-nums; }
  .summary dt { color: var(--color-text-muted); }
  .summary dd { text-align: right; }
  .stage { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  .animation { height: 240px; display: flex; align-items: center; justify-content: center; padding: 1rem; overflow: auto; }
  .animation canvas { max-width: 100%; max-height: 100%; min-width: 48px; object-fit: contain; }
  .player { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
  .scrubber { flex: 1; min-width: 8rem; margin: 0 .4rem; }
  .frame-count { min-width: 4.5rem; text-align: center; font-variant-numeric: tabular-nums; }
  :global(.workbench) input.fps { width: 4.2rem; }
  .atlas { padding: 1rem; max-height: min(60dvh, 34rem); }
  .atlas canvas { display: block; }
  .atlas canvas.fit { max-width: 100%; height: auto; }
  .pixelated { image-rendering: pixelated; }
  .frame-strip { display: flex; gap: .6rem; padding: .8rem 1rem 1rem; list-style: none; margin: 0; }
  .frame-card { position: relative; flex: 0 0 112px; display: flex; flex-direction: column; gap: .25rem; padding: .5rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); cursor: grab; }
  .frame-card:hover { border-color: var(--color-text-muted); }
  .frame-card.active { border-color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
  .frame-card.drop-target { border-style: dashed; }
  .frame-card:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .frame-card img { width: 100%; height: 64px; object-fit: contain; background: var(--color-bg); pointer-events: none; }
  .frame-number { font-size: .7rem; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
  .frame-name { font-size: .75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.workbench) button.remove { position: absolute; top: .25rem; right: .25rem; min-height: 1.6rem; min-width: 1.6rem; padding: .15rem; }
  @media (max-width: 820px) { .studio { grid-template-columns: minmax(0, 1fr); } .settings { position: static; } }
</style>
