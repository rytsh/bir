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

  // Listening mode state
  let isListening = $state(false);
  let signalDetected = $state(false);
  let currentAmplitude = $state(0);
  let sensitivity = $state(15); // Threshold percentage (0-100)
  let detectedMorse = $state(""); // Current accumulated morse symbols
  let detectedText = $state(""); // Decoded text so far
  let listeningError = $state<string | null>(null);

  // Adjustable timing thresholds (in ms)
  let listenDotMax = $state(250); // Max duration to be considered a dot
  let listenLetterGap = $state(250); // Silence duration to trigger letter decode
  let listenWordGap = $state(600); // Silence duration to trigger word gap

  // Manual keyboard input mode
  let inputMode = $state<"mic" | "keyboard">("mic");
  let isKeyboardActive = $state(false);
  let keyboardSignalActive = $state(false);

  // Listening mode audio resources
  let mediaStream: MediaStream | null = null;
  let analyserNode: AnalyserNode | null = null;
  let listeningAnimationId: number | null = null;

  // Timing tracking for listening/keyboard input
  let signalStartTime: number | null = null;
  let silenceStartTime: number | null = null;
  let currentMorseChar = $state(""); // Morse for current character being detected
  let keyboardCheckInterval: number | null = null;

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

  // ============================================
  // LISTENING MODE - Microphone input detection
  // ============================================

  // Note: Timing thresholds are now adjustable via listenDotMax, listenLetterGap, listenWordGap state variables
  // Default values based on playback: dot=100ms, dash=300ms, symbol_gap=100ms, letter_gap=300ms, word_gap=700ms

  const startListening = async () => {
    if (isListening) {
      stopListening();
      return;
    }

    listeningError = null;

    try {
      // Request microphone access
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize audio context
      const ctx = initAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Create analyser node
      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 512; // Smaller for faster response
      analyserNode.smoothingTimeConstant = 0.1; // Less smoothing for sharper transitions

      // Connect microphone to analyser
      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);

      // Reset state
      detectedMorse = "";
      detectedText = "";
      currentMorseChar = "";
      signalStartTime = null;
      silenceStartTime = null;
      signalDetected = false;

      isListening = true;

      // Start analysis loop
      analyzeAudio();
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          listeningError = "Microphone access denied. Please allow microphone access to use this feature.";
        } else if (err.name === "NotFoundError") {
          listeningError = "No microphone found. Please connect a microphone.";
        } else {
          listeningError = `Error: ${err.message}`;
        }
      }
      stopListening();
    }
  };

  const stopListening = () => {
    isListening = false;
    signalDetected = false;
    currentAmplitude = 0;

    // Finalize any pending morse character
    if (currentMorseChar) {
      const char = morseToChar[currentMorseChar];
      if (char) {
        detectedText += char;
      }
      currentMorseChar = "";
    }

    // Cancel animation frame
    if (listeningAnimationId !== null) {
      cancelAnimationFrame(listeningAnimationId);
      listeningAnimationId = null;
    }

    // Stop media stream
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = null;
    }

    // Disconnect analyser
    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }

    signalStartTime = null;
    silenceStartTime = null;
  };

  const analyzeAudio = () => {
    if (!isListening || !analyserNode) return;

    const dataArray = new Uint8Array(analyserNode.fftSize);
    analyserNode.getByteTimeDomainData(dataArray);

    // Calculate RMS (root mean square) amplitude
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    // Convert to percentage (0-100)
    currentAmplitude = Math.min(100, rms * 300);

    // Check if signal is above threshold with hysteresis
    // Use different thresholds for on/off to avoid jitter
    const baseThreshold = (sensitivity / 100) * 0.33;
    const onThreshold = baseThreshold;
    const offThreshold = baseThreshold * 0.6; // Lower threshold to turn off

    const wasSignalDetected = signalDetected;
    if (wasSignalDetected) {
      // Currently on - use lower threshold to turn off
      signalDetected = rms > offThreshold;
    } else {
      // Currently off - use higher threshold to turn on
      signalDetected = rms > onThreshold;
    }

    const now = performance.now();

    // Signal state changed
    if (signalDetected !== wasSignalDetected) {
      if (signalDetected) {
        // Signal started
        signalStartTime = now;

        // Check if we had a significant silence gap
        if (silenceStartTime !== null) {
          const silenceDuration = now - silenceStartTime;

          if (silenceDuration >= listenWordGap && currentMorseChar) {
            // Word gap - decode current char and add space
            const char = morseToChar[currentMorseChar];
            if (char) {
              detectedText += char + " ";
            }
            currentMorseChar = "";
          } else if (silenceDuration >= listenLetterGap && currentMorseChar) {
            // Letter gap - decode current char
            const char = morseToChar[currentMorseChar];
            if (char) {
              detectedText += char;
            }
            currentMorseChar = "";
          }
        }
        silenceStartTime = null;
      } else {
        // Signal ended
        silenceStartTime = now;

        if (signalStartTime !== null) {
          const signalDuration = now - signalStartTime;

          // Classify as dot or dash
          if (signalDuration > 20) {
            // Ignore very short signals (noise) - 20ms minimum
            if (signalDuration <= listenDotMax) {
              currentMorseChar += ".";
            } else {
              currentMorseChar += "-";
            }
          }
        }
        signalStartTime = null;
      }
    }

    // Check for letter/word gap while in silence
    if (!signalDetected && silenceStartTime !== null) {
      const silenceDuration = now - silenceStartTime;

      if (silenceDuration >= listenWordGap && currentMorseChar) {
        const char = morseToChar[currentMorseChar];
        if (char) {
          detectedText += char + " ";
        }
        currentMorseChar = "";
        silenceStartTime = now; // Reset to prevent multiple spaces
      } else if (silenceDuration >= listenLetterGap && currentMorseChar) {
        const char = morseToChar[currentMorseChar];
        if (char) {
          detectedText += char;
        }
        currentMorseChar = "";
        silenceStartTime = now; // Reset to prevent retriggering
      }
    }

    // Continue loop
    listeningAnimationId = requestAnimationFrame(analyzeAudio);
  };

  const clearListeningOutput = () => {
    detectedMorse = "";
    detectedText = "";
    currentMorseChar = "";
  };

  const copyListeningOutput = () => {
    if (detectedText) {
      navigator.clipboard.writeText(detectedText.trim());
    }
  };

  const useListeningOutput = () => {
    if (detectedText) {
      // Switch to encode mode with the detected text
      input = detectedText.trim();
      mode = "encode";
      // Clear listening output
      clearListeningOutput();
    }
  };

  // ============================================
  // KEYBOARD INPUT MODE - Spacebar tap morse
  // ============================================

  const startKeyboardInput = () => {
    if (isKeyboardActive) {
      stopKeyboardInput();
      return;
    }

    // Stop mic listening if active
    if (isListening) {
      stopListening();
    }

    // Reset state
    detectedMorse = "";
    detectedText = "";
    currentMorseChar = "";
    signalStartTime = null;
    silenceStartTime = null;
    keyboardSignalActive = false;

    isKeyboardActive = true;

    // Start interval to check for gaps
    keyboardCheckInterval = window.setInterval(checkKeyboardGaps, 50);
  };

  const stopKeyboardInput = () => {
    isKeyboardActive = false;
    keyboardSignalActive = false;

    // Finalize any pending morse character
    if (currentMorseChar) {
      const char = morseToChar[currentMorseChar];
      if (char) {
        detectedText += char;
      }
      currentMorseChar = "";
    }

    // Clear interval
    if (keyboardCheckInterval !== null) {
      clearInterval(keyboardCheckInterval);
      keyboardCheckInterval = null;
    }

    signalStartTime = null;
    silenceStartTime = null;
  };

  const handleKeyboardDown = (e: KeyboardEvent) => {
    if (!isKeyboardActive) return;
    if (e.code !== "Space") return;

    e.preventDefault();

    if (keyboardSignalActive) return; // Already pressed

    keyboardSignalActive = true;
    const now = performance.now();

    // Signal started - check for gaps first
    if (silenceStartTime !== null) {
      const silenceDuration = now - silenceStartTime;

      if (silenceDuration >= listenWordGap && currentMorseChar) {
        const char = morseToChar[currentMorseChar];
        if (char) {
          detectedText += char + " ";
        }
        currentMorseChar = "";
      } else if (silenceDuration >= listenLetterGap && currentMorseChar) {
        const char = morseToChar[currentMorseChar];
        if (char) {
          detectedText += char;
        }
        currentMorseChar = "";
      }
    }

    signalStartTime = now;
    silenceStartTime = null;
  };

  const handleKeyboardUp = (e: KeyboardEvent) => {
    if (!isKeyboardActive) return;
    if (e.code !== "Space") return;

    e.preventDefault();

    if (!keyboardSignalActive) return; // Not pressed

    keyboardSignalActive = false;
    const now = performance.now();

    // Signal ended - classify as dot or dash
    if (signalStartTime !== null) {
      const signalDuration = now - signalStartTime;

      if (signalDuration > 20) {
        if (signalDuration <= listenDotMax) {
          currentMorseChar += ".";
        } else {
          currentMorseChar += "-";
        }
      }
    }

    signalStartTime = null;
    silenceStartTime = now;
  };

  const checkKeyboardGaps = () => {
    if (!isKeyboardActive || keyboardSignalActive || silenceStartTime === null) return;

    const now = performance.now();
    const silenceDuration = now - silenceStartTime;

    if (silenceDuration >= listenWordGap && currentMorseChar) {
      const char = morseToChar[currentMorseChar];
      if (char) {
        detectedText += char + " ";
      }
      currentMorseChar = "";
      silenceStartTime = now;
    } else if (silenceDuration >= listenLetterGap && currentMorseChar) {
      const char = morseToChar[currentMorseChar];
      if (char) {
        detectedText += char;
      }
      currentMorseChar = "";
      silenceStartTime = now;
    }
  };

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      if (isListening) {
        stopListening();
      }
      if (isKeyboardActive) {
        stopKeyboardInput();
      }
    };
  });

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
      Use the listen feature to detect morse signals from your microphone.
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

  <!-- Listening Section -->
  <div class="mb-6 border border-(--color-border) p-4 bg-(--color-bg-alt)">
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-medium text-(--color-text)">Listen to Morse Code</h3>
      <span class="text-xs text-(--color-text-muted)">Detect morse signals via microphone or keyboard</span>
    </div>

    <!-- Input Mode Toggle -->
    <div class="flex flex-wrap items-center gap-4 mb-4">
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        <button
          class="px-3 py-1 text-xs font-medium transition-colors {inputMode === 'mic'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => { inputMode = "mic"; if (isKeyboardActive) stopKeyboardInput(); }}
        >
          Microphone
        </button>
        <button
          class="px-3 py-1 text-xs font-medium transition-colors {inputMode === 'keyboard'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => { inputMode = "keyboard"; if (isListening) stopListening(); }}
        >
          Keyboard
        </button>
      </div>
    </div>

    <!-- Microphone Mode Controls -->
    {#if inputMode === "mic"}
      <div class="flex flex-wrap items-center gap-4 mb-4">
        <button
          onclick={startListening}
          disabled={isPlaying}
          class="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 {isListening
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
        >
          {#if isListening}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            Stop Listening
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            Listen
          {/if}
        </button>

        <div class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted)">Sensitivity:</span>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            bind:value={sensitivity}
            class="w-24 accent-(--color-accent)"
          />
          <span class="text-xs text-(--color-text) w-6">{sensitivity}</span>
        </div>

        {#if isListening}
          <!-- Amplitude indicator -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Level:</span>
            <div class="w-24 h-4 bg-(--color-border) relative overflow-hidden">
              <div
                class="h-full transition-all duration-75 {signalDetected ? 'bg-green-500' : 'bg-(--color-accent)'}"
                style="width: {currentAmplitude}%"
              ></div>
              <!-- Threshold marker -->
              <div
                class="absolute top-0 bottom-0 w-0.5 bg-red-500"
                style="left: {sensitivity}%"
              ></div>
            </div>
            {#if signalDetected}
              <span class="text-xs text-green-500 font-medium">SIGNAL</span>
            {/if}
          </div>
        {/if}
      </div>

      {#if listeningError}
        <div class="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
          {listeningError}
        </div>
      {/if}
    {/if}

    <!-- Keyboard Mode Controls -->
    {#if inputMode === "keyboard"}
      <div class="flex flex-wrap items-center gap-4 mb-4">
        <button
          onclick={startKeyboardInput}
          disabled={isPlaying}
          class="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 {isKeyboardActive
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
        >
          {#if isKeyboardActive}
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
              <path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" />
            </svg>
            Start Keyboard
          {/if}
        </button>

        {#if isKeyboardActive}
          <!-- Tap area for keyboard input -->
          <div
            class="flex-1 min-w-48 h-16 border-2 border-dashed flex items-center justify-center text-sm font-medium transition-colors select-none cursor-pointer {keyboardSignalActive
              ? 'border-green-500 bg-green-500/20 text-green-500'
              : 'border-(--color-border) text-(--color-text-muted) hover:border-(--color-accent)'}"
            tabindex="0"
            onkeydown={handleKeyboardDown}
            onkeyup={handleKeyboardUp}
            role="button"
          >
            {#if keyboardSignalActive}
              SIGNAL
            {:else}
              Hold SPACE for signal (focus here first)
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Timing Thresholds (collapsible) -->
    <details class="mb-4">
      <summary class="text-xs text-(--color-text-muted) cursor-pointer hover:text-(--color-text) select-none">
        Timing Settings (adjust if detection is off)
      </summary>
      <div class="mt-3 p-3 border border-(--color-border) bg-(--color-bg) flex flex-wrap gap-4">
        <div class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted) w-20">Dot max:</span>
          <input
            type="range"
            min="100"
            max="400"
            step="10"
            bind:value={listenDotMax}
            class="w-20 accent-(--color-accent)"
          />
          <span class="text-xs text-(--color-text) w-12">{listenDotMax}ms</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted) w-20">Letter gap:</span>
          <input
            type="range"
            min="150"
            max="500"
            step="10"
            bind:value={listenLetterGap}
            class="w-20 accent-(--color-accent)"
          />
          <span class="text-xs text-(--color-text) w-12">{listenLetterGap}ms</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted) w-20">Word gap:</span>
          <input
            type="range"
            min="400"
            max="1000"
            step="25"
            bind:value={listenWordGap}
            class="w-20 accent-(--color-accent)"
          />
          <span class="text-xs text-(--color-text) w-12">{listenWordGap}ms</span>
        </div>
        <p class="w-full text-xs text-(--color-text-muted)">
          Playback uses: dot=100ms, dash=300ms, letter gap=300ms, word gap=700ms
        </p>
      </div>
    </details>

    {#if isListening || isKeyboardActive || detectedText || currentMorseChar}
      <div class="space-y-2">
        <!-- Current morse character being detected -->
        {#if (isListening || isKeyboardActive) && currentMorseChar}
          <div class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Current:</span>
            <span class="font-mono text-lg tracking-widest text-(--color-accent)">{currentMorseChar}</span>
            <span class="text-xs text-(--color-text-muted) animate-pulse">detecting...</span>
          </div>
        {/if}

        <!-- Detected output -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-(--color-text-muted)">Detected Text:</span>
            <div class="flex gap-3">
              <button
                onclick={useListeningOutput}
                disabled={!detectedText}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
              >
                Use as Input
              </button>
              <button
                onclick={copyListeningOutput}
                disabled={!detectedText}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
              >
                Copy
              </button>
              <button
                onclick={clearListeningOutput}
                disabled={!detectedText && !currentMorseChar}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
          <div class="w-full min-h-12 p-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm">
            {#if detectedText}
              {detectedText}
            {:else}
              <span class="text-(--color-text-muted)">
                {#if isListening}
                  Start sending morse signals...
                {:else if isKeyboardActive}
                  Hold SPACE for dot/dash, release to end signal...
                {:else}
                  Click Listen or Start Keyboard to begin
                {/if}
              </span>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <p class="mt-3 text-xs text-(--color-text-muted)">
      {#if inputMode === "mic"}
        Tip: Use any sustained sound (tapping, whistling, beeps). Short = dot, long = dash.
      {:else}
        Tip: Hold SPACE briefly for dot, hold longer for dash. Pause between letters/words.
      {/if}
    </p>
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
