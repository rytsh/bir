<script lang="ts">
  interface ButtonState {
    pressed: boolean;
    clicks: number;
    lastDown: number;
    lastUp: number;
  }

  interface PollSample {
    t: number;
    dx: number;
    dy: number;
  }

  let area = $state<HTMLDivElement | null>(null);

  // Position
  let mouseX = $state(0);
  let mouseY = $state(0);
  let relX = $state(0);
  let relY = $state(0);

  // Buttons (0..4)
  const initialBtn = (): ButtonState => ({ pressed: false, clicks: 0, lastDown: 0, lastUp: 0 });
  let buttons = $state<ButtonState[]>([initialBtn(), initialBtn(), initialBtn(), initialBtn(), initialBtn()]);
  const btnNames = ["Left", "Middle", "Right", "Back", "Forward"];

  // Click stats
  let lastClickTime = $state(0);
  let doubleClickGap = $state(0);
  let clickHistory = $state<{ x: number; y: number; button: number; t: number }[]>([]);

  // Movement / polling rate
  let samples: PollSample[] = [];
  let pollingHz = $state(0);
  let avgPollHz = $state(0);
  let speed = $state(0); // px/sec
  let lastMoveT = 0;

  // Scroll
  let scrollDeltaY = $state(0);
  let scrollDeltaX = $state(0);
  let totalScrollY = $state(0);
  let totalScrollX = $state(0);
  let scrollEvents = $state(0);

  // Trail
  let showTrail = $state(true);
  let trail = $state<{ x: number; y: number; t: number }[]>([]);

  // Debug log
  let log = $state<string[]>([]);
  function logEvent(msg: string) {
    log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log].slice(0, 20);
  }

  function reset() {
    buttons = buttons.map(() => initialBtn());
    clickHistory = [];
    log = [];
    trail = [];
    samples = [];
    pollingHz = 0;
    avgPollHz = 0;
    speed = 0;
    scrollEvents = 0;
    totalScrollY = 0;
    totalScrollX = 0;
    scrollDeltaY = 0;
    scrollDeltaX = 0;
    doubleClickGap = 0;
  }

  function handleMove(e: PointerEvent) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (area) {
      const r = area.getBoundingClientRect();
      relX = e.clientX - r.left;
      relY = e.clientY - r.top;
    }

    const now = performance.now();
    const dt = lastMoveT ? now - lastMoveT : 0;
    lastMoveT = now;

    if (dt > 0 && dt < 200) {
      const dx = e.movementX;
      const dy = e.movementY;
      samples.push({ t: now, dx, dy });
      // Keep last 1s
      const cutoff = now - 1000;
      while (samples.length && samples[0].t < cutoff) samples.shift();

      if (samples.length >= 2) {
        const span = samples[samples.length - 1].t - samples[0].t;
        avgPollHz = span > 0 ? Math.round(((samples.length - 1) * 1000) / span) : 0;
        pollingHz = Math.round(1000 / dt);
        const dist = Math.hypot(dx, dy);
        speed = Math.round((dist / dt) * 1000);
      }
    }

    if (showTrail) {
      trail = [...trail, { x: relX, y: relY, t: now }].slice(-60);
    }
  }

  function handleDown(e: PointerEvent) {
    const b = e.button;
    if (b >= 0 && b < buttons.length) {
      buttons[b] = { ...buttons[b], pressed: true, lastDown: performance.now() };
    }
    logEvent(`down: ${btnNames[b] ?? b} @ (${Math.round(e.clientX)}, ${Math.round(e.clientY)})`);
  }

  function handleUp(e: PointerEvent) {
    const b = e.button;
    if (b >= 0 && b < buttons.length) {
      buttons[b] = { ...buttons[b], pressed: false, lastUp: performance.now() };
    }
  }

  function handleClick(e: MouseEvent) {
    const b = e.button;
    if (b >= 0 && b < buttons.length) {
      buttons[b] = { ...buttons[b], clicks: buttons[b].clicks + 1 };
    }
    const now = performance.now();
    if (lastClickTime) doubleClickGap = Math.round(now - lastClickTime);
    lastClickTime = now;

    if (area) {
      const r = area.getBoundingClientRect();
      clickHistory = [
        { x: e.clientX - r.left, y: e.clientY - r.top, button: b, t: now },
        ...clickHistory,
      ].slice(0, 20);
    }
    logEvent(`click: ${btnNames[b] ?? b}`);
  }

  function handleAux(e: MouseEvent) {
    // catches middle/back/forward where click might not fire on some browsers
    e.preventDefault();
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    scrollDeltaY = e.deltaY;
    scrollDeltaX = e.deltaX;
    totalScrollY += e.deltaY;
    totalScrollX += e.deltaX;
    scrollEvents++;
  }

  function handleContext(e: Event) {
    e.preventDefault();
  }

  // Decay trail
  $effect(() => {
    if (!showTrail) return;
    const id = setInterval(() => {
      const now = performance.now();
      trail = trail.filter((p) => now - p.t < 800);
    }, 100);
    return () => clearInterval(id);
  });
</script>

<div class="flex-1 flex flex-col bg-(--color-bg) text-(--color-text)">
  <!-- Stats bar -->
  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-(--color-border) border-b border-(--color-border)">
    <div class="bg-(--color-bg-alt) p-3">
      <div class="text-xs text-(--color-text-light)">Position (page)</div>
      <div class="text-sm font-mono">{Math.round(mouseX)}, {Math.round(mouseY)}</div>
    </div>
    <div class="bg-(--color-bg-alt) p-3">
      <div class="text-xs text-(--color-text-light)">Position (rel)</div>
      <div class="text-sm font-mono">{Math.round(relX)}, {Math.round(relY)}</div>
    </div>
    <div class="bg-(--color-bg-alt) p-3">
      <div class="text-xs text-(--color-text-light)">Polling (avg / inst)</div>
      <div class="text-sm font-mono">{avgPollHz} / {pollingHz} Hz</div>
    </div>
    <div class="bg-(--color-bg-alt) p-3">
      <div class="text-xs text-(--color-text-light)">Speed</div>
      <div class="text-sm font-mono">{speed} px/s</div>
    </div>
    <div class="bg-(--color-bg-alt) p-3">
      <div class="text-xs text-(--color-text-light)">Last double-click gap</div>
      <div class="text-sm font-mono">{doubleClickGap} ms</div>
    </div>
    <div class="bg-(--color-bg-alt) p-3 flex items-center justify-between">
      <label class="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" bind:checked={showTrail} class="accent-(--color-accent)" />
        Trail
      </label>
      <button onclick={reset} class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg)">Reset</button>
    </div>
  </div>

  <div class="flex flex-1 min-h-0">
    <!-- Test area -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={area}
      class="flex-1 relative bg-(--color-bg-alt) overflow-hidden cursor-crosshair select-none"
      onpointermove={handleMove}
      onpointerdown={handleDown}
      onpointerup={handleUp}
      onclick={handleClick}
      onauxclick={handleAux}
      onwheel={handleWheel}
      oncontextmenu={handleContext}
    >
      <!-- Crosshair -->
      <div class="absolute inset-0 pointer-events-none" style="transform: translate({relX}px, {relY}px); transition: none;">
        <div class="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-(--color-accent)"></div>
      </div>

      <!-- Trail -->
      {#each trail as p, i}
        <div
          class="absolute w-2 h-2 rounded-full bg-(--color-accent) pointer-events-none"
          style="left: {p.x}px; top: {p.y}px; opacity: {(i / trail.length) * 0.6}; transform: translate(-50%, -50%);"
        ></div>
      {/each}

      <!-- Click markers -->
      {#each clickHistory as c}
        <div
          class="absolute pointer-events-none rounded-full"
          style="left: {c.x}px; top: {c.y}px; width: 12px; height: 12px; transform: translate(-50%, -50%); background: {c.button === 0 ? '#22c55e' : c.button === 2 ? '#ef4444' : c.button === 1 ? '#eab308' : '#3b82f6'}; opacity: 0.7;"
        ></div>
      {/each}

      <div class="absolute top-3 left-3 text-xs text-(--color-text-light) pointer-events-none">
        Move, click, scroll, and right-click here.
      </div>
    </div>

    <!-- Sidebar -->
    <div class="w-80 border-l border-(--color-border) bg-(--color-bg-alt) flex flex-col overflow-hidden">
      <!-- Buttons -->
      <div class="p-3 border-b border-(--color-border)">
        <h3 class="text-sm font-medium mb-2">Buttons</h3>
        <div class="space-y-1">
          {#each buttons as b, i}
            <div class="flex items-center justify-between text-xs">
              <span class="flex items-center gap-2">
                <span class="inline-block w-3 h-3 rounded-sm {b.pressed ? 'bg-(--color-accent)' : 'bg-(--color-border)'}"></span>
                {btnNames[i]}
              </span>
              <span class="font-mono text-(--color-text-light)">{b.clicks} clicks</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Scroll -->
      <div class="p-3 border-b border-(--color-border)">
        <h3 class="text-sm font-medium mb-2">Scroll</h3>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div><span class="text-(--color-text-light)">ΔY:</span> <span class="font-mono">{scrollDeltaY.toFixed(1)}</span></div>
          <div><span class="text-(--color-text-light)">ΔX:</span> <span class="font-mono">{scrollDeltaX.toFixed(1)}</span></div>
          <div><span class="text-(--color-text-light)">Total Y:</span> <span class="font-mono">{totalScrollY.toFixed(0)}</span></div>
          <div><span class="text-(--color-text-light)">Total X:</span> <span class="font-mono">{totalScrollX.toFixed(0)}</span></div>
          <div class="col-span-2"><span class="text-(--color-text-light)">Events:</span> <span class="font-mono">{scrollEvents}</span></div>
        </div>
      </div>

      <!-- Log -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="px-3 py-2 border-b border-(--color-border) flex items-center justify-between">
          <h3 class="text-sm font-medium">Event Log</h3>
          <button onclick={() => (log = [])} class="text-xs text-(--color-text-light) hover:text-(--color-text)">Clear</button>
        </div>
        <div class="flex-1 overflow-auto p-2 font-mono text-[11px] space-y-0.5">
          {#each log as line}<div>{line}</div>{/each}
          {#if log.length === 0}<div class="text-(--color-text-light)">No events yet</div>{/if}
        </div>
      </div>
    </div>
  </div>
</div>
