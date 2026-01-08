<script lang="ts">
  interface TouchPoint {
    id: number;
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
    force: number;
    color: string;
  }

  let touches = $state<TouchPoint[]>([]);
  let maxTouches = $state(0);
  let isFullscreen = $state(false);
  let touchArea: HTMLDivElement | null = $state(null);
  let showTrails = $state(true);
  let trails = $state<{ x: number; y: number; color: string; opacity: number }[]>([]);

  // Color palette for touch points
  const colors = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#f43f5e", // rose
    "#14b8a6", // teal
  ];

  function getColor(id: number): string {
    return colors[id % colors.length];
  }

  function getRelativePosition(touch: Touch, element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  function handleTouchStart(event: TouchEvent) {
    event.preventDefault();
    updateTouches(event.touches);
  }

  function handleTouchMove(event: TouchEvent) {
    event.preventDefault();
    updateTouches(event.touches);
  }

  function handleTouchEnd(event: TouchEvent) {
    event.preventDefault();
    updateTouches(event.touches);
  }

  function handleTouchCancel(event: TouchEvent) {
    event.preventDefault();
    updateTouches(event.touches);
  }

  function updateTouches(touchList: TouchList) {
    if (!touchArea) return;

    const newTouches: TouchPoint[] = [];
    
    for (let i = 0; i < touchList.length; i++) {
      const touch = touchList[i];
      const pos = getRelativePosition(touch, touchArea);
      const color = getColor(touch.identifier);
      
      newTouches.push({
        id: touch.identifier,
        x: pos.x,
        y: pos.y,
        radiusX: touch.radiusX || 20,
        radiusY: touch.radiusY || 20,
        force: touch.force || 0,
        color,
      });

      // Add to trails if enabled
      if (showTrails) {
        trails = [...trails.slice(-200), { x: pos.x, y: pos.y, color, opacity: 0.6 }];
      }
    }

    touches = newTouches;

    if (newTouches.length > maxTouches) {
      maxTouches = newTouches.length;
    }
  }

  function clearTrails() {
    trails = [];
  }

  function resetMaxTouches() {
    maxTouches = 0;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      touchArea?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  // Fade trails over time
  $effect(() => {
    if (!showTrails || trails.length === 0) return;

    const interval = setInterval(() => {
      trails = trails
        .map((t) => ({ ...t, opacity: t.opacity - 0.02 }))
        .filter((t) => t.opacity > 0);
    }, 50);

    return () => clearInterval(interval);
  });

  // Listen for fullscreen changes
  $effect(() => {
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Test multi-touch support on your device. Touch the area below with multiple fingers to see how many simultaneous touch points are detected.
    </p>
  </header>

  <!-- Stats and Controls -->
  <div class="flex flex-wrap items-center gap-4 mb-4">
    <div class="flex items-center gap-6">
      <div class="text-center">
        <div class="text-3xl font-mono font-bold text-(--color-accent)">{touches.length}</div>
        <div class="text-xs text-(--color-text-muted)">Current</div>
      </div>
      <div class="text-center">
        <div class="text-3xl font-mono font-bold text-(--color-text)">{maxTouches}</div>
        <div class="text-xs text-(--color-text-muted)">Max Detected</div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 ml-auto">
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showTrails}
          class="w-4 h-4 accent-(--color-accent)"
        />
        Show Trails
      </label>
      <button
        onclick={clearTrails}
        class="px-3 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover) transition-colors text-sm"
      >
        Clear Trails
      </button>
      <button
        onclick={resetMaxTouches}
        class="px-3 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover) transition-colors text-sm"
      >
        Reset Max
      </button>
      <button
        onclick={toggleFullscreen}
        class="px-3 py-1.5 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors text-sm font-medium"
      >
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
    </div>
  </div>

  <!-- Touch Area -->
  <div
    bind:this={touchArea}
    class="flex-1 min-h-[400px] border-2 border-dashed border-(--color-border) bg-(--color-bg-alt) relative overflow-hidden touch-none select-none"
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchCancel}
    role="application"
    aria-label="Multi-touch test area"
  >
    <!-- Instructions overlay when no touches -->
    {#if touches.length === 0}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="text-center text-(--color-text-muted)">
          <div class="text-4xl mb-2">👆</div>
          <div class="text-lg">Touch here with multiple fingers</div>
          <div class="text-sm mt-1">to test multi-touch support</div>
        </div>
      </div>
    {/if}

    <!-- Trail dots -->
    {#each trails as trail}
      <div
        class="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style="left: {trail.x}px; top: {trail.y}px; background-color: {trail.color}; opacity: {trail.opacity};"
      ></div>
    {/each}

    <!-- Touch points -->
    {#each touches as touch (touch.id)}
      <div
        class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
        style="left: {touch.x}px; top: {touch.y}px;"
      >
        <!-- Outer ring showing touch radius -->
        <div
          class="absolute border-2 rounded-full opacity-30"
          style="width: {Math.max(touch.radiusX * 2, 40)}px; height: {Math.max(touch.radiusY * 2, 40)}px; border-color: {touch.color}; background-color: {touch.color};"
        ></div>
        <!-- Center point -->
        <div
          class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg"
          style="background-color: {touch.color};"
        >
          {touch.id + 1}
        </div>
      </div>
    {/each}

    <!-- Fullscreen exit hint -->
    {#if isFullscreen}
      <div class="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-(--color-text-muted) bg-(--color-bg)/80 px-3 py-1 rounded">
        Press ESC to exit fullscreen
      </div>
    {/if}
  </div>

  <!-- Touch Details Table -->
  {#if touches.length > 0}
    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-(--color-border)">
            <th class="text-left py-2 px-3 text-(--color-text-muted) font-medium">#</th>
            <th class="text-left py-2 px-3 text-(--color-text-muted) font-medium">Position</th>
            <th class="text-left py-2 px-3 text-(--color-text-muted) font-medium">Radius</th>
            <th class="text-left py-2 px-3 text-(--color-text-muted) font-medium">Force</th>
          </tr>
        </thead>
        <tbody>
          {#each touches as touch (touch.id)}
            <tr class="border-b border-(--color-border)">
              <td class="py-2 px-3">
                <span
                  class="inline-flex w-6 h-6 items-center justify-center rounded-full text-white text-xs font-bold"
                  style="background-color: {touch.color};"
                >
                  {touch.id + 1}
                </span>
              </td>
              <td class="py-2 px-3 font-mono">
                {Math.round(touch.x)}, {Math.round(touch.y)}
              </td>
              <td class="py-2 px-3 font-mono">
                {touch.radiusX.toFixed(1)} x {touch.radiusY.toFixed(1)}
              </td>
              <td class="py-2 px-3">
                <div class="flex items-center gap-2">
                  <div class="w-20 h-2 bg-(--color-border) rounded overflow-hidden">
                    <div
                      class="h-full rounded"
                      style="width: {touch.force * 100}%; background-color: {touch.color};"
                    ></div>
                  </div>
                  <span class="font-mono text-xs">{touch.force.toFixed(2)}</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
