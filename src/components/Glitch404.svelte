<script lang="ts">
  // =============================================================
  // GLITCH CONFIGURATION - Adjust these values to tweak the effect
  // =============================================================

  // Timing
  const INITIAL_DELAY = 1000; // ms before first glitch
  const BURST_DURATION_MIN = 300; // minimum glitch burst duration (ms)
  const BURST_DURATION_MAX = 600; // maximum glitch burst duration (ms)
  const BURST_INTERVAL = 50; // how often to update during burst (ms)
  const GLITCH_DELAY_MIN = 3000; // minimum time between glitches (ms)
  const GLITCH_DELAY_MAX = 6000; // maximum time between glitches (ms)

  // Character glitching
  const CHAR_GLITCH_CHANCE = 0.1; // chance to glitch each character (0-1)
  const CHAR_REPLACE_CHANCE = 0.2; // chance to replace vs swap (0-1)
  const CHAR_SWAP_LEFT_CHANCE = 0.4; // threshold for swap left vs right (0-1)

  // Line shifting
  const LINE_SHIFT_CHANCE = 0.2; // chance to shift each line (0-1)
  const LINE_SHIFT_MIN = 1; // minimum shift amount (characters)
  const LINE_SHIFT_MAX = 5; // maximum shift amount (characters)
  const LINE_SHIFT_OUTSIDE_BOUNDS = false; // if true, lines can extend beyond original boundaries

  // =============================================================

  const originalArt = `
██╗  ██╗ ██████╗ ██╗  ██╗
██║  ██║██╔═══██╗██║  ██║
███████║██║   ██║███████║
╚════██║██║   ██║╚════██║
     ██║╚██████╔╝     ██║
     ╚═╝ ╚═════╝      ╚═╝
`.trim();

  const glitchChars = ["░", "▓", "█", "#", "@", "%", "&", "?", "/", "\\", "|", "_"];

  let displayText = $state(originalArt);
  let isGlitching = $state(false);

  function getRandomGlitchChar(): string {
    return glitchChars[Math.floor(Math.random() * glitchChars.length)];
  }

  function glitchText(text: string): string {
    const lines = text.split("\n");
    const glitchedLines = lines.map((line) => {
      const chars = line.split("");

      for (let i = 0; i < chars.length; i++) {
        if (chars[i] !== " " && chars[i] !== "\n" && Math.random() < CHAR_GLITCH_CHANCE) {
          const action = Math.random();

          if (action < CHAR_REPLACE_CHANCE) {
            chars[i] = getRandomGlitchChar();
          } else if (action < CHAR_SWAP_LEFT_CHANCE && i > 0) {
            const temp = chars[i];
            chars[i] = chars[i - 1];
            chars[i - 1] = temp;
          } else if (i < chars.length - 1) {
            const temp = chars[i];
            chars[i] = chars[i + 1];
            chars[i + 1] = temp;
          }
        }
      }

      let result = chars.join("");

      if (Math.random() < LINE_SHIFT_CHANCE) {
        const shiftAmount = Math.floor(Math.random() * (LINE_SHIFT_MAX - LINE_SHIFT_MIN + 1)) + LINE_SHIFT_MIN;
        const shiftDirection = Math.random();

        if (shiftDirection < 0.5) {
          // Shift right
          const spaces = " ".repeat(shiftAmount);
          if (LINE_SHIFT_OUTSIDE_BOUNDS) {
            result = spaces + result;
          } else {
            result = spaces + result.slice(0, -shiftAmount);
          }
        } else {
          // Shift left
          if (LINE_SHIFT_OUTSIDE_BOUNDS) {
            result = result.slice(Math.min(shiftAmount, result.length));
          } else {
            const spaces = " ".repeat(shiftAmount);
            result = result.slice(shiftAmount) + spaces;
          }
        }
      }

      return result;
    });

    return glitchedLines.join("\n");
  }

  function runGlitchBurst() {
    if (isGlitching) return;

    isGlitching = true;
    const burstDuration = BURST_DURATION_MIN + Math.random() * (BURST_DURATION_MAX - BURST_DURATION_MIN);
    let elapsed = 0;

    const intervalId = setInterval(() => {
      displayText = glitchText(originalArt);
      elapsed += BURST_INTERVAL;

      if (elapsed >= burstDuration) {
        clearInterval(intervalId);
        displayText = originalArt;
        isGlitching = false;
      }
    }, BURST_INTERVAL);
  }

  $effect(() => {
    const initialTimeout = setTimeout(() => {
      runGlitchBurst();
    }, INITIAL_DELAY);

    const scheduleNextGlitch = () => {
      const delay = GLITCH_DELAY_MIN + Math.random() * (GLITCH_DELAY_MAX - GLITCH_DELAY_MIN);
      return setTimeout(() => {
        runGlitchBurst();
        timerId = scheduleNextGlitch();
      }, delay);
    };

    let timerId = scheduleNextGlitch();

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(timerId);
    };
  });
</script>

<pre
  class="text-(--color-text) sm:text-2xl lg:text-5xl leading-none font-mono select-none tracking-tight"
  aria-hidden="true"
>{displayText}</pre>
