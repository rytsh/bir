<script lang="ts">
  // Live current timestamp
  let currentTimestamp = $state(Math.floor(Date.now() / 1000));
  let currentTimestampMs = $state(Date.now());

  // Input state
  let timestampInput = $state("");
  let dateInput = $state("");
  let error = $state("");
  let selectedTimezone = $state("UTC");

  // Common timezones list
  const timezones = [
    { value: "UTC", label: "UTC" },
    { value: "America/New_York", label: "New York (EST/EDT)" },
    { value: "America/Chicago", label: "Chicago (CST/CDT)" },
    { value: "America/Denver", label: "Denver (MST/MDT)" },
    { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
    { value: "America/Toronto", label: "Toronto (EST/EDT)" },
    { value: "America/Vancouver", label: "Vancouver (PST/PDT)" },
    { value: "America/Sao_Paulo", label: "Sao Paulo (BRT)" },
    { value: "Europe/London", label: "London (GMT/BST)" },
    { value: "Europe/Paris", label: "Paris (CET/CEST)" },
    { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
    { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
    { value: "Europe/Istanbul", label: "Istanbul (TRT)" },
    { value: "Europe/Moscow", label: "Moscow (MSK)" },
    { value: "Asia/Dubai", label: "Dubai (GST)" },
    { value: "Asia/Kolkata", label: "India (IST)" },
    { value: "Asia/Singapore", label: "Singapore (SGT)" },
    { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
    { value: "Asia/Shanghai", label: "Shanghai (CST)" },
    { value: "Asia/Tokyo", label: "Tokyo (JST)" },
    { value: "Asia/Seoul", label: "Seoul (KST)" },
    { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
    { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
    { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
    { value: "LOCAL", label: "Local (Browser)" },
  ];

  // Conversion results
  let convertedFormats = $state<{ label: string; value: string }[]>([]);
  let convertedTimestamp = $state("");

  // Copy states
  let copiedCurrent = $state(false);
  let copiedCurrentMs = $state(false);
  let copiedTimestamp = $state(false);
  let copiedFormat = $state<string | null>(null);

  // Update current timestamp every second
  $effect(() => {
    const interval = setInterval(() => {
      currentTimestamp = Math.floor(Date.now() / 1000);
      currentTimestampMs = Date.now();
    }, 1000);

    return () => clearInterval(interval);
  });

  // Format helpers
  const formatRFC3339 = (date: Date): string => {
    return date.toISOString();
  };

  const formatRFC2822 = (date: Date): string => {
    return date.toUTCString();
  };

  const formatLocalISO = (date: Date): string => {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, -1) + sign + hours + ":" + minutes;
  };

  const formatInTimezone = (date: Date, timezone: string): string => {
    if (timezone === "UTC") {
      return date.toISOString();
    }
    if (timezone === "LOCAL") {
      return formatLocalISO(date);
    }
    try {
      // Get the date parts in the target timezone
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || "00";
      
      // Get timezone offset for the specific timezone
      const tzFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "longOffset",
      });
      const tzParts = tzFormatter.formatToParts(date);
      const tzOffset = tzParts.find(p => p.type === "timeZoneName")?.value || "+00:00";
      // Extract offset from "GMT+05:30" format
      const offsetMatch = tzOffset.match(/GMT([+-]\d{2}):?(\d{2})?/);
      const offsetStr = offsetMatch 
        ? `${offsetMatch[1]}:${offsetMatch[2] || "00"}`
        : "+00:00";

      return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}${offsetStr}`;
    } catch {
      return date.toISOString();
    }
  };

  const formatHumanReadableInTimezone = (date: Date, timezone: string): string => {
    const tz = timezone === "LOCAL" ? undefined : timezone;
    return date.toLocaleString("en-US", {
      timeZone: tz,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  };

  const formatHumanReadable = (date: Date): string => {
    return date.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  };

  const formatRelative = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);
    const isFuture = diffMs < 0;

    if (diffSec < 60) {
      return isFuture ? `in ${diffSec} seconds` : `${diffSec} seconds ago`;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return isFuture ? `in ${diffMin} minutes` : `${diffMin} minutes ago`;
    }
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) {
      return isFuture ? `in ${diffHour} hours` : `${diffHour} hours ago`;
    }
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) {
      return isFuture ? `in ${diffDay} days` : `${diffDay} days ago`;
    }
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) {
      return isFuture ? `in ${diffMonth} months` : `${diffMonth} months ago`;
    }
    const diffYear = Math.floor(diffMonth / 12);
    return isFuture ? `in ${diffYear} years` : `${diffYear} years ago`;
  };

  const formatDayOfYear = (date: Date): string => {
    const start = new Date(date.getUTCFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / 86400000) + 1;
    return `Day ${dayOfYear} of ${date.getUTCFullYear()}`;
  };

  const formatWeekNumber = (date: Date): string => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `Week ${weekNum} of ${d.getUTCFullYear()}`;
  };

  const generateFormats = (date: Date, timezone: string): { label: string; value: string }[] => {
    const tzLabel = timezones.find(t => t.value === timezone)?.label || timezone;
    return [
      { label: "RFC 3339 / ISO 8601 (UTC)", value: formatRFC3339(date) },
      { label: `RFC 3339 / ISO 8601 (${tzLabel})`, value: formatInTimezone(date, timezone) },
      { label: "RFC 2822 (UTC)", value: formatRFC2822(date) },
      { label: "Local ISO (Browser)", value: formatLocalISO(date) },
      { label: "Human Readable (UTC)", value: formatHumanReadableInTimezone(date, "UTC") },
      { label: `Human Readable (${tzLabel})`, value: formatHumanReadableInTimezone(date, timezone) },
      { label: "Relative", value: formatRelative(date) },
      { label: "Unix (seconds)", value: String(Math.floor(date.getTime() / 1000)) },
      { label: "Unix (milliseconds)", value: String(date.getTime()) },
      { label: "Day of Year", value: formatDayOfYear(date) },
      { label: "Week Number (ISO)", value: formatWeekNumber(date) },
      { label: "Date Only (UTC)", value: date.toISOString().split("T")[0] },
      { label: "Time Only (UTC)", value: date.toISOString().split("T")[1].replace("Z", " UTC") },
    ];
  };

  const handleTimestampInput = () => {
    error = "";
    convertedFormats = [];

    if (!timestampInput.trim()) {
      return;
    }

    const input = timestampInput.trim();
    let timestamp: number;

    // Try parsing as number
    if (/^-?\d+$/.test(input)) {
      timestamp = parseInt(input, 10);
      // Detect if it's milliseconds (13+ digits) or seconds (10 digits)
      if (input.length >= 13) {
        // milliseconds
      } else {
        timestamp = timestamp * 1000; // convert to ms
      }
    } else {
      error = "Invalid timestamp. Please enter a Unix timestamp (seconds or milliseconds).";
      return;
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        error = "Invalid timestamp. The resulting date is invalid.";
        return;
      }
      convertedFormats = generateFormats(date, selectedTimezone);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to convert timestamp.";
    }
  };

  const handleDateInput = () => {
    error = "";
    convertedTimestamp = "";

    if (!dateInput.trim()) {
      return;
    }

    try {
      const date = new Date(dateInput.trim());
      if (isNaN(date.getTime())) {
        error = "Invalid date format. Try ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).";
        return;
      }
      convertedTimestamp = String(Math.floor(date.getTime() / 1000));
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to parse date.";
    }
  };

  const handleDatePickerChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.value) {
      dateInput = target.value;
      handleDateInput();
    } else {
      dateInput = "";
      convertedTimestamp = "";
    }
  };

  // React to input changes
  $effect(() => {
    timestampInput;
    handleTimestampInput();
  });

  $effect(() => {
    dateInput;
    handleDateInput();
  });

  // Regenerate formats when timezone changes
  $effect(() => {
    selectedTimezone;
    if (timestampInput.trim()) {
      handleTimestampInput();
    }
  });

  // Copy handlers
  const handleCopyCurrent = () => {
    navigator.clipboard.writeText(String(currentTimestamp));
    copiedCurrent = true;
    setTimeout(() => {
      copiedCurrent = false;
    }, 2000);
  };

  const handleCopyCurrentMs = () => {
    navigator.clipboard.writeText(String(currentTimestampMs));
    copiedCurrentMs = true;
    setTimeout(() => {
      copiedCurrentMs = false;
    }, 2000);
  };

  const handleCopyTimestamp = () => {
    if (convertedTimestamp) {
      navigator.clipboard.writeText(convertedTimestamp);
      copiedTimestamp = true;
      setTimeout(() => {
        copiedTimestamp = false;
      }, 2000);
    }
  };

  const handleCopyFormat = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    copiedFormat = label;
    setTimeout(() => {
      copiedFormat = null;
    }, 2000);
  };

  const handleClear = () => {
    timestampInput = "";
    dateInput = "";
    convertedFormats = [];
    convertedTimestamp = "";
    error = "";
  };

  const handleUseNow = () => {
    timestampInput = String(currentTimestamp);
  };

  const handleUseDateNow = () => {
    const now = new Date();
    dateInput = now.toISOString().slice(0, 19);
    handleDateInput();
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert Unix timestamps to human-readable formats and vice versa.
    </p>
  </header>

  <!-- Live Current Timestamp -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-2">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        Current Unix Timestamp
      </h2>
    </div>
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="flex-1">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-(--color-text-muted)">Seconds</span>
          <button
            onclick={handleCopyCurrent}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedCurrent ? "Copied!" : "Copy"}
          </button>
        </div>
        <div
          class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xl tabular-nums"
        >
          {currentTimestamp}
        </div>
      </div>
      <div class="flex-1">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-(--color-text-muted)">Milliseconds</span>
          <button
            onclick={handleCopyCurrentMs}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedCurrentMs ? "Copied!" : "Copy"}
          </button>
        </div>
        <div
          class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xl tabular-nums"
        >
          {currentTimestampMs}
        </div>
      </div>
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
    <!-- Timestamp to Date -->
    <div class="flex-1 flex flex-col">
      <div
        class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col"
      >
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
            Timestamp to Date
          </h2>
          <div class="flex gap-3">
            <button
              onclick={handleUseNow}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Now
            </button>
            <button
              onclick={handleClear}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="mb-4">
          <label for="timestamp-input" class="block text-sm text-(--color-text-muted) mb-2">
            Unix Timestamp (seconds or milliseconds)
          </label>
          <input
            id="timestamp-input"
            type="text"
            bind:value={timestampInput}
            placeholder="e.g., 1704067200 or 1704067200000"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none"
          />
        </div>

        <div class="mb-4">
          <label for="timezone-select" class="block text-sm text-(--color-text-muted) mb-2">
            Display Timezone
          </label>
          <select
            id="timezone-select"
            bind:value={selectedTimezone}
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none cursor-pointer"
          >
            {#each timezones as tz}
              <option value={tz.value}>{tz.label}</option>
            {/each}
          </select>
        </div>

        {#if convertedFormats.length > 0}
          <div class="flex-1 overflow-auto">
            <div class="space-y-2">
              {#each convertedFormats as format}
                <div class="flex justify-between items-start gap-2 py-1 border-b border-(--color-border) last:border-0">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs text-(--color-text-muted) block">{format.label}</span>
                    <span class="text-sm text-(--color-text) font-mono break-all">{format.value}</span>
                  </div>
                  <button
                    onclick={() => handleCopyFormat(format.label, format.value)}
                    class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                  >
                    {copiedFormat === format.label ? "Copied!" : "Copy"}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="flex-1 flex items-center justify-center text-sm text-(--color-text-muted)">
            Enter a timestamp to see conversions
          </div>
        {/if}
      </div>
    </div>

    <!-- Date to Timestamp -->
    <div class="flex-1 flex flex-col">
      <div
        class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex-1 flex flex-col"
      >
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
            Date to Timestamp
          </h2>
          <div class="flex gap-3">
            <button
              onclick={handleUseDateNow}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Now
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
            placeholder="e.g., 2024-01-01 or 2024-01-01T12:00:00Z"
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
              Unix Timestamp (seconds)
            </label>
            {#if convertedTimestamp}
              <button
                onclick={handleCopyTimestamp}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedTimestamp ? "Copied!" : "Copy"}
              </button>
            {/if}
          </div>
          <div
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono min-h-[42px]"
          >
            {convertedTimestamp || ""}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Info Section -->
  <div
    class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)"
  >
    <strong class="text-(--color-text)">About Unix Timestamps:</strong>
    Unix timestamp (or Epoch time) is the number of seconds that have elapsed since
    January 1, 1970, 00:00:00 UTC. It's widely used in programming and databases for
    storing dates in a timezone-independent format.
  </div>
</div>
