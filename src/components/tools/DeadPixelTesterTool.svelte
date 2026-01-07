<script lang="ts">
  let isTesting = $state(false);
  let selectedColor = $state("#000");
  let selectedPattern = $state("solid");

  const colors = [
    { name: "Black", value: "#000" },
    { name: "White", value: "#fff" },
    { name: "Red", value: "#f00" },
    { name: "Green", value: "#0f0" },
    { name: "Blue", value: "#00f" },
    { name: "Cyan", value: "#0ff" },
    { name: "Magenta", value: "#f0f" },
    { name: "Yellow", value: "#ff0" },
    { name: "Gray", value: "#808080" },
  ];

  const patterns = [
    { name: "Solid Color", value: "solid" },
    { name: "Checkerboard", value: "checkerboard" },
    { name: "Stripes Horizontal", value: "stripes-horizontal" },
    { name: "Stripes Vertical", value: "stripes-vertical" },
    { name: "Stripes Diagonal", value: "stripes-diagonal" },
  ];

  const startTest = () => {
    isTesting = true;
    // Request fullscreen if possible
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  };

  const stopTest = () => {
    isTesting = false;
    if (document.exitFullscreen) {
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

  // Handle keyboard navigation
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      stopTest();
    } else if (event.key === "ArrowRight") {
      nextColor();
    } else if (event.key === "ArrowLeft") {
      prevColor();
    } else if (event.key === "ArrowUp") {
      nextPattern();
    } else if (event.key === "ArrowDown") {
      prevPattern();
    }
  };

  // Add event listener
  $effect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Test your screen for dead pixels by displaying solid colors and patterns. Click "Start Test" to begin. Use arrow keys: left/right to switch colors, up/down to switch patterns in fullscreen mode.
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
      <div class="flex gap-2">
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

    <!-- Start Test Button -->
    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors font-medium"
      onclick={startTest}
    >
      Start Test
    </button>
  </div>

  <!-- Test Overlay -->
  {#if isTesting}
    <div
      class="fixed inset-0 z-50"
      style="cursor: none; background-color: {selectedPattern === 'solid' ? selectedColor : 'white'}; {selectedPattern === 'checkerboard' ? `background-image: repeating-conic-gradient(${selectedColor} 0% 25%, white 25% 50%, ${selectedColor} 50% 75%, white 75% 100%); background-size: 20px 20px;` : selectedPattern === 'stripes-horizontal' ? `background-image: repeating-linear-gradient(0deg, ${selectedColor} 0px, ${selectedColor} 10px, white 10px, white 20px);` : selectedPattern === 'stripes-vertical' ? `background-image: repeating-linear-gradient(90deg, ${selectedColor} 0px, ${selectedColor} 10px, white 10px, white 20px);` : selectedPattern === 'stripes-diagonal' ? `background-image: repeating-linear-gradient(45deg, ${selectedColor} 0px, ${selectedColor} 10px, white 10px, white 20px);` : ''}"
    ></div>
  {/if}
</div>