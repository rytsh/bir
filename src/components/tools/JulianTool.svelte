<script lang="ts">
  // Julian Date (JD) state
  let julianInput = $state("");
  let dateInput = $state("");
  let julianOutput = $state("");
  let dateOutput = $state("");
  let error = $state("");
  let copiedJulian = $state(false);
  let copiedDate = $state(false);

  // Julian Day Number (JDN) state
  let jdnInput = $state("");
  let jdnDateInput = $state("");
  let jdnOutput = $state("");
  let jdnDateOutput = $state("");
  let jdnError = $state("");
  let copiedJdn = $state(false);
  let copiedJdnDate = $state(false);

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

  // Format date as ISO string (YYYY-MM-DD only, for JDN)
  const formatDateOnly = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
    julianOutput = "";

    if (!dateInput.trim()) {
      return;
    }

    const date = parseDate(dateInput.trim());
    if (!date) {
      error =
        "Invalid date format. Please use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).";
      return;
    }

    try {
      const jd = dateToJulian(date);
      julianOutput = jd.toString();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "Failed to convert date to Julian Date.";
    }
  };

  const handleDatePickerChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.value) {
      dateInput = target.value;
      handleDateInput();
    } else {
      dateInput = "";
      julianOutput = "";
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
    julianOutput = "";
    error = "";
  };

  const handleUseNow = () => {
    const now = new Date();
    dateInput = now.toISOString().slice(0, 19);
    handleDateInput();
  };

  // JDN handlers (YYDDD format: 2-digit year + 3-digit day of year)
  const getDayOfYear = (year: number, month: number, day: number): number => {
    const date = new Date(Date.UTC(year, month - 1, day));
    const start = new Date(Date.UTC(year, 0, 1));
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / 86400000) + 1;
  };

  const dateToJdn = (year: number, month: number, day: number): string => {
    const yy = year % 100;
    const dayOfYear = getDayOfYear(year, month, day);
    return String(yy).padStart(2, "0") + String(dayOfYear).padStart(3, "0");
  };

  const jdnToDate = (jdn: string): { year: number; month: number; day: number } | null => {
    if (jdn.length !== 5) return null;
    const yy = parseInt(jdn.slice(0, 2), 10);
    const dayOfYear = parseInt(jdn.slice(2), 10);
    if (isNaN(yy) || isNaN(dayOfYear)) return null;
    if (dayOfYear < 1 || dayOfYear > 366) return null;

    // Assume 2000s for years 00-49, 1900s for 50-99
    const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
    const date = new Date(Date.UTC(fullYear, 0, dayOfYear));

    // Validate the day exists in that year (handles leap year check)
    if (date.getUTCFullYear() !== fullYear) return null;

    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  };

  // Parse date string to year, month, day (handles various formats)
  const parseDateComponents = (input: string): { year: number; month: number; day: number } | null => {
    // Try ISO format YYYY-MM-DD
    const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return {
        year: parseInt(isoMatch[1], 10),
        month: parseInt(isoMatch[2], 10),
        day: parseInt(isoMatch[3], 10)
      };
    }
    
    // Try DD/MM/YYYY format
    const dmy = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return {
        year: parseInt(dmy[3], 10),
        month: parseInt(dmy[2], 10),
        day: parseInt(dmy[1], 10)
      };
    }

    return null;
  };

  const handleJdnInput = () => {
    jdnError = "";
    jdnDateOutput = "";

    if (!jdnInput.trim()) {
      return;
    }

    const input = jdnInput.trim();
    if (!/^\d{5}$/.test(input)) {
      jdnError = "Invalid format. Please enter 5 digits (YYDDD).";
      return;
    }

    try {
      const result = jdnToDate(input);
      if (!result) {
        jdnError =
          "Invalid Julian Day Number. Day must be 1-365 (or 366 for leap years).";
        return;
      }
      jdnDateOutput = `${result.year}-${String(result.month).padStart(2, "0")}-${String(result.day).padStart(2, "0")}`;
    } catch (e) {
      jdnError =
        e instanceof Error ? e.message : "Failed to convert Julian Day Number.";
    }
  };

  const handleJdnDateInput = () => {
    jdnError = "";
    jdnOutput = "";

    if (!jdnDateInput.trim()) {
      return;
    }

    const components = parseDateComponents(jdnDateInput.trim());
    if (!components) {
      jdnError = "Invalid date format. Please use YYYY-MM-DD or DD/MM/YYYY.";
      return;
    }

    try {
      jdnOutput = dateToJdn(components.year, components.month, components.day);
    } catch (e) {
      jdnError =
        e instanceof Error
          ? e.message
          : "Failed to convert date to Julian Day Number.";
    }
  };

  const handleJdnDatePickerChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.value) {
      // Date picker returns YYYY-MM-DD format
      jdnDateInput = target.value;
      handleJdnDateInput();
    } else {
      jdnDateInput = "";
      jdnOutput = "";
    }
  };

  const handleCopyJdn = () => {
    if (jdnOutput) {
      navigator.clipboard.writeText(jdnOutput);
      copiedJdn = true;
      setTimeout(() => (copiedJdn = false), 2000);
    }
  };

  const handleCopyJdnDate = () => {
    if (jdnDateOutput) {
      navigator.clipboard.writeText(jdnDateOutput);
      copiedJdnDate = true;
      setTimeout(() => (copiedJdnDate = false), 2000);
    }
  };

  const handleClearJdn = () => {
    jdnInput = "";
    jdnDateOutput = "";
    jdnError = "";
  };

  const handleClearJdnDate = () => {
    jdnDateInput = "";
    jdnOutput = "";
    jdnError = "";
  };

  const handleJdnUseToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    jdnDateInput = `${year}-${month}-${day}`;
    handleJdnDateInput();
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

  $effect(() => {
    jdnInput;
    handleJdnInput();
  });

  $effect(() => {
    jdnDateInput;
    handleJdnDateInput();
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Julian Date Converter
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Convert between Julian Day Number (JDN), Julian Date (JD), and calendar
      date.
    </p>
  </header>

  <!-- JDN Section Header -->
  <h2 class="text-lg font-medium text-(--color-text) mb-4">
    Julian Day Number (JDN)
  </h2>

  <!-- JDN Error -->
  {#if jdnError}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {jdnError}
    </div>
  {/if}

  <div class="flex-1 flex flex-col lg:flex-row gap-6">
    <!-- Date to JDN -->
    <div class="flex-1 flex flex-col">
      <div
        class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col"
      >
        <div class="flex justify-between items-center mb-3">
          <h2
            class="text-sm tracking-wider text-(--color-text-light) font-medium"
          >
            Calendar Date to JDN
          </h2>
          <div class="flex gap-3">
            <button
              onclick={handleJdnUseToday}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Today
            </button>
            <button
              onclick={handleClearJdnDate}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="mb-4">
          <label
            for="jdn-date-input"
            class="block text-sm text-(--color-text-muted) mb-2"
          >
            Date (text input)
          </label>
          <input
            id="jdn-date-input"
            type="text"
            bind:value={jdnDateInput}
            placeholder="e.g., 2024-01-15 or 15/01/2024"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="mb-4">
          <label
            for="jdn-date-picker"
            class="block text-sm text-(--color-text-muted) mb-2"
          >
            Date (picker)
          </label>
          <input
            id="jdn-date-picker"
            type="date"
            onchange={handleJdnDatePickerChange}
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="flex-1">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-sm text-(--color-text-muted)">
              Julian Day Number (YYDDD)
            </label>
            {#if jdnOutput}
              <button
                onclick={handleCopyJdn}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedJdn ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <div
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) min-h-[42px]"
          >
            {jdnOutput || ""}
          </div>
        </div>
      </div>
    </div>

    <!-- JDN to Date -->
    <div class="flex-1 flex flex-col">
      <div
        class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col"
      >
        <div class="flex justify-between items-center mb-3">
          <h2
            class="text-sm tracking-wider text-(--color-text-light) font-medium"
          >
            JDN to Calendar Date
          </h2>
          <button
            onclick={handleClearJdn}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>

        <div class="mb-4">
          <label
            for="jdn-input"
            class="block text-sm text-(--color-text-muted) mb-2"
          >
            Julian Day Number (YYDDD)
          </label>
          <input
            id="jdn-input"
            type="text"
            bind:value={jdnInput}
            placeholder="e.g., 25364"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="flex-1">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-sm text-(--color-text-muted)">
              Calendar Date
            </label>
            {#if jdnDateOutput}
              <button
                onclick={handleCopyJdnDate}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedJdnDate ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <div
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) min-h-[42px]"
          >
            {jdnDateOutput || ""}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- JD Section Header -->
  <h2 class="text-lg font-medium text-(--color-text) mt-6 mb-4">
    Julian Date (JD)
  </h2>

  <!-- JD Error -->
  {#if error}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {error}
    </div>
  {/if}

  <div class="flex-1 flex flex-col lg:flex-row gap-6">
    <!-- Date to Julian -->
    <div class="flex-1 flex flex-col">
      <div
        class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col"
      >
        <div class="flex justify-between items-center mb-3">
          <h2
            class="text-sm tracking-wider text-(--color-text-light) font-medium"
          >
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
          <label
            for="date-input"
            class="block text-sm text-(--color-text-muted) mb-2"
          >
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
          <label
            for="date-picker"
            class="block text-sm text-(--color-text-muted) mb-2"
          >
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
          <div
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) min-h-[42px]"
          >
            {julianOutput || ""}
          </div>
        </div>
      </div>
    </div>

    <!-- Julian to Date -->
    <div class="flex-1 flex flex-col">
      <div
        class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col"
      >
        <div class="flex justify-between items-center mb-3">
          <h2
            class="text-sm tracking-wider text-(--color-text-light) font-medium"
          >
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
          <label
            for="julian-input"
            class="block text-sm text-(--color-text-muted) mb-2"
          >
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
          <div
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) min-h-[42px]"
          >
            {dateOutput || ""}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Info Section -->
  <div
    class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)"
  >
    <strong class="text-(--color-text)">About Julian Day Number:</strong>
    Julian Day Number (JDN) in YYDDD format represents the 2-digit year and 3-digit
    day of year (1-365/366). For example, 25364 means the 364th day of 2025.
    <br /><br />
    <strong class="text-(--color-text)">About Julian Date:</strong>
    Julian Date (JD) is a continuous count of days (including fractions) since the
    beginning of the Julian Period on January 1, 4713 BC. JD 2440587.5 corresponds
    to January 1, 1970, 00:00:00 UTC (Unix epoch).
  </div>
</div>
