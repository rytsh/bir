<script lang="ts">
  import { tick } from "svelte";
  import { axisLabels, kindLabels, getTrials, shuffle, summarizeVision, type TestSuite, type VisionTrial, type VisionResponse } from "./color-vision.ts";

  let suite = $state<TestSuite>("complete");
  let phase = $state<"intro" | "test" | "result">("intro");
  let activeTrials = $state<VisionTrial[]>([]);
  let trialIndex = $state(0);
  let responses = $state<VisionResponse[]>([]);
  let userInput = $state("");
  let selectedColor = $state<number | null>(null);
  let colorOrder = $state<number[]>([]);
  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let headingRef: HTMLHeadingElement;
  let canvasError = $state("");
  let advancing = $state(false);
  const current = $derived(activeTrials[trialIndex]);
  const summary = $derived(summarizeVision(activeTrials, responses));
  const selectedTrials = $derived(getTrials(suite));
  const canSubmit = $derived(current?.kind === "plate" ? /^\d{1,2}$/.test(userInput.trim()) : current?.kind === "match" ? selectedColor !== null : true);

  // A fixed random sequence keeps a plate stable across redraws and sessions.
  function drawPlate(plate: VisionTrial, canvas: HTMLCanvasElement) {
    const size = 400;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const mask = document.createElement("canvas");
    mask.width = size;
    mask.height = size;
    const maskCtx = mask.getContext("2d");
    if (!ctx || !maskCtx) { canvasError = "Canvas rendering is unavailable. Try a browser with Canvas support or choose Color matching / Hue ordering."; return; }
    canvasError = "";
    maskCtx.fillStyle = "#fff";
    maskCtx.font = "bold 200px sans-serif";
    maskCtx.textAlign = "center";
    maskCtx.textBaseline = "middle";
    maskCtx.fillText(plate.digit || "", 200, 208);
    const pixels = maskCtx.getImageData(0, 0, size, size).data;
    let seed = [...plate.id].reduce((sum, char) => sum + char.charCodeAt(0), 91);
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = "#303030";
    ctx.fillRect(0, 0, size, size);
    const dots: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 4500; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = 3 + random() * 5;
      if (Math.hypot(x - 200, y - 200) + r > 194 || dots.some((dot) => Math.hypot(dot.x - x, dot.y - y) < dot.r + r + 1)) continue;
      dots.push({ x, y, r });
      const foreground = pixels[(Math.floor(y) * size + Math.floor(x)) * 4 + 3] > 128;
      const palette = (foreground ? plate.foreground : plate.background)!;
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  $effect(() => {
    if (phase === "test" && current?.kind === "plate" && canvasRef) drawPlate(current, canvasRef);
  });

  function prepareTrial() {
    userInput = "";
    selectedColor = null;
    canvasError = "";
    const trial = activeTrials[trialIndex];
    const indices = trial.colors.map((_, i) => i);
    colorOrder = shuffle(trial.kind === "order" ? indices.slice(1, -1) : indices);
    if (trial.kind === "order" && colorOrder.every((value, i) => value === i + 1)) colorOrder.reverse();
  }

  async function focusHeading() {
    await tick();
    headingRef?.focus();
  }

  async function startTest() {
    activeTrials = getTrials(suite);
    trialIndex = 0;
    responses = [];
    prepareTrial();
    phase = "test";
    await focusHeading();
  }

  async function submit(status: VisionResponse["status"] = "answered") {
    if (phase !== "test" || advancing || (status === "answered" && (!canSubmit || canvasError))) return;
    advancing = true;
    const trial = current;
    let correct = false;
    let response = "";
    if (status === "answered") {
      if (trial.kind === "plate") { response = userInput.trim(); correct = response === trial.digit; }
      else if (trial.kind === "match") { response = `Option ${colorOrder.indexOf(selectedColor!) + 1}`; correct = selectedColor === trial.target; }
      else { correct = colorOrder.every((value, i) => value === i + 1); response = correct ? "Target order" : "Different order"; }
    }
    responses = [...responses, { trialId: trial.id, status, correct, response }];
    if (trialIndex === activeTrials.length - 1) phase = "result";
    else { trialIndex++; prepareTrial(); }
    await focusHeading();
    advancing = false;
  }

  function moveColor(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= colorOrder.length) return;
    const next = [...colorOrder];
    [next[index], next[destination]] = [next[destination], next[index]];
    colorOrder = next;
  }

  async function restart() { phase = "intro"; await focusHeading(); }
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-4 sm:p-6">
  <div class="max-w-3xl mx-auto space-y-5">
    <aside class="screening-note p-4 text-sm leading-relaxed" aria-label="About these exercises">
      <strong class="block mb-1">An educational check, not a diagnosis</strong>
      Display calibration, lighting, and browser rendering affect results. These custom exercises cannot diagnose a color vision condition. An optometrist can provide validated testing.
    </aside>

    {#if phase === "intro"}
      <section class="panel">
        <h2 bind:this={headingRef} tabindex="-1" class="text-xl font-medium mb-3">Explore your color vision</h2>
        <p class="text-sm text-(--color-text-light) leading-relaxed mb-5">Try three ways to distinguish colors, then see which tasks were harder and what the color vision terms mean. Each set includes a visibility control.</p>
        <label for="vision-suite" class="block text-sm font-medium mb-2">Choose your exercises</label>
        <select id="vision-suite" bind:value={suite} class="field w-full mb-4">
          <option value="complete">Complete check · 21 tasks</option>
          <option value="plate">Number plates · 10 tasks</option>
          <option value="match">Color matching · 8 tasks</option>
          <option value="order">Hue ordering · 3 tasks</option>
        </select>
        <dl class="space-y-3 text-sm mb-5">
          <div><dt class="font-medium">Number plates</dt><dd class="text-(--color-text-light)">Read numbers made from colored dots.</dd></div>
          <div><dt class="font-medium">Color matching</dt><dd class="text-(--color-text-light)">Choose the swatch that matches a reference color.</dd></div>
          <div><dt class="font-medium">Hue ordering</dt><dd class="text-(--color-text-light)">Arrange five swatches into a smooth transition between fixed endpoints.</dd></div>
        </dl>
        <div class="border-t border-(--color-border) pt-4 mb-5 text-sm text-(--color-text-light) leading-relaxed">
          Use comfortable, even lighting and your usual viewing distance. Turn off night mode and color filters. There is no time limit. “Can't distinguish” records a difficulty; “Skip” leaves a task unassessed.
        </div>
        <button onclick={startTest} class="primary-button">Start {selectedTrials.length} tasks</button>
      </section>
    {:else if phase === "test" && current}
      <section class="panel">
        <div class="flex flex-wrap justify-between items-baseline gap-2 mb-3">
          <h2 bind:this={headingRef} tabindex="-1" class="text-lg font-medium">{kindLabels[current.kind]}</h2>
          <span class="text-sm text-(--color-text-light) tabular-nums">Task {trialIndex + 1} of {activeTrials.length}</span>
        </div>
        <progress value={trialIndex} max={activeTrials.length} aria-label="Completed tasks" class="w-full h-1.5 mb-5 accent-(--color-accent)"></progress>
        {#if current.kind === "plate"}
          <p id="task-instructions" class="text-sm text-(--color-text-light) mb-4">Read the number in the dots. Enter only what you can see.</p>
          <canvas bind:this={canvasRef} role="img" aria-label="Colored-dot number exercise" aria-describedby="task-instructions" class="block mx-auto w-full max-w-100 aspect-square rounded-full"></canvas>
          {#if canvasError}<p role="alert" class="mt-3 text-sm text-(--color-error-text)">{canvasError}</p>{/if}
          <form class="mt-5" onsubmit={(event) => { event.preventDefault(); submit(); }}>
            <label for="vision-answer" class="block text-sm mb-2">What number do you see?</label>
            <input id="vision-answer" class="field w-full" type="text" inputmode="numeric" autocomplete="off" maxlength="2" pattern={"[0-9]{1,2}"} bind:value={userInput} placeholder="Enter a number" disabled={advancing || !!canvasError} />
            <button class="primary-button mt-4" type="submit" disabled={!canSubmit || advancing || !!canvasError}>{trialIndex === activeTrials.length - 1 ? "See results" : "Next task"}</button>
          </form>
        {:else if current.kind === "match"}
          <p class="text-sm text-(--color-text-light) mb-4">Select the option that exactly matches the reference. All swatches use the same neutral surround.</p>
          <div class="swatch-stage p-5 sm:p-7">
            <p class="stage-label text-center text-sm mb-3">Reference</p>
            <div class="w-24 h-24 mx-auto mb-6" style:background={current.colors[current.target!]}></div>
            <fieldset class="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0">
              <legend class="sr-only">Matching color options</legend>
              {#each colorOrder as color, index}
                <label class="match-option p-2 cursor-pointer">
                  <span class="block h-18 mb-2" style:background={current.colors[color]}></span>
                  <span class="stage-label flex items-center justify-center gap-2 text-sm"><input type="radio" name="match-color" value={color} bind:group={selectedColor} />Option {index + 1}</span>
                </label>
              {/each}
            </fieldset>
          </div>
          <button onclick={() => submit()} class="primary-button mt-5" disabled={!canSubmit || advancing}>{trialIndex === activeTrials.length - 1 ? "See results" : "Next task"}</button>
        {:else}
          <p class="text-sm text-(--color-text-light) mb-4">Use Earlier / Later to make the smoothest color transition from Start to End. The endpoints stay fixed; the same controls work with a keyboard.</p>
          <div class="swatch-stage p-4 sm:p-6">
            <div class="flex gap-1 mb-5" role="img" aria-label="Preview of your current color sequence">
              {#each [0, ...colorOrder, current.colors.length - 1] as color}
                <span class="flex-1 h-14" style:background={current.colors[color]}></span>
              {/each}
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-3"><span class="w-14 h-10 shrink-0" style:background={current.colors[0]}></span><span class="stage-label text-sm">Start · fixed</span></div>
              {#each colorOrder as color, index}
                <div class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_auto] items-center gap-2">
                  <span class="w-full h-10" style:background={current.colors[color]}></span>
                  <span class="stage-label text-sm"><span class="sr-only sm:not-sr-only">Position </span>{index + 1}</span>
                  <button class="stage-button" aria-label={`Move position ${index + 1} earlier`} disabled={index === 0} onclick={() => moveColor(index, -1)}>Earlier</button>
                  <button class="stage-button" aria-label={`Move position ${index + 1} later`} disabled={index === colorOrder.length - 1} onclick={() => moveColor(index, 1)}>Later</button>
                </div>
              {/each}
              <div class="flex items-center gap-3"><span class="w-14 h-10 shrink-0" style:background={current.colors.at(-1)}></span><span class="stage-label text-sm">End · fixed</span></div>
            </div>
          </div>
          <button onclick={() => submit()} class="primary-button mt-5" disabled={advancing}>{trialIndex === activeTrials.length - 1 ? "See results" : "Submit order"}</button>
        {/if}
        <div class="flex flex-wrap gap-3 mt-4 border-t border-(--color-border) pt-4">
          <button onclick={() => submit("unseen")} disabled={advancing || !!canvasError} class="secondary-button">Can't distinguish</button>
          <button onclick={() => submit("skipped")} disabled={advancing} class="secondary-button">Skip task</button>
          <button onclick={restart} class="secondary-button sm:ml-auto">Back to setup</button>
        </div>
      </section>
    {:else if phase === "result"}
      <section class="panel">
        <h2 bind:this={headingRef} tabindex="-1" class="text-xl font-medium mb-3">Your color distinction profile</h2>
        <h3 class="text-lg font-medium mb-2">{summary.title}</h3>
        <p class="text-sm text-(--color-text-light) leading-relaxed mb-5">{summary.explanation}</p>
        <div class="divide-y divide-(--color-border) border-y border-(--color-border) mb-5">
          {#each summary.scores as score}
            <div class="py-3 flex flex-wrap justify-between gap-2 text-sm">
              <span class="font-medium">{axisLabels[score.axis]}</span>
              <span class="text-(--color-text-light) tabular-nums">{score.correct}/{score.answered} matched · {score.missed} difficult · {score.skipped} skipped</span>
            </div>
          {/each}
        </div>
        <p class="text-sm text-(--color-text-light) leading-relaxed mb-5">These are task counts, not a diagnosis, likelihood, or severity score. A validated assessment is needed to determine a type, including protanopia/protanomaly, deuteranopia/deuteranomaly, or tritanopia/tritanomaly.</p>
        <details class="border-t border-(--color-border) py-4">
          <summary class="cursor-pointer font-medium text-sm">What do the color vision types mean?</summary>
          <dl class="mt-4 space-y-3 text-sm leading-relaxed">
            <div><dt class="font-medium">Protan · red-sensitive</dt><dd class="text-(--color-text-light)">Affects the long-wavelength cone response. Can cause red–green confusion; some reds may look darker.</dd></div>
            <div><dt class="font-medium">Deutan · green-sensitive</dt><dd class="text-(--color-text-light)">Affects the medium-wavelength cone response. Also causes red–green confusion. This tool cannot separate it from protan.</dd></div>
            <div><dt class="font-medium">Tritan · blue-sensitive</dt><dd class="text-(--color-text-light)">Affects the short-wavelength cone response. Can cause blue–green and yellow–violet confusion.</dd></div>
          </dl>
        </details>
        <details class="border-t border-(--color-border) py-4">
          <summary class="cursor-pointer font-medium text-sm">Review all {activeTrials.length} responses</summary>
          <ol class="mt-3 divide-y divide-(--color-border)">
            {#each activeTrials as trial, index}
              {@const response = responses.find((answer) => answer.trialId === trial.id)}
              <li class="py-3 text-sm flex flex-wrap justify-between gap-2">
                <span>{index + 1}. {kindLabels[trial.kind]} · {axisLabels[trial.axis]}</span>
                <span class="text-(--color-text-light)">{response?.status === "skipped" ? "Skipped" : response?.status === "unseen" ? "Could not distinguish" : response?.correct ? "Matched" : "Different answer"}{trial.kind === "plate" ? ` · target ${trial.digit}, answer ${response?.response || "—"}` : ""}</span>
              </li>
            {/each}
          </ol>
        </details>
        <button onclick={restart} class="primary-button mt-4">Try another set</button>
      </section>
    {/if}
  </div>
</div>

<style>
  .panel { --color-text-light: var(--color-text-muted); padding: clamp(1rem, 4vw, 1.5rem); border: 1px solid var(--color-border); background: var(--color-bg-alt); }
  .screening-note { color: var(--color-text); background: var(--color-bg-alt); border: 1px solid var(--color-border); }
  .field { min-width: 0; padding: 0.625rem 0.75rem; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); font-size: 1rem; }
  .primary-button, .secondary-button, .stage-button { padding: 0.625rem 1rem; min-height: 44px; font-size: 0.875rem; cursor: pointer; }
  .primary-button { background: var(--color-accent); color: var(--color-btn-text); }
  .primary-button:hover { background: var(--color-accent-hover); }
  .secondary-button { border: 1px solid var(--color-border); color: var(--color-text); }
  .secondary-button:hover { background: var(--color-bg); }
  .swatch-stage { background: #303030; color: #ffffff; }
  .stage-label { color: #ffffff; }
  .match-option { border: 1px solid #969696; }
  .match-option:has(input:checked) { outline: 2px solid #ffffff; outline-offset: 2px; }
  .stage-button { padding-inline: 0.5rem; background: #eeeeee; color: #222222; }
  .stage-button:hover { background: #ffffff; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  :is(button, input, select, summary):focus-visible { outline: 2px solid var(--color-text); outline-offset: 3px; }
  .swatch-stage :is(button, input):focus-visible { outline-color: #ffffff; }
  h2:focus { outline: none; }
</style>
