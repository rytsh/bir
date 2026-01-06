<script lang="ts">
  type GradientType = "linear" | "radial";

  interface ColorStop {
    id: string;
    color: string;
    position: number;
  }

  let gradientType = $state<GradientType>("linear");
  let angle = $state(90);
  let radialShape = $state<"circle" | "ellipse">("circle");
  let radialPosition = $state({ x: 50, y: 50 });
  let colorStops = $state<ColorStop[]>([
    { id: "1", color: "#3b82f6", position: 0 },
    { id: "2", color: "#8b5cf6", position: 100 },
  ]);
  let copied = $state<string | null>(null);

  function addColorStop() {
    const newPosition = colorStops.length > 0
      ? Math.min(100, colorStops[colorStops.length - 1].position + 25)
      : 50;
    colorStops = [
      ...colorStops,
      {
        id: Date.now().toString(),
        color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0"),
        position: newPosition,
      },
    ];
  }

  function removeColorStop(id: string) {
    if (colorStops.length > 2) {
      colorStops = colorStops.filter((stop) => stop.id !== id);
    }
  }

  function updateColorStop(id: string, field: "color" | "position", value: string | number) {
    colorStops = colorStops.map((stop) =>
      stop.id === id ? { ...stop, [field]: value } : stop
    );
  }

  function sortStops() {
    colorStops = [...colorStops].sort((a, b) => a.position - b.position);
  }

  let gradientCss = $derived(() => {
    const sortedStops = [...colorStops].sort((a, b) => a.position - b.position);
    const stopsString = sortedStops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");

    if (gradientType === "linear") {
      return `linear-gradient(${angle}deg, ${stopsString})`;
    } else {
      return `radial-gradient(${radialShape} at ${radialPosition.x}% ${radialPosition.y}%, ${stopsString})`;
    }
  });

  let fullCss = $derived(`background: ${gradientCss()};`);

  function copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text);
    copied = type;
    setTimeout(() => { copied = null; }, 2000);
  }

  function randomGradient() {
    const randomColor = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    colorStops = [
      { id: "1", color: randomColor(), position: 0 },
      { id: "2", color: randomColor(), position: 100 },
    ];
    if (Math.random() > 0.5) {
      colorStops = [...colorStops, { id: "3", color: randomColor(), position: 50 }];
    }
    angle = Math.floor(Math.random() * 360);
  }

  const presetGradients = [
    { name: "Sunset", stops: [{ color: "#ff512f", position: 0 }, { color: "#dd2476", position: 100 }], angle: 135 },
    { name: "Ocean", stops: [{ color: "#2193b0", position: 0 }, { color: "#6dd5ed", position: 100 }], angle: 135 },
    { name: "Forest", stops: [{ color: "#134e5e", position: 0 }, { color: "#71b280", position: 100 }], angle: 135 },
    { name: "Purple", stops: [{ color: "#667eea", position: 0 }, { color: "#764ba2", position: 100 }], angle: 135 },
    { name: "Fire", stops: [{ color: "#f12711", position: 0 }, { color: "#f5af19", position: 100 }], angle: 135 },
    { name: "Cool", stops: [{ color: "#00c6ff", position: 0 }, { color: "#0072ff", position: 100 }], angle: 135 },
  ];

  function applyPreset(preset: typeof presetGradients[0]) {
    colorStops = preset.stops.map((stop, i) => ({ id: String(i + 1), ...stop }));
    angle = preset.angle;
    gradientType = "linear";
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Create CSS linear and radial gradients with a visual editor and get the CSS code.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Controls -->
    <div class="lg:w-80 flex flex-col gap-4">
      <!-- Gradient Type -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Gradient Type
        </span>
        <div class="flex gap-2">
          <button
            onclick={() => gradientType = "linear"}
            class="flex-1 px-3 py-2 text-sm font-medium transition-colors {gradientType === 'linear' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
          >
            Linear
          </button>
          <button
            onclick={() => gradientType = "radial"}
            class="flex-1 px-3 py-2 text-sm font-medium transition-colors {gradientType === 'radial' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
          >
            Radial
          </button>
        </div>
      </div>

      <!-- Linear Options -->
      {#if gradientType === "linear"}
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Angle: {angle}deg
          </span>
          <input
            type="range"
            min="0"
            max="360"
            bind:value={angle}
            class="w-full accent-(--color-accent)"
          />
          <div class="flex gap-2 mt-2">
            {#each [0, 45, 90, 135, 180, 225, 270, 315] as deg}
              <button
                onclick={() => angle = deg}
                class="flex-1 px-1 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors {angle === deg ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)' : ''}"
              >
                {deg}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <!-- Radial Options -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Shape
          </span>
          <div class="flex gap-2 mb-4">
            <button
              onclick={() => radialShape = "circle"}
              class="flex-1 px-3 py-2 text-sm font-medium transition-colors {radialShape === 'circle' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
            >
              Circle
            </button>
            <button
              onclick={() => radialShape = "ellipse"}
              class="flex-1 px-3 py-2 text-sm font-medium transition-colors {radialShape === 'ellipse' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
            >
              Ellipse
            </button>
          </div>
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
            Position: {radialPosition.x}% {radialPosition.y}%
          </span>
          <div class="flex gap-4">
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) mb-1 block">X</label>
              <input
                type="range"
                min="0"
                max="100"
                bind:value={radialPosition.x}
                class="w-full accent-(--color-accent)"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) mb-1 block">Y</label>
              <input
                type="range"
                min="0"
                max="100"
                bind:value={radialPosition.y}
                class="w-full accent-(--color-accent)"
              />
            </div>
          </div>
        </div>
      {/if}

      <!-- Color Stops -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Color Stops
          </span>
          <button
            onclick={addColorStop}
            class="text-xs text-(--color-accent) hover:underline"
          >
            + Add Stop
          </button>
        </div>
        <div class="flex flex-col gap-2">
          {#each colorStops as stop (stop.id)}
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
                style="background-color: {stop.color}"
              >
                <input
                  type="color"
                  value={stop.color}
                  oninput={(e) => updateColorStop(stop.id, "color", (e.target as HTMLInputElement).value)}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <input
                type="text"
                value={stop.color}
                oninput={(e) => updateColorStop(stop.id, "color", (e.target as HTMLInputElement).value)}
                class="w-20 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={stop.position}
                oninput={(e) => updateColorStop(stop.id, "position", parseInt((e.target as HTMLInputElement).value) || 0)}
                class="w-16 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
              <span class="text-xs text-(--color-text-muted)">%</span>
              {#if colorStops.length > 2}
                <button
                  onclick={() => removeColorStop(stop.id)}
                  class="text-xs text-red-500 hover:text-red-700 px-1"
                >
                  x
                </button>
              {/if}
            </div>
          {/each}
        </div>
        <button
          onclick={sortStops}
          class="mt-2 text-xs text-(--color-text-muted) hover:text-(--color-text)"
        >
          Sort by position
        </button>
      </div>

      <!-- Presets -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Presets
        </span>
        <div class="grid grid-cols-3 gap-2">
          {#each presetGradients as preset}
            <button
              onclick={() => applyPreset(preset)}
              class="h-8 border border-(--color-border) hover:border-(--color-accent) transition-colors"
              style="background: linear-gradient({preset.angle}deg, {preset.stops.map(s => `${s.color} ${s.position}%`).join(', ')})"
              title={preset.name}
            ></button>
          {/each}
        </div>
        <button
          onclick={randomGradient}
          class="mt-2 w-full px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-colors"
        >
          Random
        </button>
      </div>
    </div>

    <!-- Preview and Output -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Preview -->
      <div class="flex-1 min-h-[200px]">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Preview
        </span>
        <div
          class="w-full h-full min-h-[200px] border border-(--color-border)"
          style="background: {gradientCss()}"
        ></div>
      </div>

      <!-- CSS Output -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            CSS Code
          </span>
          <button
            onclick={() => copyToClipboard(fullCss, "css")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied === "css" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="font-mono text-sm text-(--color-text) whitespace-pre-wrap break-all">{fullCss}</pre>
      </div>

      <!-- Gradient Value Only -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Gradient Value
          </span>
          <button
            onclick={() => copyToClipboard(gradientCss(), "gradient")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied === "gradient" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="font-mono text-sm text-(--color-text) whitespace-pre-wrap break-all">{gradientCss()}</pre>
      </div>
    </div>
  </div>
</div>
