<script lang="ts">
  import bcrypt from "bcryptjs";

  type Tab = "generate" | "validate";

  let activeTab = $state<Tab>("generate");

  // Generate tab state
  let plainText = $state("");
  let saltRounds = $state(10);
  let generatedHash = $state("");
  let generating = $state(false);
  let generateError = $state("");
  let copiedHash = $state(false);

  // Validate tab state
  let validateText = $state("");
  let hashToValidate = $state("");
  let validating = $state(false);
  let validateError = $state("");
  let validateResult = $state<boolean | null>(null);

  const generateHash = async () => {
    if (!plainText) {
      generateError = "Please enter text to hash";
      return;
    }

    generating = true;
    generateError = "";
    generatedHash = "";

    try {
      const salt = await bcrypt.genSalt(saltRounds);
      generatedHash = await bcrypt.hash(plainText, salt);
    } catch (e) {
      generateError = e instanceof Error ? e.message : "Failed to generate hash";
    } finally {
      generating = false;
    }
  };

  const validateHash = async () => {
    if (!validateText) {
      validateError = "Please enter text to validate";
      return;
    }
    if (!hashToValidate) {
      validateError = "Please enter hash to validate against";
      return;
    }

    validating = true;
    validateError = "";
    validateResult = null;

    try {
      validateResult = await bcrypt.compare(validateText, hashToValidate);
    } catch (e) {
      validateError = e instanceof Error ? e.message : "Failed to validate hash";
    } finally {
      validating = false;
    }
  };

  const handleCopyHash = () => {
    if (generatedHash) {
      navigator.clipboard.writeText(generatedHash);
      copiedHash = true;
      setTimeout(() => {
        copiedHash = false;
      }, 2000);
    }
  };

  const handlePasteGenerate = async () => {
    plainText = await navigator.clipboard.readText();
  };

  const handlePasteValidateText = async () => {
    validateText = await navigator.clipboard.readText();
  };

  const handlePasteHash = async () => {
    hashToValidate = await navigator.clipboard.readText();
  };

  const handleClearGenerate = () => {
    plainText = "";
    generatedHash = "";
    generateError = "";
  };

  const handleClearValidate = () => {
    validateText = "";
    hashToValidate = "";
    validateError = "";
    validateResult = null;
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate bcrypt hashes from plain text or validate text against existing hashes.
    </p>
  </header>

  <!-- Tabs -->
  <div class="mb-4 flex border-b border-(--color-border)">
    <button
      class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab === 'generate'
        ? 'border-(--color-accent) text-(--color-accent)'
        : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
      onclick={() => activeTab = "generate"}
    >
      Generate
    </button>
    <button
      class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab === 'validate'
        ? 'border-(--color-accent) text-(--color-accent)'
        : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
      onclick={() => activeTab = "validate"}
    >
      Validate
    </button>
  </div>

  <!-- Generate Tab -->
  {#if activeTab === "generate"}
    <div class="flex-1 flex flex-col">
      <!-- Salt Rounds -->
      <div class="mb-4">
        <label for="salt-rounds" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Salt Rounds (Cost Factor)
        </label>
        <div class="flex items-center gap-4">
          <input
            id="salt-rounds"
            type="number"
            min="4"
            max="31"
            bind:value={saltRounds}
            class="w-24 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
          <span class="text-xs text-(--color-text-muted)">
            Higher = more secure but slower (recommended: 10-12)
          </span>
        </div>
      </div>

      <!-- Input -->
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Plain Text</span>
          <div class="flex gap-3">
            <button
              onclick={handlePasteGenerate}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Paste
            </button>
            <button
              onclick={handleClearGenerate}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <input
          type="text"
          bind:value={plainText}
          placeholder="Enter text to hash..."
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Generate Button -->
      <button
        onclick={generateHash}
        disabled={generating || !plainText}
        class="mb-4 px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
      >
        {generating ? "Generating..." : "Generate Hash"}
      </button>

      <!-- Error -->
      {#if generateError}
        <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
          {generateError}
        </div>
      {/if}

      <!-- Output -->
      <div class="flex-1">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Generated Hash</span>
          <button
            onclick={handleCopyHash}
            disabled={!generatedHash}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
          >
            {copiedHash ? "Copied!" : "Copy"}
          </button>
        </div>
        <div
          class="p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm break-all"
        >
          {#if generatedHash}
            {generatedHash}
          {:else}
            <span class="text-(--color-text-muted)">Hash will appear here...</span>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Validate Tab -->
  {#if activeTab === "validate"}
    <div class="flex-1 flex flex-col">
      <!-- Plain Text Input -->
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Plain Text</span>
          <button
            onclick={handlePasteValidateText}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
        </div>
        <input
          type="text"
          bind:value={validateText}
          placeholder="Enter plain text..."
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Hash Input -->
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Bcrypt Hash</span>
          <button
            onclick={handlePasteHash}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
        </div>
        <input
          type="text"
          bind:value={hashToValidate}
          placeholder="Enter bcrypt hash (e.g., $2a$10$...)..."
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Validate Button -->
      <div class="flex gap-3 mb-4">
        <button
          onclick={validateHash}
          disabled={validating || !validateText || !hashToValidate}
          class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {validating ? "Validating..." : "Validate"}
        </button>
        <button
          onclick={handleClearValidate}
          class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm hover:bg-(--color-bg-alt) transition-colors"
        >
          Clear
        </button>
      </div>

      <!-- Error -->
      {#if validateError}
        <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
          {validateError}
        </div>
      {/if}

      <!-- Result -->
      {#if validateResult !== null}
        <div
          class="p-4 border text-center {validateResult
            ? 'bg-green-500/10 border-green-500 text-green-500'
            : 'bg-red-500/10 border-red-500 text-red-500'}"
        >
          <div class="text-2xl mb-2">{validateResult ? "✓" : "✗"}</div>
          <div class="font-medium">
            {validateResult ? "Match! The text matches the hash." : "No Match! The text does not match the hash."}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-6 border-t border-(--color-border) pt-4">
    <h2 class="text-sm font-medium text-(--color-text) mb-3">About Bcrypt</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Format</div>
        <div class="font-mono text-(--color-text)">$2a$10$N9qo8uLOickgx2ZMRZoMy...</div>
      </div>
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Cost Factor</div>
        <div class="text-(--color-text)">2^rounds iterations (10 = 1024 iterations)</div>
      </div>
      <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="text-(--color-text-light) mb-1">Security</div>
        <div class="text-(--color-text)">Includes salt, resistant to rainbow tables</div>
      </div>
    </div>
  </div>
</div>
