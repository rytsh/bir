<script lang="ts">
  interface Clock {
    id: string;
    timezone: string;
    label: string;
  }

  interface LayoutConfig {
    label: string;
    cols: number;
    firstRowCols?: number; // If set, first row has different column count
  }

  // Layout options with flexible configurations
  // For mixed layouts: firstRowCols = items in first row, cols = items per row for remaining rows
  const layoutOptions: Record<string, LayoutConfig> = {
    // Grid layouts (uniform columns)
    "auto": { label: "Auto", cols: 0 }, // 0 means responsive
    "1": { label: "1 Column", cols: 1 },
    "2": { label: "2 Columns", cols: 2 },
    "3": { label: "3 Columns", cols: 3 },
    "4": { label: "4 Columns", cols: 4 },
    "5": { label: "5 Columns", cols: 5 },
    "6": { label: "6 Columns", cols: 6 },
    // Mixed layouts: first row different from rest
    // Format: "XxY" where X = first row items, Y = remaining row items
    "1x2": { label: "1 top + 2/row", cols: 2, firstRowCols: 1 },
    "1x3": { label: "1 top + 3/row", cols: 3, firstRowCols: 1 },
    "1x4": { label: "1 top + 4/row", cols: 4, firstRowCols: 1 },
    "1x5": { label: "1 top + 5/row", cols: 5, firstRowCols: 1 },
    "2x3": { label: "2 top + 3/row", cols: 3, firstRowCols: 2 },
    "2x4": { label: "2 top + 4/row", cols: 4, firstRowCols: 2 },
    "2x5": { label: "2 top + 5/row", cols: 5, firstRowCols: 2 },
    "3x4": { label: "3 top + 4/row", cols: 4, firstRowCols: 3 },
    "3x5": { label: "3 top + 5/row", cols: 5, firstRowCols: 3 },
    "4x5": { label: "4 top + 5/row", cols: 5, firstRowCols: 4 },
  };

  type LayoutType = keyof typeof layoutOptions;

  // Popular timezones grouped by region
  const timezoneGroups = [
    {
      region: "Americas",
      zones: [
        { value: "America/New_York", label: "New York (EST/EDT)" },
        { value: "America/Chicago", label: "Chicago (CST/CDT)" },
        { value: "America/Denver", label: "Denver (MST/MDT)" },
        { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
        { value: "America/Anchorage", label: "Anchorage (AKST/AKDT)" },
        { value: "Pacific/Honolulu", label: "Honolulu (HST)" },
        { value: "America/Toronto", label: "Toronto (EST/EDT)" },
        { value: "America/Vancouver", label: "Vancouver (PST/PDT)" },
        { value: "America/Mexico_City", label: "Mexico City (CST/CDT)" },
        { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
        { value: "America/Buenos_Aires", label: "Buenos Aires (ART)" },
        { value: "America/Santiago", label: "Santiago (CLT/CLST)" },
      ],
    },
    {
      region: "Europe",
      zones: [
        { value: "Europe/London", label: "London (GMT/BST)" },
        { value: "Europe/Paris", label: "Paris (CET/CEST)" },
        { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
        { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
        { value: "Europe/Rome", label: "Rome (CET/CEST)" },
        { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
        { value: "Europe/Zurich", label: "Zurich (CET/CEST)" },
        { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
        { value: "Europe/Moscow", label: "Moscow (MSK)" },
        { value: "Europe/Istanbul", label: "Istanbul (TRT)" },
        { value: "Europe/Athens", label: "Athens (EET/EEST)" },
        { value: "Europe/Warsaw", label: "Warsaw (CET/CEST)" },
      ],
    },
    {
      region: "Asia & Pacific",
      zones: [
        { value: "Asia/Dubai", label: "Dubai (GST)" },
        { value: "Asia/Kolkata", label: "Mumbai/Delhi (IST)" },
        { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
        { value: "Asia/Singapore", label: "Singapore (SGT)" },
        { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
        { value: "Asia/Shanghai", label: "Shanghai (CST)" },
        { value: "Asia/Tokyo", label: "Tokyo (JST)" },
        { value: "Asia/Seoul", label: "Seoul (KST)" },
        { value: "Asia/Jakarta", label: "Jakarta (WIB)" },
        { value: "Asia/Manila", label: "Manila (PHT)" },
        { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
        { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
        { value: "Australia/Perth", label: "Perth (AWST)" },
        { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
      ],
    },
    {
      region: "Africa & Middle East",
      zones: [
        { value: "Africa/Cairo", label: "Cairo (EET)" },
        { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
        { value: "Africa/Lagos", label: "Lagos (WAT)" },
        { value: "Africa/Nairobi", label: "Nairobi (EAT)" },
        { value: "Asia/Jerusalem", label: "Jerusalem (IST/IDT)" },
        { value: "Asia/Riyadh", label: "Riyadh (AST)" },
        { value: "Asia/Tehran", label: "Tehran (IRST/IRDT)" },
      ],
    },
    {
      region: "UTC & Other",
      zones: [
        { value: "UTC", label: "UTC (Coordinated Universal Time)" },
        { value: "Etc/GMT+12", label: "UTC-12 (Baker Island)" },
        { value: "Etc/GMT-14", label: "UTC+14 (Line Islands)" },
      ],
    },
  ];

  // Flatten for lookup
  const allTimezones = timezoneGroups.flatMap(g => g.zones);

  // Detect user's local timezone
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Default clocks - 2 top row + 3 per row layout
  const defaultClocks: Clock[] = [
    { id: "1", timezone: localTimezone, label: "Local" },
    { id: "2", timezone: "UTC", label: "UTC" },
    { id: "3", timezone: "Europe/Amsterdam", label: "Amsterdam" },
    { id: "4", timezone: "Europe/Istanbul", label: "Istanbul" },
    { id: "5", timezone: "Asia/Tokyo", label: "Tokyo" },
  ];

  let clocks = $state<Clock[]>([...defaultClocks]);
  let currentTime = $state(new Date());
  let use24Hour = $state(true);
  let showSeconds = $state(true);
  let showDate = $state(true);
  let layout = $state<LayoutType>("2x3");
  let isFullscreen = $state(false);
  let clocksContainer: HTMLDivElement | null = $state(null);

  // Add clock inputs
  let newTimezone = $state("");
  let customTimezone = $state("");
  let newLabel = $state("");
  let useCustomTimezone = $state(false);
  let customTimezoneError = $state("");

  // Drag and drop state
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  // Update time every second
  $effect(() => {
    const interval = setInterval(() => {
      currentTime = new Date();
    }, 1000);
    
    return () => clearInterval(interval);
  });

  // Load saved clocks from localStorage
  $effect(() => {
    const saved = localStorage.getItem("world-clock-settings");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.clocks) clocks = data.clocks;
        if (data.use24Hour !== undefined) use24Hour = data.use24Hour;
        if (data.showSeconds !== undefined) showSeconds = data.showSeconds;
        if (data.showDate !== undefined) showDate = data.showDate;
        if (data.layout !== undefined && data.layout in layoutOptions) layout = data.layout;
      } catch {
        // Ignore parse errors
      }
    }
  });

  // Listen for fullscreen changes
  $effect(() => {
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  });

  // Save settings to localStorage
  function saveSettings() {
    localStorage.setItem("world-clock-settings", JSON.stringify({
      clocks,
      use24Hour,
      showSeconds,
      showDate,
      layout,
    }));
  }

  function formatTime(date: Date, timezone: string): string {
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: !use24Hour,
      };
      
      if (showSeconds) {
        options.second = "2-digit";
      }
      
      return date.toLocaleTimeString("en-US", options);
    } catch {
      return "Invalid timezone";
    }
  }

  function formatDate(date: Date, timezone: string): string {
    try {
      return date.toLocaleDateString("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  function getOffset(timezone: string): string {
    try {
      const now = new Date();
      const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
      const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const diffMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;
      const hours = Math.floor(Math.abs(diffMinutes) / 60);
      const minutes = Math.abs(diffMinutes) % 60;
      const sign = diffMinutes >= 0 ? "+" : "-";
      return `UTC${sign}${hours}${minutes > 0 ? `:${minutes.toString().padStart(2, "0")}` : ""}`;
    } catch {
      return "";
    }
  }

  function isDaytime(date: Date, timezone: string): boolean {
    try {
      const hour = parseInt(date.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }));
      return hour >= 6 && hour < 18;
    } catch {
      return true;
    }
  }

  function isValidTimezone(tz: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  function addClock() {
    const timezone = useCustomTimezone ? customTimezone.trim() : newTimezone;
    
    if (!timezone) return;
    
    // Validate custom timezone
    if (useCustomTimezone) {
      if (!isValidTimezone(timezone)) {
        customTimezoneError = "Invalid timezone. Use format like 'America/New_York' or 'Europe/London'";
        return;
      }
      customTimezoneError = "";
    }
    
    const tzInfo = allTimezones.find(t => t.value === timezone);
    const label = newLabel.trim() || tzInfo?.label.split(" ")[0] || timezone.split("/").pop() || timezone;
    
    const clock: Clock = {
      id: Date.now().toString(),
      timezone,
      label,
    };
    
    clocks = [...clocks, clock];
    newTimezone = "";
    customTimezone = "";
    newLabel = "";
    saveSettings();
  }

  function removeClock(id: string) {
    clocks = clocks.filter(c => c.id !== id);
    saveSettings();
  }

  function resetToDefaults() {
    clocks = [...defaultClocks];
    saveSettings();
  }

  function handleSettingsChange() {
    saveSettings();
  }

  function addLocalTimezone() {
    const exists = clocks.some(c => c.timezone === localTimezone);
    if (exists) return;
    
    const clock: Clock = {
      id: Date.now().toString(),
      timezone: localTimezone,
      label: "Local",
    };
    clocks = [...clocks, clock];
    saveSettings();
  }

  // Drag and drop handlers
  function handleDragStart(e: DragEvent, id: string) {
    draggedId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    dragOverId = id;
  }

  function handleDragLeave() {
    dragOverId = null;
  }

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    
    if (!draggedId || draggedId === targetId) {
      draggedId = null;
      dragOverId = null;
      return;
    }
    
    const draggedIndex = clocks.findIndex(c => c.id === draggedId);
    const targetIndex = clocks.findIndex(c => c.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      draggedId = null;
      dragOverId = null;
      return;
    }
    
    // Reorder clocks
    const newClocks = [...clocks];
    const [draggedClock] = newClocks.splice(draggedIndex, 1);
    newClocks.splice(targetIndex, 0, draggedClock);
    
    clocks = newClocks;
    draggedId = null;
    dragOverId = null;
    saveSettings();
  }

  function handleDragEnd() {
    draggedId = null;
    dragOverId = null;
  }

  function moveClock(id: string, direction: "up" | "down") {
    const index = clocks.findIndex(c => c.id === id);
    if (index === -1) return;
    
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= clocks.length) return;
    
    const newClocks = [...clocks];
    [newClocks[index], newClocks[newIndex]] = [newClocks[newIndex], newClocks[index]];
    clocks = newClocks;
    saveSettings();
  }

  // Fullscreen
  function toggleFullscreen() {
    if (!clocksContainer) return;
    
    if (!document.fullscreenElement) {
      clocksContainer.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  // Split clocks into rows based on layout
  const clockRows = $derived(() => {
    const config = layoutOptions[layout];
    
    if (layout === "auto" || !config.firstRowCols) {
      // Simple grid - return all clocks in one array
      return null;
    }
    
    // Split into first row and remaining rows
    const firstRowCount = config.firstRowCols;
    const firstRow = clocks.slice(0, firstRowCount);
    const rest = clocks.slice(firstRowCount);
    
    return { firstRow, rest, firstRowCols: firstRowCount, restCols: config.cols };
  });

  // Get grid classes for standard layouts
  function getGridClasses(cols: number): string {
    switch (cols) {
      case 0: return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"; // auto
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-2";
      case 3: return "grid-cols-3";
      case 4: return "grid-cols-4";
      case 5: return "grid-cols-5";
      case 6: return "grid-cols-6";
      default: return "grid-cols-1";
    }
  }

  // Clock size classes based on layout for fullscreen
  const clockSizeClass = $derived(
    isFullscreen 
      ? layoutOptions[layout].cols <= 2 ? "text-6xl" : layoutOptions[layout].cols <= 3 ? "text-5xl" : "text-4xl"
      : "text-3xl"
  );

  // Check if layout uses special row configuration
  const useSpecialLayout = $derived(layout.includes("x"));
</script>

<div class="h-full flex flex-col">
  {#if !isFullscreen}
    <header class="mb-4">
      <p class="text-sm text-(--color-text-muted)">
        Display multiple world clocks for different timezones. Drag clocks to reorder. Your local timezone: {localTimezone}
      </p>
    </header>

    <!-- Settings Bar -->
    <div class="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-(--color-border)">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          bind:checked={use24Hour}
          onchange={handleSettingsChange}
          class="accent-(--color-accent)"
        />
        24-hour
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          bind:checked={showSeconds}
          onchange={handleSettingsChange}
          class="accent-(--color-accent)"
        />
        Seconds
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          bind:checked={showDate}
          onchange={handleSettingsChange}
          class="accent-(--color-accent)"
        />
        Date
      </label>
      
      <!-- Layout selector -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-(--color-text-muted)">Layout:</span>
        <select
          bind:value={layout}
          onchange={handleSettingsChange}
          class="px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
        >
          <optgroup label="Grid">
            <option value="auto">Auto</option>
            <option value="1">1 Column</option>
            <option value="2">2 Columns</option>
            <option value="3">3 Columns</option>
            <option value="4">4 Columns</option>
            <option value="5">5 Columns</option>
            <option value="6">6 Columns</option>
          </optgroup>
          <optgroup label="Mixed (1 top)">
            <option value="1x2">1 top + 2/row</option>
            <option value="1x3">1 top + 3/row</option>
            <option value="1x4">1 top + 4/row</option>
            <option value="1x5">1 top + 5/row</option>
          </optgroup>
          <optgroup label="Mixed (2 top)">
            <option value="2x3">2 top + 3/row</option>
            <option value="2x4">2 top + 4/row</option>
            <option value="2x5">2 top + 5/row</option>
          </optgroup>
          <optgroup label="Mixed (3-4 top)">
            <option value="3x4">3 top + 4/row</option>
            <option value="3x5">3 top + 5/row</option>
            <option value="4x5">4 top + 5/row</option>
          </optgroup>
        </select>
      </div>

      <button
        onclick={toggleFullscreen}
        class="flex items-center gap-1 text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        title="Fullscreen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        Fullscreen
      </button>
      
      <button
        onclick={resetToDefaults}
        class="text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Reset
      </button>
    </div>

    <!-- Add Clock -->
    <div class="flex flex-col gap-2 mb-4">
      <div class="flex flex-wrap gap-2">
        {#if useCustomTimezone}
          <input
            type="text"
            bind:value={customTimezone}
            placeholder="e.g., America/New_York, Europe/Paris"
            class="flex-1 min-w-48 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted) {customTimezoneError ? 'border-red-500' : ''}"
          />
        {:else}
          <select
            bind:value={newTimezone}
            class="flex-1 min-w-48 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          >
            <option value="">Select timezone...</option>
            {#each timezoneGroups as group}
              <optgroup label={group.region}>
                {#each group.zones as zone}
                  <option value={zone.value}>{zone.label}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        {/if}
        <input
          type="text"
          bind:value={newLabel}
          placeholder="Label (optional)"
          class="w-36 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
        />
        <button
          onclick={addClock}
          disabled={useCustomTimezone ? !customTimezone.trim() : !newTimezone}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
        <button
          onclick={addLocalTimezone}
          class="px-4 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover) transition-colors text-sm"
        >
          Add Local
        </button>
      </div>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-sm text-(--color-text-muted)">
          <input
            type="checkbox"
            bind:checked={useCustomTimezone}
            class="accent-(--color-accent)"
          />
          Custom timezone (IANA format)
        </label>
        {#if customTimezoneError}
          <span class="text-sm text-red-500">{customTimezoneError}</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Clocks Grid -->
  <div 
    bind:this={clocksContainer}
    class="flex-1 overflow-auto {isFullscreen ? 'bg-black p-4 flex flex-col items-center justify-center' : ''}"
  >
    {#if clocks.length === 0}
      <div class="text-center py-12 text-(--color-text-muted)">
        No clocks added. Select a timezone above to add one.
      </div>
    {:else if useSpecialLayout && clockRows()}
      <!-- Special layout with different row configurations -->
      {@const rows = clockRows()}
      {#if rows}
        <div class="flex flex-col gap-4 {isFullscreen ? 'w-full h-full justify-center' : ''}">
          <!-- First row -->
          {#if rows.firstRow.length > 0}
            <div class="grid {getGridClasses(rows.firstRowCols)} gap-4">
              {#each rows.firstRow as clock, index (clock.id)}
                {@const isDay = isDaytime(currentTime, clock.timezone)}
                {@const globalIndex = index}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  class="relative p-4 border border-(--color-border) {isDay ? 'bg-(--color-bg-alt)' : 'bg-gray-900'} {dragOverId === clock.id ? 'ring-2 ring-(--color-accent)' : ''} {draggedId === clock.id ? 'opacity-50' : ''} {isFullscreen ? 'flex flex-col justify-center' : ''}"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, clock.id)}
                  ondragover={(e) => handleDragOver(e, clock.id)}
                  ondragleave={handleDragLeave}
                  ondrop={(e) => handleDrop(e, clock.id)}
                  ondragend={handleDragEnd}
                >
                  {#if !isFullscreen}
                    <div class="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        onclick={() => moveClock(clock.id, "up")}
                        disabled={globalIndex === 0}
                        class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move left"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                      </button>
                      <button
                        onclick={() => moveClock(clock.id, "down")}
                        disabled={globalIndex === clocks.length - 1}
                        class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move right"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </button>
                      <button
                        onclick={() => removeClock(clock.id)}
                        class="p-1 text-(--color-text-muted) hover:text-red-500 transition-colors"
                        title="Remove clock"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  {/if}

                  <div class="absolute top-2 left-2">
                    {#if isDay}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-yellow-500">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                      </svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-300">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                      </svg>
                    {/if}
                  </div>

                  <div class="text-center pt-4">
                    <div class="text-sm font-medium {isDay ? 'text-(--color-text)' : 'text-white'} mb-1 {isFullscreen ? 'text-lg' : ''}">
                      {clock.label}
                    </div>
                    <div class="{clockSizeClass} font-mono font-bold {isDay ? 'text-(--color-text)' : 'text-white'} mb-1">
                      {formatTime(currentTime, clock.timezone)}
                    </div>
                    {#if showDate}
                      <div class="text-sm {isDay ? 'text-(--color-text-muted)' : 'text-gray-400'} {isFullscreen ? 'text-base' : ''}">
                        {formatDate(currentTime, clock.timezone)}
                      </div>
                    {/if}
                    <div class="text-xs {isDay ? 'text-(--color-text-muted)' : 'text-gray-500'} mt-1">
                      {getOffset(clock.timezone)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          
          <!-- Remaining rows -->
          {#if rows.rest.length > 0}
            <div class="grid {getGridClasses(rows.restCols)} gap-4">
              {#each rows.rest as clock, index (clock.id)}
                {@const isDay = isDaytime(currentTime, clock.timezone)}
                {@const globalIndex = rows.firstRow.length + index}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  class="relative p-4 border border-(--color-border) {isDay ? 'bg-(--color-bg-alt)' : 'bg-gray-900'} {dragOverId === clock.id ? 'ring-2 ring-(--color-accent)' : ''} {draggedId === clock.id ? 'opacity-50' : ''} {isFullscreen ? 'flex flex-col justify-center' : ''}"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, clock.id)}
                  ondragover={(e) => handleDragOver(e, clock.id)}
                  ondragleave={handleDragLeave}
                  ondrop={(e) => handleDrop(e, clock.id)}
                  ondragend={handleDragEnd}
                >
                  {#if !isFullscreen}
                    <div class="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        onclick={() => moveClock(clock.id, "up")}
                        disabled={globalIndex === 0}
                        class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move left"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                      </button>
                      <button
                        onclick={() => moveClock(clock.id, "down")}
                        disabled={globalIndex === clocks.length - 1}
                        class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move right"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </button>
                      <button
                        onclick={() => removeClock(clock.id)}
                        class="p-1 text-(--color-text-muted) hover:text-red-500 transition-colors"
                        title="Remove clock"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  {/if}

                  <div class="absolute top-2 left-2">
                    {#if isDay}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-yellow-500">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                      </svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-300">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                      </svg>
                    {/if}
                  </div>

                  <div class="text-center pt-4">
                    <div class="text-sm font-medium {isDay ? 'text-(--color-text)' : 'text-white'} mb-1 {isFullscreen ? 'text-lg' : ''}">
                      {clock.label}
                    </div>
                    <div class="{clockSizeClass} font-mono font-bold {isDay ? 'text-(--color-text)' : 'text-white'} mb-1">
                      {formatTime(currentTime, clock.timezone)}
                    </div>
                    {#if showDate}
                      <div class="text-sm {isDay ? 'text-(--color-text-muted)' : 'text-gray-400'} {isFullscreen ? 'text-base' : ''}">
                        {formatDate(currentTime, clock.timezone)}
                      </div>
                    {/if}
                    <div class="text-xs {isDay ? 'text-(--color-text-muted)' : 'text-gray-500'} mt-1">
                      {getOffset(clock.timezone)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <!-- Standard grid layout -->
      <div class="grid {getGridClasses(layoutOptions[layout].cols)} gap-4 {isFullscreen ? 'w-full h-full content-center' : ''}">
        {#each clocks as clock, index (clock.id)}
          {@const isDay = isDaytime(currentTime, clock.timezone)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="relative p-4 border border-(--color-border) {isDay ? 'bg-(--color-bg-alt)' : 'bg-gray-900'} {dragOverId === clock.id ? 'ring-2 ring-(--color-accent)' : ''} {draggedId === clock.id ? 'opacity-50' : ''} {isFullscreen ? 'flex flex-col justify-center' : ''}"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, clock.id)}
            ondragover={(e) => handleDragOver(e, clock.id)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, clock.id)}
            ondragend={handleDragEnd}
          >
            <!-- Control buttons -->
            {#if !isFullscreen}
              <div class="absolute top-2 right-2 flex items-center gap-1">
                <!-- Move buttons -->
                <button
                  onclick={() => moveClock(clock.id, "up")}
                  disabled={index === 0}
                  class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <button
                  onclick={() => moveClock(clock.id, "down")}
                  disabled={index === clocks.length - 1}
                  class="p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move right"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
                <!-- Remove button -->
                <button
                  onclick={() => removeClock(clock.id)}
                  class="p-1 text-(--color-text-muted) hover:text-red-500 transition-colors"
                  title="Remove clock"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            {/if}

            <!-- Day/Night indicator -->
            <div class="absolute top-2 left-2">
              {#if isDay}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-yellow-500">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-300">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              {/if}
            </div>

            <!-- Clock content -->
            <div class="text-center pt-4">
              <div class="text-sm font-medium {isDay ? 'text-(--color-text)' : 'text-white'} mb-1 {isFullscreen ? 'text-lg' : ''}">
                {clock.label}
              </div>
              <div class="{clockSizeClass} font-mono font-bold {isDay ? 'text-(--color-text)' : 'text-white'} mb-1">
                {formatTime(currentTime, clock.timezone)}
              </div>
              {#if showDate}
                <div class="text-sm {isDay ? 'text-(--color-text-muted)' : 'text-gray-400'} {isFullscreen ? 'text-base' : ''}">
                  {formatDate(currentTime, clock.timezone)}
                </div>
              {/if}
              <div class="text-xs {isDay ? 'text-(--color-text-muted)' : 'text-gray-500'} mt-1">
                {getOffset(clock.timezone)}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
    
    <!-- Fullscreen exit hint -->
    {#if isFullscreen}
      <button
        onclick={toggleFullscreen}
        class="fixed top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
        title="Exit fullscreen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20"></polyline>
          <polyline points="20 10 14 10 14 4"></polyline>
          <line x1="14" y1="10" x2="21" y2="3"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      </button>
    {/if}
  </div>
</div>
