<script lang="ts">
  import { onMount } from "svelte";

  interface KeyEvent {
    key: string;
    code: string;
    keyCode: number;
    which: number;
    charCode: number;
    location: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    repeat: boolean;
    timestamp: number;
  }

  let currentEvent = $state<KeyEvent | null>(null);
  let history = $state<KeyEvent[]>([]);
  let isListening = $state(true);
  let copied = $state<string | null>(null);

  const locationNames: Record<number, string> = {
    0: "Standard",
    1: "Left",
    2: "Right",
    3: "Numpad",
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isListening) return;

    // Prevent default for most keys to capture them properly
    // Allow some browser shortcuts to work
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }

    const event: KeyEvent = {
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      which: e.which,
      charCode: e.charCode,
      location: e.location,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
      timestamp: Date.now(),
    };

    currentEvent = event;
    history = [event, ...history.slice(0, 19)]; // Keep last 20 events
  };

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    copied = label;
    setTimeout(() => { copied = null; }, 1500);
  };

  const clearHistory = () => {
    history = [];
    currentEvent = null;
  };

  const getJsCode = (e: KeyEvent): string => {
    const conditions: string[] = [];
    if (e.ctrlKey) conditions.push("e.ctrlKey");
    if (e.shiftKey) conditions.push("e.shiftKey");
    if (e.altKey) conditions.push("e.altKey");
    if (e.metaKey) conditions.push("e.metaKey");
    conditions.push(`e.code === "${e.code}"`);
    return `if (${conditions.join(" && ")}) {\n  // Handle ${e.key} key\n}`;
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Press any key to see its code, keyCode, and other properties. Useful for implementing keyboard event handlers.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex items-center gap-4">
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={isListening}
        class="w-4 h-4 accent-(--color-accent)"
      />
      <span class="text-sm text-(--color-text)">Listen for keys</span>
    </label>
  </div>

  <!-- Main Display -->
  <div class="mb-6 p-8 border-2 border-dashed border-(--color-border) bg-(--color-bg-alt) text-center {isListening ? '' : 'opacity-50'}">
    {#if currentEvent}
      <div class="text-6xl font-mono font-bold text-(--color-text) mb-4">
        {currentEvent.key === " " ? "Space" : currentEvent.key}
      </div>
      <div class="text-lg text-(--color-text-muted) font-mono">
        {currentEvent.code}
      </div>
    {:else}
      <div class="text-2xl text-(--color-text-muted)">
        Press any key...
      </div>
    {/if}
  </div>

  {#if currentEvent}
    <!-- Key Properties -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="p-3 border border-(--color-border) bg-(--color-bg)">
        <div class="text-xs text-(--color-text-muted) mb-1">key</div>
        <div class="font-mono text-sm text-(--color-text) flex justify-between items-center">
          <span>"{currentEvent.key}"</span>
          <button
            onclick={() => handleCopy(`"${currentEvent?.key}"`, "key")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
          >
            {copied === "key" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div class="p-3 border border-(--color-border) bg-(--color-bg)">
        <div class="text-xs text-(--color-text-muted) mb-1">code</div>
        <div class="font-mono text-sm text-(--color-text) flex justify-between items-center">
          <span>"{currentEvent.code}"</span>
          <button
            onclick={() => handleCopy(`"${currentEvent?.code}"`, "code")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
          >
            {copied === "code" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div class="p-3 border border-(--color-border) bg-(--color-bg)">
        <div class="text-xs text-(--color-text-muted) mb-1">keyCode (deprecated)</div>
        <div class="font-mono text-sm text-(--color-text) flex justify-between items-center">
          <span>{currentEvent.keyCode}</span>
          <button
            onclick={() => handleCopy(String(currentEvent?.keyCode), "keyCode")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
          >
            {copied === "keyCode" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div class="p-3 border border-(--color-border) bg-(--color-bg)">
        <div class="text-xs text-(--color-text-muted) mb-1">which (deprecated)</div>
        <div class="font-mono text-sm text-(--color-text) flex justify-between items-center">
          <span>{currentEvent.which}</span>
          <button
            onclick={() => handleCopy(String(currentEvent?.which), "which")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
          >
            {copied === "which" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div class="p-3 border border-(--color-border) bg-(--color-bg)">
        <div class="text-xs text-(--color-text-muted) mb-1">location</div>
        <div class="font-mono text-sm text-(--color-text)">
          {currentEvent.location} ({locationNames[currentEvent.location] || "Unknown"})
        </div>
      </div>

      <div class="p-3 border border-(--color-border) bg-(--color-bg)">
        <div class="text-xs text-(--color-text-muted) mb-1">repeat</div>
        <div class="font-mono text-sm text-(--color-text)">
          {currentEvent.repeat}
        </div>
      </div>

      <div class="p-3 border border-(--color-border) bg-(--color-bg) col-span-2">
        <div class="text-xs text-(--color-text-muted) mb-1">Modifiers</div>
        <div class="flex gap-2 flex-wrap">
          <span class="px-2 py-0.5 text-xs font-mono {currentEvent.ctrlKey ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-border) text-(--color-text-muted)'}">
            Ctrl
          </span>
          <span class="px-2 py-0.5 text-xs font-mono {currentEvent.shiftKey ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-border) text-(--color-text-muted)'}">
            Shift
          </span>
          <span class="px-2 py-0.5 text-xs font-mono {currentEvent.altKey ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-border) text-(--color-text-muted)'}">
            Alt
          </span>
          <span class="px-2 py-0.5 text-xs font-mono {currentEvent.metaKey ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-border) text-(--color-text-muted)'}">
            Meta
          </span>
        </div>
      </div>
    </div>

    <!-- Code Snippet -->
    <div class="mb-6">
      <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium mb-3">Code Snippet</h3>
      <div class="border border-(--color-border) bg-(--color-bg)">
        <div class="flex justify-between items-center px-3 py-2 border-b border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs font-medium text-(--color-text)">JavaScript</span>
          <button
            onclick={() => handleCopy(getJsCode(currentEvent!), "js")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
          >
            {copied === "js" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="p-3 text-xs font-mono text-(--color-text) overflow-x-auto">{getJsCode(currentEvent)}</pre>
      </div>
    </div>
  {/if}

  <!-- History -->
  {#if history.length > 0}
    <div class="flex-1 min-h-0">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xs tracking-wider text-(--color-text-light) font-medium">History</h3>
        <button
          onclick={clearHistory}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
      <div class="border border-(--color-border) overflow-auto max-h-48">
        <table class="w-full text-xs">
          <thead class="bg-(--color-bg-alt) sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left font-medium text-(--color-text)">Key</th>
              <th class="px-3 py-2 text-left font-medium text-(--color-text)">Code</th>
              <th class="px-3 py-2 text-left font-medium text-(--color-text)">keyCode</th>
              <th class="px-3 py-2 text-left font-medium text-(--color-text)">Modifiers</th>
            </tr>
          </thead>
          <tbody>
            {#each history as event, i}
              <tr class="border-t border-(--color-border) {i === 0 ? 'bg-(--color-bg-alt)' : ''}">
                <td class="px-3 py-2 font-mono text-(--color-text)">{event.key === " " ? "Space" : event.key}</td>
                <td class="px-3 py-2 font-mono text-(--color-text-muted)">{event.code}</td>
                <td class="px-3 py-2 font-mono text-(--color-text-muted)">{event.keyCode}</td>
                <td class="px-3 py-2 text-(--color-text-muted)">
                  {[
                    event.ctrlKey && "Ctrl",
                    event.shiftKey && "Shift",
                    event.altKey && "Alt",
                    event.metaKey && "Meta",
                  ].filter(Boolean).join(" + ") || "-"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
