<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Check, ChevronDown, Clock3, Expand, Monitor, Pencil, Plus, RotateCcw, Settings2, X } from "@lucide/svelte";
  import WorldClockCard from "./WorldClockCard.svelte";
  import {
    clockColumns, clockLayouts, defaultClockSettings, isValidTimezone, normalizeCitySearch, readClock, restoreClockSettings, timezoneLabel, timezoneOptions,
    type ClockLayout, type ClockReading, type ClockSettings, type TimezoneOption, type WorldClock,
  } from "../../lib/world-clock.ts";

  interface ClockRow {
    clocks: WorldClock[];
    columns: number;
  }

  interface UndoState {
    clocks: WorldClock[];
    referenceId: string;
    message: string;
  }

  interface ScreenLock {
    released: boolean;
    release: () => Promise<void>;
    addEventListener: (type: string, listener: () => void) => void;
  }

  const storageKey: string = "world-clock-settings";
  let localTimezone = $state<string>("UTC");
  let settings = $state<ClockSettings>(defaultClockSettings("UTC"));
  let currentTime = $state<Date>(new Date());
  let ready = $state<boolean>(false);
  let width = $state<number>(900);
  let height = $state<number>(600);
  let board = $state<HTMLDivElement>();
  let fullscreen = $state<boolean>(false);
  let fullscreenAvailable = $state<boolean>(false);
  let editing = $state<boolean>(false);
  let appearanceOpen = $state<boolean>(false);
  let editorOpen = $state<boolean>(false);
  let editingId = $state<string>("");
  let cityQuery = $state<string>("");
  let selectedTimezone = $state<string>("");
  let clockLabel = $state<string>("");
  let editorError = $state<string>("");
  let searchInput = $state<HTMLInputElement>();
  let labelInput = $state<HTMLInputElement>();
  let searchIndex = $state<number>(-1);
  let cityChoices = $state<TimezoneOption[]>([]);
  let status = $state<string>("");
  let error = $state<string>("");
  let storageError = $state<string>("");
  let undoState = $state<UndoState | null>(null);
  let draggedId = $state<string>("");
  let dragOverId = $state<string>("");
  let keepAwake = $state<boolean>(false);
  let wakeAvailable = $state<boolean>(false);
  let wakeActive = $state<boolean>(false);
  let screenLock: ScreenLock | null = null;
  let wakeRequest: number = 0;
  let mounted: boolean = false;

  const referenceClock = $derived(settings.clocks.find((clock: WorldClock) => clock.id === settings.referenceId) ?? settings.clocks[0]);
  const referenceReading = $derived(readClock(currentTime, referenceClock?.timezone ?? localTimezone, settings.use24Hour));
  const readings = $derived(new Map<string, ClockReading>(settings.clocks.map((clock: WorldClock) => [clock.id, readClock(currentTime, clock.timezone, settings.use24Hour)])));
  const currentLayout = $derived(clockLayouts.find((layout: ClockLayout) => layout.value === settings.layout) ?? clockLayouts[0]);
  const searchResults = $derived.by(() => {
    const query: string = normalizeCitySearch(cityQuery);
    const matches: TimezoneOption[] = cityChoices.filter((choice: TimezoneOption) => !query || query.split(/\s+/).every((word: string) => choice.search.includes(word)));
    const custom: string = cityQuery.trim();
    if (query && !matches.some((choice: TimezoneOption) => choice.timezone.toLowerCase() === custom.toLowerCase()) && isValidTimezone(custom)) {
      matches.unshift({ timezone: custom, label: timezoneLabel(custom), search: query });
    }
    return matches.slice(0, 8);
  });
  const rows = $derived.by((): ClockRow[] => {
    const compact: boolean = settings.density === "compact";
    const groups: ClockRow[] = [];
    if (currentLayout.firstRow) {
      const first: WorldClock[] = settings.clocks.slice(0, currentLayout.firstRow);
      if (first.length) groups.push({ clocks: first, columns: clockColumns(width, first.length, currentLayout.firstRow, compact) });
      const rest: WorldClock[] = settings.clocks.slice(currentLayout.firstRow);
      if (rest.length) groups.push({ clocks: rest, columns: clockColumns(width, rest.length, currentLayout.columns, compact) });
    } else {
      groups.push({ clocks: settings.clocks, columns: clockColumns(width, settings.clocks.length, currentLayout.columns, compact, fullscreen ? height - 40 : undefined) });
    }
    return groups;
  });

  onMount(() => {
    mounted = true;
    localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    cityChoices = timezoneOptions(localTimezone);
    settings = defaultClockSettings(localTimezone);
    try {
      const stored: string | null = localStorage.getItem(storageKey);
      if (stored) settings = restoreClockSettings(JSON.parse(stored), localTimezone);
    } catch {
      storageError = "Saved settings could not be read. This board still works; changes may not survive a reload.";
    }
    currentTime = new Date();
    fullscreenAvailable = Boolean(document.fullscreenEnabled && board?.requestFullscreen);
    wakeAvailable = "wakeLock" in navigator;
    ready = true;
    const timer: ReturnType<typeof setInterval> = setInterval(() => { currentTime = new Date(); }, 1000);
    const onFullscreen = (): void => { fullscreen = document.fullscreenElement === board; };
    const onVisibility = (): void => {
      currentTime = new Date();
      if (document.visibilityState === "visible" && keepAwake) void requestScreenLock();
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      wakeRequest++;
      clearInterval(timer);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      void screenLock?.release().catch(() => {});
    };
  });

  function saveSettings(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify($state.snapshot(settings)));
      storageError = "";
    } catch {
      storageError = "Changes are kept in this tab, but could not be saved. Your browser may have blocked local storage.";
    }
  }

  async function openEditor(clock?: WorldClock): Promise<void> {
    editingId = clock?.id ?? "";
    cityQuery = "";
    selectedTimezone = clock?.timezone ?? "";
    clockLabel = clock?.label ?? "";
    searchIndex = -1;
    editorError = "";
    editorOpen = true;
    appearanceOpen = false;
    await tick();
    if (clock) labelInput?.focus();
    else searchInput?.focus();
  }

  function closeEditor(): void {
    editorOpen = false;
    editingId = "";
    editorError = "";
  }

  async function selectCity(choice: TimezoneOption): Promise<void> {
    selectedTimezone = choice.timezone;
    cityQuery = "";
    searchIndex = -1;
    editorError = "";
    await tick();
    labelInput?.focus();
  }

  async function searchKey(event: KeyboardEvent): Promise<void> {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      searchIndex = event.key === "ArrowDown" ? Math.min(searchIndex + 1, searchResults.length - 1) : Math.max(searchIndex - 1, 0);
      await tick();
      document.getElementById(`clock-city-option-${searchIndex}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && !selectedTimezone) {
      event.preventDefault();
      const choice: TimezoneOption | undefined = searchResults[searchIndex >= 0 ? searchIndex : 0];
      if (choice) void selectCity(choice);
    }
  }

  function submitClock(): void {
    if (!selectedTimezone || !isValidTimezone(selectedTimezone)) { editorError = "Choose a city, or enter a valid IANA time zone such as Europe/London."; return; }
    const label: string = clockLabel.trim() || timezoneLabel(selectedTimezone);
    if (editingId) {
      settings.clocks = settings.clocks.map((clock: WorldClock) => clock.id === editingId ? { ...clock, timezone: selectedTimezone, label } : clock);
      status = `Updated ${label}.`;
    } else {
      const clock: WorldClock = { id: crypto.randomUUID(), timezone: selectedTimezone, label };
      settings.clocks = [...settings.clocks, clock];
      if (!settings.referenceId) settings.referenceId = clock.id;
      status = `Added ${label}.`;
    }
    undoState = null;
    saveSettings();
    closeEditor();
  }

  function addLocal(): void {
    const existing: WorldClock | undefined = settings.clocks.find((clock: WorldClock) => clock.timezone === localTimezone);
    if (existing) { status = `${existing.label} already shows your local time zone.`; return; }
    selectedTimezone = localTimezone;
    clockLabel = "";
    editingId = "";
    submitClock();
  }

  function removeClock(id: string): void {
    const clock: WorldClock | undefined = settings.clocks.find((item: WorldClock) => item.id === id);
    if (!clock) return;
    undoState = { clocks: $state.snapshot(settings.clocks), referenceId: settings.referenceId, message: `Removed ${clock.label}.` };
    settings.clocks = settings.clocks.filter((item: WorldClock) => item.id !== id);
    if (settings.referenceId === id) settings.referenceId = settings.clocks[0]?.id ?? "";
    if (editingId === id) closeEditor();
    status = "";
    saveSettings();
  }

  function resetClocks(): void {
    undoState = { clocks: $state.snapshot(settings.clocks), referenceId: settings.referenceId, message: "Restored the default cities. Appearance settings were kept." };
    const defaults: ClockSettings = defaultClockSettings(localTimezone);
    settings.clocks = defaults.clocks;
    settings.referenceId = defaults.referenceId;
    closeEditor();
    status = "";
    saveSettings();
  }

  function undo(): void {
    if (!undoState) return;
    settings.clocks = undoState.clocks;
    settings.referenceId = undoState.referenceId;
    undoState = null;
    status = "Your previous clock list was restored.";
    saveSettings();
  }

  function reorder(id: string, target: number): void {
    const index: number = settings.clocks.findIndex((clock: WorldClock) => clock.id === id);
    if (index < 0 || target < 0 || target >= settings.clocks.length || index === target) return;
    const clocks: WorldClock[] = [...settings.clocks];
    const [clock] = clocks.splice(index, 1);
    clocks.splice(target, 0, clock);
    settings.clocks = clocks;
    undoState = null;
    status = `${clock.label} moved to position ${target + 1}.`;
    saveSettings();
  }

  function setReference(id: string): void {
    settings.referenceId = id;
    status = `Clock differences are now relative to ${referenceClock?.label ?? "your reference clock"}.`;
    saveSettings();
  }

  function dragStart(event: DragEvent, id: string): void {
    draggedId = id;
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }
  }

  function drop(event: DragEvent, id: string): void {
    event.preventDefault();
    if (draggedId) reorder(draggedId, settings.clocks.findIndex((clock: WorldClock) => clock.id === id));
    draggedId = "";
    dragOverId = "";
  }

  async function toggleFullscreen(): Promise<void> {
    error = "";
    const previousEditing: boolean = editing;
    try {
      if (document.fullscreenElement === board) await document.exitFullscreen();
      else if (board?.requestFullscreen) {
        editing = false;
        closeEditor();
        appearanceOpen = false;
        await board.requestFullscreen();
      } else error = "Fullscreen is not available in this browser. You can still use the clock board normally.";
    } catch {
      editing = previousEditing;
      error = "Fullscreen could not start. Try again, or use your browser’s fullscreen mode.";
    }
  }

  async function requestScreenLock(): Promise<void> {
    if (!keepAwake || !mounted || document.visibilityState !== "visible" || screenLock && !screenLock.released) return;
    const request: number = ++wakeRequest;
    try {
      const wakeNavigator = navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<ScreenLock> } };
      const lock: ScreenLock = await wakeNavigator.wakeLock.request("screen");
      if (!mounted || !keepAwake || request !== wakeRequest) { await lock.release(); return; }
      screenLock = lock;
      wakeActive = true;
      lock.addEventListener("release", () => { if (screenLock === lock) { screenLock = null; wakeActive = false; } });
    } catch {
      if (mounted && request === wakeRequest) { keepAwake = false; wakeActive = false; error = "Your browser could not keep the screen awake. Check battery-saving settings and try again."; }
    }
  }

  async function toggleScreenLock(): Promise<void> {
    error = "";
    if (keepAwake) await requestScreenLock();
    else {
      wakeRequest++;
      const lock: ScreenLock | null = screenLock;
      screenLock = null;
      wakeActive = false;
      try { await lock?.release(); } catch { error = "The screen wake lock could not be released. Closing this tab will release it."; }
    }
  }

  function shortcut(event: KeyboardEvent): void {
    if (event.key === "Escape" && !fullscreen) { closeEditor(); appearanceOpen = false; editing = false; }
  }
</script>

<svelte:window onkeydown={shortcut} />

<div class="world-clock" aria-busy={!ready}>
  <div class="board-toolbar">
    <p class="board-description">Your cities. One glance.</p>
    <div class="toolbar-actions">
      <button type="button" class="primary" onclick={() => openEditor()} aria-expanded={editorOpen && !editingId} aria-controls="clock-editor" disabled={!ready}><Plus size={17} /> Add city</button>
      <button type="button" class:active={editing} aria-pressed={editing} onclick={() => { editing = !editing; if (!editing) closeEditor(); }} disabled={!ready || !settings.clocks.length}>{#if editing}<Check size={16} /> Done{:else}<Pencil size={15} /> Edit clocks{/if}</button>
      <button type="button" class:active={appearanceOpen} aria-expanded={appearanceOpen} aria-controls="clock-appearance" onclick={() => { appearanceOpen = !appearanceOpen; if (appearanceOpen) closeEditor(); }}><Settings2 size={16} /> Appearance <ChevronDown size={13} /></button>
      <button type="button" onclick={toggleFullscreen} disabled={!ready || !settings.clocks.length || !fullscreenAvailable} title={fullscreenAvailable ? "Show only the clock board" : "Fullscreen is unavailable in this browser"}><Expand size={16} /> Fullscreen</button>
    </div>
  </div>

  {#if appearanceOpen}
    <section id="clock-appearance" class="appearance-panel" aria-label="Clock appearance">
      <div class="display-toggles">
        <label><input type="checkbox" bind:checked={settings.use24Hour} onchange={saveSettings} /> 24-hour time</label>
        <label><input type="checkbox" bind:checked={settings.showSeconds} onchange={saveSettings} /> Seconds</label>
        <label><input type="checkbox" bind:checked={settings.showDate} onchange={saveSettings} /> Date</label>
        <label><input type="checkbox" bind:checked={settings.showDifference} onchange={saveSettings} /> Time differences</label>
      </div>
      <div class="appearance-fields">
        <label class="field">Spacing<select bind:value={settings.density} onchange={saveSettings}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        <label class="field">Reference city<select bind:value={settings.referenceId} onchange={saveSettings} disabled={!settings.clocks.length}>{#each settings.clocks as clock (clock.id)}<option value={clock.id}>{clock.label}</option>{/each}</select></label>
        <label class="awake-toggle" title={wakeAvailable ? "Keeps the screen awake while this tab is visible. May increase battery use." : "Screen Wake Lock needs a supported browser and a secure connection"}><input type="checkbox" bind:checked={keepAwake} onchange={toggleScreenLock} disabled={!wakeAvailable} /><Monitor size={16} /> Keep screen awake <span class="small muted">{!wakeAvailable ? "Unavailable" : wakeActive ? "Active" : keepAwake ? "Paused" : "This session only"}</span></label>
      </div>
      <details class="advanced-layout"><summary>Advanced layout</summary><div class="advanced-fields"><label class="field">Desktop columns<select bind:value={settings.layout} onchange={saveSettings}>{#each clockLayouts as option}<option value={option.value}>{option.label}</option>{/each}</select></label><p class="small muted">Columns adapt to the available width so times stay readable, including in fullscreen.</p></div></details>
      <p class="small muted">Dates use YYYY-MM-DD. Time differences and Yesterday / Tomorrow are relative to the reference city. Day/night uses estimated sunrise and sunset for each time zone's reference city in the time-zone database, not your exact location. Zones without a location, such as UTC, use 06:00–18:00.</p>
    </section>
  {/if}

  {#if editorOpen}
    <section id="clock-editor" class="city-editor" aria-label={editingId ? "Edit a clock" : "Add a city"}>
      <div class="panel-heading"><h2>{editingId ? "Edit clock" : "Add a city"}</h2><button type="button" class="icon-button" aria-label="Close city editor" onclick={closeEditor}><X size={18} /></button></div>
      <form onsubmit={(event) => { event.preventDefault(); submitClock(); }}>
        <div class="editor-fields">
          <div class="city-search-field">
            <label for="clock-city-search">City or IANA time zone</label>
            {#if selectedTimezone}
              <div class="selected-city"><div><strong>{timezoneLabel(selectedTimezone)}</strong><span class="small muted">{selectedTimezone}</span></div><button type="button" onclick={async () => { selectedTimezone = ""; await tick(); searchInput?.focus(); }}>Change</button></div>
            {:else}
              <input id="clock-city-search" bind:this={searchInput} type="search" placeholder="Search New York, Istanbul, Asia/Tokyo…" bind:value={cityQuery} oninput={() => { searchIndex = -1; editorError = ""; }} onkeydown={searchKey} autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded={searchResults.length > 0} aria-controls="clock-city-results" aria-activedescendant={searchIndex >= 0 && searchResults[searchIndex] ? `clock-city-option-${searchIndex}` : undefined} aria-describedby="clock-city-hint" />
            {/if}
          </div>
          <label class="field label-field">Display name (optional)<input bind:this={labelInput} bind:value={clockLabel} placeholder={selectedTimezone ? timezoneLabel(selectedTimezone) : "e.g. Japan office"} /></label>
          <button type="submit" class="primary" disabled={!selectedTimezone}>{editingId ? "Save clock" : "Add clock"}</button>
        </div>
        {#if !selectedTimezone}
          <ul id="clock-city-results" class="city-results" role="listbox" aria-label="Matching time zones">
            {#each searchResults as city, index (city.timezone)}
              {@const reading = readClock(currentTime, city.timezone, settings.use24Hour)}
              <li role="presentation"><button id={`clock-city-option-${index}`} type="button" role="option" aria-selected={searchIndex === index} class:highlighted={searchIndex === index} onclick={() => selectCity(city)}><span><strong>{city.label}</strong><span class="small muted">{city.timezone}</span></span><span class="result-time">{reading.time} {reading.period}<span class="small muted">{reading.offset}</span></span></button></li>
            {:else}
              <li class="no-results">No matching city. Try a full IANA time zone such as America/New_York.</li>
            {/each}
          </ul>
        {/if}
        <div class="editor-footer"><p id="clock-city-hint" class="small muted">Search a city or paste a time zone. Use ↑ / ↓ and Enter to select.</p>{#if !editingId}<button type="button" onclick={addLocal}>Add local city</button>{/if}</div>
        {#if editorError}<p class="error-message" role="alert">{editorError}</p>{/if}
      </form>
    </section>
  {/if}

  <div class="board-context">
    <span class="live-label"><span class="live-dot" aria-hidden="true"></span> Live <span class="muted">· {settings.clocks.length} {settings.clocks.length === 1 ? "city" : "cities"}</span></span>
    {#if settings.showDifference && referenceClock}<span class="small muted">Compared to <strong>{referenceClock.label}</strong></span>{/if}
    {#if editing}<button type="button" class="reset-button" onclick={resetClocks}><RotateCcw size={14} /> Restore default cities</button>{/if}
  </div>

  {#if storageError}<p class="error-message" role="alert">{storageError}</p>{/if}
  {#if error}<p class="error-message" role="alert">{error}</p>{/if}
  <div class="board-feedback" aria-live="polite" aria-atomic="true">
    {#if undoState}<div class="undo-message"><span>{undoState.message}</span><button type="button" onclick={undo}><RotateCcw size={14} /> Undo</button><button type="button" class="icon-button" aria-label="Dismiss undo message" onclick={() => undoState = null}><X size={15} /></button></div>{:else if status}<p class="small muted">{status}</p>{/if}
  </div>

  <div bind:this={board} bind:clientWidth={width} bind:clientHeight={height} class="clock-board" class:compact={settings.density === "compact"} class:fullscreen aria-label="World clock board">
    {#if !settings.clocks.length}
      <div class="empty-board"><Clock3 size={32} strokeWidth={1.25} /><h2>Make room for your world.</h2><p>Add the cities you follow. Your board is saved in this browser.</p><div><button type="button" class="primary" onclick={() => openEditor()}><Plus size={16} /> Add your first city</button><button type="button" onclick={resetClocks}>Restore default cities</button></div></div>
    {:else}
      <div class="clock-rows">
        {#each rows as row}
          <div class="clock-grid" style={`--clock-columns: ${row.columns};`}>
            {#each row.clocks as clock (clock.id)}
              <WorldClockCard {clock} reading={readings.get(clock.id)!} reference={referenceReading} referenceLabel={referenceClock?.label ?? "local time"} isReference={clock.id === referenceClock?.id} isLocal={clock.timezone === localTimezone} showSeconds={settings.showSeconds} showDate={settings.showDate} showDifference={settings.showDifference} editing={editing && !fullscreen} first={settings.clocks[0]?.id === clock.id} last={settings.clocks.at(-1)?.id === clock.id} dragging={draggedId === clock.id} dropTarget={dragOverId === clock.id} onedit={() => openEditor(clock)} onremove={() => removeClock(clock.id)} onmove={(direction) => reorder(clock.id, settings.clocks.findIndex((item: WorldClock) => item.id === clock.id) + direction)} onreference={() => setReference(clock.id)} ondragstart={(event) => dragStart(event, clock.id)} ondragover={(event) => { if (draggedId) { event.preventDefault(); dragOverId = clock.id; } }} ondrop={(event) => drop(event, clock.id)} ondragend={() => { draggedId = ""; dragOverId = ""; }} />
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <p class="board-note small muted">Saved on this device. Times follow your device clock and its time-zone data.</p>
</div>

<style>
  .world-clock { display: flex; flex-direction: column; gap: 1rem; min-width: 0; color: var(--color-text); }
  .world-clock :is(button, input, select) { font: inherit; }
  .world-clock button { display: inline-flex; align-items: center; justify-content: center; gap: .45rem; min-height: 44px; padding: .55rem .8rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); color: var(--color-text); font-size: .8125rem; line-height: 1.4; cursor: pointer; }
  .world-clock button:hover:not(:disabled) { background: var(--color-bg); border-color: var(--color-text-muted); }
  .world-clock button.primary { background: var(--color-accent); color: var(--color-btn-text); border-color: var(--color-accent); }
  .world-clock button.primary:hover:not(:disabled) { background: var(--color-accent-hover); }
  .world-clock button.active { border-color: var(--color-text); background: var(--color-bg); }
  .world-clock button:disabled { opacity: .45; cursor: not-allowed; }
  .world-clock :is(button, input, select, summary):focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
  .world-clock :is(input:not([type="checkbox"]), select) { width: 100%; min-width: 0; min-height: 44px; padding: .6rem .7rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); color: var(--color-text); font-size: .875rem; }
  .world-clock input::placeholder { color: var(--color-text-muted); }
  .world-clock input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--color-accent); flex-shrink: 0; }
  .world-clock p { margin: 0; }
  .board-toolbar, .toolbar-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
  .board-toolbar { justify-content: space-between; gap: 1rem; padding-bottom: .25rem; }
  .board-description { font-size: .875rem; color: var(--color-text-muted); }
  .small { font-size: .75rem; line-height: 1.65; }
  .muted { color: var(--color-text-muted); }
  .appearance-panel, .city-editor { border: 1px solid var(--color-border); background: var(--color-bg-alt); padding: 1rem; }
  .appearance-panel { display: flex; flex-direction: column; gap: 1.1rem; }
  .display-toggles { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; }
  .display-toggles label, .awake-toggle { display: inline-flex; align-items: center; flex-wrap: wrap; gap: .5rem; min-height: 36px; font-size: .8125rem; }
  .appearance-fields { display: flex; align-items: end; flex-wrap: wrap; gap: 1rem 1.5rem; }
  .field { display: flex; flex-direction: column; gap: .4rem; min-width: 0; font-size: .8125rem; }
  .appearance-fields .field { min-width: 160px; }
  .awake-toggle { align-self: center; }
  .advanced-layout { border-top: 1px solid var(--color-border); padding-top: .85rem; }
  .advanced-layout summary { width: fit-content; font-size: .8125rem; cursor: pointer; padding-block: .35rem; }
  .advanced-fields { display: flex; flex-wrap: wrap; align-items: end; gap: 1rem; padding-top: .75rem; }
  .advanced-fields .field { min-width: 200px; }
  .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  .panel-heading h2 { font-size: 1rem; font-weight: 600; }
  .world-clock .icon-button { width: 44px; min-width: 44px; padding: 0; }
  .editor-fields { display: flex; flex-wrap: wrap; align-items: end; gap: .8rem; }
  .city-search-field { flex: 2 1 18rem; min-width: 0; }
  .city-search-field > label { display: block; margin-bottom: .4rem; font-size: .8125rem; }
  .label-field { flex: 1 1 12rem; }
  .selected-city { display: flex; align-items: center; justify-content: space-between; gap: .6rem; min-height: 44px; }
  .selected-city > div { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
  .selected-city strong { font-size: .875rem; }
  .selected-city button { flex-shrink: 0; }
  .city-results { list-style: none; margin: .9rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 .9rem; }
  .city-results li { min-width: 0; }
  .world-clock .city-results button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 64px; gap: .8rem; padding: .7rem; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; text-align: left; }
  .city-results button > span { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
  .city-results strong { font-size: .875rem; font-weight: 500; }
  .city-results .result-time { flex-shrink: 0; align-items: end; font-variant-numeric: tabular-nums; }
  .world-clock .city-results button.highlighted { background: var(--color-bg); outline: 1px solid var(--color-text); outline-offset: -1px; }
  .no-results { padding: .8rem; font-size: .875rem; color: var(--color-text-muted); grid-column: 1 / -1; }
  .editor-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .8rem; margin-top: .85rem; }
  .board-context { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1.25rem; min-height: 1.6rem; }
  .live-label { display: inline-flex; align-items: center; gap: .45rem; font-size: .75rem; }
  .live-dot { width: 6px; height: 6px; background: var(--color-text); border-radius: 50%; }
  @media (prefers-reduced-motion: no-preference) {
    .live-dot { animation: live-pulse 2s ease-in-out infinite; }
  }
  @keyframes live-pulse { 50% { opacity: .25; } }
  .board-context strong { font-weight: 500; color: var(--color-text); }
  .world-clock .reset-button { min-height: 36px; margin-inline-start: auto; border-color: transparent; background: transparent; font-size: .75rem; }
  .board-feedback:empty { display: none; }
  .undo-message { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; font-size: .8125rem; }
  .undo-message > span { margin-inline-end: auto; }
  .error-message { background: var(--color-error-bg); color: var(--color-error-text); border: 1px solid var(--color-error-border); padding: .75rem; font-size: .8125rem; line-height: 1.6; }
  .clock-board { min-width: 0; }
  .clock-rows { display: flex; flex-direction: column; gap: 1rem; }
  .clock-grid { display: grid; grid-template-columns: repeat(var(--clock-columns), minmax(0, 1fr)); gap: 1rem; }
  .clock-board.fullscreen { display: flex; flex-direction: column; width: 100%; height: 100%; padding: 1.25rem; overflow: auto; background: var(--color-bg); color: var(--color-text); }
  .clock-board.fullscreen .clock-rows { flex: 1; }
  .clock-board.fullscreen .clock-grid { flex: 1; grid-auto-rows: minmax(min-content, 1fr); }
  .empty-board { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3.5rem 1rem; border: 1px dashed var(--color-border); text-align: center; }
  .empty-board > :global(svg) { color: var(--color-text-muted); }
  .empty-board h2 { font-size: 1.125rem; font-weight: 500; }
  .empty-board p { font-size: .875rem; color: var(--color-text-muted); }
  .empty-board > div { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; }
  .board-note { padding-bottom: .75rem; }
  @media (max-width: 600px) {
    .toolbar-actions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .toolbar-actions > button { width: 100%; }
    .city-results { grid-template-columns: minmax(0, 1fr); }
    .world-clock :is(input:not([type="checkbox"]), select) { font-size: 1rem; }
    .editor-fields { align-items: stretch; }
    .editor-fields > button { flex: 1 0 100%; }
    .appearance-fields .field { flex: 1; }
    .clock-board.fullscreen { padding: .75rem; }
  }
</style>
