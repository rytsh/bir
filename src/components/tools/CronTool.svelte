<script lang="ts">
  import { init, Cron } from "cron-js-wasm";

  // WASM initialization state
  let wasmReady = $state(false);
  let wasmError = $state("");

  // Initialize WASM module on component mount
  $effect(() => {
    // @ts-expect-error - browser entry accepts optional wasmUrl, but types default to node
    init("/wasm/cron.wasm")
      .then(() => {
        wasmReady = true;
      })
      .catch((err: Error) => {
        wasmError = `Failed to initialize cron parser: ${err.message}`;
      });
  });

  // Cron expression input
  let cronExpression = $state("");

  // Configuration
  let numNextRuns = $state(5);
  let numPrevRuns = $state(5);
  let selectedTimezone = $state("LOCAL");
  let customTimezone = $state("");
  let timezoneError = $state("");
  let referenceTime = $state(new Date());

  // Format date for datetime-local input
  function toDatetimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  // Handle reference time input change
  function handleReferenceTimeChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.value) {
      referenceTime = new Date(input.value);
    }
  }

  // Reset to current time
  function handleNow() {
    referenceTime = new Date();
  }

  // Base timezone options
  const baseTimezones = [
    { value: "LOCAL", label: "Local (Browser)" },
    { value: "UTC", label: "UTC" },
  ];

  // Effective timezone for display
  let effectiveTimezone = $derived(selectedTimezone === "CUSTOM" ? customTimezone : selectedTimezone);

  // Validate custom timezone
  function validateTimezone(tz: string): boolean {
    if (!tz.trim()) return false;
    try {
      Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  // Handle custom timezone change
  function handleCustomTimezoneChange() {
    if (customTimezone.trim() && !validateTimezone(customTimezone)) {
      timezoneError = "Invalid timezone. Use IANA format (e.g., America/New_York, Europe/London)";
    } else {
      timezoneError = "";
    }
  }

  // Preset cron expressions
  const presets = [
    { label: "Every minute", value: "* * * * *" },
    { label: "Every 5 minutes", value: "*/5 * * * *" },
    { label: "Every 15 minutes", value: "*/15 * * * *" },
    { label: "Every hour", value: "0 * * * *" },
    { label: "Every day at midnight", value: "0 0 * * *" },
    { label: "Every day at noon", value: "0 12 * * *" },
    { label: "Every Monday at 9am", value: "0 9 * * 1" },
    { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
    { label: "First day of month", value: "0 0 1 * *" },
    { label: "Every Sunday at 3am", value: "0 3 * * 0" },
  ];

  // Copy state
  let copiedExpression = $state(false);

  // Field names and descriptions
  const fieldNames = ["Minute", "Hour", "Day of Month", "Month", "Day of Week"];
  const fieldRanges = ["0-59", "0-23", "1-31", "1-12", "0-6 (Sun-Sat)"];

  // Month and day names
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shortDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Parse a single cron field into a set of values
  function parseField(field: string, min: number, max: number): number[] | null {
    const values = new Set<number>();

    // Handle special characters
    if (field === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      return Array.from(values).sort((a, b) => a - b);
    }

    // Split by comma for multiple values
    const parts = field.split(",");

    for (const part of parts) {
      // Handle step values (*/n or m-n/s)
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) return null;

        let start = min;
        let end = max;

        if (range !== "*") {
          if (range.includes("-")) {
            const [startStr, endStr] = range.split("-");
            start = parseInt(startStr, 10);
            end = parseInt(endStr, 10);
          } else {
            start = parseInt(range, 10);
          }
        }

        if (isNaN(start) || isNaN(end)) return null;

        for (let i = start; i <= end; i += step) {
          if (i >= min && i <= max) values.add(i);
        }
      }
      // Handle ranges (m-n)
      else if (part.includes("-")) {
        const [startStr, endStr] = part.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (isNaN(start) || isNaN(end) || start > end) return null;

        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) values.add(i);
        }
      }
      // Single value
      else {
        const val = parseInt(part, 10);
        if (isNaN(val) || val < min || val > max) return null;
        values.add(val);
      }
    }

    return values.size > 0 ? Array.from(values).sort((a, b) => a - b) : null;
  }

  // Parse full cron expression
  interface ParsedCron {
    minutes: number[];
    hours: number[];
    daysOfMonth: number[];
    months: number[];
    daysOfWeek: number[];
    fields: string[];
  }

  function parseCron(expr: string): ParsedCron | null {
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) return null;

    const minutes = parseField(fields[0], 0, 59);
    const hours = parseField(fields[1], 0, 23);
    const daysOfMonth = parseField(fields[2], 1, 31);
    const months = parseField(fields[3], 1, 12);
    const daysOfWeek = parseField(fields[4], 0, 6);

    if (!minutes || !hours || !daysOfMonth || !months || !daysOfWeek) {
      return null;
    }

    return { minutes, hours, daysOfMonth, months, daysOfWeek, fields };
  }

  // Generate human-readable description
  function describeField(field: string, values: number[], type: "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek"): string {
    if (field === "*") {
      return type === "minute" ? "every minute" :
             type === "hour" ? "every hour" :
             type === "dayOfMonth" ? "every day" :
             type === "month" ? "every month" :
             "every day of the week";
    }

    if (type === "dayOfWeek") {
      if (values.length === 7) return "every day";
      if (values.length === 5 && values.join(",") === "1,2,3,4,5") return "weekdays";
      if (values.length === 2 && values.join(",") === "0,6") return "weekends";
      return values.map(v => dayNames[v]).join(", ");
    }

    if (type === "month") {
      if (values.length === 12) return "every month";
      return values.map(v => monthNames[v]).join(", ");
    }

    if (values.length === 1) {
      return String(values[0]);
    }

    // Check for step pattern
    if (field.includes("/")) {
      const step = field.split("/")[1];
      return `every ${step} ${type}s`;
    }

    // Check for range
    if (field.includes("-") && !field.includes(",")) {
      return `${values[0]} through ${values[values.length - 1]}`;
    }

    return values.join(", ");
  }

  function generateDescription(parsed: ParsedCron): string {
    const { minutes, hours, daysOfMonth, months, daysOfWeek, fields } = parsed;

    let desc = "";

    // Time description
    if (fields[0] === "*" && fields[1] === "*") {
      desc += "every minute";
    } else if (fields[0] === "*") {
      desc += "every minute ";
      if (hours.length === 1) {
        desc += `during the ${hours[0]}:00 hour`;
      } else {
        desc += `during hours ${describeField(fields[1], hours, "hour")}`;
      }
    } else if (fields[1] === "*") {
      // Check if minute field is a step pattern
      if (fields[0].includes("/")) {
        const step = fields[0].split("/")[1];
        desc += `every ${step} minutes`;
      } else if (minutes.length === 1) {
        desc += `at minute ${minutes[0]} of every hour`;
      } else {
        desc += `at minutes ${minutes.join(", ")} of every hour`;
      }
    } else {
      const timeStrings = [];
      for (const hour of hours) {
        for (const minute of minutes) {
          timeStrings.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
        }
      }
      if (timeStrings.length <= 3) {
        desc += `at ${timeStrings.join(", ")}`;
      } else {
        desc += `at ${timeStrings.length} specific times`;
      }
    }

    // Day description
    const hasDayOfMonth = fields[2] !== "*";
    const hasDayOfWeek = fields[4] !== "*";

    if (hasDayOfMonth && hasDayOfWeek) {
      desc += ` on day ${describeField(fields[2], daysOfMonth, "dayOfMonth")} and ${describeField(fields[4], daysOfWeek, "dayOfWeek")}`;
    } else if (hasDayOfMonth) {
      desc += ` on day ${describeField(fields[2], daysOfMonth, "dayOfMonth")} of the month`;
    } else if (hasDayOfWeek) {
      desc += ` on ${describeField(fields[4], daysOfWeek, "dayOfWeek")}`;
    }

    // Month description
    if (fields[3] !== "*") {
      desc += ` in ${describeField(fields[3], months, "month")}`;
    }

    // Capitalize first character
    return desc.charAt(0).toUpperCase() + desc.slice(1);
  }

  // Cache for Cron instances to avoid memory issues
  let cronCache: { expr: string; cron: InstanceType<typeof Cron> } | null = null;

  function getCron(expr: string): InstanceType<typeof Cron> {
    if (!cronCache || cronCache.expr !== expr) {
      cronCache = { expr, cron: new Cron(expr) };
    }
    return cronCache.cron;
  }

  // Get next N run times using cron-js-wasm
  function getNextRuns(expr: string, count: number, startDate: Date): Date[] {
    if (!wasmReady) return [];
    try {
      const cron = getCron(expr);
      const results = cron.nextN(count, startDate);
      // Filter out invalid dates (year 1970 means no result)
      return results.filter(d => d.getFullYear() > 1970);
    } catch {
      return [];
    }
  }

  // Get previous N run times using cron-js-wasm
  function getPrevRuns(expr: string, count: number, startDate: Date): Date[] {
    if (!wasmReady) return [];
    try {
      const cron = getCron(expr);
      const results = cron.prevN(count, startDate);
      // Filter out invalid dates (year 1970 means no result)
      return results.filter(d => d.getFullYear() > 1970);
    } catch {
      return [];
    }
  }

  // Format date for display in RFC3339 format
  function formatDate(date: Date, timezone: string): string {
    if (timezone && timezone !== "LOCAL") {
      try {
        // Get date parts in target timezone
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

        // Get timezone offset
        const tzFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          timeZoneName: "longOffset",
        });
        const tzParts = tzFormatter.formatToParts(date);
        const tzOffset = tzParts.find(p => p.type === "timeZoneName")?.value || "+00:00";
        const offsetMatch = tzOffset.match(/GMT([+-]\d{2}):?(\d{2})?/);
        const offsetStr = offsetMatch
          ? `${offsetMatch[1]}:${offsetMatch[2] || "00"}`
          : "+00:00";

        return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}${offsetStr}`;
      } catch {
        // Invalid timezone, fall back to local
      }
    }

    // Local timezone - RFC3339 format
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 60).padStart(2, "0");

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
  }

  // Format relative time
  function formatRelative(date: Date, referenceTime: Date): string {
    const diffMs = date.getTime() - referenceTime.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);
    const isFuture = diffMs > 0;

    if (diffSec < 60) {
      return isFuture ? `in ${diffSec}s` : `${diffSec}s ago`;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return isFuture ? `in ${diffMin}m` : `${diffMin}m ago`;
    }
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) {
      const mins = diffMin % 60;
      return isFuture ? `in ${diffHour}h ${mins}m` : `${diffHour}h ${mins}m ago`;
    }
    const diffDay = Math.floor(diffHour / 24);
    return isFuture ? `in ${diffDay}d` : `${diffDay}d ago`;
  }

  // Reactive parsing - return both parsed result and error message
  let parseResult = $derived.by(() => {
    if (!cronExpression.trim()) return { parsed: null, error: "" };
    const result = parseCron(cronExpression);
    if (!result) {
      return { parsed: null, error: "Invalid cron expression. Expected format: minute hour day-of-month month day-of-week" };
    }
    return { parsed: result, error: "" };
  });

  let parsed = $derived(parseResult.parsed);
  let error = $derived(parseResult.error);
  let description = $derived(parsed ? generateDescription(parsed) : "");

  // Use referenceTime for calculations
  // Reactivity automatically triggers on referenceTime, numNextRuns, numPrevRuns changes
  let nextRuns = $derived.by(() => {
    if (!parsed || !wasmReady) return [];
    return getNextRuns(cronExpression, numNextRuns, referenceTime);
  });

  let prevRuns = $derived.by(() => {
    if (!parsed || !wasmReady) return [];
    return getPrevRuns(cronExpression, numPrevRuns, referenceTime);
  });

  // Handle preset selection
  function handlePreset(value: string) {
    cronExpression = value;
  }

  // Copy expression
  function handleCopyExpression() {
    navigator.clipboard.writeText(cronExpression);
    copiedExpression = true;
    setTimeout(() => {
      copiedExpression = false;
    }, 2000);
  }

  // Clear
  function handleClear() {
    cronExpression = "";
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Parse and explain cron expressions with next and previous run times.
    </p>
  </header>

  <!-- WASM Loading/Error -->
  {#if wasmError}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {wasmError}
    </div>
  {:else if !wasmReady}
    <div class="mb-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) text-sm">
      Loading cron parser...
    </div>
  {/if}

  <!-- Input Section -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        Cron Expression
      </h2>
      <div class="flex gap-3">
        <button
          onclick={handleCopyExpression}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copiedExpression ? "Copied!" : "Copy"}
        </button>
        <button
          onclick={handleClear}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>

    <input
      type="text"
      bind:value={cronExpression}
      placeholder="* * * * *"
      class="w-full px-4 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-lg focus:border-(--color-text-light) outline-none mb-3"
    />

    <!-- Field Reference -->
    <div class="grid grid-cols-5 gap-2 text-center text-xs mb-3">
      {#each fieldNames as name, i}
        <div class="flex flex-col">
          <span class="text-(--color-text-muted)">{name}</span>
          <span class="text-(--color-text-muted) opacity-60">{fieldRanges[i]}</span>
        </div>
      {/each}
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-2">
      {#each presets as preset}
        <button
          onclick={() => handlePreset(preset.value)}
          class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  {#if parsed}
    <!-- Description -->
    <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <p class="text-(--color-text) text-lg">
        {description}
      </p>
    </div>

    <!-- Configuration -->
    <div class="mb-4 px-4 py-2 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex flex-wrap gap-4">
        <div>
          <label for="timezone-select" class="block text-sm text-(--color-text-muted) mb-1">
            Timezone
          </label>
          <select
            id="timezone-select"
            bind:value={selectedTimezone}
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none cursor-pointer"
          >
            {#each baseTimezones as tz}
              <option value={tz.value}>{tz.label}</option>
            {/each}
            <option value="CUSTOM">Custom...</option>
          </select>
          {#if selectedTimezone === "CUSTOM"}
            <input
              type="text"
              bind:value={customTimezone}
              oninput={handleCustomTimezoneChange}
              placeholder="e.g., America/New_York"
              class="w-full mt-2 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
            {#if timezoneError}
              <p class="mt-1 text-xs text-(--color-error-text)">{timezoneError}</p>
            {/if}
          {/if}
        </div>
        <div>
          <label for="reference-time" class="block text-sm text-(--color-text-muted) mb-1">
            Reference Time
          </label>
          <div class="flex gap-1">
            <input
              id="reference-time"
              type="datetime-local"
              value={toDatetimeLocal(referenceTime)}
              oninput={handleReferenceTimeChange}
              class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
            />
            <button
              onclick={handleNow}
              class="px-2 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors text-xs"
              title="Set to now"
            >
              Now
            </button>
          </div>
        </div>
        <div>
          <label for="next-runs" class="block text-sm text-(--color-text-muted) mb-1">
            Next Runs
          </label>
          <input
            id="next-runs"
            type="number"
            min="1"
            max="50"
            bind:value={numNextRuns}
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>
        <div>
          <label for="prev-runs" class="block text-sm text-(--color-text-muted) mb-1">
            Previous Runs
          </label>
          <input
            id="prev-runs"
            type="number"
            min="1"
            max="50"
            bind:value={numPrevRuns}
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          />
        </div>
      </div>
    </div>

    <!-- Run Times -->
    <div class="flex-1 flex flex-col lg:flex-row gap-4">
      <!-- Next Runs -->
      <div class="flex-1 flex flex-col p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
          Next {numNextRuns} Runs
        </h2>
        <div class="flex-1">
          {#if nextRuns.length > 0}
            <div class="border border-(--color-border) overflow-hidden">
              {#each nextRuns as run}
                <div class="flex justify-between items-center px-3 py-2 border-b border-(--color-border) last:border-b-0 odd:bg-(--color-bg-alt) even:bg-(--color-bg) hover:brightness-95 dark:hover:brightness-125 transition-all">
                  <span class="text-sm text-(--color-text) font-mono">
                    {formatDate(run, effectiveTimezone)}
                  </span>
                  <span class="text-xs text-(--color-text-muted) ml-4">
                    {formatRelative(run, referenceTime)}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-sm text-(--color-text-muted)">
              No upcoming runs found within the next year.
            </div>
          {/if}
        </div>
      </div>

      <!-- Previous Runs -->
      <div class="flex-1 flex flex-col p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
          Previous {numPrevRuns} Runs
        </h2>
        <div class="flex-1">
          {#if prevRuns.length > 0}
            <div class="border border-(--color-border) overflow-hidden">
              {#each prevRuns as run}
                <div class="flex justify-between items-center px-3 py-2 border-b border-(--color-border) last:border-b-0 odd:bg-(--color-bg-alt) even:bg-(--color-bg) hover:brightness-95 dark:hover:brightness-125 transition-all">
                  <span class="text-sm text-(--color-text) font-mono">
                    {formatDate(run, effectiveTimezone)}
                  </span>
                  <span class="text-xs text-(--color-text-muted) ml-4">
                    {formatRelative(run, referenceTime)}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-sm text-(--color-text-muted)">
              No previous runs found within the past year.
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">Cron Format:</strong>
    <code class="mx-1 px-1 bg-(--color-bg) text-(--color-text-light)">minute hour day-of-month month day-of-week</code>
    <span class="block mt-1">
      Use <code class="px-1 bg-(--color-bg)">*</code> for any,
      <code class="px-1 bg-(--color-bg)">*/n</code> for every n,
      <code class="px-1 bg-(--color-bg)">m-n</code> for ranges,
      <code class="px-1 bg-(--color-bg)">a,b,c</code> for lists.
    </span>
  </div>
</div>
