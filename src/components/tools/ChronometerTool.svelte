<script lang="ts">
  import { onMount } from "svelte";

  interface Lap {
    id: number;
    time: number;
    delta: number;
  }

  // Timer state
  let elapsedMs = $state(0);
  let isRunning = $state(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTickTime = $state(0);

  // Lap tracking
  let laps = $state<Lap[]>([]);
  let lapCounter = $state(0);

  // Display formatting
  const formatTime = (ms: number, showMs: boolean = true): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    if (hours > 0) {
      if (showMs) {
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
      }
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    if (showMs) {
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatLapTime = (ms: number): string => {
    return formatTime(ms, true);
  };

  // Derived display values
  let displayMinutes = $derived(
    Math.floor((elapsedMs / 1000 / 60) % 60)
      .toString()
      .padStart(2, "0"),
  );
  let displaySeconds = $derived(
    Math.floor((elapsedMs / 1000) % 60)
      .toString()
      .padStart(2, "0"),
  );
  let displayMilliseconds = $derived(
    Math.floor((elapsedMs % 1000) / 10)
      .toString()
      .padStart(2, "0"),
  );
  let displayHours = $derived(
    Math.floor(elapsedMs / 1000 / 3600)
      .toString()
      .padStart(2, "0"),
  );
  let hasHours = $derived(elapsedMs >= 3600000);

  // Progress for the circular indicator (resets every minute)
  let secondsProgress = $derived((elapsedMs % 60000) / 60000);
  let millisProgress = $derived((elapsedMs % 1000) / 1000);

  // Control functions
  const handleStart = () => {
    if (isRunning) return;

    isRunning = true;
    lastTickTime = Date.now();

    intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickTime;
      lastTickTime = now;
      elapsedMs += elapsed;
    }, 10);
  };

  const handlePause = () => {
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const handleReset = () => {
    isRunning = false;
    elapsedMs = 0;
    laps = [];
    lapCounter = 0;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const handleLap = () => {
    if (!isRunning && elapsedMs === 0) return;

    lapCounter++;
    const previousLapTime = laps.length > 0 ? laps[0].time : 0;
    const delta = elapsedMs - previousLapTime;

    laps = [
      {
        id: lapCounter,
        time: elapsedMs,
        delta: delta,
      },
      ...laps,
    ];
  };

  const clearLaps = () => {
    laps = [];
    lapCounter = 0;
  };

  // Find best and worst lap deltas
  let bestLapId = $derived(() => {
    if (laps.length < 2) return -1;
    let bestId = -1;
    let bestDelta = Infinity;
    for (const lap of laps) {
      if (lap.delta < bestDelta && lap.delta > 0) {
        bestDelta = lap.delta;
        bestId = lap.id;
      }
    }
    return bestId;
  });

  let worstLapId = $derived(() => {
    if (laps.length < 2) return -1;
    let worstId = -1;
    let worstDelta = -Infinity;
    for (const lap of laps) {
      if (lap.delta > worstDelta) {
        worstDelta = lap.delta;
        worstId = lap.id;
      }
    }
    return worstId;
  });

  // Keyboard shortcuts
  const handleKeydown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      if (isRunning) {
        handlePause();
      } else {
        handleStart();
      }
    } else if (e.code === "KeyL" && (isRunning || elapsedMs > 0)) {
      e.preventDefault();
      handleLap();
    } else if (e.code === "KeyR" && !isRunning) {
      e.preventDefault();
      handleReset();
    }
  };

  // Setup keyboard listener
  onMount(() => {
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  });

  // SVG circle calculations
  const circleRadius = 140;
  const circleCircumference = 2 * Math.PI * circleRadius;
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Press <kbd
        class="px-1.5 py-0.5 text-xs bg-(--color-bg-alt) border border-(--color-border)"
        >Space</kbd
      >
      to start/stop,
      <kbd
        class="px-1.5 py-0.5 text-xs bg-(--color-bg-alt) border border-(--color-border)"
        >L</kbd
      >
      for lap,
      <kbd
        class="px-1.5 py-0.5 text-xs bg-(--color-bg-alt) border border-(--color-border)"
        >R</kbd
      > to reset.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Main Timer Display -->
    <div class="flex-1 flex flex-col items-center justify-center">
      <!-- Circular Timer Display -->
      <div class="relative">
        <!-- SVG Circular Progress -->
        <svg
          class="w-72 h-72 md:w-80 md:h-80 lg:w-96 lg:h-96 xl:w-[28rem] xl:h-[28rem] 2xl:w-[32rem] 2xl:h-[32rem] transform -rotate-90"
          viewBox="0 0 320 320"
        >
          <!-- Glow filter for running state -->
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- Background track (outer) -->
          <circle
            cx="160"
            cy="160"
            r={circleRadius}
            fill="none"
            stroke="var(--color-border)"
            stroke-width="6"
            opacity="0.3"
          />

          <!-- Background track (inner) -->
          <circle
            cx="160"
            cy="160"
            r={circleRadius - 20}
            fill="none"
            stroke="var(--color-border)"
            stroke-width="3"
            opacity="0.2"
          />

          <!-- Progress circle (seconds/minutes) -->
          <circle
            cx="160"
            cy="160"
            r={circleRadius}
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="6"
            stroke-linecap="round"
            stroke-dasharray={circleCircumference}
            stroke-dashoffset={circleCircumference * (1 - secondsProgress)}
            filter={isRunning ? "url(#glow)" : ""}
            class="transition-none"
          />

          <!-- Inner progress circle (milliseconds) -->
          <circle
            cx="160"
            cy="160"
            r={circleRadius - 20}
            fill="none"
            stroke="var(--color-text-muted)"
            stroke-width="3"
            stroke-linecap="round"
            stroke-dasharray={2 * Math.PI * (circleRadius - 20)}
            stroke-dashoffset={2 *
              Math.PI *
              (circleRadius - 20) *
              (1 - millisProgress)}
            opacity="0.4"
            class="transition-none"
          />

          <!-- Tick marks -->
          {#each Array(60) as _, i}
            {@const angle = (i / 60) * 360}
            {@const isMainTick = i % 5 === 0}
            {@const innerR = isMainTick ? circleRadius + 8 : circleRadius + 5}
            {@const outerR = circleRadius + 12}
            <line
              x1={160 + innerR * Math.cos(((angle - 90) * Math.PI) / 180)}
              y1={160 + innerR * Math.sin(((angle - 90) * Math.PI) / 180)}
              x2={160 + outerR * Math.cos(((angle - 90) * Math.PI) / 180)}
              y2={160 + outerR * Math.sin(((angle - 90) * Math.PI) / 180)}
              stroke="var(--color-text-muted)"
              stroke-width={isMainTick ? 2 : 1}
              opacity={isMainTick ? 0.5 : 0.2}
            />
          {/each}
        </svg>

        <!-- Time Display (centered in circle) -->
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <!-- Main time display -->
          <div class="flex items-baseline gap-0.5">
            {#if hasHours}
              <span
                class="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-mono font-bold text-(--color-text) tabular-nums tracking-tight"
              >
                {displayHours}
              </span>
              <span
                class="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-mono text-(--color-text-muted)"
                >:</span
              >
            {/if}
            <span
              class="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-mono font-bold text-(--color-text) tabular-nums tracking-tight"
            >
              {displayMinutes}
            </span>
            <span
              class="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-mono text-(--color-text-muted)"
              >:</span
            >
            <span
              class="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-mono font-bold text-(--color-text) tabular-nums tracking-tight"
            >
              {displaySeconds}
            </span>
            <span
              class="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-mono text-(--color-text-muted) ml-1"
              >.</span
            >
            <span
              class="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-mono text-(--color-text-muted) tabular-nums w-8 lg:w-10 xl:w-14"
            >
              {displayMilliseconds}
            </span>
          </div>

          <!-- Current lap indicator -->
          {#if laps.length > 0}
            <div
              class="mt-2 lg:mt-3 xl:mt-4 px-3 lg:px-4 py-1 lg:py-1.5 border border-(--color-border) rounded-full"
            >
              <span class="text-xs lg:text-sm text-(--color-text-muted)"
                >Lap {laps.length + 1}</span
              >
              <span
                class="text-xs lg:text-sm text-(--color-text) font-mono ml-2"
              >
                {formatLapTime(elapsedMs - laps[0].time)}
              </span>
            </div>
          {/if}

          <!-- Status -->
          <div class="mt-3 lg:mt-4 flex items-center gap-2">
            <div
              class="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full transition-colors {isRunning
                ? 'bg-green-500'
                : elapsedMs > 0
                  ? 'bg-yellow-500'
                  : 'bg-(--color-border)'}"
              class:animate-pulse={isRunning}
            ></div>
            <span
              class="text-xs lg:text-sm uppercase tracking-widest text-(--color-text-muted)"
            >
              {isRunning ? "Running" : elapsedMs > 0 ? "Paused" : "Ready"}
            </span>
          </div>
        </div>
      </div>

      <!-- Control Buttons -->
      <div class="flex gap-3 lg:gap-4 mt-6 lg:mt-8">
        <button
          onclick={handleReset}
          disabled={elapsedMs === 0}
          class="flex items-center gap-2 px-4 lg:px-6 py-2 lg:py-2.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm lg:text-base font-medium hover:border-(--color-text-muted) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg
            class="w-4 h-4 lg:w-5 lg:h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Reset
        </button>

        {#if !isRunning}
          <button
            onclick={handleStart}
            class="flex items-center gap-2 px-4 lg:px-6 py-2 lg:py-2.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm lg:text-base font-medium hover:border-(--color-text-muted) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              class="w-4 h-4 lg:w-5 lg:h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            {elapsedMs === 0 ? "Start " : "Resume"}
          </button>
        {:else}
          <button
            onclick={handlePause}
            class="flex items-center gap-2 px-4 lg:px-6 py-2 lg:py-2.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm lg:text-base font-medium hover:border-(--color-text-muted) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              class="w-4 h-4 lg:w-5 lg:h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            Pause
          </button>
        {/if}

        <button
          onclick={handleLap}
          disabled={!isRunning && elapsedMs === 0}
          class="flex items-center gap-2 px-4 lg:px-6 py-2 lg:py-2.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm lg:text-base font-medium hover:border-(--color-text-muted) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg
            class="w-4 h-4 lg:w-5 lg:h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 22h14" />
            <path d="M5 2h14" />
            <path
              d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"
            />
            <path
              d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"
            />
          </svg>
          Lap
        </button>
      </div>
    </div>

    <!-- Lap Times Panel -->
    <div class="flex-1 flex flex-col min-w-0 lg:max-w-sm">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          Lap Times ({laps.length})
        </span>
        {#if laps.length > 0}
          <button
            onclick={clearLaps}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        {/if}
      </div>

      <div
        class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-hidden"
      >
        {#if laps.length === 0}
          <div
            class="h-full min-h-[200px] flex flex-col items-center justify-center p-8 text-center"
          >
            <p class="text-sm text-(--color-text-muted)">No laps recorded</p>
            <p class="text-xs text-(--color-text-muted) mt-1">
              Press Lap or <kbd
                class="px-1 py-0.5 bg-(--color-bg) border border-(--color-border) text-xs"
                >L</kbd
              > to record
            </p>
          </div>
        {:else}
          <div class="max-h-[300px] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-(--color-bg) sticky top-0">
                <tr
                  class="text-xs text-(--color-text-muted) uppercase tracking-wider"
                >
                  <th class="py-2 px-3 text-left font-medium">Lap</th>
                  <th class="py-2 px-3 text-right font-medium">Split</th>
                  <th class="py-2 px-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {#each laps as lap (lap.id)}
                  {@const isBest = bestLapId() === lap.id && laps.length >= 2}
                  {@const isWorst = worstLapId() === lap.id && laps.length >= 2}
                  <tr
                    class="border-t border-(--color-border) {isBest
                      ? 'bg-green-500/10'
                      : isWorst
                        ? 'bg-red-500/10'
                        : ''}"
                  >
                    <td class="py-2 px-3 font-medium text-(--color-text)">
                      #{lap.id}
                      {#if isBest}
                        <span class="ml-1 text-green-500 text-xs">Best</span>
                      {:else if isWorst}
                        <span class="ml-1 text-red-500 text-xs">Slow</span>
                      {/if}
                    </td>
                    <td
                      class="py-2 px-3 text-right font-mono text-(--color-text-muted) tabular-nums"
                    >
                      {formatLapTime(lap.delta)}
                    </td>
                    <td
                      class="py-2 px-3 text-right font-mono text-(--color-text) tabular-nums"
                    >
                      {formatLapTime(lap.time)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- Statistics Panel -->
      {#if laps.length >= 2}
        <div
          class="mt-4 p-4 border border-(--color-border) bg-(--color-bg-alt)"
        >
          <div
            class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
          >
            Statistics
          </div>
          <div class="grid grid-cols-4 gap-4 text-sm">
            <div>
              <div class="text-xs text-(--color-text-muted)">Average</div>
              <div class="font-mono text-(--color-text) tabular-nums">
                {formatLapTime(
                  laps.reduce((sum, lap) => sum + lap.delta, 0) / laps.length,
                )}
              </div>
            </div>
            <div>
              <div class="text-xs text-(--color-text-muted)">Total</div>
              <div class="font-mono text-(--color-text)">{laps.length}</div>
            </div>
            <div>
              <div class="text-xs text-(--color-text-muted)">Best</div>
              <div class="font-mono text-green-500 tabular-nums">
                {formatLapTime(Math.min(...laps.map((l) => l.delta)))}
              </div>
            </div>
            <div>
              <div class="text-xs text-(--color-text-muted)">Worst</div>
              <div class="font-mono text-red-500 tabular-nums">
                {formatLapTime(Math.max(...laps.map((l) => l.delta)))}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
