<script lang="ts">
  import { random } from "../../lib/random";

  interface DieConfig {
    sides: number;
    count: number;
    colorIndex: number;
  }

  interface DieResult {
    sides: number;
    value: number;
    id: number;
    colorIndex: number;
  }

  interface RollHistory {
    dice: DieResult[];
    total: number;
    timestamp: Date;
    preset: string | null;
  }

  interface Preset {
    name: string;
    description: string;
    dice: { sides: number; count: number }[];
  }

  // Color themes for dice
  const colorThemes = [
    { name: "Classic", bg: "#1a1a1a", text: "#ffffff", border: "#333333" },
    { name: "Red", bg: "#DC2626", text: "#ffffff", border: "#B91C1C" },
    { name: "Blue", bg: "#2563EB", text: "#ffffff", border: "#1D4ED8" },
    { name: "Green", bg: "#16A34A", text: "#ffffff", border: "#15803D" },
    { name: "Purple", bg: "#9333EA", text: "#ffffff", border: "#7E22CE" },
    { name: "Orange", bg: "#EA580C", text: "#ffffff", border: "#C2410C" },
    { name: "Cyan", bg: "#0891B2", text: "#ffffff", border: "#0E7490" },
    { name: "White", bg: "#F5F5F5", text: "#000000", border: "#D4D4D4" },
    { name: "Mustard", bg: "#FFD166", text: "#000000", border: "#E6BC5C" },
    { name: "Mint", bg: "#06D6A0", text: "#000000", border: "#05B587" },
    { name: "Sky", bg: "#98C1D9", text: "#000000", border: "#7BACC9" },
  ];

  // Presets for common games
  const presets: Preset[] = [
    {
      name: "D20",
      description: "Standard D&D attack roll",
      dice: [{ sides: 20, count: 1 }],
    },
    {
      name: "2D6",
      description: "Monopoly, Catan, etc.",
      dice: [{ sides: 6, count: 2 }],
    },
    {
      name: "D20 + D6",
      description: "Attack with damage",
      dice: [
        { sides: 20, count: 1 },
        { sides: 6, count: 1 },
      ],
    },
    {
      name: "4D6 Drop Lowest",
      description: "D&D stat generation",
      dice: [{ sides: 6, count: 4 }],
    },
    {
      name: "D100",
      description: "Percentile roll",
      dice: [{ sides: 100, count: 1 }],
    },
    {
      name: "3D6",
      description: "Classic stat roll",
      dice: [{ sides: 6, count: 3 }],
    },
    {
      name: "Advantage",
      description: "Roll 2D20, take highest",
      dice: [{ sides: 20, count: 2 }],
    },
    {
      name: "Disadvantage",
      description: "Roll 2D20, take lowest",
      dice: [{ sides: 20, count: 2 }],
    },
    {
      name: "Fudge/Fate",
      description: "4 Fate dice (-1, 0, +1)",
      dice: [{ sides: 3, count: 4 }],
    },
    {
      name: "D&D Full Set",
      description: "D4, D6, D8, D10, D12, D20",
      dice: [
        { sides: 4, count: 1 },
        { sides: 6, count: 1 },
        { sides: 8, count: 1 },
        { sides: 10, count: 1 },
        { sides: 12, count: 1 },
        { sides: 20, count: 1 },
      ],
    },
  ];

  // Available die sizes
  const dieSizes = [4, 6, 8, 10, 12, 20, 100];

  // State
  let selectedDice = $state<DieConfig[]>([
    { sides: 6, count: 1, colorIndex: 2 }, // Blue by default
    { sides: 6, count: 1, colorIndex: 1 }, // Red by default
  ]);
  let results = $state<DieResult[]>([]);
  let displayedTotal = $state<number | null>(null);
  let isRolling = $state(false);
  let isCooldown = $state(false);
  let cooldownRemaining = $state(0);
  let history = $state<RollHistory[]>([]);
  let lastPreset = $state<string | null>(null);
  let showAddDie = $state(false);
  let newDieSides = $state(6);
  let newDieCount = $state(1);
  let newDieColorIndex = $state(0);
  let cooldownTime = $state(5); // seconds
  let editingDieIndex = $state<number | null>(null);
  let isFullscreen = $state(false);

  // Derived
  let canRoll = $derived(!isRolling && !isCooldown && selectedDice.length > 0);

  // Get the display value for the total (handles special presets)
  let displayValue = $derived.by(() => {
    if (displayedTotal === null) return null;
    if (lastPreset === "Fudge/Fate" && results.length > 0) {
      return getFateTotal(results);
    }
    const special = getSpecialResultValue();
    if (special !== null) return special;
    return displayedTotal;
  });

  // Format display value with sign for fate dice
  let formattedDisplayValue = $derived.by(() => {
    if (displayValue === null) return "";
    if (lastPreset === "Fudge/Fate") {
      return (displayValue >= 0 ? "+" : "") + displayValue;
    }
    return displayValue.toString();
  });

  // Format die value for display
  const formatDieValue = (die: DieResult): string => {
    // Fate dice show -, 0, +
    if (die.sides === 3) {
      const symbols = ["-", "0", "+"];
      return symbols[die.value - 1] || die.value.toString();
    }
    return die.value.toString();
  };

  // Get fate dice total (convert 1,2,3 to -1,0,+1)
  const getFateTotal = (dice: DieResult[]): number => {
    return dice
      .filter((d) => d.sides === 3)
      .reduce((sum, d) => sum + (d.value - 2), 0);
  };

  // Roll all dice
  const roll = () => {
    if (!canRoll) return;

    isRolling = true;
    results = [];
    displayedTotal = null;

    // Animation parameters - slower and with easing
    const totalDuration = 2000; // 2 seconds total
    const startTime = Date.now();
    let idCounter = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);

      // Easing function - starts fast, slows down at the end
      const easeOut = 1 - Math.pow(1 - progress, 3);

      // Calculate delay between updates - starts at 50ms, increases to 300ms
      const currentDelay = 50 + 250 * easeOut;

      const newResults: DieResult[] = [];
      for (const dieConfig of selectedDice) {
        for (let i = 0; i < dieConfig.count; i++) {
          newResults.push({
            sides: dieConfig.sides,
            value: Math.floor(random() * dieConfig.sides) + 1,
            id: idCounter++,
            colorIndex: dieConfig.colorIndex,
          });
        }
      }
      results = newResults;

      if (progress < 1) {
        setTimeout(animate, currentDelay);
      } else {
        isRolling = false;
        displayedTotal = results.reduce((sum, d) => sum + d.value, 0);

        // Add to history
        history = [
          {
            dice: [...results],
            total: displayedTotal,
            timestamp: new Date(),
            preset: lastPreset,
          },
          ...history.slice(0, 19),
        ];

        // Start cooldown
        if (cooldownTime > 0) {
          isCooldown = true;
          cooldownRemaining = cooldownTime;
          const cooldownInterval = setInterval(() => {
            cooldownRemaining -= 0.1;
            if (cooldownRemaining <= 0) {
              isCooldown = false;
              cooldownRemaining = 0;
              clearInterval(cooldownInterval);
            }
          }, 100);
        }
      }
    };

    animate();
  };

  // Apply preset
  const applyPreset = (preset: Preset) => {
    // Assign different colors to different die types
    const defaultColors = [2, 1, 3, 4, 5, 6, 7]; // Blue, Red, Green, Purple, Orange, Pink, Cyan
    // Expand dice: if count > 1, create separate entries for each die
    const expandedDice: DieConfig[] = [];
    let colorIdx = 0;
    for (const d of preset.dice) {
      for (let i = 0; i < d.count; i++) {
        expandedDice.push({
          sides: d.sides,
          count: 1,
          colorIndex: defaultColors[colorIdx % defaultColors.length],
        });
        colorIdx++;
      }
    }
    selectedDice = expandedDice;
    lastPreset = preset.name;
    results = [];
    displayedTotal = null;
    editingDieIndex = null;
  };

  // Add a die type
  const addDie = () => {
    selectedDice = [
      ...selectedDice,
      { sides: newDieSides, count: newDieCount, colorIndex: newDieColorIndex },
    ];
    showAddDie = false;
    lastPreset = null;
    results = [];
    displayedTotal = null;
  };

  // Remove a die at index
  const removeDie = (index: number) => {
    selectedDice = selectedDice.filter((_, i) => i !== index);
    lastPreset = null;
    results = [];
    displayedTotal = null;
    if (editingDieIndex === index) {
      editingDieIndex = null;
    } else if (editingDieIndex !== null && editingDieIndex > index) {
      editingDieIndex--;
    }
  };

  // Increment die count at index
  const incrementDie = (index: number) => {
    selectedDice[index].count++;
    selectedDice = [...selectedDice];
    lastPreset = null;
  };

  // Decrement die count at index
  const decrementDie = (index: number) => {
    if (selectedDice[index].count > 1) {
      selectedDice[index].count--;
      selectedDice = [...selectedDice];
    }
    lastPreset = null;
  };

  // Change die color at index
  const changeDieColor = (index: number, colorIndex: number) => {
    selectedDice[index].colorIndex = colorIndex;
    selectedDice = [...selectedDice];
  };

  // Change die sides at index
  const changeDieSides = (index: number, sides: number) => {
    selectedDice[index].sides = sides;
    selectedDice = [...selectedDice];
    lastPreset = null;
  };

  // Toggle editing mode for a die
  const toggleEditDie = (index: number) => {
    if (editingDieIndex === index) {
      editingDieIndex = null;
    } else {
      editingDieIndex = index;
    }
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    isFullscreen = !isFullscreen;
  };

  // Handle escape key to close fullscreen
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        isFullscreen = false;
      }
    };
    if (isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  });

  // Clear history
  const clearHistory = () => {
    history = [];
  };

  // Check if current dice match a preset
  const isActivePreset = (preset: Preset): boolean => {
    // Count total dice per sides in current selection
    const currentCounts: Record<number, number> = {};
    for (const die of selectedDice) {
      currentCounts[die.sides] = (currentCounts[die.sides] || 0) + die.count;
    }

    // Count total dice per sides in preset
    const presetCounts: Record<number, number> = {};
    for (const die of preset.dice) {
      presetCounts[die.sides] = (presetCounts[die.sides] || 0) + die.count;
    }

    // Compare
    const currentKeys = Object.keys(currentCounts).sort();
    const presetKeys = Object.keys(presetCounts).sort();
    if (currentKeys.length !== presetKeys.length) return false;
    return currentKeys.every(
      (key) => currentCounts[Number(key)] === presetCounts[Number(key)]
    );
  };

  // Calculate special results for specific presets
  const getSpecialResult = (): string | null => {
    if (lastPreset === "4D6 Drop Lowest" && results.length === 4) {
      const sorted = [...results].sort((a, b) => a.value - b.value);
      const kept = sorted.slice(1);
      const sum = kept.reduce((s, d) => s + d.value, 0);
      return `Drop ${sorted[0].value}, Keep ${kept.map((d) => d.value).join("+")} = ${sum}`;
    }
    if (lastPreset === "Advantage" && results.length === 2) {
      const max = Math.max(...results.map((d) => d.value));
      return `Take highest: ${max}`;
    }
    if (lastPreset === "Disadvantage" && results.length === 2) {
      const min = Math.min(...results.map((d) => d.value));
      return `Take lowest: ${min}`;
    }
    if (lastPreset === "Fudge/Fate" && results.length === 4) {
      const fateTotal = getFateTotal(results);
      const sign = fateTotal >= 0 ? "+" : "";
      return `Fate result: ${sign}${fateTotal}`;
    }
    return null;
  };

  // Get special result value (for large display)
  const getSpecialResultValue = (): number | null => {
    if (lastPreset === "4D6 Drop Lowest" && results.length === 4) {
      const sorted = [...results].sort((a, b) => a.value - b.value);
      return sorted.slice(1).reduce((s, d) => s + d.value, 0);
    }
    if (lastPreset === "Advantage" && results.length === 2) {
      return Math.max(...results.map((d) => d.value));
    }
    if (lastPreset === "Disadvantage" && results.length === 2) {
      return Math.min(...results.map((d) => d.value));
    }
    return null;
  };

  // Get SVG path for die shape
  const getDiePath = (sides: number): string => {
    switch (sides) {
      case 4: // Triangle
        return "M60 10 L110 100 L10 100 Z";
      case 6: // Square with rounded corners
        return "M20 10 H100 Q110 10 110 20 V100 Q110 110 100 110 H20 Q10 110 10 100 V20 Q10 10 20 10 Z";
      case 8: // Diamond
        return "M60 5 L115 60 L60 115 L5 60 Z";
      case 10: // Pentagon
        return "M60 5 L112 40 L95 105 L25 105 L8 40 Z";
      case 12: // Hexagon
        return "M60 5 L105 25 L115 70 L90 110 L30 110 L5 70 L15 25 Z";
      case 20: // D20 shape
        return "M60 5 L110 30 L110 90 L60 115 L10 90 L10 30 Z";
      case 100: // Circle
        return "M60 5 A55 55 0 1 1 60 115 A55 55 0 1 1 60 5 Z";
      case 3: // Fate dice - square
        return "M15 15 H105 V105 H15 Z";
      default:
        return "M20 10 H100 Q110 10 110 20 V100 Q110 110 100 110 H20 Q10 110 10 100 V20 Q10 10 20 10 Z";
    }
  };

  // Get small SVG path for preview (scaled down)
  const getSmallDiePath = (sides: number): string => {
    switch (sides) {
      case 4:
        return "M20 3 L37 33 L3 33 Z";
      case 6:
        return "M7 3 H33 Q37 3 37 7 V33 Q37 37 33 37 H7 Q3 37 3 33 V7 Q3 3 7 3 Z";
      case 8:
        return "M20 2 L38 20 L20 38 L2 20 Z";
      case 10:
        return "M20 2 L37 13 L32 35 L8 35 L3 13 Z";
      case 12:
        return "M20 2 L35 8 L38 23 L30 37 L10 37 L2 23 L5 8 Z";
      case 20:
        return "M20 2 L37 10 L37 30 L20 38 L3 30 L3 10 Z";
      case 100:
        return "M20 2 A18 18 0 1 1 20 38 A18 18 0 1 1 20 2 Z";
      case 3:
        return "M5 5 H35 V35 H5 Z";
      default:
        return "M7 3 H33 Q37 3 37 7 V33 Q37 37 33 37 H7 Q3 37 3 33 V7 Q3 3 7 3 Z";
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Roll dice of various sizes with customizable quantities. Click on dice to
      configure colors.
    </p>
  </header>

  <!-- Presets -->
  <div class="mb-4">
    <label
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2 block"
    >
      Presets
    </label>
    <div class="flex flex-wrap gap-2">
      {#each presets as preset}
        <button
          onclick={() => applyPreset(preset)}
          class="px-3 py-1.5 text-sm border transition-colors {isActivePreset(
            preset
          )
            ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
            : 'border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
          title={preset.description}
        >
          {preset.name}
        </button>
      {/each}
    </div>
  </div>

  <hr class="border-t border-(--color-border) mb-4" />

  <div class="flex gap-2">
    <!-- Roll Button -->
    <div class="flex items-center gap-4 mb-4">
      <div class="relative">
        <button
          onclick={roll}
          disabled={!canRoll}
          class="w-40 px-6 py-4 bg-(--color-accent) text-(--color-btn-text) font-bold text-xl hover:bg-(--color-accent-hover) transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
        >
          {#if isRolling}
            Rolling...
          {:else if isCooldown}
            Wait {cooldownRemaining.toFixed(1)}s
          {:else}
            ROLL
          {/if}
        </button>
        {#if isCooldown}
          <div
            class="absolute bottom-0 left-0 h-1 bg-(--color-accent-hover) cooldown-bar"
            style="width: {(cooldownRemaining / cooldownTime) * 100}%"
          ></div>
        {/if}
      </div>
    </div>
    <!-- Dice Configuration with Preview -->
    <div class="mb-4 flex-1">
      <div class="flex flex-wrap items-center justify-between mb-2">
        <label
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          Dice Configuration (click to edit)
        </label>
        <div class="flex flex-wrap items-center gap-4">
          <label
            class="flex items-center gap-2 text-xs text-(--color-text-muted)"
          >
            Cooldown:
            <input
              type="number"
              bind:value={cooldownTime}
              min="0"
              max="10"
              step="0.5"
              class="w-14 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs text-center"
            />
            <span>sec</span>
          </label>
          <button
            onclick={() => {
              showAddDie = !showAddDie;
              editingDieIndex = null;
            }}
            class="text-xs px-2 py-1 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
          >
            + Add Die
          </button>
        </div>
      </div>

      <!-- Add Die Form -->
      {#if showAddDie}
        <div
          class="mb-3 p-3 border border-(--color-border) bg-(--color-bg-alt)"
        >
          <div class="flex items-center gap-3 mb-3">
            <select
              bind:value={newDieSides}
              class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm"
            >
              {#each dieSizes as size}
                <option value={size}>D{size}</option>
              {/each}
            </select>
            <span class="text-(--color-text-muted)">x</span>
            <input
              type="number"
              bind:value={newDieCount}
              min="1"
              max="20"
              class="w-16 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm"
            />
            <button
              onclick={addDie}
              class="px-3 py-1 bg-(--color-accent) text-(--color-btn-text) text-sm hover:bg-(--color-accent-hover) transition-colors"
            >
              Add
            </button>
            <button
              onclick={() => (showAddDie = false)}
              class="px-3 py-1 border border-(--color-border) text-(--color-text) text-sm hover:bg-(--color-bg-alt) transition-colors"
            >
              Cancel
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Color:</span>
            <div class="flex gap-1">
              {#each colorThemes as color, index}
                <button
                  onclick={() => (newDieColorIndex = index)}
                  class="w-6 h-6 rounded border-2 transition-all {newDieColorIndex ===
                  index
                    ? 'border-(--color-accent) scale-110'
                    : 'border-transparent hover:border-(--color-border)'}"
                  style="background-color: {color.bg};"
                  title={color.name}
                />
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Dice Preview Grid -->
      <div class="flex flex-wrap gap-3">
        {#each selectedDice as die, index}
          {@const color = colorThemes[die.colorIndex]}
          <div class="relative">
            <!-- Dice Preview Card -->
            <button
              onclick={() => toggleEditDie(index)}
              class="flex items-center gap-1 px-2 py-1 border transition-all hover:border-(--color-accent) {editingDieIndex ===
              index
                ? 'border-(--color-accent) bg-(--color-bg-alt)'
                : 'border-(--color-border) bg-(--color-bg-alt)'}"
            >
              <!-- Show each die separately -->
              {#each Array(Math.min(die.count, 6)) as _, i}
                <svg viewBox="0 0 40 40" class="w-10 h-10">
                  <path
                    d={getSmallDiePath(die.sides)}
                    fill={color.bg}
                    stroke={color.border}
                    stroke-width="2"
                  />
                  <text
                    x="20"
                    y={die.sides === 4 ? "24" : "22"}
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill={color.text}
                    font-size="12"
                    font-weight="bold"
                  >
                    {die.sides}
                  </text>
                </svg>
              {/each}
              {#if die.count > 6}
                <span class="text-xs text-(--color-text-muted) ml-1"
                  >+{die.count - 6}</span
                >
              {/if}
            </button>

            <!-- Remove button -->
            <button
              onclick={() => removeDie(index)}
              class="opacity-40 hover:opacity-100 absolute -top-2 -right-2 w-5 h-5 bg-(--color-bg-secondary) text-white flex items-center justify-center hover:bg-red-500 transition-colors"
              title="Remove"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <!-- Edit Panel -->
            {#if editingDieIndex === index}
              <div
                class="absolute top-full left-0 mt-2 p-3 bg-(--color-bg) border border-(--color-border) z-10 min-w-[200px]"
              >
                <!-- Count -->
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs text-(--color-text-muted)">Count:</span>
                  <div class="flex items-center gap-2">
                    <button
                      onclick={() => decrementDie(index)}
                      disabled={die.count <= 1}
                      class="w-7 h-7 flex items-center justify-center border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      -
                    </button>
                    <span class="font-mono text-(--color-text) w-8 text-center"
                      >{die.count}</span
                    >
                    <button
                      onclick={() => incrementDie(index)}
                      class="w-7 h-7 flex items-center justify-center border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)"
                    >
                      +
                    </button>
                  </div>
                </div>

                <!-- Die Type -->
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs text-(--color-text-muted)">Type:</span>
                  <select
                    value={die.sides}
                    onchange={(e) =>
                      changeDieSides(index, parseInt(e.currentTarget.value))}
                    class="px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm"
                  >
                    {#each dieSizes as size}
                      <option value={size}>D{size}</option>
                    {/each}
                  </select>
                </div>

                <!-- Color -->
                <div class="mb-2">
                  <span class="text-xs text-(--color-text-muted) block mb-2"
                    >Color:</span
                  >
                  <div class="flex flex-wrap gap-1">
                    {#each colorThemes as colorOption, colorIdx}
                      <button
                        onclick={() => changeDieColor(index, colorIdx)}
                        class="w-6 h-6 rounded border-2 transition-all {die.colorIndex ===
                        colorIdx
                          ? 'border-(--color-accent) scale-110'
                          : 'border-transparent hover:border-(--color-border)'}"
                        style="background-color: {colorOption.bg};"
                        title={colorOption.name}
                      />
                    {/each}
                  </div>
                </div>

                <button
                  onclick={() => (editingDieIndex = null)}
                  class="w-full mt-2 px-3 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
                >
                  Done
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      {#if selectedDice.length === 0}
        <div class="text-sm text-(--color-text-muted) py-4 text-center">
          No dice selected. Add dice or choose a preset above.
        </div>
      {/if}
    </div>
  </div>

  <hr class="border-t border-(--color-border) mb-4" />

  <!-- Results -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Dice Results -->
    <div class="flex-1">
      <div class="flex items-center justify-between mb-2">
        <label
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          Results
        </label>
        <button
          onclick={toggleFullscreen}
          class="p-1.5 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors"
          title="Fullscreen"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>

      {#if results.length === 0 && !isRolling}
        <div
          class="flex items-center justify-center min-h-[350px] border border-(--color-border) bg-(--color-bg-alt) text-(--color-text-muted) text-lg"
        >
          Click ROLL to roll the dice
        </div>
      {:else}
        <div
          class="border border-(--color-border) bg-(--color-bg-alt) p-8 min-h-[350px] flex items-center justify-center relative"
        >
          <!-- Total Display - Top Right -->
          {#if displayedTotal !== null || isRolling}
            <div class="flex items-center gap-3 absolute top-2 right-2">
              {#if getSpecialResult() && !isRolling}
                <span class="text-sm text-(--color-text-muted)"
                  >{getSpecialResult()}</span
                >
              {/if}
              <div
                class="total-display px-4 py-1 bg-(--color-bg-secondary) text-white text-3xl md:text-4xl min-w-[140px] text-center {!isRolling
                  ? 'total-pop'
                  : ''}"
                class:opacity-50={isRolling}
              >
                {#if isRolling}
                  <span class="animate-pulse">--</span>
                {:else}
                  {formattedDisplayValue}
                {/if}
              </div>
            </div>
          {/if}

          <!-- Individual Dice - 2D Flat Style with individual colors -->
          <div class="flex flex-wrap gap-6 justify-center">
            {#each results as die (die.id)}
              {@const color = colorThemes[die.colorIndex]}
              <div class="relative {isRolling ? 'rolling' : 'die-pop'}">
                <svg
                  viewBox="0 0 120 120"
                  class="w-28 h-28 md:w-32 md:h-32 lg:w-36 lg:h-36"
                >
                  <path
                    d={getDiePath(die.sides)}
                    fill={color.bg}
                    stroke={color.border}
                    stroke-width="3"
                  />
                  <text
                    x="60"
                    y={die.sides === 4 ? "75" : "68"}
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill={color.text}
                    font-size={die.sides === 100 ? "36" : "42"}
                    font-weight="bold"
                    font-family="system-ui, sans-serif"
                  >
                    {formatDieValue(die)}
                  </text>
                </svg>
                <span
                  class="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs px-2 py-0.5 rounded font-medium"
                  style="background-color: {color.border}; color: {color.text};"
                >
                  D{die.sides}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- History -->
    <div class="w-full lg:w-80 shrink-0">
      <div class="flex items-center justify-between mb-2">
        <label
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          History ({history.length})
        </label>
        {#if history.length > 0}
          <button
            onclick={clearHistory}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        {/if}
      </div>

      <div
        class="border border-(--color-border) bg-(--color-bg-alt) overflow-y-auto max-h-80 lg:max-h-[500px]"
      >
        {#if history.length === 0}
          <div class="p-4 text-sm text-(--color-text-muted) text-center">
            No rolls yet
          </div>
        {:else}
          <div class="divide-y divide-(--color-border)">
            {#each history as entry, i}
              <div class="p-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex flex-wrap gap-1">
                    {#each entry.dice as die}
                      {@const color = colorThemes[die.colorIndex]}
                      <span
                        class="inline-flex items-center justify-center w-9 h-9 text-sm font-bold rounded border-2"
                        style="background-color: {color.bg}; color: {color.text}; border-color: {color.border};"
                      >
                        {formatDieValue(die)}
                      </span>
                    {/each}
                  </div>
                  <span
                    class="text-2xl text-white bg-(--color-bg-secondary) px-5 py-1"
                  >
                    {entry.preset === "Fudge/Fate"
                      ? (getFateTotal(entry.dice) >= 0 ? "+" : "") +
                        getFateTotal(entry.dice)
                      : entry.total}
                  </span>
                </div>
                <div class="text-xs text-(--color-text-muted)">
                  {entry.preset
                    ? entry.preset + " | "
                    : ""}{entry.timestamp.toLocaleTimeString()}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Fullscreen Overlay -->
  {#if isFullscreen}
    <div
      class="fixed inset-0 z-50 bg-(--color-bg) flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <!-- Close Button -->
      <button
        onclick={toggleFullscreen}
        class="absolute top-4 right-4 p-2 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors"
        title="Exit Fullscreen (Esc)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <!-- Results Display -->
      <div class="flex-1 flex flex-col items-center justify-center w-full max-w-5xl px-8">
        {#if results.length === 0 && !isRolling}
          <div class="text-(--color-text-muted) text-2xl mb-8">
            Click ROLL to roll the dice
          </div>
        {:else}
          <!-- Total Display -->
          {#if displayedTotal !== null || isRolling}
            <div class="flex flex-col items-center gap-2 mb-8">
              {#if getSpecialResult() && !isRolling}
                <span class="text-lg text-(--color-text-muted)">{getSpecialResult()}</span>
              {/if}
              <div
                class="total-display px-8 py-4 bg-(--color-bg-secondary) text-white text-6xl md:text-8xl min-w-[200px] text-center {!isRolling ? 'total-pop' : ''}"
                class:opacity-50={isRolling}
              >
                {#if isRolling}
                  <span class="animate-pulse">--</span>
                {:else}
                  {formattedDisplayValue}
                {/if}
              </div>
            </div>
          {/if}

          <!-- Individual Dice -->
          <div class="flex flex-wrap gap-8 justify-center mb-8">
            {#each results as die (die.id)}
              {@const color = colorThemes[die.colorIndex]}
              <div class="relative {isRolling ? 'rolling' : 'die-pop'}">
                <svg viewBox="0 0 120 120" class="w-36 h-36 md:w-44 md:h-44 lg:w-52 lg:h-52">
                  <path
                    d={getDiePath(die.sides)}
                    fill={color.bg}
                    stroke={color.border}
                    stroke-width="3"
                  />
                  <text
                    x="60"
                    y={die.sides === 4 ? "75" : "68"}
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill={color.text}
                    font-size={die.sides === 100 ? "36" : "42"}
                    font-weight="bold"
                    font-family="system-ui, sans-serif"
                  >
                    {formatDieValue(die)}
                  </text>
                </svg>
                <span
                  class="absolute -bottom-1 left-1/2 -translate-x-1/2 text-sm px-3 py-1 rounded font-medium"
                  style="background-color: {color.border}; color: {color.text};"
                >
                  D{die.sides}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Roll Button -->
      <div class="pb-12">
        <div class="relative">
          <button
            onclick={roll}
            disabled={!canRoll}
            class="w-48 px-8 py-5 bg-(--color-accent) text-(--color-btn-text) font-bold text-2xl hover:bg-(--color-accent-hover) transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
          >
            {#if isRolling}
              Rolling...
            {:else if isCooldown}
              Wait {cooldownRemaining.toFixed(1)}s
            {:else}
              ROLL
            {/if}
          </button>
          {#if isCooldown}
            <div
              class="absolute bottom-0 left-0 h-1.5 bg-(--color-accent-hover) cooldown-bar"
              style="width: {(cooldownRemaining / cooldownTime) * 100}%"
            ></div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .rolling {
    animation: roll 0.3s ease-in-out infinite;
  }

  @keyframes roll {
    0% {
      transform: rotate(0deg) scale(1);
    }
    25% {
      transform: rotate(8deg) scale(1.02);
    }
    50% {
      transform: rotate(0deg) scale(1);
    }
    75% {
      transform: rotate(-8deg) scale(1.02);
    }
    100% {
      transform: rotate(0deg) scale(1);
    }
  }

  @keyframes pop {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.03);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .die-pop {
    animation: pop 0.4s ease-out;
  }

  @keyframes total-pop {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    60% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .total-pop {
    animation: total-pop 0.5s ease-out;
  }

  .cooldown-bar {
    transition: width 0.1s linear;
  }

  .total-display {
    font-variant-numeric: tabular-nums;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .fixed.inset-0 {
    animation: fadeIn 0.2s ease-out;
  }
</style>
