<script lang="ts">
  type PatternType = "stripes" | "checkerboard" | "grid" | "dots" | "zigzag" | "noise" | "isometric" | "pixel-art";

  interface PatternLayer {
    id: string;
    type: PatternType;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    size: number;
    thickness: number;
    angle: number;
    opacity: number;
    pixelGrid: boolean[][];
    pixelGridSize: number;
  }

  interface AnimationConfig {
    enabled: boolean;
    direction: "horizontal" | "vertical" | "diagonal";
    speed: number;
  }

  interface PatternPreset {
    name: string;
    type: PatternType;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    size: number;
    thickness: number;
    angle: number;
  }

  const patterns: { type: PatternType; name: string; icon: string }[] = [
    { type: "stripes", name: "Stripes", icon: "▤" },
    { type: "checkerboard", name: "Checkerboard", icon: "▦" },
    { type: "grid", name: "Grid", icon: "▩" },
    { type: "dots", name: "Dots", icon: "⚬" },
    { type: "zigzag", name: "Zigzag", icon: "⌇" },
    { type: "noise", name: "Noise", icon: "░" },
    { type: "isometric", name: "Isometric", icon: "⬢" },
    { type: "pixel-art", name: "Pixel Art", icon: "▦" },
  ];

  function createEmptyGrid(size: number): boolean[][] {
    return Array(size).fill(null).map(() => Array(size).fill(false));
  }

  function createDefaultLayer(): PatternLayer {
    return {
      id: Date.now().toString(),
      type: "stripes",
      primaryColor: "#3b82f6",
      secondaryColor: "#1e40af",
      backgroundColor: "#ffffff",
      size: 20,
      thickness: 10,
      angle: 45,
      opacity: 100,
      pixelGrid: createEmptyGrid(8),
      pixelGridSize: 8,
    };
  }

  // State
  let layers = $state<PatternLayer[]>([createDefaultLayer()]);
  let currentLayerIndex = $state(0);
  let animation = $state<AnimationConfig>({
    enabled: false,
    direction: "diagonal",
    speed: 10,
  });
  let copied = $state<string | null>(null);
  
  // Editable CSS state
  let customCssMode = $state(false);
  let editableCss = $state("");

  // Current layer shortcut
  let currentLayer = $derived(layers[currentLayerIndex] || layers[0]);

  // Pattern CSS generators
  function generatePatternCss(layer: PatternLayer): { background: string; backgroundSize: string } {
    const { type, primaryColor, secondaryColor, backgroundColor, size, thickness, angle, opacity, pixelGrid } = layer;
    const opacityValue = opacity / 100;

    switch (type) {
      case "stripes":
        return {
          background: `repeating-linear-gradient(${angle}deg, ${primaryColor} 0px, ${primaryColor} ${thickness}px, ${backgroundColor} ${thickness}px, ${backgroundColor} ${size}px)`,
          backgroundSize: "auto",
        };

      case "checkerboard":
        return {
          background: `repeating-conic-gradient(${primaryColor} 0% 25%, ${backgroundColor} 0% 50%) 0 0 / ${size}px ${size}px`,
          backgroundSize: `${size}px ${size}px`,
        };

      case "grid":
        return {
          background: `
            linear-gradient(${primaryColor} ${thickness}px, transparent ${thickness}px),
            linear-gradient(90deg, ${primaryColor} ${thickness}px, ${backgroundColor} ${thickness}px)
          `.trim().replace(/\s+/g, " "),
          backgroundSize: `${size}px ${size}px`,
        };

      case "dots":
        return {
          background: `radial-gradient(circle, ${primaryColor} ${thickness}px, ${backgroundColor} ${thickness}px)`,
          backgroundSize: `${size}px ${size}px`,
        };

      case "zigzag": {
        const zigHeight = size;
        const zigWidth = size;
        return {
          background: `
            linear-gradient(135deg, ${primaryColor} 25%, transparent 25%) -${zigWidth / 2}px 0,
            linear-gradient(225deg, ${primaryColor} 25%, transparent 25%) -${zigWidth / 2}px 0,
            linear-gradient(315deg, ${primaryColor} 25%, transparent 25%),
            linear-gradient(45deg, ${primaryColor} 25%, transparent 25%),
            ${backgroundColor}
          `.trim().replace(/\s+/g, " "),
          backgroundSize: `${zigWidth}px ${zigHeight}px`,
        };
      }

      case "noise": {
        const noiseUrl = generateNoiseSvg(primaryColor, secondaryColor, opacityValue);
        return {
          background: `url("${noiseUrl}"), ${backgroundColor}`,
          backgroundSize: `${size * 5}px ${size * 5}px`,
        };
      }

      case "isometric": {
        const iso = size;
        return {
          background: `
            linear-gradient(30deg, ${primaryColor} 12%, transparent 12.5%, transparent 87%, ${primaryColor} 87.5%, ${primaryColor}),
            linear-gradient(150deg, ${primaryColor} 12%, transparent 12.5%, transparent 87%, ${primaryColor} 87.5%, ${primaryColor}),
            linear-gradient(30deg, ${primaryColor} 12%, transparent 12.5%, transparent 87%, ${primaryColor} 87.5%, ${primaryColor}) ${iso}px ${iso * 1.73}px,
            linear-gradient(150deg, ${primaryColor} 12%, transparent 12.5%, transparent 87%, ${primaryColor} 87.5%, ${primaryColor}) ${iso}px ${iso * 1.73}px,
            linear-gradient(60deg, ${secondaryColor}80 25%, ${backgroundColor}80 25.5%, ${backgroundColor}80 75%, ${secondaryColor}80 75%, ${secondaryColor}80),
            linear-gradient(60deg, ${secondaryColor}80 25%, ${backgroundColor}80 25.5%, ${backgroundColor}80 75%, ${secondaryColor}80 75%, ${secondaryColor}80) ${iso}px ${iso * 1.73}px
          `.trim().replace(/\s+/g, " "),
          backgroundSize: `${iso * 2}px ${iso * 3.46}px`,
        };
      }

      case "pixel-art": {
        const svgDataUri = pixelGridToSvg(pixelGrid, primaryColor, backgroundColor);
        return {
          background: `url("${svgDataUri}")`,
          backgroundSize: `${size}px ${size}px`,
        };
      }

      default:
        return {
          background: backgroundColor,
          backgroundSize: "auto",
        };
    }
  }

  function generateNoiseSvg(color1: string, color2: string, opacity: number): string {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" opacity="${opacity}"/>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function pixelGridToSvg(grid: boolean[][], color: string, bgColor: string): string {
    const gridSize = grid.length;
    let rects = "";
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (grid[y][x]) {
          rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
        }
      }
    }
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gridSize} ${gridSize}">
      <rect width="${gridSize}" height="${gridSize}" fill="${bgColor}"/>
      ${rects}
    </svg>`;
    
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  // Combined CSS for all layers
  let combinedPatternCss = $derived(() => {
    if (layers.length === 1) {
      const { background, backgroundSize } = generatePatternCss(layers[0]);
      return {
        background,
        backgroundSize,
        backgroundPosition: "0 0",
      };
    }

    const backgrounds: string[] = [];
    const sizes: string[] = [];
    const positions: string[] = [];

    layers.forEach((layer) => {
      const { background, backgroundSize } = generatePatternCss(layer);
      backgrounds.push(background);
      sizes.push(backgroundSize);
      positions.push("0 0");
    });

    return {
      background: backgrounds.join(",\n  "),
      backgroundSize: sizes.join(", "),
      backgroundPosition: positions.join(", "),
    };
  });

  // Animation CSS
  let animationCss = $derived(() => {
    if (!animation.enabled) return "";

    const distance = currentLayer.size * 2;
    let xMove = "0";
    let yMove = "0";

    switch (animation.direction) {
      case "horizontal":
        xMove = `${distance}px`;
        break;
      case "vertical":
        yMove = `${distance}px`;
        break;
      case "diagonal":
        xMove = `${distance}px`;
        yMove = `${distance}px`;
        break;
    }

    return `@keyframes patternScroll {
  from { background-position: 0 0; }
  to { background-position: ${xMove} ${yMove}; }
}

animation: patternScroll ${animation.speed}s linear infinite;`;
  });

  // Full CSS output
  let fullCss = $derived(() => {
    const pattern = combinedPatternCss();
    let css = `.container {\n  background: ${pattern.background};`;

    if (pattern.backgroundSize !== "auto") {
      css += `\n  background-size: ${pattern.backgroundSize};`;
    }

    if (animation.enabled) {
      css += `\n\n  ${animationCss().split('\n').join('\n  ')}`;
    }
    
    css += `\n}`;

    return css;
  });
  
  // The CSS to display (either from generator or custom edited)
  let displayCss = $derived(() => {
    return customCssMode ? editableCss : fullCss();
  });
  
  // Sync generated CSS to editable when not in custom mode
  $effect(() => {
    if (!customCssMode) {
      editableCss = fullCss();
    }
  });
  
  function handleCssEdit(value: string) {
    customCssMode = true;
    editableCss = value;
  }
  
  function resetToGenerated() {
    customCssMode = false;
    editableCss = fullCss();
  }

  // Actions
  function copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text);
    copied = type;
    setTimeout(() => { copied = null; }, 2000);
  }

  function addLayer() {
    if (layers.length >= 3) return;
    const newLayer = createDefaultLayer();
    newLayer.primaryColor = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    newLayer.secondaryColor = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    newLayer.opacity = 70;
    layers = [...layers, newLayer];
    currentLayerIndex = layers.length - 1;
  }

  function removeLayer(index: number) {
    if (layers.length <= 1) return;
    layers = layers.filter((_, i) => i !== index);
    if (currentLayerIndex >= layers.length) {
      currentLayerIndex = layers.length - 1;
    }
  }

  function updateCurrentLayer(field: keyof PatternLayer, value: PatternLayer[keyof PatternLayer]) {
    layers = layers.map((layer, i) =>
      i === currentLayerIndex ? { ...layer, [field]: value } : layer
    );
  }

  function setPatternType(type: PatternType) {
    layers = layers.map((layer, i) =>
      i === currentLayerIndex ? { ...layer, type } : layer
    );
  }

  function randomPattern() {
    const availablePatterns = patterns.filter(p => p.type !== "pixel-art");
    const randomPatternInfo = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];

    const randomColor = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");

    layers = layers.map((layer, i) =>
      i === currentLayerIndex ? {
        ...layer,
        type: randomPatternInfo.type,
        primaryColor: randomColor(),
        secondaryColor: randomColor(),
        size: Math.floor(Math.random() * 40) + 10,
        thickness: Math.floor(Math.random() * 10) + 2,
        angle: Math.floor(Math.random() * 180),
      } : layer
    );
  }

  const presets: PatternPreset[] = [
    { name: "Blueprint", type: "grid", primaryColor: "#1e3a5f", secondaryColor: "#1e3a5f", backgroundColor: "#0f2744", size: 20, thickness: 1, angle: 0 },
    { name: "Notebook", type: "grid", primaryColor: "#c0d4e8", secondaryColor: "#c0d4e8", backgroundColor: "#ffffff", size: 24, thickness: 1, angle: 0 },
    { name: "Police Line", type: "stripes", primaryColor: "#ffc107", secondaryColor: "#ffc107", backgroundColor: "#000000", size: 30, thickness: 15, angle: 45 },
    { name: "Candy", type: "stripes", primaryColor: "#ff6b9d", secondaryColor: "#ff6b9d", backgroundColor: "#ffffff", size: 20, thickness: 10, angle: 45 },
    { name: "Checkers", type: "checkerboard", primaryColor: "#000000", secondaryColor: "#000000", backgroundColor: "#ffffff", size: 40, thickness: 10, angle: 0 },
    { name: "Polka", type: "dots", primaryColor: "#e74c3c", secondaryColor: "#e74c3c", backgroundColor: "#f5f5dc", size: 30, thickness: 8, angle: 0 },
    { name: "TV Static", type: "noise", primaryColor: "#333333", secondaryColor: "#666666", backgroundColor: "#ffffff", size: 10, thickness: 2, angle: 0 },
    { name: "3D Cubes", type: "isometric", primaryColor: "#3b82f6", secondaryColor: "#1e40af", backgroundColor: "#e0e7ff", size: 20, thickness: 2, angle: 0 },
  ];

  function applyPreset(preset: PatternPreset) {
    layers = layers.map((layer, i) =>
      i === currentLayerIndex ? {
        ...layer,
        type: preset.type,
        primaryColor: preset.primaryColor,
        secondaryColor: preset.secondaryColor,
        backgroundColor: preset.backgroundColor,
        size: preset.size,
        thickness: preset.thickness,
        angle: preset.angle,
      } : layer
    );
  }

  // Pixel Art functions
  let isDrawing = $state(false);
  let drawValue = $state(true);

  function togglePixel(x: number, y: number, dragging = false) {
    const newGrid = currentLayer.pixelGrid.map(row => [...row]);
    if (dragging) {
      newGrid[y][x] = drawValue;
    } else {
      drawValue = !newGrid[y][x];
      newGrid[y][x] = drawValue;
    }
    updateCurrentLayer("pixelGrid", newGrid);
  }

  function clearPixelGrid() {
    updateCurrentLayer("pixelGrid", createEmptyGrid(currentLayer.pixelGridSize));
  }

  function resizePixelGrid(newSize: number) {
    const oldGrid = currentLayer.pixelGrid;
    const oldSize = oldGrid.length;
    const newGrid = createEmptyGrid(newSize);
    
    // Copy over existing pixels that fit
    const minSize = Math.min(oldSize, newSize);
    for (let y = 0; y < minSize; y++) {
      for (let x = 0; x < minSize; x++) {
        newGrid[y][x] = oldGrid[y][x];
      }
    }
    
    layers = layers.map((layer, i) =>
      i === currentLayerIndex ? { ...layer, pixelGrid: newGrid, pixelGridSize: newSize } : layer
    );
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Create repeating CSS background patterns with visual editor, animations, and layering support.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
    <!-- Controls -->
    <div class="lg:w-80 flex flex-col gap-4 overflow-y-auto">
      <!-- Pattern Type -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Pattern Type
        </span>
        <div class="grid grid-cols-4 gap-2">
          {#each patterns as pattern}
            <button
              onclick={() => setPatternType(pattern.type)}
              class="flex flex-col items-center p-2 text-xs transition-colors {currentLayer.type === pattern.type ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
              title={pattern.name}
            >
              <span class="text-lg mb-1">{pattern.icon}</span>
              <span class="truncate w-full text-center text-[10px]">{pattern.name}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Pixel Art Editor -->
      {#if currentLayer.type === "pixel-art"}
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
              Pixel Art Editor ({currentLayer.pixelGridSize}x{currentLayer.pixelGridSize})
            </span>
            <button
              onclick={clearPixelGrid}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
          
          <!-- Grid Size Selector -->
          <div class="mb-3">
            <label class="text-xs text-(--color-text-muted) block mb-2">Grid Size</label>
            <div class="flex gap-1">
              {#each [4, 6, 8, 10, 12, 16] as gridSize}
                <button
                  onclick={() => resizePixelGrid(gridSize)}
                  class="flex-1 px-1 py-1 text-xs border transition-colors {currentLayer.pixelGridSize === gridSize ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)' : 'border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
                >
                  {gridSize}
                </button>
              {/each}
            </div>
          </div>
          
          <!-- Pixel Grid -->
          <div 
            class="pixel-grid border border-(--color-border) mx-auto"
            style="
              display: grid;
              grid-template-columns: repeat({currentLayer.pixelGridSize}, 1fr);
              width: min(100%, 240px);
              aspect-ratio: 1;
              background: {currentLayer.backgroundColor};
            "
          >
            {#each currentLayer.pixelGrid as row, y}
              {#each row as cell, x}
                <button
                  class="pixel-cell border border-(--color-border)/30 transition-colors hover:opacity-80"
                  style="background: {cell ? currentLayer.primaryColor : 'transparent'}"
                  onmousedown={() => togglePixel(x, y)}
                  onmouseenter={(e) => e.buttons === 1 && togglePixel(x, y, true)}
                ></button>
              {/each}
            {/each}
          </div>
          
          <p class="text-xs text-(--color-text-muted) mt-3 text-center">
            Click or drag to paint pixels
          </p>
        </div>
      {/if}

      <!-- Colors -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Colors
        </span>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
              style="background-color: {currentLayer.primaryColor}"
            >
              <input
                type="color"
                value={currentLayer.primaryColor}
                oninput={(e) => updateCurrentLayer("primaryColor", (e.target as HTMLInputElement).value)}
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) block mb-1">Primary</label>
              <input
                type="text"
                value={currentLayer.primaryColor}
                oninput={(e) => updateCurrentLayer("primaryColor", (e.target as HTMLInputElement).value)}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
              style="background-color: {currentLayer.secondaryColor}"
            >
              <input
                type="color"
                value={currentLayer.secondaryColor}
                oninput={(e) => updateCurrentLayer("secondaryColor", (e.target as HTMLInputElement).value)}
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) block mb-1">Secondary</label>
              <input
                type="text"
                value={currentLayer.secondaryColor}
                oninput={(e) => updateCurrentLayer("secondaryColor", (e.target as HTMLInputElement).value)}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
              style="background-color: {currentLayer.backgroundColor}"
            >
              <input
                type="color"
                value={currentLayer.backgroundColor}
                oninput={(e) => updateCurrentLayer("backgroundColor", (e.target as HTMLInputElement).value)}
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) block mb-1">Background</label>
              <input
                type="text"
                value={currentLayer.backgroundColor}
                oninput={(e) => updateCurrentLayer("backgroundColor", (e.target as HTMLInputElement).value)}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Size Controls -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Size & Shape
        </span>
        <div class="flex flex-col gap-4">
          <div>
            <label class="text-xs text-(--color-text-muted) mb-2 flex justify-between">
              <span>Pattern Size</span>
              <span>{currentLayer.size}px</span>
            </label>
            <input
              type="range"
              min="4"
              max="100"
              value={currentLayer.size}
              oninput={(e) => updateCurrentLayer("size", parseInt((e.target as HTMLInputElement).value))}
              class="w-full accent-(--color-accent)"
            />
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) mb-2 flex justify-between">
              <span>Thickness</span>
              <span>{currentLayer.thickness}px</span>
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={currentLayer.thickness}
              oninput={(e) => updateCurrentLayer("thickness", parseInt((e.target as HTMLInputElement).value))}
              class="w-full accent-(--color-accent)"
            />
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) mb-2 flex justify-between">
              <span>Angle</span>
              <span>{currentLayer.angle}deg</span>
            </label>
            <input
              type="range"
              min="0"
              max="360"
              value={currentLayer.angle}
              oninput={(e) => updateCurrentLayer("angle", parseInt((e.target as HTMLInputElement).value))}
              class="w-full accent-(--color-accent)"
            />
            <div class="flex gap-1 mt-2">
              {#each [0, 45, 90, 135, 180] as deg}
                <button
                  onclick={() => updateCurrentLayer("angle", deg)}
                  class="flex-1 px-1 py-1 text-xs border transition-colors {currentLayer.angle === deg ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)' : 'border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
                >
                  {deg}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Animation -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Animation
          </span>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={animation.enabled}
              class="accent-(--color-accent)"
            />
            <span class="text-xs text-(--color-text)">Enable</span>
          </label>
        </div>
        {#if animation.enabled}
          <div class="flex flex-col gap-3">
            <div>
              <label class="text-xs text-(--color-text-muted) block mb-2">Direction</label>
              <div class="flex gap-2">
                {#each ["horizontal", "vertical", "diagonal"] as dir}
                  <button
                    onclick={() => animation.direction = dir as AnimationConfig["direction"]}
                    class="flex-1 px-2 py-1 text-xs font-medium transition-colors {animation.direction === dir ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
                  >
                    {dir.charAt(0).toUpperCase() + dir.slice(1)}
                  </button>
                {/each}
              </div>
            </div>
            <div>
              <label class="text-xs text-(--color-text-muted) mb-2 flex justify-between">
                <span>Speed</span>
                <span>{animation.speed}s</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                bind:value={animation.speed}
                class="w-full accent-(--color-accent)"
              />
            </div>
          </div>
        {/if}
      </div>

      <!-- Layers -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Layers ({layers.length}/3)
          </span>
          {#if layers.length < 3}
            <button
              onclick={addLayer}
              class="text-xs text-(--color-accent) hover:underline"
            >
              + Add Layer
            </button>
          {/if}
        </div>
        <div class="flex flex-col gap-2">
          {#each layers as layer, i (layer.id)}
            <div
              class="flex items-center gap-2 p-2 cursor-pointer transition-colors {currentLayerIndex === i ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) hover:bg-(--color-bg)'}"
              onclick={() => currentLayerIndex = i}
              onkeydown={(e) => e.key === 'Enter' && (currentLayerIndex = i)}
              role="button"
              tabindex="0"
            >
              <div
                class="w-6 h-6 border border-(--color-border) shrink-0"
                style="background: {generatePatternCss(layer).background}; background-size: {generatePatternCss(layer).backgroundSize}"
              ></div>
              <span class="flex-1 text-xs truncate">Layer {i + 1}: {layer.type}</span>
              {#if layers.length > 1}
                <button
                  onclick={(e) => { e.stopPropagation(); removeLayer(i); }}
                  class="text-xs px-1 hover:text-red-500"
                >
                  x
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Presets -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Presets
        </span>
        <div class="grid grid-cols-4 gap-2">
          {#each presets as preset}
            <button
              onclick={() => applyPreset(preset)}
              class="h-10 border border-(--color-border) hover:border-(--color-accent) transition-colors"
              style="background: {generatePatternCss({...createDefaultLayer(), ...preset}).background}; background-size: {generatePatternCss({...createDefaultLayer(), ...preset}).backgroundSize}"
              title={preset.name}
            ></button>
          {/each}
        </div>
        <button
          onclick={randomPattern}
          class="mt-3 w-full px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-colors"
        >
          Random Pattern
        </button>
      </div>
    </div>

    <!-- Preview and Output -->
    <div class="flex-1 flex flex-col gap-4 min-h-0">
      <!-- Preview -->
      <div class="flex-1 min-h-[200px] flex flex-col">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Preview (.container)
        </span>
        {@html `<style>${displayCss()}</style>`}
        <div
          class="container flex-1 border border-(--color-border) min-h-[200px] preview-pattern"
          class:animate-horizontal={animation.enabled && animation.direction === "horizontal" && !customCssMode}
          class:animate-vertical={animation.enabled && animation.direction === "vertical" && !customCssMode}
          class:animate-diagonal={animation.enabled && animation.direction === "diagonal" && !customCssMode}
          style="
            --animation-speed: {animation.speed}s;
            --pattern-size: {currentLayer.size * 2}px;
          "
        ></div>
      </div>

      <!-- CSS Output -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            CSS Code {customCssMode ? "(Edited)" : ""}
          </span>
          <div class="flex items-center gap-3">
            {#if customCssMode}
              <button
                onclick={resetToGenerated}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Reset
              </button>
            {/if}
            <button
              onclick={() => copyToClipboard(displayCss(), "css")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied === "css" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <textarea
          value={displayCss()}
          oninput={(e) => handleCssEdit((e.target as HTMLTextAreaElement).value)}
          class="w-full h-40 px-3 py-2 font-mono text-xs text-(--color-text) bg-(--color-bg) border border-(--color-border) focus:outline-none focus:border-(--color-accent) resize-none"
          spellcheck="false"
        ></textarea>
        <p class="text-xs text-(--color-text-muted) mt-2">
          Edit the CSS directly to see changes in the preview.
        </p>
      </div>


    </div>
  </div>
</div>

<style>
  @keyframes scrollHorizontal {
    from { background-position: 0 0; }
    to { background-position: var(--pattern-size) 0; }
  }

  @keyframes scrollVertical {
    from { background-position: 0 0; }
    to { background-position: 0 var(--pattern-size); }
  }

  @keyframes scrollDiagonal {
    from { background-position: 0 0; }
    to { background-position: var(--pattern-size) var(--pattern-size); }
  }

  .preview-pattern.animate-horizontal {
    animation: scrollHorizontal var(--animation-speed) linear infinite;
  }

  .preview-pattern.animate-vertical {
    animation: scrollVertical var(--animation-speed) linear infinite;
  }

  .preview-pattern.animate-diagonal {
    animation: scrollDiagonal var(--animation-speed) linear infinite;
  }

  .pixel-cell {
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
  }

  .pixel-grid {
    touch-action: none;
  }
</style>
