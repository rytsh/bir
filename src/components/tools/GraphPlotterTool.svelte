<script lang="ts">
  import { compile } from "mathjs/number";
  import type { EvalFunction } from "mathjs";

  interface PlotFunction {
    id: number;
    expression: string;
    color: string;
    visible: boolean;
    showDerivative: boolean;
    error: string | null;
    compiled: EvalFunction | null;
  }

  interface Viewport {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  }

  interface CursorInfo {
    canvasX: number;
    canvasY: number;
    mathX: number;
    mathY: number;
    snappedY: number | null;
    snappedFnIndex: number | null;
  }

  const COLORS = [
    "#3b82f6", // blue
    "#ef4444", // red
    "#22c55e", // green
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
  ];

  const DERIVATIVE_COLORS = [
    "#93c5fd", // light blue
    "#fca5a5", // light red
    "#86efac", // light green
    "#fcd34d", // light amber
    "#c4b5fd", // light violet
    "#f9a8d4", // light pink
    "#67e8f9", // light cyan
    "#fdba74", // light orange
  ];

  const PRESETS: { name: string; expression: string }[] = [
    { name: "Parabola", expression: "x^2" },
    { name: "Sine", expression: "sin(x)" },
    { name: "Cosine", expression: "cos(x)" },
    { name: "Tangent", expression: "tan(x)" },
    { name: "Exponential", expression: "e^x" },
    { name: "Logarithm", expression: "log(x)" },
    { name: "Square Root", expression: "sqrt(x)" },
    { name: "Reciprocal", expression: "1/x" },
    { name: "Sinc", expression: "sin(x)/x" },
    { name: "Cubic", expression: "x^3 - 3x" },
    { name: "Absolute", expression: "abs(x)" },
    { name: "Gaussian", expression: "e^(-x^2)" },
  ];

  let nextId = $state(2);
  let functions = $state<PlotFunction[]>([
    {
      id: 1,
      expression: "sin(x)",
      color: COLORS[0],
      visible: true,
      showDerivative: false,
      error: null,
      compiled: null,
    },
  ]);

  let viewport = $state<Viewport>({
    xMin: -10,
    xMax: 10,
    yMin: -6,
    yMax: 6,
  });

  let canvas: HTMLCanvasElement | undefined = $state();
  let canvasContainer: HTMLDivElement | undefined = $state();
  let cursorInfo = $state<CursorInfo | null>(null);
  let isPanning = $state(false);
  let panStart = $state<{ x: number; y: number; viewport: Viewport } | null>(null);
  let showPresets = $state(false);
  let canvasWidth = $state(800);
  let canvasHeight = $state(500);

  // Touch state
  let lastTouchDist = $state<number | null>(null);
  let lastTouchMid = $state<{ x: number; y: number } | null>(null);

  // Compile expressions reactively
  $effect(() => {
    for (const fn of functions) {
      if (fn.expression.trim() === "") {
        fn.compiled = null;
        fn.error = null;
        continue;
      }
      try {
        const compiled = compile(fn.expression) as EvalFunction;
        // Test evaluation to catch errors early
        compiled.evaluate({ x: 0 });
        fn.compiled = compiled;
        fn.error = null;
      } catch (e: unknown) {
        fn.compiled = null;
        fn.error = e instanceof Error ? e.message : "Invalid expression";
      }
    }
  });

  // Resize observer
  $effect(() => {
    if (!canvasContainer) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvasWidth = Math.floor(rect.width);
        canvasHeight = Math.floor(Math.max(300, rect.height));
        if (canvas) {
          canvas.width = canvasWidth * dpr;
          canvas.height = canvasHeight * dpr;
          canvas.style.width = canvasWidth + "px";
          canvas.style.height = canvasHeight + "px";
        }
      }
    });
    observer.observe(canvasContainer);
    return () => observer.disconnect();
  });

  // Main render loop
  $effect(() => {
    if (!canvas) return;
    // Track dependencies
    void viewport.xMin;
    void viewport.xMax;
    void viewport.yMin;
    void viewport.yMax;
    void canvasWidth;
    void canvasHeight;
    void cursorInfo;
    for (const fn of functions) {
      void fn.expression;
      void fn.visible;
      void fn.showDerivative;
      void fn.color;
    }
    renderCanvas();
  });

  function mathToCanvas(mathX: number, mathY: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth * dpr;
    const h = canvasHeight * dpr;
    const x = ((mathX - viewport.xMin) / (viewport.xMax - viewport.xMin)) * w;
    const y = ((viewport.yMax - mathY) / (viewport.yMax - viewport.yMin)) * h;
    return { x, y };
  }

  function canvasToMath(cx: number, cy: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth * dpr;
    const h = canvasHeight * dpr;
    const mathX = viewport.xMin + (cx * dpr / w) * (viewport.xMax - viewport.xMin);
    const mathY = viewport.yMax - (cy * dpr / h) * (viewport.yMax - viewport.yMin);
    return { x: mathX, y: mathY };
  }

  function evaluateAt(fn: PlotFunction, x: number): number | null {
    if (!fn.compiled) return null;
    try {
      const result = fn.compiled.evaluate({ x });
      if (typeof result === "number" && isFinite(result)) return result;
      return null;
    } catch {
      return null;
    }
  }

  function derivativeAt(fn: PlotFunction, x: number): number | null {
    const h = (viewport.xMax - viewport.xMin) * 0.00001;
    const y1 = evaluateAt(fn, x - h);
    const y2 = evaluateAt(fn, x + h);
    if (y1 === null || y2 === null) return null;
    const d = (y2 - y1) / (2 * h);
    if (!isFinite(d)) return null;
    return d;
  }

  function getNiceStep(range: number): number {
    const rough = range / 10;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalized = rough / pow;
    let nice: number;
    if (normalized <= 1) nice = 1;
    else if (normalized <= 2) nice = 2;
    else if (normalized <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  function formatTickLabel(value: number, step: number): string {
    if (value === 0) return "0";
    const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
    if (decimals > 6) return value.toExponential(2);
    return parseFloat(value.toFixed(decimals)).toString();
  }

  function renderCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    // Detect dark mode
    const isDark = document.documentElement.classList.contains("dark");

    // Clear
    ctx.fillStyle = isDark ? "#141414" : "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Grid
    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;
    const xStep = getNiceStep(xRange);
    const yStep = getNiceStep(yRange);

    ctx.strokeStyle = isDark ? "#1f1f1f" : "#f0f0f0";
    ctx.lineWidth = 1 * dpr;

    // Vertical grid lines
    const xStart = Math.ceil(viewport.xMin / xStep) * xStep;
    for (let x = xStart; x <= viewport.xMax; x += xStep) {
      const { x: cx } = mathToCanvas(x, 0);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
    }

    // Horizontal grid lines
    const yStart = Math.ceil(viewport.yMin / yStep) * yStep;
    for (let y = yStart; y <= viewport.yMax; y += yStep) {
      const { y: cy } = mathToCanvas(0, y);
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
    }

    // Axes
    const origin = mathToCanvas(0, 0);
    ctx.strokeStyle = isDark ? "#444" : "#999";
    ctx.lineWidth = 1.5 * dpr;

    // X axis
    if (origin.y >= 0 && origin.y <= h) {
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(w, origin.y);
      ctx.stroke();
    }

    // Y axis
    if (origin.x >= 0 && origin.x <= w) {
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, h);
      ctx.stroke();
    }

    // Tick labels
    ctx.fillStyle = isDark ? "#888" : "#666";
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // X tick labels
    for (let x = xStart; x <= viewport.xMax; x += xStep) {
      if (Math.abs(x) < xStep * 0.01) continue; // skip 0
      const { x: cx } = mathToCanvas(x, 0);
      let tickY = origin.y + 4 * dpr;
      if (origin.y < 0) tickY = 4 * dpr;
      else if (origin.y > h) tickY = h - 16 * dpr;
      ctx.fillText(formatTickLabel(x, xStep), cx, tickY);
    }

    // Y tick labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = yStart; y <= viewport.yMax; y += yStep) {
      if (Math.abs(y) < yStep * 0.01) continue; // skip 0
      const { y: cy } = mathToCanvas(0, y);
      let tickX = origin.x - 6 * dpr;
      if (origin.x < 30 * dpr) tickX = 4 * dpr, ctx.textAlign = "left";
      else if (origin.x > w - 10 * dpr) tickX = w - 4 * dpr;
      ctx.fillText(formatTickLabel(y, yStep), tickX, cy);
      ctx.textAlign = "right";
    }

    // Plot functions
    const pointsPerPixel = 2;
    const numPoints = canvasWidth * pointsPerPixel;

    for (let fi = 0; fi < functions.length; fi++) {
      const fn = functions[fi];
      if (!fn.visible || !fn.compiled) continue;

      // Main function
      drawCurve(ctx, fn, w, h, dpr, numPoints, fn.color, 2.5, false);

      // Derivative
      if (fn.showDerivative) {
        const dColor = DERIVATIVE_COLORS[fi % DERIVATIVE_COLORS.length];
        drawCurve(ctx, fn, w, h, dpr, numPoints, dColor, 1.5, true);
      }
    }

    // Crosshair cursor
    if (cursorInfo) {
      const cursorCanvasX = cursorInfo.canvasX * dpr;
      const cursorCanvasY = cursorInfo.canvasY * dpr;

      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(cursorCanvasX, 0);
      ctx.lineTo(cursorCanvasX, h);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, cursorCanvasY);
      ctx.lineTo(w, cursorCanvasY);
      ctx.stroke();

      ctx.setLineDash([]);

      // Snap point on function
      if (cursorInfo.snappedY !== null && cursorInfo.snappedFnIndex !== null) {
        const snapCanvas = mathToCanvas(cursorInfo.mathX, cursorInfo.snappedY);
        const fnColor = functions[cursorInfo.snappedFnIndex].color;

        ctx.beginPath();
        ctx.arc(snapCanvas.x, snapCanvas.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = fnColor;
        ctx.fill();
        ctx.strokeStyle = isDark ? "#fff" : "#000";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      // Coordinate label
      const labelX = cursorInfo.mathX;
      const labelY = cursorInfo.snappedY !== null ? cursorInfo.snappedY : cursorInfo.mathY;
      const labelText = `(${labelX.toFixed(3)}, ${labelY.toFixed(3)})`;

      ctx.font = `${12 * dpr}px system-ui, sans-serif`;
      const metrics = ctx.measureText(labelText);
      const padding = 6 * dpr;
      const labelW = metrics.width + padding * 2;
      const labelH = 18 * dpr;

      let lx = cursorCanvasX + 12 * dpr;
      let ly = cursorCanvasY - labelH - 8 * dpr;
      if (lx + labelW > w) lx = cursorCanvasX - labelW - 12 * dpr;
      if (ly < 0) ly = cursorCanvasY + 12 * dpr;

      ctx.fillStyle = isDark ? "rgba(20,20,20,0.9)" : "rgba(255,255,255,0.9)";
      ctx.strokeStyle = isDark ? "#444" : "#ddd";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.rect(lx, ly, labelW, labelH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isDark ? "#eee" : "#333";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, lx + padding, ly + labelH / 2);
    }
  }

  function drawCurve(
    ctx: CanvasRenderingContext2D,
    fn: PlotFunction,
    w: number,
    h: number,
    dpr: number,
    numPoints: number,
    color: string,
    lineWidth: number,
    isDerivative: boolean,
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    let drawing = false;
    let prevY: number | null = null;

    ctx.beginPath();
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const mathX = viewport.xMin + t * (viewport.xMax - viewport.xMin);
      const mathY = isDerivative ? derivativeAt(fn, mathX) : evaluateAt(fn, mathX);

      if (mathY === null) {
        drawing = false;
        prevY = null;
        continue;
      }

      const { x: cx, y: cy } = mathToCanvas(mathX, mathY);

      // Discontinuity detection: large jumps suggest asymptotes
      if (drawing && prevY !== null) {
        const jump = Math.abs(cy - prevY);
        if (jump > h * 0.5) {
          // Likely a discontinuity, break the path
          ctx.stroke();
          ctx.beginPath();
          drawing = false;
        }
      }

      if (!drawing) {
        ctx.moveTo(cx, cy);
        drawing = true;
      } else {
        ctx.lineTo(cx, cy);
      }
      prevY = cy;
    }
    ctx.stroke();

    if (isDerivative) {
      // Draw a small dashed legend hint
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPanning && panStart) {
      const dx = mx - panStart.x;
      const dy = my - panStart.y;
      const xRange = panStart.viewport.xMax - panStart.viewport.xMin;
      const yRange = panStart.viewport.yMax - panStart.viewport.yMin;
      const mathDx = -(dx / canvasWidth) * xRange;
      const mathDy = (dy / canvasHeight) * yRange;
      viewport = {
        xMin: panStart.viewport.xMin + mathDx,
        xMax: panStart.viewport.xMax + mathDx,
        yMin: panStart.viewport.yMin + mathDy,
        yMax: panStart.viewport.yMax + mathDy,
      };
      return;
    }

    const math = canvasToMath(mx, my);

    // Find closest function value at this x
    let closestY: number | null = null;
    let closestFnIndex: number | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < functions.length; i++) {
      const fn = functions[i];
      if (!fn.visible || !fn.compiled) continue;
      const y = evaluateAt(fn, math.x);
      if (y === null) continue;
      const canvasPoint = mathToCanvas(math.x, y);
      const dist = Math.abs(canvasPoint.y / (window.devicePixelRatio || 1) - my);
      if (dist < 30 && dist < closestDist) {
        closestDist = dist;
        closestY = y;
        closestFnIndex = i;
      }
    }

    cursorInfo = {
      canvasX: mx,
      canvasY: my,
      mathX: math.x,
      mathY: math.y,
      snappedY: closestY,
      snappedFnIndex: closestFnIndex,
    };
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isPanning = true;
    const rect = canvas!.getBoundingClientRect();
    panStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      viewport: { ...viewport },
    };
    cursorInfo = null;
  }

  function handleMouseUp() {
    isPanning = false;
    panStart = null;
  }

  function handleMouseLeave() {
    cursorInfo = null;
    isPanning = false;
    panStart = null;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const math = canvasToMath(mx, my);

    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;

    viewport = {
      xMin: math.x - (math.x - viewport.xMin) * factor,
      xMax: math.x + (viewport.xMax - math.x) * factor,
      yMin: math.y - (math.y - viewport.yMin) * factor,
      yMax: math.y + (viewport.yMax - math.y) * factor,
    };
  }

  // Touch handlers
  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      const rect = canvas!.getBoundingClientRect();
      const touch = e.touches[0];
      isPanning = true;
      panStart = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        viewport: { ...viewport },
      };
      cursorInfo = null;
    } else if (e.touches.length === 2) {
      isPanning = false;
      panStart = null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      lastTouchMid = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    }
    e.preventDefault();
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 1 && isPanning && panStart) {
      const rect = canvas!.getBoundingClientRect();
      const touch = e.touches[0];
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const dx = mx - panStart.x;
      const dy = my - panStart.y;
      const xRange = panStart.viewport.xMax - panStart.viewport.xMin;
      const yRange = panStart.viewport.yMax - panStart.viewport.yMin;
      const mathDx = -(dx / canvasWidth) * xRange;
      const mathDy = (dy / canvasHeight) * yRange;
      viewport = {
        xMin: panStart.viewport.xMin + mathDx,
        xMax: panStart.viewport.xMax + mathDx,
        yMin: panStart.viewport.yMin + mathDy,
        yMax: panStart.viewport.yMax + mathDy,
      };
    } else if (e.touches.length === 2 && lastTouchDist !== null && lastTouchMid !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const mid = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const rect = canvas!.getBoundingClientRect();
      const mx = mid.x - rect.left;
      const my = mid.y - rect.top;
      const math = canvasToMath(mx, my);

      const factor = lastTouchDist / dist;

      viewport = {
        xMin: math.x - (math.x - viewport.xMin) * factor,
        xMax: math.x + (viewport.xMax - math.x) * factor,
        yMin: math.y - (math.y - viewport.yMin) * factor,
        yMax: math.y + (viewport.yMax - math.y) * factor,
      };

      lastTouchDist = dist;
      lastTouchMid = mid;
    }
    e.preventDefault();
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      isPanning = false;
      panStart = null;
      lastTouchDist = null;
      lastTouchMid = null;
    } else if (e.touches.length === 1) {
      // Switch from pinch to pan
      lastTouchDist = null;
      lastTouchMid = null;
      const rect = canvas!.getBoundingClientRect();
      const touch = e.touches[0];
      isPanning = true;
      panStart = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        viewport: { ...viewport },
      };
    }
  }

  function addFunction() {
    const colorIndex = functions.length % COLORS.length;
    functions.push({
      id: nextId++,
      expression: "",
      color: COLORS[colorIndex],
      visible: true,
      showDerivative: false,
      error: null,
      compiled: null,
    });
  }

  function removeFunction(id: number) {
    if (functions.length <= 1) return;
    functions = functions.filter((f) => f.id !== id);
  }

  function loadPreset(expression: string) {
    if (functions.length === 1 && functions[0].expression === "sin(x)") {
      functions[0].expression = expression;
    } else {
      const colorIndex = functions.length % COLORS.length;
      functions.push({
        id: nextId++,
        expression,
        color: COLORS[colorIndex],
        visible: true,
        showDerivative: false,
        error: null,
        compiled: null,
      });
    }
    showPresets = false;
  }

  function resetViewport() {
    viewport = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };
  }

  function exportPNG() {
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "graph-plot.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  let colorDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function debouncedColorChange(fn: PlotFunction, value: string) {
    if (colorDebounceTimer) clearTimeout(colorDebounceTimer);
    colorDebounceTimer = setTimeout(() => {
      fn.color = value;
    }, 50);
  }
</script>

<div class="flex flex-col gap-2 h-full overflow-hidden">
  <!-- Function inputs -->
  <div class="flex flex-col gap-2 shrink-0">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-(--color-text)">Functions</h2>
      <div class="flex gap-2">
        <div class="relative">
          <button
            onclick={() => (showPresets = !showPresets)}
            class="text-xs px-2.5 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors cursor-pointer"
          >
            Presets
          </button>
          {#if showPresets}
            <div
              class="absolute top-full right-0 mt-1 bg-(--color-bg-alt) border border-(--color-border) shadow-lg z-10 py-1 min-w-[160px]"
            >
              {#each PRESETS as preset}
                <button
                  onclick={() => loadPreset(preset.expression)}
                  class="w-full text-left px-3 py-1.5 text-xs hover:bg-(--color-bg) text-(--color-text) transition-colors cursor-pointer flex justify-between items-center gap-3"
                >
                  <span class="font-medium">{preset.name}</span>
                  <span class="text-(--color-text-muted) font-mono">{preset.expression}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button
          onclick={addFunction}
          class="text-xs px-2.5 py-1.5 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors cursor-pointer"
        >
          + Add
        </button>
      </div>
    </div>

    {#each functions as fn, i}
      <div class="flex items-center gap-2">
        <label class="w-4 h-4 flex-shrink-0 cursor-pointer block relative" title="Change color">
          <input
            type="color"
            value={fn.color}
            oninput={(e) => debouncedColorChange(fn, (e.target as HTMLInputElement).value)}
            onchange={(e) => { fn.color = (e.target as HTMLInputElement).value; }}
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <span
            class="block w-full h-full border border-(--color-border)"
            style="background: {fn.color}"
          ></span>
        </label>
        <button
          onclick={() => (fn.visible = !fn.visible)}
          class="flex-shrink-0 cursor-pointer w-4 h-4 border border-(--color-border) flex items-center justify-center {fn.visible ? 'bg-(--color-accent)' : 'bg-(--color-bg)'}"
          title={fn.visible ? "Hide" : "Show"}
        >
          {#if fn.visible}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-(--color-btn-text)">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          {/if}
        </button>
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={fn.expression}
            placeholder="e.g. x^2 + sin(x)"
            class="w-full px-3 py-1.5 text-sm font-mono border bg-(--color-bg) text-(--color-text) focus:outline-none focus:ring-1 focus:ring-(--color-accent) transition-colors {fn.error
              ? 'border-(--color-error-border)'
              : 'border-(--color-border)'}"
          />
          {#if fn.error}
            <div
              class="absolute top-full left-0 mt-0.5 text-[10px] text-(--color-error-text) whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
            >
              {fn.error}
            </div>
          {/if}
        </div>
        <button
          onclick={() => (fn.showDerivative = !fn.showDerivative)}
          class="text-xs px-2 py-1.5 border transition-colors cursor-pointer flex-shrink-0 {fn.showDerivative
            ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
            : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) bg-(--color-bg)'}"
          title="Toggle derivative"
        >
          f'
        </button>
        {#if functions.length > 1}
          <button
            onclick={() => removeFunction(fn.id)}
            class="text-(--color-text-muted) hover:text-(--color-error-text) transition-colors text-sm cursor-pointer flex-shrink-0"
            title="Remove"
          >
            &times;
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Controls bar -->
  <div class="flex items-center justify-between text-xs text-(--color-text-muted) flex-wrap gap-2 shrink-0">
    <div class="flex items-center gap-3">
      <span>
        x: [{viewport.xMin.toFixed(2)}, {viewport.xMax.toFixed(2)}]
      </span>
      <span>
        y: [{viewport.yMin.toFixed(2)}, {viewport.yMax.toFixed(2)}]
      </span>
      <!-- Legend -->
      {#if functions.some((f) => f.visible && f.compiled)}
        <span class="text-(--color-border)">|</span>
        {#each functions as fn, i}
          {#if fn.visible && fn.compiled}
            <span class="flex items-center gap-1">
              <span class="inline-block w-3 h-0.5" style="background: {fn.color}"></span>
              <span class="font-mono">{fn.expression}</span>
            </span>
            {#if fn.showDerivative}
              <span class="flex items-center gap-1">
                <span
                  class="inline-block w-3 h-0.5"
                  style="background: {DERIVATIVE_COLORS[i % DERIVATIVE_COLORS.length]}"
                ></span>
                <span class="font-mono">{fn.expression}'</span>
              </span>
            {/if}
          {/if}
        {/each}
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={resetViewport}
        class="px-2.5 py-1 border border-(--color-border) hover:bg-(--color-bg-alt) transition-colors cursor-pointer"
      >
        Reset View
      </button>
      <button
        onclick={exportPNG}
        class="px-2.5 py-1 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors cursor-pointer"
      >
        Export PNG
      </button>
    </div>
  </div>

  <!-- Canvas -->
  <div
    bind:this={canvasContainer}
    class="flex-1 min-h-0 relative border border-(--color-border) overflow-hidden"
    style="touch-action: none;"
  >
    <canvas
      bind:this={canvas}
      class="block w-full h-full"
      style="cursor: {isPanning ? 'grabbing' : 'crosshair'}"
      onmousemove={handleMouseMove}
      onmousedown={handleMouseDown}
      onmouseup={handleMouseUp}
      onmouseleave={handleMouseLeave}
      onwheel={handleWheel}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
    ></canvas>
  </div>

  <!-- Help text -->
  <div class="text-[11px] text-(--color-text-light) leading-relaxed shrink-0">
    <span class="font-medium">Supported:</span> +, -, *, /, ^, sin, cos, tan, asin, acos, atan, log, log2, log10, ln, sqrt, abs, ceil, floor, round, exp, sign, pi, e, phi.
    <span class="font-medium ml-1">Controls:</span> Drag to pan, scroll to zoom, hover to trace.
  </div>
</div>
