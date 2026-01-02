<script lang="ts">
  import { random } from "../../lib/random";

  interface Winner {
    name: string;
    prize: string | null;
    timestamp: Date;
  }

  // Input state
  let namesInput = $state("");
  let prizesInput = $state("");

  // Store original inputs for reset
  let originalNamesInput = $state("");
  let originalPrizesInput = $state("");

  // Parsed lists
  let names = $derived(
    namesInput
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
  );

  let prizes = $derived(
    prizesInput
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  );

  // Wheel state
  let isSpinning = $state(false);
  let rotation = $state(0);
  let selectedName = $state<string | null>(null);
  let currentPrize = $derived(
    prizes.length > 0 ? prizes[prizes.length - 1] : null
  );

  // Winners history
  let winners = $state<Winner[]>([]);

  // Canvas element and container for responsive sizing
  let canvas: HTMLCanvasElement | null = $state(null);
  let canvasContainer: HTMLDivElement | null = $state(null);
  let canvasWidth = $state(580);
  let canvasHeight = $state(400);
  
  // Offscreen canvas for cached wheel (to avoid redrawing segments during spin)
  let wheelCacheCanvas: HTMLCanvasElement | null = $state(null);

  // Colors for wheel segments
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FFEAA7",
    "#DDA0DD",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E9",
    "#F8B500",
    "#FF6F61",
    "#6B5B95",
    "#88B04B",
    "#F7CAC9",
    "#92A8D1",
    "#955251",
    "#B565A7",
    "#009B77",
    "#DD4124",
  ];

  // Draw wheel to cache (static parts only - segments and text)
  const drawWheelToCache = () => {
    if (!canvas || names.length === 0) return;

    // Create or resize cache canvas
    if (!wheelCacheCanvas || wheelCacheCanvas.width !== canvasWidth || wheelCacheCanvas.height !== canvasHeight) {
      wheelCacheCanvas = document.createElement('canvas');
      wheelCacheCanvas.width = canvasWidth;
      wheelCacheCanvas.height = canvasHeight;
    }

    const ctx = wheelCacheCanvas.getContext("2d");
    if (!ctx) return;

    // Calculate dimensions based on canvas size
    const magnifierSpace = 190;
    const wheelSize = Math.min(canvasWidth - magnifierSpace, canvasHeight);
    const centerX = (canvasWidth - magnifierSpace) / 2;
    const centerY = canvasHeight / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, wheelCacheCanvas.width, wheelCacheCanvas.height);

    const sliceAngle = (2 * Math.PI) / names.length;

    names.forEach((name, i) => {
      const startAngle = i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#000000";
      ctx.font = `${Math.max(12, Math.min(18, 200 / names.length))}px system-ui`;
      ctx.fillText(
        name.length > 12 ? name.slice(0, 12) + "..." : name,
        radius - 15,
        5
      );
      ctx.restore();
    });
  };

  // Draw wheel (rotates cached wheel and draws magnifier)
  const drawWheel = () => {
    if (!canvas || names.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Calculate dimensions based on canvas size
    // Magnifier needs ~190px on the right (160px width + 30px gap)
    const magnifierSpace = 190;
    const wheelSize = Math.min(canvasWidth - magnifierSpace, canvasHeight);
    const centerX = (canvasWidth - magnifierSpace) / 2;
    const centerY = canvasHeight / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw rotated cached wheel
    if (wheelCacheCanvas) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
      ctx.drawImage(wheelCacheCanvas, 0, 0);
      ctx.restore();
    }

     // Draw pointer triangle on the right side, fixed (not rotating)
     ctx.beginPath();
     ctx.moveTo(centerX + radius - 5, centerY);
     ctx.lineTo(centerX + radius + 20, centerY - 15);
     ctx.lineTo(centerX + radius + 20, centerY + 15);
     ctx.closePath();
     ctx.fillStyle = "#ffffff";
     ctx.fill();
     ctx.strokeStyle = "#000000";
     ctx.lineWidth = 2;
     ctx.stroke();

    // Calculate current segment at pointer (right side = 0 degrees)
    // Canvas rotation: positive angle = counter-clockwise
    // When rotation increases, wheel rotates counter-clockwise, segment 0 moves UP
    // The segment at pointer: pointer sees segment that was at angle (360 - rotation) in original wheel
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const sliceDegrees = 360 / names.length;

    // Which segment is at the pointer (right side = 0 degrees)
    const pointerAngle = (360 - normalizedRotation) % 360;
    const currentIndex = Math.floor(pointerAngle / sliceDegrees) % names.length;

    // How far through this segment (0 = start of segment, 1 = end of segment)
    const segmentProgress = 1 - (pointerAngle % sliceDegrees) / sliceDegrees;

    // Zoomed magnifier area settings - right side of wheel, straight
    // Scale magnifier based on wheel size
    const scale = Math.min(1, wheelSize / 300);
    const rowHeight = Math.round(42 * scale);
    const visibleRows = 7;
    const halfVisible = Math.floor(visibleRows / 2);
    const magWidth = Math.round(160 * scale);
    const magHeight = rowHeight * visibleRows;

    // Calculate actual wheel center (wheel may not fill full canvas height)
    const wheelHeight = wheelSize;
    const wheelCenterY = (canvasHeight - wheelHeight) / 2 + wheelHeight / 2;

    // Position on the right side of the wheel
    const magX = centerX + radius + 25;
    const magY = wheelCenterY - magHeight / 2;

    ctx.save();

    // Clip to rounded rectangle shape
    ctx.beginPath();
    ctx.roundRect(magX, magY, magWidth, magHeight, 8);
    ctx.clip();

    // Draw background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(magX - 5, magY - 5, magWidth + 10, magHeight + 10);

    // Draw segments in magnifier
     // Wheel rotates counter-clockwise (positive rotation), so segments move UP past pointer
     // In magnifier: as segmentProgress increases, current segment should move UP (scroll up)
     // Next segment (currentIndex + 1) comes from below
     const magCenterY = wheelCenterY + rowHeight / 2;

     for (let i = -halfVisible - 1; i <= halfVisible + 1; i++) {
       // i=0 is current segment (at center when segmentProgress=0)
       // i>0 means segments above (previous segments, lower indices)
       // i<0 means segments below (next segments, higher indices)
       const nameIndex = (((currentIndex - i) % names.length) + names.length) % names.length;
       const segmentColor = colors[nameIndex % colors.length];
       const segmentName = names[nameIndex];

       // Position: segment moves up as segmentProgress increases
       const rowY = magCenterY + i * rowHeight - segmentProgress * rowHeight;

      if (rowY > magY - rowHeight && rowY < magY + magHeight + rowHeight) {
        // Draw row background
        ctx.fillStyle = segmentColor;
        ctx.fillRect(
          magX + 2,
          rowY - rowHeight / 2 + 1,
          magWidth - 4,
          rowHeight - 2
        );

        // Draw text
        ctx.fillStyle = "#000000";
        const fontSize = Math.round(14 * scale);
        ctx.font = `${fontSize}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const maxChars = Math.floor(magWidth / (fontSize * 0.6));
        const displayName =
          segmentName.length > maxChars
            ? segmentName.slice(0, maxChars - 2) + ".."
            : segmentName;
        ctx.fillText(displayName, magX + magWidth / 2, rowY);
      }
    }

    ctx.restore();

    // Draw magnifier border
    ctx.beginPath();
    ctx.roundRect(magX, magY, magWidth, magHeight, 8);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw center indicator line (aligned with current name position)
    ctx.beginPath();
    ctx.moveTo(magX, magCenterY - rowHeight / 2);
    ctx.lineTo(magX + magWidth, magCenterY - rowHeight / 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  // Spin the wheel
  const spin = () => {
    if (isSpinning || names.length === 0) return;

    // Save original inputs on first spin
    saveOriginalInputs();

    isSpinning = true;
    selectedName = null;

    const spinDuration = 6000 + random() * 2000; // Longer duration (6-8 seconds)
    const totalRotation = 2160 + random() * 1440; // 6-10 full rotations
    const startRotation = rotation;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / spinDuration, 1);

      // Custom easing: fast start, very long slow ending for excitement
      // Using ease-out with higher power (6) for more dramatic slowdown
      const easeOut = 1 - Math.pow(1 - progress, 6);
      rotation = startRotation + totalRotation * easeOut;

      drawWheel();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        isSpinning = false;
        // Calculate which name was selected (pointer at right = 0 degrees)
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        const sliceAngle = 360 / names.length;
        // Pointer is at right (0 degrees in standard coords)
        const pointerAngle = (360 - normalizedRotation) % 360;
        const selectedIndex =
          Math.floor(pointerAngle / sliceAngle) % names.length;
        selectedName = names[selectedIndex];
      }
    };

    requestAnimationFrame(animate);
  };

  // Add winner to history
  const confirmWinner = () => {
    if (!selectedName) return;

    const winner: Winner = {
      name: selectedName,
      prize: currentPrize,
      timestamp: new Date(),
    };

    winners = [winner, ...winners];

    // Remove from names
    const newNames = namesInput
      .split("\n")
      .filter((n) => n.trim() !== selectedName)
      .join("\n");
    namesInput = newNames;

    // Remove prize from list (bottom one = last in array = biggest prize)
    if (currentPrize) {
      const prizeLines = prizesInput
        .split("\n")
        .filter((p) => p.trim().length > 0);
      prizeLines.pop();
      prizesInput = prizeLines.join("\n");
    }

    selectedName = null;
  };

  // Keep in list (just dismiss selection)
  const keepInList = () => {
    selectedName = null;
  };

  // Clear winners
  const clearWinners = () => {
    winners = [];
  };

  // Reset game to original state
  const resetGame = () => {
    namesInput = originalNamesInput;
    prizesInput = originalPrizesInput;
    winners = [];
    selectedName = null;
    rotation = 0;
  };

  // Save current inputs as the starting point
  const saveAsStart = () => {
    originalNamesInput = namesInput;
    originalPrizesInput = prizesInput;
  };

  // Save original inputs when starting first spin
  const saveOriginalInputs = () => {
    if (winners.length === 0 && originalNamesInput === "") {
      originalNamesInput = namesInput;
      originalPrizesInput = prizesInput;
    }
  };

  // Current name at pointer (for magnifier display)
  let currentNameAtPointer = $state<string | null>(null);
  let currentColorAtPointer = $state<string>("#1a1a1a");

  // Calculate which name is at pointer position (right side = 0 degrees)
  const updateNameAtPointer = () => {
    if (names.length === 0) {
      currentNameAtPointer = null;
      return;
    }
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const sliceAngle = 360 / names.length;
    const pointerAngle = (360 - normalizedRotation) % 360;
    const index = Math.floor(pointerAngle / sliceAngle) % names.length;
    currentNameAtPointer = names[index];
    currentColorAtPointer = colors[index % colors.length];
  };

  // Fullscreen
  let spinContainer: HTMLDivElement | null = $state(null);
  let isFullscreen = $state(false);

  const toggleFullscreen = async () => {
    if (!spinContainer) return;

    try {
      if (!document.fullscreenElement) {
        await spinContainer.requestFullscreen();
        isFullscreen = true;
      } else {
        await document.exitFullscreen();
        isFullscreen = false;
      }
    } catch (e) {
      console.warn("Fullscreen failed:", e);
    }
  };

  // Listen for fullscreen changes
  $effect(() => {
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  });

  // Resize canvas to fit container
  $effect(() => {
    if (!canvasContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvasWidth = width;
          canvasHeight = height;
          if (canvas) {
            canvas.width = width;
            canvas.height = height;
            drawWheelToCache();
            drawWheel();
          }
        }
      }
    });

    resizeObserver.observe(canvasContainer);
    return () => resizeObserver.disconnect();
  });

  // Redraw wheel cache when names change
  $effect(() => {
    names;
    drawWheelToCache();
  });

  // Redraw when rotation changes
  $effect(() => {
    rotation;
    if (!isSpinning) {
      drawWheel();
    }
    updateNameAtPointer();
  });

  // Initial draw
  $effect(() => {
    if (canvas) {
      drawWheelToCache();
      drawWheel();
    }
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Spin the wheel to pick random winners. Add prizes to award from biggest
      to smallest.
    </p>
  </header>

  <!-- Top: Names and Prizes side by side -->
  <div class="flex flex-col sm:flex-row gap-4 mb-4">
    <!-- Names Input -->
    <div class="flex-1 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <label
          for="names-input"
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          Names (one per line)
        </label>
        <button
          onclick={saveAsStart}
          disabled={names.length === 0}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Save current names and prizes as the starting point for reset"
        >
          Save as Start
        </button>
      </div>
      <textarea
        id="names-input"
        bind:value={namesInput}
        placeholder="John&#10;Jane&#10;Alice&#10;Bob"
        rows="5"
        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm font-mono resize-none focus:outline-none focus:border-(--color-accent)"
      ></textarea>
      <div class="text-xs text-(--color-text-muted)">
        {names.length} name{names.length !== 1 ? "s" : ""} in wheel
      </div>
    </div>

    <!-- Prizes Input -->
    <div class="flex-1 flex flex-col gap-2">
      <label
        for="prizes-input"
        class="text-xs tracking-wider text-(--color-text-light) font-medium"
      >
        Prizes (biggest to smallest, one per line)
      </label>
      <textarea
        id="prizes-input"
        bind:value={prizesInput}
        placeholder="Sticker&#10;T-Shirt&#10;Gift Card&#10;Grand Prize"
        rows="5"
        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm font-mono resize-none focus:outline-none focus:border-(--color-accent)"
      ></textarea>
      <div class="text-xs text-(--color-text-muted)">
        {prizes.length} prize{prizes.length !== 1 ? "s" : ""} remaining
        {#if currentPrize}
          <span class="text-(--color-text)"
            >| Next: <strong>{currentPrize}</strong></span
          >
        {/if}
      </div>
    </div>
  </div>

  <hr class="border-t border-(--color-border)" />

  <!-- Bottom: Wheel, Current Selection, Winners -->
  <div
    bind:this={spinContainer}
    class="flex-1 flex flex-col lg:flex-row gap-4 {isFullscreen
      ? 'bg-(--color-bg) p-4'
      : ''}"
  >
    <div class="flex-1 flex flex-col">
      <div
        class="flex gap-2 items-center border-b border-(--color-border) py-2 mb-2"
      >
        <button
          onclick={spin}
          disabled={isSpinning || names.length === 0}
          class="px-8 py-1 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSpinning ? "Spinning..." : "SPIN"}
        </button>

        <button
          onclick={toggleFullscreen}
          class="px-3 py-1 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {#if isFullscreen}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="4 14 4 20 10 20"></polyline><polyline
                points="20 10 20 4 14 4"
              ></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line
                x1="3"
                y1="21"
                x2="10"
                y2="14"
              ></line></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="15 3 21 3 21 9"></polyline><polyline
                points="9 21 3 21 3 15"
              ></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line
                x1="3"
                y1="21"
                x2="10"
                y2="14"
              ></line></svg
            >
          {/if}
        </button>

        <input
          type="range"
          min="0"
          max="360"
          step="1"
          bind:value={rotation}
          disabled={isSpinning}
          class="flex-1 h-2 bg-(--color-bg-alt) rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Manual rotation for testing ({rotation}°)"
        />

        <span class="text-xs text-(--color-text-muted) w-12 text-right">
          {Math.round(rotation % 360)}°
        </span>

        <div class="flex-1 flex gap-3 justify-end items-center text-xs text-(--color-text-muted) font-mono">
          <span>names: {names.length.toString().padStart(2, '0')}</span>
          <span>prizes: {prizes.length.toString().padStart(2, '0')}</span>
        </div>
      </div>
      <!-- Wheel -->
      <div
        class="flex-1 flex flex-col items-center justify-center min-h-80 {isFullscreen
          ? ''
          : ''}"
      >
        {#if names.length === 0}
          <div class="text-(--color-text-muted) text-center">
            <p class="text-lg mb-2">Add names to spin the wheel</p>
            <p class="text-sm">Enter names in the input above</p>
          </div>
        {:else}
          <div
            bind:this={canvasContainer}
            class="relative w-full flex-1"
          >
            <canvas
              bind:this={canvas}
              width={canvasWidth}
              height={canvasHeight}
              class="absolute inset-0"
            ></canvas>

            {#if currentPrize && !selectedName}
              <div
                class="absolute top-2 right-4 px-4 py-2 bg-(--color-accent) text-(--color-btn-text) font-medium"
                style="font-size: {Math.max(14, canvasWidth / 40)}px;"
              >
                Prize: {currentPrize}
              </div>
            {/if}
          </div>

          <!-- Winner Modal -->
          {#if selectedName && !isSpinning}
            <div
              class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            >
              <div
                class="bg-(--color-bg) border border-(--color-border) p-8 max-w-md w-full mx-4 text-center"
              >
                <h2 class="text-2xl font-bold text-(--color-text) mb-2">
                  🎉 Winner!
                </h2>
                <p class="text-3xl font-bold text-(--color-accent) mb-2">
                  {selectedName}
                </p>
                {#if currentPrize}
                  <p class="text-lg text-(--color-text-muted) mb-6">
                    Wins: <span class="text-(--color-text) font-medium"
                      >{currentPrize}</span
                    >
                  </p>
                {:else}
                  <div class="mb-6"></div>
                {/if}

                <div class="flex gap-3 justify-center">
                  <button
                    onclick={confirmWinner}
                    class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors"
                  >
                    Remove from list
                  </button>
                  <button
                    onclick={keepInList}
                    class="px-6 py-2 border border-(--color-border) text-(--color-text) font-medium hover:bg-(--color-bg-alt) transition-colors"
                  >
                    Keep in list
                  </button>
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Right side: Current Selection + Winners -->
    <div class="w-full lg:w-72 shrink-0 flex flex-col gap-4">
      <!-- Current Selection -->
      <div class="flex flex-col gap-2">
        <label
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          Current Selection
        </label>
        <div
          class="relative border-2 overflow-hidden transition-all duration-100"
          style="border-color: {isSpinning
            ? currentColorAtPointer
            : 'var(--color-border)'}; background-color: {isSpinning
            ? currentColorAtPointer + '22'
            : 'var(--color-bg-alt)'};"
        >
          <div class="p-4 text-center">
            {#if isSpinning}
              <div
                class="text-2xl font-bold truncate transition-all duration-100"
                style="color: {currentColorAtPointer};"
              >
                {currentNameAtPointer ?? "-"}
              </div>
              <div class="text-xs text-(--color-text-muted) mt-1 animate-pulse">
                Spinning...
              </div>
            {:else}
              <div
                class="text-2xl font-bold truncate text-(--color-text-muted)"
              >
                {currentNameAtPointer ?? "-"}
              </div>
              <div class="text-xs text-(--color-text-muted) mt-1">
                Ready to spin
              </div>
            {/if}
          </div>

          <!-- Pointer indicator on right side - only when spinning -->
          {#if isSpinning}
            <div
              class="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0"
              style="border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-right: 8px solid {currentColorAtPointer};"
            ></div>
          {/if}
        </div>
      </div>

      <!-- Winners History -->
      <div class="flex-1 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <label
            class="text-xs tracking-wider text-(--color-text-light) font-medium"
          >
            Winners ({winners.length})
          </label>
          {#if winners.length > 0}
            <button
              onclick={clearWinners}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          {/if}
        </div>

        <div
          class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-y-auto min-h-[100px]"
        >
          {#if winners.length === 0}
            <div class="p-4 text-sm text-(--color-text-muted) text-center">
              No winners yet
            </div>
          {:else}
            <div class="divide-y divide-(--color-border)">
              {#each winners as winner, i}
                <div class="p-3 flex items-start gap-3">
                  <div
                    class="w-6 h-6 flex items-center justify-center bg-(--color-accent) text-(--color-btn-text) text-xs font-bold shrink-0"
                  >
                    {winners.length - i}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-(--color-text) truncate">
                      {winner.name}
                    </div>
                    {#if winner.prize}
                      <div class="text-sm text-(--color-text-muted) truncate">
                        {winner.prize}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Reset Button -->
        <button
          onclick={resetGame}
          class="w-full mt-2 px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
        >
          Reset Game
        </button>
      </div>
    </div>
  </div>
</div>
