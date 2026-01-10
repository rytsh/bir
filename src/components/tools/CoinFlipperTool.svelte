<script lang="ts">
  import { random } from "../../lib/random";

  type CoinResult = "heads" | "tails";

  interface FlipRecord {
    result: CoinResult;
    timestamp: Date;
  }

  // State
  let result = $state<CoinResult | null>(null);
  let isFlipping = $state(false);
  let history = $state<FlipRecord[]>([]);
  let coinRotation = $state(0);
  let isFullscreen = $state(false);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    isFullscreen = !isFullscreen;
  };

  // Escape key to close fullscreen
  $effect(() => {
    if (!isFullscreen) return;
    
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        isFullscreen = false;
      }
    };
    
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  // Statistics
  let headsCount = $derived(history.filter(h => h.result === "heads").length);
  let tailsCount = $derived(history.filter(h => h.result === "tails").length);
  let headsPercent = $derived(history.length > 0 ? Math.round((headsCount / history.length) * 100) : 0);
  let tailsPercent = $derived(history.length > 0 ? Math.round((tailsCount / history.length) * 100) : 0);

  const flipCoin = () => {
    if (isFlipping) return;
    
    isFlipping = true;
    result = null;

    // Determine flip result
    const flipResult: CoinResult = random() < 0.5 ? "heads" : "tails";
    
    // Calculate target rotation
    // Heads = 0°, 360°, 720°, etc. (multiples of 360)
    // Tails = 180°, 540°, 900°, etc. (180 + multiples of 360)
    const fullRotations = Math.floor(random() * 3) + 3; // 3-5 full rotations
    const targetEnd = flipResult === "tails" ? 180 : 0;
    
    // Calculate how many full rotations we need to add from current position
    // to reach the target end position
    const currentNormalized = ((coinRotation % 360) + 360) % 360; // 0-359
    const rotationsToAdd = fullRotations * 360;
    
    // Target: current + rotations + adjustment to land on correct face
    let targetRotation = coinRotation + rotationsToAdd;
    
    // Adjust to land on the correct face
    const targetNormalized = ((targetRotation % 360) + 360) % 360;
    if (flipResult === "heads") {
      // Need to land on 0° (or 360°)
      if (targetNormalized > 180) {
        targetRotation += (360 - targetNormalized);
      } else {
        targetRotation -= targetNormalized;
      }
    } else {
      // Need to land on 180°
      if (targetNormalized > 180) {
        targetRotation -= (targetNormalized - 180);
      } else {
        targetRotation += (180 - targetNormalized);
      }
    }

    // Animate
    const duration = 1500;
    const startRotation = coinRotation;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function - starts fast, slows down
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      coinRotation = startRotation + (targetRotation - startRotation) * easeOut;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        isFlipping = false;
        result = flipResult;
        
        // Add to history
        history = [
          { result: flipResult, timestamp: new Date() },
          ...history.slice(0, 49), // Keep last 50
        ];
      }
    };

    requestAnimationFrame(animate);
  };

  const clearHistory = () => {
    history = [];
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Flip a coin to make decisions. Track your flip history and statistics.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-6">
    <!-- Left: Coin and Controls -->
    <div class="flex-1 flex flex-col items-center">
      <!-- Fullscreen Button -->
      <div class="w-full flex justify-end mb-2">
        <button
          onclick={toggleFullscreen}
          class="p-2 text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Fullscreen mode"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>

      <!-- Coin Display -->
      <div class="relative mb-8" style="perspective: 1000px;">
        <div
          class="coin-container"
          style="transform: rotateX({coinRotation}deg);"
        >
          <!-- Heads Side - Star -->
          <div class="coin coin-heads">
            <div class="coin-inner">
              <svg viewBox="0 0 100 100" class="w-full h-full">
                <!-- Outer ring -->
                <circle cx="50" cy="50" r="48" fill="none" stroke="#909090" stroke-width="2" />
                <!-- Inner decorative ring -->
                <circle cx="50" cy="50" r="42" fill="none" stroke="#a0a0a0" stroke-width="1" />
                
                <!-- 5-pointed star -->
                <polygon 
                  points="50,18 56,38 78,38 61,50 67,72 50,58 33,72 39,50 22,38 44,38"
                  fill="#808080"
                  stroke="#707070"
                  stroke-width="1"
                />
              </svg>
              <span class="coin-label">HEADS</span>
            </div>
          </div>
          
          <!-- Tails Side - Triangle -->
          <div class="coin coin-tails">
            <div class="coin-inner">
              <svg viewBox="0 0 100 100" class="w-full h-full">
                <!-- Outer ring -->
                <circle cx="50" cy="50" r="48" fill="none" stroke="#909090" stroke-width="2" />
                <!-- Inner decorative ring -->
                <circle cx="50" cy="50" r="42" fill="none" stroke="#a0a0a0" stroke-width="1" />
                
                <!-- Triangle -->
                <polygon 
                  points="50,22 76,68 24,68"
                  fill="#808080"
                  stroke="#707070"
                  stroke-width="1"
                />
              </svg>
              <span class="coin-label">TAILS</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Result Display -->
      <div class="text-center mb-6 h-16">
        {#if isFlipping}
          <div class="text-2xl font-bold text-(--color-text) animate-pulse">
            Flipping...
          </div>
        {:else if result}
          <div class="text-4xl font-bold text-(--color-text) result-pop">
            {result === "heads" ? "HEADS" : "TAILS"}
          </div>
        {:else}
          <div class="text-lg text-(--color-text-muted)">
            Click the button to flip
          </div>
        {/if}
      </div>

      <!-- Flip Button -->
      <button
        onclick={flipCoin}
        disabled={isFlipping}
        class="px-12 py-4 bg-(--color-accent) text-(--color-btn-text) font-bold text-xl hover:bg-(--color-accent-hover) transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isFlipping ? "Flipping..." : "FLIP"}
      </button>
    </div>

    <!-- Right: Statistics and History -->
    <div class="lg:w-72 flex-shrink-0 flex flex-col gap-4">
      <!-- Statistics -->
      <div>
        <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3">
          Statistics ({history.length} flip{history.length !== 1 ? "s" : ""})
        </div>
        
        <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          <div class="flex justify-between items-center mb-3">
            <div class="text-center flex-1">
              <div class="text-3xl font-bold text-(--color-text)">{headsCount}</div>
              <div class="text-xs text-(--color-text-muted)">Heads ({headsPercent}%)</div>
            </div>
            <div class="text-2xl text-(--color-text-muted) px-4">:</div>
            <div class="text-center flex-1">
              <div class="text-3xl font-bold text-(--color-text)">{tailsCount}</div>
              <div class="text-xs text-(--color-text-muted)">Tails ({tailsPercent}%)</div>
            </div>
          </div>
          
          <!-- Progress bar -->
          {#if history.length > 0}
            <div class="h-3 bg-(--color-border) rounded overflow-hidden flex">
              <div 
                class="h-full bg-amber-500 transition-all duration-300"
                style="width: {headsPercent}%;"
              ></div>
              <div 
                class="h-full bg-slate-500 transition-all duration-300"
                style="width: {tailsPercent}%;"
              ></div>
            </div>
            <div class="flex justify-between text-xs mt-1">
              <span class="text-amber-500">Heads</span>
              <span class="text-slate-500">Tails</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- History -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs tracking-wider text-(--color-text-light) font-medium">
            History
          </div>
          {#if history.length > 0}
            <button
              onclick={clearHistory}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          {/if}
        </div>
        
        <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-y-auto max-h-[300px]">
          {#if history.length === 0}
            <div class="p-4 text-sm text-(--color-text-muted) text-center">
              No flips yet
            </div>
          {:else}
            <div class="divide-y divide-(--color-border)">
              {#each history as flip, i}
                <div class="px-4 py-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">{flip.result === "heads" ? "⭐" : "▲"}</span>
                    <span class="text-sm font-medium text-(--color-text)">
                      {flip.result === "heads" ? "Heads" : "Tails"}
                    </span>
                  </div>
                  <span class="text-xs text-(--color-text-muted)">
                    {flip.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Fullscreen Overlay -->
  {#if isFullscreen}
    <div class="fullscreen-overlay" onclick={toggleFullscreen}>
      <div class="fullscreen-content" onclick={(e) => e.stopPropagation()}>
        <!-- Close Button -->
        <button
          onclick={toggleFullscreen}
          class="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- Large Coin Display -->
        <div class="mb-8" style="perspective: 1000px;">
          <div
            class="coin-container-large"
            style="transform: rotateX({coinRotation}deg);"
          >
            <!-- Heads Side - Star -->
            <div class="coin-large coin-heads-large">
              <div class="coin-inner-large">
                <svg viewBox="0 0 100 100" class="w-full h-full">
                  <circle cx="50" cy="50" r="48" fill="none" stroke="#909090" stroke-width="2" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#a0a0a0" stroke-width="1" />
                  <polygon 
                    points="50,18 56,38 78,38 61,50 67,72 50,58 33,72 39,50 22,38 44,38"
                    fill="#808080"
                    stroke="#707070"
                    stroke-width="1"
                  />
                </svg>
                <span class="coin-label-large">HEADS</span>
              </div>
            </div>
            
            <!-- Tails Side - Triangle -->
            <div class="coin-large coin-tails-large">
              <div class="coin-inner-large">
                <svg viewBox="0 0 100 100" class="w-full h-full">
                  <circle cx="50" cy="50" r="48" fill="none" stroke="#909090" stroke-width="2" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#a0a0a0" stroke-width="1" />
                  <polygon 
                    points="50,22 76,68 24,68"
                    fill="#808080"
                    stroke="#707070"
                    stroke-width="1"
                  />
                </svg>
                <span class="coin-label-large">TAILS</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Result Display -->
        <div class="text-center mb-8 h-20">
          {#if isFlipping}
            <div class="text-4xl font-bold text-white animate-pulse">
              Flipping...
            </div>
          {:else if result}
            <div class="text-6xl font-bold text-white result-pop">
              {result === "heads" ? "HEADS" : "TAILS"}
            </div>
          {:else}
            <div class="text-2xl text-white/60">
              Click FLIP to start
            </div>
          {/if}
        </div>

        <!-- Flip Button -->
        <button
          onclick={flipCoin}
          disabled={isFlipping}
          class="px-16 py-5 bg-(--color-accent) text-(--color-btn-text) font-bold text-2xl hover:bg-(--color-accent-hover) transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
        >
          {isFlipping ? "Flipping..." : "FLIP"}
        </button>

        <!-- Stats summary -->
        <div class="mt-8 text-white/70 text-lg">
          Heads: {headsCount} ({headsPercent}%) | Tails: {tailsCount} ({tailsPercent}%)
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .coin-container {
    width: 180px;
    height: 180px;
    transform-style: preserve-3d;
    transition: transform 0.1s linear;
  }

  .coin {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 6px solid #a0a0a0;
    background: linear-gradient(145deg, #d0d0d0, #a8a8a8);
    backface-visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 
      inset 0 0 30px rgba(0,0,0,0.1),
      inset 0 0 10px rgba(255,255,255,0.3),
      0 8px 20px rgba(0,0,0,0.3);
  }

  .coin-heads {
    transform: rotateX(0deg);
  }

  .coin-tails {
    transform: rotateX(180deg);
  }

  .coin-inner {
    width: 92%;
    height: 92%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .coin-label {
    position: absolute;
    bottom: 8%;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #707070;
  }

  @keyframes result-pop {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .result-pop {
    animation: result-pop 0.4s ease-out;
  }

  /* Fullscreen styles */
  .fullscreen-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.95);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fade-in 0.2s ease-out;
  }

  .fullscreen-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 100%;
    height: 100%;
    padding: 2rem;
  }

  .coin-container-large {
    width: 280px;
    height: 280px;
    transform-style: preserve-3d;
    transition: transform 0.1s linear;
  }

  @media (min-width: 640px) {
    .coin-container-large {
      width: 350px;
      height: 350px;
    }
  }

  .coin-large {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 8px solid #a0a0a0;
    background: linear-gradient(145deg, #d0d0d0, #a8a8a8);
    backface-visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 
      inset 0 0 40px rgba(0,0,0,0.1),
      inset 0 0 15px rgba(255,255,255,0.3),
      0 12px 30px rgba(0,0,0,0.4);
  }

  .coin-heads-large {
    transform: rotateX(0deg);
  }

  .coin-tails-large {
    transform: rotateX(180deg);
  }

  .coin-inner-large {
    width: 92%;
    height: 92%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .coin-label-large {
    position: absolute;
    bottom: 8%;
    font-size: 16px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: #707070;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
