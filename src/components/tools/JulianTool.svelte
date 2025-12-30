<script lang="ts">
  import { onMount } from "svelte";

  const STORAGE_KEY = "bir:converter/julian:showFractions";

  let julianInput = $state("");
  let dateInput = $state("");
  let julianOutputRaw = $state<number | null>(null);
  let dateOutput = $state("");
  let error = $state("");
  let copiedJulian = $state(false);
  let copiedDate = $state(false);
  let showFractions = $state(true);

  let julianOutput = $derived(
    julianOutputRaw !== null
      ? showFractions
        ? julianOutputRaw.toFixed(6)
        : Math.floor(julianOutputRaw).toString()
      : ""
  );

  // Load from localStorage on mount
  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      showFractions = stored === "true";
    }
  });

  // Save to localStorage when showFractions changes
  $effect(() => {
    localStorage.setItem(STORAGE_KEY, String(showFractions));
  });

  // Convert Julian Date to JavaScript Date
  const julianToDate = (jd: number): Date => {
    // Julian Date to Unix timestamp (milliseconds)
    // JD 2440587.5 = Unix epoch (1970-01-01 00:00:00 UTC)
    const unixMs = (jd - 2440587.5) * 86400000;
    return new Date(unixMs);
  };

  // Convert JavaScript Date to Julian Date
  const dateToJulian = (date: Date): number => {
    // Unix timestamp (milliseconds) to Julian Date
    const unixMs = date.getTime();
    return unixMs / 86400000 + 2440587.5;
  };

  // Format date as ISO string (YYYY-MM-DD HH:MM:SS)
  const formatDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
  };

  // Parse date input (supports various formats)
  const parseDate = (input: string): Date | null => {
    // Try ISO format first
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  };

  const handleJulianInput = () => {
    error = "";
    dateOutput = "";

    if (!julianInput.trim()) {
      return;
    }

    const jd = parseFloat(julianInput.trim());
    if (isNaN(jd)) {
      error = "Invalid Julian Date. Please enter a valid number.";
      return;
    }

    if (jd < 0) {
      error = "Julian Date must be a positive number.";
      return;
    }

    try {
      const date = julianToDate(jd);
      dateOutput = formatDate(date);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to convert Julian Date.";
    }
  };

  const handleDateInput = () => {
    error = "";
    julianOutputRaw = null;

    if (!dateInput.trim()) {
      return;
    }

    const date = parseDate(dateInput.trim());
    if (!date) {
      error = "Invalid date format. Please use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).";
      return;
    }

    try {
      const jd = dateToJulian(date);
      julianOutputRaw = jd;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to convert date to Julian Date.";
    }
  };

  const handleDatePickerChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.value) {
      dateInput = target.value;
      handleDateInput();
    } else {
      dateInput = "";
      julianOutputRaw = null;
    }
  };

  const handleCopyJulian = () => {
    if (julianOutput) {
      navigator.clipboard.writeText(julianOutput);
      copiedJulian = true;
      setTimeout(() => (copiedJulian = false), 2000);
    }
  };

  const handleCopyDate = () => {
    if (dateOutput) {
      navigator.clipboard.writeText(dateOutput);
      copiedDate = true;
      setTimeout(() => (copiedDate = false), 2000);
    }
  };

  const handleClearJulian = () => {
    julianInput = "";
    dateOutput = "";
    error = "";
  };

  const handleClearDate = () => {
    dateInput = "";
    julianOutputRaw = null;
    error = "";
  };

  const handleUseNow = () => {
    const now = new Date();
    dateInput = now.toISOString().slice(0, 19);
    handleDateInput();
  };

  // React to input changes
  $effect(() => {
    julianInput;
    handleJulianInput();
  });

  $effect(() => {
    dateInput;
    handleDateInput();
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Julian Date Converter
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Convert between Julian Date and calendar date. Julian Date is a continuous count of days since the beginning of the Julian Period (January 1, 4713 BC).
    </p>
  </header>

  <!-- Configuration -->
  <div class="mb-4 p-2 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showFractions}
          class="w-4 h-4 accent-(--color-text) hover:cursor-pointer"
        />
        <span class="text-sm text-(--color-text-muted)">Show fractions</span>
      </label>
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {error}
    </div>
  {/if}

  <div class="flex-1 flex flex-col lg:flex-row gap-6">
    <!-- Julian to Date -->
    <div class="flex-1 flex flex-col">
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
            Julian Date to Calendar Date
          </h2>
          <button
            onclick={handleClearJulian}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>

        <div class="mb-4">
          <label for="julian-input" class="block text-sm text-(--color-text-muted) mb-2">
            Julian Date
          </label>
          <input
            id="julian-input"
            type="text"
            bind:value={julianInput}
            placeholder="e.g., 2460000.5"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="flex-1">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-sm text-(--color-text-muted)">
              Calendar Date (UTC)
            </label>
            {#if dateOutput}
              <button
                onclick={handleCopyDate}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedDate ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <div class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) min-h-[42px]">
            {dateOutput || ""}
          </div>
        </div>
      </div>
    </div>

    <!-- Date to Julian -->
    <div class="flex-1 flex flex-col">
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
            Calendar Date to Julian Date
          </h2>
          <div class="flex gap-3">
            <button
              onclick={handleUseNow}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Now
            </button>
            <button
              onclick={handleClearDate}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="mb-4">
          <label for="date-input" class="block text-sm text-(--color-text-muted) mb-2">
            Date (text input)
          </label>
          <input
            id="date-input"
            type="text"
            bind:value={dateInput}
            placeholder="e.g., 2024-01-15 or 2024-01-15T12:00:00"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="mb-4">
          <label for="date-picker" class="block text-sm text-(--color-text-muted) mb-2">
            Date (picker)
          </label>
          <input
            id="date-picker"
            type="datetime-local"
            onchange={handleDatePickerChange}
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="flex-1">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-sm text-(--color-text-muted)">
              Julian Date
            </label>
            {#if julianOutput}
              <button
                onclick={handleCopyJulian}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedJulian ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <div class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) min-h-[42px]">
            {julianOutput || ""}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About Julian Date:</strong>
    Julian Date (JD) is a continuous count of days since the beginning of the Julian Period on January 1, 4713 BC (Julian calendar).
    It is widely used in astronomy and other sciences to calculate time intervals.
    JD 2440587.5 corresponds to January 1, 1970, 00:00:00 UTC (Unix epoch).
  </div>
</div>
