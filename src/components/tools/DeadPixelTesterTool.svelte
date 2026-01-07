<script lang="ts">
  let isTesting = $state(false);
  let selectedColor = $state("#000");
  let selectedPattern = $state("solid");
  let lastTapTime = $state(0);

  const colors = [
    { name: "Black", value: "#000" },
    { name: "White", value: "#fff" },
    { name: "Red", value: "#f00" },
    { name: "Green", value: "#0f0" },
    { name: "Blue", value: "#00f" },
    { name: "Cyan", value: "#0ff" },
    { name: "Magenta", value: "#f0f" },
    { name: "Yellow", value: "#ff0" },
    { name: "Gray 50%", value: "#808080" },
    { name: "Gray 25%", value: "#404040" },
    { name: "Gray 75%", value: "#c0c0c0" },
    { name: "Orange", value: "#ff8000" },
  ];

  const patterns = [
    { name: "Solid", value: "solid" },
    { name: "Checkerboard", value: "checkerboard" },
    { name: "Fine Checker", value: "checkerboard-fine" },
    { name: "H-Stripes", value: "stripes-horizontal" },
    { name: "V-Stripes", value: "stripes-vertical" },
    { name: "Diagonal", value: "stripes-diagonal" },
    { name: "Grid", value: "grid" },
    { name: "Dots", value: "dots" },
    { name: "Pixel Alt", value: "pixel-alternating" },
    { name: "H-Gradient", value: "gradient-horizontal" },
    { name: "V-Gradient", value: "gradient-vertical" },
    { name: "Color Bars", value: "color-bars" },
    { name: "Grayscale", value: "grayscale-bars" },
  ];

  // Generate CSS background for each pattern
  function getPatternStyle(pattern: string, color: string): string {
    switch (pattern) {
      case "solid":
        return `background-color: ${color};`;
      case "checkerboard":
        return `background-color: white; background-image: repeating-conic-gradient(${color} 0% 25%, white 0% 50%); background-size: 20px 20px;`;
      case "checkerboard-fine":
        return `background-color: white; background-image: repeating-conic-gradient(${color} 0% 25%, white 0% 50%); background-size: 8px 8px;`;
      case "stripes-horizontal":
        return `background-color: white; background-image: repeating-linear-gradient(0deg, ${color} 0px, ${color} 10px, white 10px, white 20px);`;
      case "stripes-vertical":
        return `background-color: white; background-image: repeating-linear-gradient(90deg, ${color} 0px, ${color} 10px, white 10px, white 20px);`;
      case "stripes-diagonal":
        return `background-color: white; background-image: repeating-linear-gradient(45deg, ${color} 0px, ${color} 10px, white 10px, white 20px);`;
      case "grid":
        return `background-color: white; background-image: linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px); background-size: 20px 20px;`;
      case "dots":
        return `background-color: white; background-image: radial-gradient(${color} 2px, transparent 2px); background-size: 10px 10px;`;
      case "pixel-alternating":
        return `background-color: white; background-image: repeating-conic-gradient(${color} 0% 25%, white 0% 50%); background-size: 2px 2px;`;
      case "gradient-horizontal":
        return `background: linear-gradient(90deg, black, ${color}, white);`;
      case "gradient-vertical":
        return `background: linear-gradient(180deg, black, ${color}, white);`;
      case "color-bars":
        return `background: linear-gradient(90deg, #000 0%, #000 12.5%, #fff 12.5%, #fff 25%, #f00 25%, #f00 37.5%, #0f0 37.5%, #0f0 50%, #00f 50%, #00f 62.5%, #ff0 62.5%, #ff0 75%, #0ff 75%, #0ff 87.5%, #f0f 87.5%, #f0f 100%);`;
      case "grayscale-bars":
        return `background: linear-gradient(90deg, #000 0%, #000 12.5%, #242424 12.5%, #242424 25%, #494949 25%, #494949 37.5%, #6d6d6d 37.5%, #6d6d6d 50%, #929292 50%, #929292 62.5%, #b6b6b6 62.5%, #b6b6b6 75%, #dbdbdb 75%, #dbdbdb 87.5%, #fff 87.5%, #fff 100%);`;
      default:
        return `background-color: ${color};`;
    }
  }

  const startTest = () => {
    isTesting = true;
    // Request fullscreen if possible
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  };

  const stopTest = () => {
    isTesting = false;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const nextColor = () => {
    const currentIndex = colors.findIndex(c => c.value === selectedColor);
    const nextIndex = (currentIndex + 1) % colors.length;
    selectedColor = colors[nextIndex].value;
  };

  const prevColor = () => {
    const currentIndex = colors.findIndex(c => c.value === selectedColor);
    const prevIndex = (currentIndex - 1 + colors.length) % colors.length;
    selectedColor = colors[prevIndex].value;
  };

  const nextPattern = () => {
    const currentIndex = patterns.findIndex(p => p.value === selectedPattern);
    const nextIndex = (currentIndex + 1) % patterns.length;
    selectedPattern = patterns[nextIndex].value;
  };

  const prevPattern = () => {
    const currentIndex = patterns.findIndex(p => p.value === selectedPattern);
    const prevIndex = (currentIndex - 1 + patterns.length) % patterns.length;
    selectedPattern = patterns[prevIndex].value;
  };

  const selectColor = (color: string) => {
    selectedColor = color;
  };

  const selectPattern = (pattern: string) => {
    selectedPattern = pattern;
  };

  // Handle double-tap to exit on touch devices
  const handleTouchEnd = (event: TouchEvent) => {
    const currentTime = Date.now();
    const tapGap = currentTime - lastTapTime;
    
    if (tapGap < 300 && tapGap > 0) {
      // Double tap detected
      event.preventDefault();
      stopTest();
    }
    
    lastTapTime = currentTime;
  };

  // Handle keyboard navigation
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      stopTest();
    } else if (event.key === "ArrowRight") {
      nextColor();
    } else if (event.key === "ArrowLeft") {
      prevColor();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nextPattern();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      prevPattern();
    } else if (event.key === " ") {
      event.preventDefault();
      nextColor();
    }
  };

  // Add event listener
  $effect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  // Listen for fullscreen exit (e.g., pressing Escape triggers browser's exit)
  $effect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isTesting) {
        isTesting = false;
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Test your screen for dead or stuck pixels using solid colors and patterns. Use arrow keys (left/right for colors, up/down for patterns) or spacebar to cycle. On touch devices, double-tap to exit fullscreen.
    </p>
  </header>

  <!-- Controls -->
  <div class="flex flex-col gap-4 mb-4">
    <!-- Color Selection -->
    <div>
      <h3 class="text-sm font-medium mb-2">Select Color</h3>
      <div class="flex flex-wrap gap-2">
        {#each colors as color}
          <button
            class="px-3 py-2 border border-(--color-border) hover:border-(--color-accent) transition-colors {selectedColor === color.value ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-bg)'}"
            onclick={() => selectColor(color.value)}
          >
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 border border-(--color-border)" style="background-color: {color.value}"></div>
              <span class="text-sm">{color.name}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Pattern Selection -->
    <div>
      <h3 class="text-sm font-medium mb-2">Select Pattern</h3>
      <div class="flex flex-wrap gap-2">
        {#each patterns as pattern}
          <button
            class="px-3 py-2 border border-(--color-border) hover:border-(--color-accent) transition-colors {selectedPattern === pattern.value ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-bg)'}"
            onclick={() => selectPattern(pattern.value)}
          >
            {pattern.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- Preview -->
    <div>
      <h3 class="text-sm font-medium mb-2">Preview</h3>
      <div 
        class="w-full h-24 border border-(--color-border)"
        style={getPatternStyle(selectedPattern, selectedColor)}
      ></div>
    </div>

    <!-- Start Test Button -->
    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors font-medium"
      onclick={startTest}
    >
      Start Fullscreen Test
    </button>
  </div>

  <!-- Test Overlay -->
  {#if isTesting}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50"
      style="cursor: none; {getPatternStyle(selectedPattern, selectedColor)}"
      ontouchend={handleTouchEnd}
    ></div>
  {/if}
</div>
