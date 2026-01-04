<script lang="ts">
  let mode = $state<"encode" | "decode">("encode");
  let input = $state("");
  let copied = $state(false);
  let isPlaying = $state(false);
  let isFlashing = $state(false);
  let isFullscreenFlash = $state(false);
  let isSounding = $state(false);
  let playbackSpeed = $state(1);
  let toneFrequency = $state(700);
  let playMode = $state<"flash" | "sound" | "both">("sound");
  let currentPlaybackIndex = $state(-1);
  let currentLetterIndex = $state(-1);

  // Web Audio API context
  let audioContext: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;

  const initAudio = () => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  };

  const startTone = () => {
    const ctx = initAudio();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Create oscillator and gain node
    oscillator = ctx.createOscillator();
    gainNode = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(toneFrequency, ctx.currentTime);

    // Smooth attack to avoid clicks
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    isSounding = true;
  };

  const stopTone = () => {
    if (gainNode && oscillator && audioContext) {
      // Smooth release to avoid clicks
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.01);
      setTimeout(() => {
        oscillator?.stop();
        oscillator?.disconnect();
        gainNode?.disconnect();
        oscillator = null;
        gainNode = null;
      }, 15);
    }
    isSounding = false;
  };

  // Morse code mapping
  const charToMorse: Record<string, string> = {
    A: ".-",
    B: "-...",
    C: "-.-.",
    D: "-..",
    E: ".",
    F: "..-.",
    G: "--.",
    H: "....",
    I: "..",
    J: ".---",
    K: "-.-",
    L: ".-..",
    M: "--",
    N: "-.",
    O: "---",
    P: ".--.",
    Q: "--.-",
    R: ".-.",
    S: "...",
    T: "-",
    U: "..-",
    V: "...-",
    W: ".--",
    X: "-..-",
    Y: "-.--",
    Z: "--..",
    "0": "-----",
    "1": ".----",
    "2": "..---",
    "3": "...--",
    "4": "....-",
    "5": ".....",
    "6": "-....",
    "7": "--...",
    "8": "---..",
    "9": "----.",
    ".": ".-.-.-",
    ",": "--..--",
    "?": "..--..",
    "'": ".----.",
    "!": "-.-.--",
    "/": "-..-.",
    "(": "-.--.",
    ")": "-.--.-",
    "&": ".-...",
    ":": "---...",
    ";": "-.-.-.",
    "=": "-...-",
    "+": ".-.-.",
    "-": "-....-",
    _: "..--.-",
    '"': ".-..-.",
    $: "...-..-",
    "@": ".--.-.",
  };

  // Reverse mapping for decoding
  const morseToChar: Record<string, string> = Object.fromEntries(
    Object.entries(charToMorse).map(([k, v]) => [v, k])
  );

  const encodeToMorse = (text: string): string => {
    return text
      .toUpperCase()
      .split("")
      .map((char) => {
        if (char === " ") return "/";
        if (char === "\n") return "\n";
        return charToMorse[char] || "";
      })
      .filter((code) => code !== "")
      .join(" ");
  };

  const decodeFromMorse = (morse: string): string => {
    return morse
      .split(/\s+/)
      .map((code) => {
        if (code === "/" || code === "|") return " ";
        return morseToChar[code] || "";
      })
      .join("");
  };

  const output = $derived(
    mode === "encode" ? encodeToMorse(input) : decodeFromMorse(input)
  );

  // Get the morse string being played
  const playingMorse = $derived(mode === "encode" ? output : input);

  // Get text characters for display (input when encoding, output when decoding)
  const textChars = $derived(mode === "encode" ? input.toUpperCase() : output);

  // Get current snippet around playback position (10 chars before, current, 10 chars after)
  const currentSnippet = $derived.by(() => {
    if (currentPlaybackIndex < 0 || !playingMorse) return null;
    const start = Math.max(0, currentPlaybackIndex - 10);
    const end = Math.min(playingMorse.length, currentPlaybackIndex + 11);
    const before = playingMorse.slice(start, currentPlaybackIndex);
    const current = playingMorse[currentPlaybackIndex] || "";
    const after = playingMorse.slice(currentPlaybackIndex + 1, end);
    return { before, current, after };
  });

  // Get current text character and nearby characters (10 before, 10 after)
  const currentTextSnippet = $derived.by(() => {
    if (currentLetterIndex < 0 || !textChars) return null;
    const start = Math.max(0, currentLetterIndex - 10);
    const end = Math.min(textChars.length, currentLetterIndex + 11);
    const before = textChars.slice(start, currentLetterIndex).replace(/ /g, "\u2423");
    const current = (textChars[currentLetterIndex] || "").replace(/ /g, "\u2423");
    const after = textChars.slice(currentLetterIndex + 1, end).replace(/ /g, "\u2423");
    return { before, current, after };
  });

  // Timing constants (in milliseconds) - based on standard Morse timing
  const DOT_DURATION = 100;
  const DASH_DURATION = DOT_DURATION * 3;
  const SYMBOL_GAP = DOT_DURATION; // Gap between dots/dashes
  const LETTER_GAP = DOT_DURATION * 3; // Gap between letters
  const WORD_GAP = DOT_DURATION * 7; // Gap between words

  let playbackAbort: AbortController | null = null;

  const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms / playbackSpeed));
  };

  const stopPlayback = () => {
    playbackAbort?.abort();
    stopTone();
    isPlaying = false;
    isFlashing = false;
    isFullscreenFlash = false;
    currentPlaybackIndex = -1;
    currentLetterIndex = -1;
    playbackAbort = null;
  };

  // Handle ESC key to stop playback
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isPlaying) {
      stopPlayback();
    }
  };

  // Setup and cleanup event listeners
  $effect(() => {
    if (isFullscreenFlash) {
      document.addEventListener("keydown", handleKeydown);
      return () => {
        document.removeEventListener("keydown", handleKeydown);
      };
    }
  });

  const playMorse = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const morseToPlay = mode === "encode" ? output : input;
    if (!morseToPlay.trim()) return;

    isPlaying = true;
    playbackAbort = new AbortController();
    currentLetterIndex = 0;

    const shouldFlash = playMode === "flash" || playMode === "both";
    const shouldSound = playMode === "sound" || playMode === "both";

    // Enter fullscreen flash mode
    if (shouldFlash) {
      isFullscreenFlash = true;
    }

    try {
      const symbols = morseToPlay.split("");

      for (let i = 0; i < symbols.length; i++) {
        if (playbackAbort.signal.aborted) break;

        const symbol = symbols[i];
        currentPlaybackIndex = i;

        if (symbol === ".") {
          if (shouldFlash) isFlashing = true;
          if (shouldSound) startTone();
          await sleep(DOT_DURATION);
          if (shouldFlash) isFlashing = false;
          if (shouldSound) stopTone();
          await sleep(SYMBOL_GAP);
        } else if (symbol === "-") {
          if (shouldFlash) isFlashing = true;
          if (shouldSound) startTone();
          await sleep(DASH_DURATION);
          if (shouldFlash) isFlashing = false;
          if (shouldSound) stopTone();
          await sleep(SYMBOL_GAP);
        } else if (symbol === " ") {
          // Space between letters (already have symbol gap, add extra)
          currentLetterIndex++;
          await sleep(LETTER_GAP - SYMBOL_GAP);
        } else if (symbol === "/" || symbol === "|") {
          // Word separator (counts as space in text)
          currentLetterIndex++;
          await sleep(WORD_GAP - SYMBOL_GAP);
        } else if (symbol === "\n") {
          currentLetterIndex++;
          await sleep(WORD_GAP);
        }
      }
    } catch {
      // Playback was aborted
    } finally {
      isPlaying = false;
      isFlashing = false;
      isFullscreenFlash = false;
      currentPlaybackIndex = -1;
      currentLetterIndex = -1;
      stopTone();
      playbackAbort = null;
    }
  };

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  const handleClear = () => {
    input = "";
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      input = text;
    });
  };

  const handleSwap = () => {
    if (output) {
      input = output;
      mode = mode === "encode" ? "decode" : "encode";
    }
  };

  // Reference playback
  let playingRefChar = $state<string | null>(null);

  const playRefMorse = async (char: string, morse: string) => {
    if (isPlaying || playingRefChar) return;

    playingRefChar = char;
    const ctx = initAudio();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    try {
      for (const symbol of morse) {
        if (symbol === ".") {
          startTone();
          await sleep(DOT_DURATION);
          stopTone();
          await sleep(SYMBOL_GAP);
        } else if (symbol === "-") {
          startTone();
          await sleep(DASH_DURATION);
          stopTone();
          await sleep(SYMBOL_GAP);
        }
      }
    } finally {
      stopTone();
      playingRefChar = null;
    }
  };

  // Reference data
  const letters = Object.entries(charToMorse).filter(([key]) =>
    /[A-Z]/.test(key)
  );
  const numbers = Object.entries(charToMorse).filter(([key]) =>
    /[0-9]/.test(key)
  );
  const punctuation = Object.entries(charToMorse).filter(
    ([key]) => !/[A-Z0-9]/.test(key)
  );
</script>

<!-- Fullscreen flash overlay -->
{#if isFullscreenFlash}
  <div
    class="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer select-none"
    class:bg-white={isFlashing}
    class:bg-black={!isFlashing}
    onclick={stopPlayback}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
  >
    <!-- Current position display - centered -->
    <div class="flex flex-col items-center gap-4 pointer-events-none">
      {#if currentTextSnippet}
        <span class="font-mono text-3xl tracking-wide" class:text-black={isFlashing} class:text-white={!isFlashing}>
          <span class="opacity-50">{currentTextSnippet.before}</span><span class="font-bold">{currentTextSnippet.current}</span><span class="opacity-50">{currentTextSnippet.after}</span>
        </span>
      {/if}
      {#if currentSnippet}
        <span class="font-mono text-5xl tracking-widest" class:text-black={isFlashing} class:text-white={!isFlashing}>
          <span class="opacity-50">{currentSnippet.before}</span><span class="font-bold text-6xl">{currentSnippet.current}</span><span class="opacity-50">{currentSnippet.after}</span>
        </span>
      {/if}
    </div>

    <!-- Stop hint -->
    <div class="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
      <span class="text-xs opacity-50" class:text-black={isFlashing} class:text-white={!isFlashing}>
        Tap or press ESC to stop
      </span>
    </div>
  </div>
{/if}

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert text to Morse code or decode Morse code to text. Use the play
      button to hear the Morse code as audio tones or visualize it with screen flashes.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'encode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "encode";
        }}
      >
        Text to Morse
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'decode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "decode";
        }}
      >
        Morse to Text
      </button>
    </div>
  </div>

  <!-- Input Section -->
  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
        {mode === "encode" ? "Text Input" : "Morse Code Input"}
      </span>
      <div class="flex gap-3">
        <button
          onclick={handlePaste}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste
        </button>
        <button
          onclick={handleClear}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
    <textarea
      bind:value={input}
      placeholder={mode === "encode"
        ? "Enter text to convert to Morse code..."
        : "Enter Morse code (use . for dot, - for dash, space between letters, / between words)..."}
      class="w-full h-24 p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
    ></textarea>
  </div>

  <!-- Output Section -->
  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
        {mode === "encode" ? "Morse Code Output" : "Text Output"}
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleSwap}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Use output as new input"
        >
          Swap
        </button>
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
    <div
      class="w-full min-h-24 p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm whitespace-pre-wrap break-words"
    >
      {#if output}
        {output}
      {:else}
        <span class="text-(--color-text-muted)">Result will appear here...</span>
      {/if}
    </div>
  </div>

  <!-- Playback Controls -->
  <div class="mb-6 flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-4">
      <button
        onclick={playMorse}
        disabled={!output && mode === "encode"}
        class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {#if isPlaying}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          Stop
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          Play
        {/if}
      </button>

      <!-- Play Mode Toggle -->
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        <button
          class="px-2 py-1 text-xs font-medium transition-colors {playMode === 'flash'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => { playMode = "flash"; }}
          title="Flash only"
        >
          Flash
        </button>
        <button
          class="px-2 py-1 text-xs font-medium transition-colors {playMode === 'sound'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => { playMode = "sound"; }}
          title="Sound only"
        >
          Sound
        </button>
        <button
          class="px-2 py-1 text-xs font-medium transition-colors {playMode === 'both'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => { playMode = "both"; }}
          title="Flash and sound"
        >
          Both
        </button>
      </div>

      {#if isPlaying}
        <div class="flex items-center gap-3">
          <span class="text-xs text-(--color-text-muted) animate-pulse">
            Playing...
          </span>
          {#if currentTextSnippet}
            <span class="font-mono text-base tracking-wide border-r border-(--color-border) pr-3">
              <span class="text-(--color-text-muted)">{currentTextSnippet.before}</span><span class="bg-(--color-accent) text-(--color-btn-text) px-1">{currentTextSnippet.current}</span><span class="text-(--color-text-muted)">{currentTextSnippet.after}</span>
            </span>
          {/if}
          {#if currentSnippet}
            <span class="font-mono text-lg tracking-wider">
              <span class="text-(--color-text-muted)">{currentSnippet.before}</span><span class="text-(--color-accent) font-bold">{currentSnippet.current}</span><span class="text-(--color-text-muted)">{currentSnippet.after}</span>
            </span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-6">
      <div class="flex items-center gap-2">
        <span class="text-xs text-(--color-text-muted)">Speed:</span>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.25"
          bind:value={playbackSpeed}
          class="w-24 accent-(--color-accent)"
        />
        <span class="text-xs text-(--color-text) w-8">{playbackSpeed}x</span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-(--color-text-muted)">Tone:</span>
        <input
          type="range"
          min="400"
          max="1000"
          step="50"
          bind:value={toneFrequency}
          class="w-24 accent-(--color-accent)"
        />
        <span class="text-xs text-(--color-text) w-12">{toneFrequency} Hz</span>
      </div>
    </div>
  </div>

  <!-- Morse Code Reference -->
  <div class="border-t border-(--color-border) pt-6">
    <h2 class="text-sm font-medium text-(--color-text) mb-4">
      Morse Code Reference
      <span class="text-xs font-normal text-(--color-text-muted) ml-2">(click morse code to play only as sound)</span>
    </h2>

    <div class="flex flex-wrap gap-6">
      <!-- Letters Table -->
      <div class="flex-1 min-w-48">
        <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">Letters</h3>
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="bg-(--color-bg-alt)">
              <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Char</th>
              <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Morse</th>
            </tr>
          </thead>
          <tbody>
            {#each letters as [char, code]}
              <tr>
                <td class="border border-(--color-border) px-2 py-1 font-mono font-bold text-(--color-accent)">{char}</td>
                <td
                  class="border border-(--color-border) px-2 py-1 font-mono cursor-pointer transition-colors {playingRefChar === char ? 'bg-(--color-accent) text-(--color-btn-text)' : 'hover:bg-(--color-border) text-(--color-text)'}"
                  onclick={() => playRefMorse(char, code)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && playRefMorse(char, code)}
                >{code}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Numbers Table -->
      <div class="flex-1 min-w-48">
        <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">Numbers</h3>
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="bg-(--color-bg-alt)">
              <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Char</th>
              <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Morse</th>
            </tr>
          </thead>
          <tbody>
            {#each numbers as [char, code]}
              <tr>
                <td class="border border-(--color-border) px-2 py-1 font-mono font-bold text-(--color-accent)">{char}</td>
                <td
                  class="border border-(--color-border) px-2 py-1 font-mono cursor-pointer transition-colors {playingRefChar === char ? 'bg-(--color-accent) text-(--color-btn-text)' : 'hover:bg-(--color-border) text-(--color-text)'}"
                  onclick={() => playRefMorse(char, code)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && playRefMorse(char, code)}
                >{code}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Punctuation Table -->
      <div class="flex-1 min-w-48">
        <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">Punctuation</h3>
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="bg-(--color-bg-alt)">
              <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Char</th>
              <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Morse</th>
            </tr>
          </thead>
          <tbody>
            {#each punctuation as [char, code]}
              <tr>
                <td class="border border-(--color-border) px-2 py-1 font-mono font-bold text-(--color-accent)">{char}</td>
                <td
                  class="border border-(--color-border) px-2 py-1 font-mono cursor-pointer transition-colors {playingRefChar === char ? 'bg-(--color-accent) text-(--color-btn-text)' : 'hover:bg-(--color-border) text-(--color-text)'}"
                  onclick={() => playRefMorse(char, code)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && playRefMorse(char, code)}
                >{code}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Info -->
    <div class="mt-4 text-xs text-(--color-text-muted)">
      <p>Use <code class="bg-(--color-bg-alt) px-1">.</code> for dot, <code class="bg-(--color-bg-alt) px-1">-</code> for dash, space between letters, <code class="bg-(--color-bg-alt) px-1">/</code> between words.</p>
    </div>
  </div>
</div>
