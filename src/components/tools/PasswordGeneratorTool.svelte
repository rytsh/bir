<script lang="ts">
  import { random } from "../../lib/random";

  type OutputFormat = "characters" | "hex";

  interface Preset {
    name: string;
    length: number;
    lower: boolean;
    upper: boolean;
    digits: boolean;
    special: boolean;
    format?: OutputFormat;
  }

  interface GeneratedPassword {
    id: number;
    value: string;
    copied: boolean;
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
    {
      name: "Hex 32",
      length: 32,
      lower: false,
      upper: false,
      digits: false,
      special: false,
      format: "hex",
    },
    {
      name: "Hex 64",
      length: 64,
      lower: false,
      upper: false,
      digits: false,
      special: false,
      format: "hex",
    },
  ];

  let selectedPreset = $state("");
  let outputFormat = $state<OutputFormat>("characters");
  let length = $state(16);
  let includeLower = $state(true);
  let includeUpper = $state(true);
  let includeDigits = $state(true);
  let includeSpecial = $state(true);
  let excludeChars = $state("");
  let minDigits = $state(1);
  let minSpecial = $state(1);
  let count = $state(1);
  let error = $state("");
  let nextId = $state(0);

  // Array of generated passwords
  let passwords = $state<GeneratedPassword[]>([]);

  const applyPreset = (presetName: string) => {
    const preset = presets.find((p) => p.name === presetName);
    if (preset) {
      length = preset.length;
      outputFormat = preset.format ?? "characters";
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

  const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";
  const SPECIAL = "`~!@#$%^&*()-=_+[]{}|;':\",./<>?";

  // Generate hex password from cryptographically secure random bytes
  const generateHexPassword = (hexLength: number): string => {
    const byteLength = Math.ceil(hexLength / 2);
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, hexLength);
  };

  const getCharacterSet = (chars: string, exclude: string): string => {
    return chars
      .split("")
      .filter((c) => !exclude.includes(c))
      .join("");
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

  const handleGenerate = () => {
    error = "";
    try {
      const safeCount = Math.min(Math.max(1, count), 100);
      const newPasswords: GeneratedPassword[] = [];

      for (let i = 0; i < safeCount; i++) {
        const value = outputFormat === "hex" 
          ? generateHexPassword(length)
          : generatePassword();
        newPasswords.push({
          id: nextId++,
          value,
          copied: false,
        });
      }

      // Add new passwords to the beginning of the list
      passwords = [...newPasswords, ...passwords];
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Generation failed";
      error = errorMessage;
    }
  };

  const handleCopyOne = (id: number) => {
    const pw = passwords.find((p) => p.id === id);
    if (pw) {
      navigator.clipboard.writeText(pw.value);
      passwords = passwords.map((p) =>
        p.id === id ? { ...p, copied: true } : p
      );
      setTimeout(() => {
        passwords = passwords.map((p) =>
          p.id === id ? { ...p, copied: false } : p
        );
      }, 2000);
    }
  };

  const handleRemoveOne = (id: number) => {
    passwords = passwords.filter((p) => p.id !== id);
  };

  const handleCopyAll = () => {
    if (passwords.length > 0) {
      const allPasswords = passwords.map((p) => p.value).join("\n");
      navigator.clipboard.writeText(allPasswords);
      // Flash all as copied
      passwords = passwords.map((p) => ({ ...p, copied: true }));
      setTimeout(() => {
        passwords = passwords.map((p) => ({ ...p, copied: false }));
      }, 2000);
    }
  };

  const handleClear = () => {
    passwords = [];
    error = "";
  };

  let hasAnyCharType = $derived(
    includeLower || includeUpper || includeDigits || includeSpecial,
  );

  let canGenerate = $derived(
    outputFormat === "hex" || hasAnyCharType,
  );
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate secure random passwords with customizable options.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-col gap-4">
    <!-- Format Selector -->
    <div class="flex gap-4 items-center">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Format</span>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="format"
          value="characters"
          checked={outputFormat === "characters"}
          onchange={() => outputFormat = "characters"}
          class="w-4 h-4 accent-(--color-accent)"
        />
        <span class="text-sm text-(--color-text)">Characters</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="format"
          value="hex"
          checked={outputFormat === "hex"}
          onchange={() => outputFormat = "hex"}
          class="w-4 h-4 accent-(--color-accent)"
        />
        <span class="text-sm text-(--color-text)">Hex</span>
      </label>
      {#if outputFormat === "hex"}
        <span class="text-xs text-(--color-text-muted)">
          ({Math.ceil(length / 2)} bytes)
        </span>
      {/if}
    </div>

    <!-- Basic Settings Row -->
    <div class="flex flex-row flex-wrap gap-4 items-end">
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
        disabled={!canGenerate}
        class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Generate
      </button>
      <!-- Preset Selector -->
      <select
        onchange={handlePresetChange}
        value={selectedPreset}
        class="w-full lg:max-w-md px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
      >
        <option value="">Custom Settings</option>
        {#each presets as preset}
          <option value={preset.name}>
            {preset.name}
          </option>
        {/each}
      </select>
    </div>

    {#if outputFormat === "characters"}
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
    {/if}
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
        Generated Passwords {#if passwords.length > 0}({passwords.length}){/if}
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleCopyAll}
          disabled={passwords.length === 0}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Copy All
        </button>
        <button
          onclick={handleClear}
          disabled={passwords.length === 0}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>
    <div
      class="flex-1 border border-(--color-border) overflow-auto bg-(--color-bg) p-2"
    >
      {#if passwords.length === 0}
        <div class="h-full flex items-center justify-center text-(--color-text-muted) text-sm">
          Click "Generate" to create passwords...
        </div>
      {:else}
        <div class="flex flex-col gap-2">
          {#each passwords as pw (pw.id)}
            <div class="flex items-center gap-2 group">
              <input
                type="text"
                readonly
                value={pw.value}
                class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent) select-all"
                onclick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onclick={() => handleCopyOne(pw.id)}
                class="p-2 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors shrink-0 {pw.copied ? 'text-(--color-accent) border-(--color-accent)' : ''}"
                title={pw.copied ? "Copied!" : "Copy"}
              >
                {#if pw.copied}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
                {/if}
              </button>
              <button
                onclick={() => handleRemoveOne(pw.id)}
                class="px-2 py-2 text-xs text-(--color-text-muted) hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove"
              >
                ✕
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
