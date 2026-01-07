<script lang="ts">
  import { onMount } from "svelte";

  interface GamepadState {
    id: string;
    index: number;
    connected: boolean;
    buttons: { pressed: boolean; value: number }[];
    axes: number[];
    timestamp: number;
  }

  let gamepads = $state<GamepadState[]>([]);
  let animationFrameId: number | null = null;
  let copied = $state<string | null>(null);
  let selectedGamepadIndex = $state<number>(0);

  const updateGamepads = () => {
    const navigatorGamepads = navigator.getGamepads();
    const newGamepads: GamepadState[] = [];

    for (let i = 0; i < navigatorGamepads.length; i++) {
      const gamepad = navigatorGamepads[i];
      if (gamepad) {
        newGamepads.push({
          id: gamepad.id,
          index: gamepad.index,
          connected: gamepad.connected,
          buttons: Array.from(gamepad.buttons).map((button) => ({
            pressed: button.pressed,
            value: button.value,
          })),
          axes: Array.from(gamepad.axes),
          timestamp: gamepad.timestamp,
        });
      }
    }

    gamepads = newGamepads;
    animationFrameId = requestAnimationFrame(updateGamepads);
  };

  const handleGamepadConnected = (e: GamepadEvent) => {
    console.log("Gamepad connected:", e.gamepad.id);
    if (!animationFrameId) {
      updateGamepads();
    }
  };

  const handleGamepadDisconnected = (e: GamepadEvent) => {
    console.log("Gamepad disconnected:", e.gamepad.id);
  };

  const getButtonLabel = (index: number): string => {
    const labels: Record<number, string> = {
      0: "A / Cross",
      1: "B / Circle",
      2: "X / Square",
      3: "Y / Triangle",
      4: "LB / L1",
      5: "RB / R1",
      6: "LT / L2",
      7: "RT / R2",
      8: "Select / Share",
      9: "Start / Options",
      10: "L3 (Left Stick)",
      11: "R3 (Right Stick)",
      12: "D-Pad Up",
      13: "D-Pad Down",
      14: "D-Pad Left",
      15: "D-Pad Right",
      16: "Home / PS / Xbox",
    };
    return labels[index] || `Button ${index}`;
  };

  const getAxisLabel = (index: number): string => {
    const labels: Record<number, string> = {
      0: "Left Stick X",
      1: "Left Stick Y",
      2: "Right Stick X",
      3: "Right Stick Y",
    };
    return labels[index] || `Axis ${index}`;
  };

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    copied = label;
    setTimeout(() => {
      copied = null;
    }, 1500);
  };

  const getConnectionCode = (): string => {
    return `// Listen for gamepad connection
window.addEventListener("gamepadconnected", (e) => {
  console.log("Gamepad connected:", e.gamepad.id);
  startGameLoop();
});

window.addEventListener("gamepaddisconnected", (e) => {
  console.log("Gamepad disconnected:", e.gamepad.id);
});`;
  };

  const getPollingCode = (): string => {
    return `// Poll gamepad state in animation loop
function gameLoop() {
  const gamepads = navigator.getGamepads();
  
  for (const gamepad of gamepads) {
    if (gamepad) {
      // Check buttons
      gamepad.buttons.forEach((button, index) => {
        if (button.pressed) {
          console.log(\`Button \${index} pressed: \${button.value}\`);
        }
      });
      
      // Check axes (analog sticks)
      gamepad.axes.forEach((axis, index) => {
        if (Math.abs(axis) > 0.1) { // Deadzone
          console.log(\`Axis \${index}: \${axis.toFixed(3)}\`);
        }
      });
    }
  }
  
  requestAnimationFrame(gameLoop);
}`;
  };

  const getButtonCheckCode = (gamepadIndex: number): string => {
    return `// Check specific button on gamepad ${gamepadIndex}
const gamepads = navigator.getGamepads();
const gamepad = gamepads[${gamepadIndex}];

if (gamepad) {
  // Button 0 (A/Cross button)
  if (gamepad.buttons[0].pressed) {
    console.log("A button pressed!");
  }
  
  // Analog trigger value (0.0 to 1.0)
  const triggerValue = gamepad.buttons[6].value; // LT/L2
}`;
  };

  const getAxisCheckCode = (gamepadIndex: number): string => {
    return `// Read analog stick values on gamepad ${gamepadIndex}
const gamepads = navigator.getGamepads();
const gamepad = gamepads[${gamepadIndex}];

if (gamepad) {
  // Left stick (axes 0 and 1)
  const leftStickX = gamepad.axes[0];
  const leftStickY = gamepad.axes[1];
  
  // Right stick (axes 2 and 3)
  const rightStickX = gamepad.axes[2];
  const rightStickY = gamepad.axes[3];
  
  // Apply deadzone
  const deadzone = 0.1;
  if (Math.abs(leftStickX) > deadzone) {
    console.log("Left stick X:", leftStickX);
  }
}`;
  };

  onMount(() => {
    window.addEventListener("gamepadconnected", handleGamepadConnected);
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

    // Check for already connected gamepads
    const existingGamepads = navigator.getGamepads();
    if (existingGamepads.some((gp) => gp !== null)) {
      updateGamepads();
    }

    return () => {
      window.removeEventListener("gamepadconnected", handleGamepadConnected);
      window.removeEventListener(
        "gamepaddisconnected",
        handleGamepadDisconnected,
      );
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Connect a gamepad and press buttons or move sticks to see real-time input.
      Useful for testing gamepad support in web applications.
    </p>
  </header>

  {#if gamepads.length === 0}
    <div
      class="flex-1 flex items-center justify-center border-2 border-dashed border-(--color-border) bg-(--color-bg-alt)"
    >
      <div class="text-center p-8">
        <div class="text-4xl mb-4">🎮</div>
        <div class="text-xl text-(--color-text) mb-2">No Gamepad Detected</div>
        <div class="text-sm text-(--color-text-muted)">
          Connect a gamepad and press any button to start
        </div>
      </div>
    </div>
  {:else}
    <div class="flex-1 overflow-auto space-y-6">
      {#each gamepads as gamepad (gamepad.index)}
        <div class="border border-(--color-border) bg-(--color-bg)">
          <!-- Gamepad Header -->
          <div
            class="px-4 py-3 border-b border-(--color-border) bg-(--color-bg-alt)"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium text-(--color-text)">
                  Gamepad {gamepad.index}
                </h3>
                <p class="text-xs text-(--color-text-muted) font-mono mt-1">
                  {gamepad.id}
                </p>
              </div>
              <div
                class="px-2 py-1 text-xs font-medium bg-(--color-accent) text-(--color-btn-text)"
              >
                Connected
              </div>
            </div>
          </div>

          <div class="p-4 space-y-4">
            <!-- Buttons -->
            <div>
              <h4
                class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
              >
                Buttons ({gamepad.buttons.length})
              </h4>
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {#each gamepad.buttons as button, index}
                  <div
                    class="px-3 py-2 border transition-colors {button.pressed
                      ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                      : 'bg-(--color-bg-alt) border-(--color-border)'}"
                  >
                    <div
                      class="text-xs font-medium {button.pressed
                        ? 'text-(--color-btn-text)'
                        : 'text-(--color-text)'}"
                    >
                      {getButtonLabel(index)}
                    </div>
                    <div
                      class="text-xs font-mono mt-1 {button.pressed
                        ? 'text-(--color-btn-text) opacity-80'
                        : 'text-(--color-text-muted)'}"
                    >
                      {button.value.toFixed(2)}
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Axes -->
            <div>
              <h4 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3">
                Axes ({gamepad.axes.length})
              </h4>
              
              <!-- XY Visualization for Analog Sticks -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <!-- Left Stick -->
                {#if gamepad.axes.length >= 2}
                  <div class="border border-(--color-border) bg-(--color-bg-alt) p-2">
                    <div class="text-xs font-medium text-(--color-text) mb-2">Left Stick</div>
                    <div class="relative w-full aspect-square max-w-32 mx-auto bg-(--color-bg) border border-(--color-border)">
                      <!-- Grid lines -->
                      <div class="absolute left-1/2 top-0 bottom-0 w-px bg-(--color-border)"></div>
                      <div class="absolute top-1/2 left-0 right-0 h-px bg-(--color-border)"></div>
                      <!-- Position indicator -->
                      <div
                        class="absolute w-2 h-2 bg-(--color-accent) rounded-full transition-all"
                        style="left: calc(50% + {gamepad.axes[0] * 50}% - 4px); top: calc(50% + {gamepad.axes[1] * 50}% - 4px)"
                      ></div>
                    </div>
                    <div class="text-xs font-mono text-(--color-text-muted) mt-1 text-center">
                      X: {gamepad.axes[0].toFixed(2)}, Y: {gamepad.axes[1].toFixed(2)}
                    </div>
                  </div>
                {/if}
                
                <!-- Right Stick -->
                {#if gamepad.axes.length >= 4}
                  <div class="border border-(--color-border) bg-(--color-bg-alt) p-2">
                    <div class="text-xs font-medium text-(--color-text) mb-2">Right Stick</div>
                    <div class="relative w-full aspect-square max-w-32 mx-auto bg-(--color-bg) border border-(--color-border)">
                      <!-- Grid lines -->
                      <div class="absolute left-1/2 top-0 bottom-0 w-px bg-(--color-border)"></div>
                      <div class="absolute top-1/2 left-0 right-0 h-px bg-(--color-border)"></div>
                      <!-- Position indicator -->
                      <div
                        class="absolute w-2 h-2 bg-(--color-accent) rounded-full transition-all"
                        style="left: calc(50% + {gamepad.axes[2] * 50}% - 4px); top: calc(50% + {gamepad.axes[3] * 50}% - 4px)"
                      ></div>
                    </div>
                    <div class="text-xs font-mono text-(--color-text-muted) mt-1 text-center">
                      X: {gamepad.axes[2].toFixed(2)}, Y: {gamepad.axes[3].toFixed(2)}
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Individual Axis Bars -->
              <div class="space-y-3">
                {#each gamepad.axes as axis, index}
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-xs text-(--color-text)">
                        {getAxisLabel(index)}
                      </span>
                      <span class="text-xs font-mono text-(--color-text-muted)">
                        {axis.toFixed(3)}
                      </span>
                    </div>
                    <div
                      class="relative h-6 bg-(--color-bg-alt) border border-(--color-border)"
                    >
                      <!-- Center line -->
                      <div
                        class="absolute left-1/2 top-0 bottom-0 w-px bg-(--color-border)"
                      ></div>
                      <!-- Value indicator -->
                      <div
                        class="absolute top-1 bottom-1 w-1 bg-(--color-accent) transition-all"
                        style="left: calc(50% + {axis * 50}% - 2px)"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/each}

      <!-- Code Examples (when gamepad connected) -->
      <div class="space-y-3 mt-6">
        <h3
          class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
        >
          Code Examples
        </h3>

        <!-- Button Check -->
        <details class="border border-(--color-border) bg-(--color-bg)">
          <summary
            class="flex justify-between items-center px-3 py-2 cursor-pointer bg-(--color-bg-alt) hover:bg-(--color-bg) transition-colors"
          >
            <span class="text-xs font-medium text-(--color-text)"
              >Check Button State</span
            >
            <button
              onclick={(e) => {
                e.preventDefault();
                handleCopy(
                  getButtonCheckCode(gamepads[0]?.index || 0),
                  "button",
                );
              }}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "button" ? "Copied!" : "Copy"}
            </button>
          </summary>
          <pre
            class="p-3 text-xs font-mono text-(--color-text) overflow-x-auto border-t border-(--color-border)">{getButtonCheckCode(
              gamepads[0]?.index || 0,
            )}</pre>
        </details>

        <!-- Axis Check -->
        <details class="border border-(--color-border) bg-(--color-bg)">
          <summary
            class="flex justify-between items-center px-3 py-2 cursor-pointer bg-(--color-bg-alt) hover:bg-(--color-bg) transition-colors"
          >
            <span class="text-xs font-medium text-(--color-text)"
              >Read Analog Sticks</span
            >
            <button
              onclick={(e) => {
                e.preventDefault();
                handleCopy(getAxisCheckCode(gamepads[0]?.index || 0), "axis");
              }}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "axis" ? "Copied!" : "Copy"}
            </button>
          </summary>
          <pre
            class="p-3 text-xs font-mono text-(--color-text) overflow-x-auto border-t border-(--color-border)">{getAxisCheckCode(
              gamepads[0]?.index || 0,
            )}</pre>
        </details>

        <!-- Connection Events -->
        <details class="border border-(--color-border) bg-(--color-bg)">
          <summary
            class="flex justify-between items-center px-3 py-2 cursor-pointer bg-(--color-bg-alt) hover:bg-(--color-bg) transition-colors"
          >
            <span class="text-xs font-medium text-(--color-text)"
              >Connection Events</span
            >
            <button
              onclick={(e) => {
                e.preventDefault();
                handleCopy(getConnectionCode(), "connection");
              }}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "connection" ? "Copied!" : "Copy"}
            </button>
          </summary>
          <pre
            class="p-3 text-xs font-mono text-(--color-text) overflow-x-auto border-t border-(--color-border)">{getConnectionCode()}</pre>
        </details>

        <!-- Polling Loop -->
        <details class="border border-(--color-border) bg-(--color-bg)">
          <summary
            class="flex justify-between items-center px-3 py-2 cursor-pointer bg-(--color-bg-alt) hover:bg-(--color-bg) transition-colors"
          >
            <span class="text-xs font-medium text-(--color-text)"
              >Polling Game Loop</span
            >
            <button
              onclick={(e) => {
                e.preventDefault();
                handleCopy(getPollingCode(), "polling");
              }}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              {copied === "polling" ? "Copied!" : "Copy"}
            </button>
          </summary>
          <pre
            class="p-3 text-xs font-mono text-(--color-text) overflow-x-auto border-t border-(--color-border)">{getPollingCode()}</pre>
        </details>
      </div>
    </div>
  {/if}
</div>
