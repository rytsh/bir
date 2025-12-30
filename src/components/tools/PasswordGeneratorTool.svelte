<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { placeholder } from "@codemirror/view";
  import { oneDark } from "@codemirror/theme-one-dark";

  interface Preset {
    name: string;
    length: number;
    lower: boolean;
    upper: boolean;
    digits: boolean;
    special: boolean;
  }

  const presets: Preset[] = [
    {
      name: "Memorable",
      length: 10,
      lower: true,
      upper: true,
      digits: true,
      special: false,
    },
    {
      name: "Strong",
      length: 15,
      lower: true,
      upper: true,
      digits: true,
      special: true,
    },
    {
      name: "Fort Knox",
      length: 30,
      lower: true,
      upper: true,
      digits: true,
      special: true,
    },
    {
      name: "Encryption",
      length: 32,
      lower: true,
      upper: true,
      digits: true,
      special: false,
    },
  ];

  let selectedPreset = $state("");
  let length = $state(16);
  let includeLower = $state(true);
  let includeUpper = $state(true);
  let includeDigits = $state(true);
  let includeSpecial = $state(true);
  let excludeChars = $state("");
  let minDigits = $state(1);
  let minSpecial = $state(1);
  let count = $state(1);
  let copied = $state(false);
  let isDark = $state(false);
  let error = $state("");

  const applyPreset = (presetName: string) => {
    const preset = presets.find((p) => p.name === presetName);
    if (preset) {
      length = preset.length;
      includeLower = preset.lower;
      includeUpper = preset.upper;
      includeDigits = preset.digits;
      includeSpecial = preset.special;
      minDigits = preset.digits ? 1 : 0;
      minSpecial = preset.special ? 1 : 0;
    }
  };

  const handlePresetChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    selectedPreset = target.value;
    if (selectedPreset) {
      applyPreset(selectedPreset);
    }
  };

  let outputEditorContainer: HTMLDivElement;
  let outputEditor: EditorView;

  const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";
  const SPECIAL = "`~!@#$%^&*()-=_+[]{}|;':\",./<>?";

  const getCharacterSet = (chars: string, exclude: string): string => {
    return chars
      .split("")
      .filter((c) => !exclude.includes(c))
      .join("");
  };

  const random = (): number => {
    const { crypto, Uint32Array } = window;
    if (
      typeof crypto?.getRandomValues === "function" &&
      typeof Uint32Array === "function"
    ) {
      // Divide a random UInt32 by the maximum value (2^32 -1) to get a result between 0 and 1
      return window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967295;
    }

    return random();
  };

  const generatePassword = (): string => {
    const excludeSet = excludeChars;

    const lowerChars = includeLower
      ? getCharacterSet(LOWERCASE, excludeSet)
      : "";
    const upperChars = includeUpper
      ? getCharacterSet(UPPERCASE, excludeSet)
      : "";
    const digitChars = includeDigits ? getCharacterSet(DIGITS, excludeSet) : "";
    const specialChars = includeSpecial
      ? getCharacterSet(SPECIAL, excludeSet)
      : "";

    const allChars = lowerChars + upperChars + digitChars + specialChars;

    if (allChars.length === 0) {
      throw new Error(
        "No characters available. Please enable at least one character type.",
      );
    }

    // Calculate required minimums
    const requiredDigits = includeDigits ? Math.min(minDigits, length) : 0;
    const requiredSpecial = includeSpecial ? Math.min(minSpecial, length) : 0;

    if (requiredDigits + requiredSpecial > length) {
      throw new Error(
        `Password length (${length}) is too short for minimum requirements (${requiredDigits} digits + ${requiredSpecial} special = ${requiredDigits + requiredSpecial}).`,
      );
    }

    if (requiredDigits > 0 && digitChars.length === 0) {
      throw new Error(
        "Cannot meet minimum digits requirement - all digits are excluded.",
      );
    }

    if (requiredSpecial > 0 && specialChars.length === 0) {
      throw new Error(
        "Cannot meet minimum special requirement - all special characters are excluded.",
      );
    }

    const password: string[] = [];

    // Add required digits
    for (let i = 0; i < requiredDigits; i++) {
      password.push(digitChars[Math.floor(random() * digitChars.length)]);
    }

    // Add required special characters
    for (let i = 0; i < requiredSpecial; i++) {
      password.push(specialChars[Math.floor(random() * specialChars.length)]);
    }

    // Fill the rest with random characters from all available
    const remaining = length - password.length;
    for (let i = 0; i < remaining; i++) {
      password.push(allChars[Math.floor(random() * allChars.length)]);
    }

    // Shuffle the password using Fisher-Yates
    for (let i = password.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [password[i], password[j]] = [password[j], password[i]];
    }

    return password.join("");
  };

  const createTheme = (dark: boolean) => {
    if (dark) {
      return [
        oneDark,
        EditorView.theme({
          ".cm-placeholder": {
            color: "var(--color-text-light)",
            fontStyle: "italic",
          },
        }),
      ];
    }
    return [
      EditorView.theme({
        "&": {
          backgroundColor: "var(--color-bg-alt)",
          color: "var(--color-text)",
        },
        ".cm-content": {
          caretColor: "var(--color-text)",
        },
        ".cm-cursor": {
          borderLeftColor: "var(--color-text)",
        },
        ".cm-gutters": {
          backgroundColor: "var(--color-bg)",
          color: "var(--color-text-light)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--color-border)",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(0, 0, 0, 0.05)",
        },
        ".cm-placeholder": {
          color: "var(--color-text-light)",
          fontStyle: "italic",
        },
      }),
    ];
  };

  const createOutputEditor = () => {
    if (!outputEditorContainer) return;
    if (outputEditor) {
      outputEditor.destroy();
    }

    outputEditor = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          ...createTheme(isDark),
          placeholder('Click "Generate" to create passwords...'),
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
      parent: outputEditorContainer,
    });
  };

  const handleGenerate = () => {
    error = "";
    try {
      const safeCount = Math.min(Math.max(1, count), 1000);
      const passwords: string[] = [];

      for (let i = 0; i < safeCount; i++) {
        passwords.push(generatePassword());
      }

      const output = passwords.join("\n");
      updateOutput(output);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Generation failed";
      error = errorMessage;
      updateOutput("");
    }
  };

  const updateOutput = (content: string) => {
    if (outputEditor) {
      outputEditor.dispatch({
        changes: {
          from: 0,
          to: outputEditor.state.doc.length,
          insert: content,
        },
      });
    }
  };

  const handleCopy = () => {
    const output = outputEditor?.state.doc.toString() || "";
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handleClear = () => {
    updateOutput("");
    error = "";
  };

  onMount(() => {
    isDark = document.documentElement.classList.contains("dark");

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDark = document.documentElement.classList.contains("dark");
          if (newIsDark !== isDark) {
            isDark = newIsDark;
            const outputContent = outputEditor?.state.doc.toString() || "";
            createOutputEditor();
            if (outputContent) {
              outputEditor.dispatch({
                changes: { from: 0, to: 0, insert: outputContent },
              });
            }
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    tick().then(() => {
      createOutputEditor();
    });

    return () => {
      observer.disconnect();
      outputEditor?.destroy();
    };
  });

  let hasAnyCharType = $derived(
    includeLower || includeUpper || includeDigits || includeSpecial,
  );
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Password Generator
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Generate secure random passwords with customizable options.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-col gap-4">
    <!-- Basic Settings Row -->
    <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
      <!-- Length Input -->
      <div>
        <label
          for="length-input"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Length
        </label>
        <input
          id="length-input"
          type="number"
          min="4"
          max="128"
          bind:value={length}
          class="w-24 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Count Input -->
      <div>
        <label
          for="count-input"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Count
        </label>
        <input
          id="count-input"
          type="number"
          min="1"
          max="1000"
          bind:value={count}
          class="w-24 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Generate Button -->
      <button
        onclick={handleGenerate}
        disabled={!hasAnyCharType}
        class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Generate
      </button>
      <!-- Preset Selector -->
      <select
        onchange={handlePresetChange}
        value={selectedPreset}
        class="w-full max-w-md px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
      >
        <option value="">Custom Settings</option>
        {#each presets as preset}
          <option value={preset.name}>
            {preset.name}
          </option>
        {/each}
      </select>
    </div>

    <!-- Character Type Checkboxes -->
    <div class="px-4 py-2 border border-(--color-border) bg-(--color-bg-alt)">
      <div
        class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
      >
        Character Types
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={includeLower}
            class="w-4 h-4 accent-(--color-accent)"
          />
          <span class="text-sm text-(--color-text)">Lowercase (a-z)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={includeUpper}
            class="w-4 h-4 accent-(--color-accent)"
          />
          <span class="text-sm text-(--color-text)">Uppercase (A-Z)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={includeDigits}
            class="w-4 h-4 accent-(--color-accent)"
          />
          <span class="text-sm text-(--color-text)">Digits (0-9)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={includeSpecial}
            class="w-4 h-4 accent-(--color-accent)"
          />
          <span class="text-sm text-(--color-text)">Special (!@#$%...)</span>
        </label>
      </div>
    </div>

    <div class="flex flex-row justify-between gap-2">
      <!-- Minimum Requirements -->
      <div class="px-4 py-2 border border-(--color-border) bg-(--color-bg-alt)">
        <div
          class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3"
        >
          Minimum Requirements
        </div>
        <div class="flex flex-wrap gap-4">
          <div>
            <label
              for="min-digits"
              class="block text-xs text-(--color-text-light) mb-1"
            >
              Min Digits
            </label>
            <input
              id="min-digits"
              type="number"
              min="0"
              max={length}
              bind:value={minDigits}
              disabled={!includeDigits}
              class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label
              for="min-special"
              class="block text-xs text-(--color-text-light) mb-1"
            >
              Min Special
            </label>
            <input
              id="min-special"
              type="number"
              min="0"
              max={length}
              bind:value={minSpecial}
              disabled={!includeSpecial}
              class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      <!-- Exclude Characters -->
      <div class="flex-1 px-4 py-2 border border-(--color-border) bg-(--color-bg-alt)">
        <label
          for="exclude-chars"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Exclude Characters
        </label>
        <input
          id="exclude-chars"
          type="text"
          bind:value={excludeChars}
          placeholder="e.g., 0O1lI"
          class="w-full max-w-md px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono"
        />
        <p class="mt-1 text-xs text-(--color-text-muted)">
          Characters entered here will not appear in generated passwords.
        </p>
      </div>
    </div>
  </div>

  <!-- Error Message -->
  {#if error}
    <div
      class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm"
    >
      {error}
    </div>
  {/if}

  <!-- Output -->
  <div class="flex-1 flex flex-col min-h-[200px]">
    <div class="flex justify-between items-center mb-2">
      <span
        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
      >
        Generated Passwords
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onclick={handleClear}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
    <div
      bind:this={outputEditorContainer}
      class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
    ></div>
  </div>
</div>
