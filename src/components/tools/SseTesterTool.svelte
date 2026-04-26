<script lang="ts">
  interface SseEvent {
    id: number;
    type: string;
    data: string;
    eventId?: string;
    timestamp: number;
  }

  let url = $state("https://stream.wikimedia.org/v2/stream/recentchange");
  let withCredentials = $state(false);
  let connected = $state(false);
  let connecting = $state(false);
  let error = $state("");
  let readyState = $state<number>(2); // CLOSED
  let events = $state<SseEvent[]>([]);
  let filter = $state("");
  let autoScroll = $state(true);
  let evtSource: EventSource | null = null;
  let counter = 0;

  // Custom event types to listen to (besides default 'message')
  let customEventTypes = $state("");

  function connect() {
    disconnect();
    error = "";
    if (!url.trim()) {
      error = "URL is required";
      return;
    }
    try {
      connecting = true;
      const es = new EventSource(url, { withCredentials });
      evtSource = es;
      readyState = es.readyState;

      es.onopen = () => {
        connected = true;
        connecting = false;
        readyState = es.readyState;
      };

      es.onerror = () => {
        readyState = es.readyState;
        if (es.readyState === EventSource.CLOSED) {
          connected = false;
          connecting = false;
          error = "Connection closed by server or network error";
        } else if (es.readyState === EventSource.CONNECTING) {
          connecting = true;
        }
      };

      es.onmessage = (e: MessageEvent) => {
        events = [
          { id: ++counter, type: "message", data: e.data, eventId: e.lastEventId, timestamp: Date.now() },
          ...events,
        ].slice(0, 500);
      };

      // Custom event types
      const types = customEventTypes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of types) {
        es.addEventListener(t, (e: MessageEvent) => {
          events = [
            { id: ++counter, type: t, data: e.data, eventId: e.lastEventId, timestamp: Date.now() },
            ...events,
          ].slice(0, 500);
        });
      }
    } catch (e) {
      error = (e as Error).message;
      connecting = false;
    }
  }

  function disconnect() {
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }
    connected = false;
    connecting = false;
    readyState = 2;
  }

  function clearEvents() {
    events = [];
  }

  function copyEventData(e: SseEvent) {
    navigator.clipboard.writeText(e.data).catch(() => {});
  }

  let filteredEvents = $derived(
    filter
      ? events.filter(
          (e) =>
            e.data.toLowerCase().includes(filter.toLowerCase()) ||
            e.type.toLowerCase().includes(filter.toLowerCase())
        )
      : events
  );

  $effect(() => {
    return () => disconnect();
  });

  function rsLabel(s: number): string {
    return ["CONNECTING", "OPEN", "CLOSED"][s] ?? String(s);
  }

  function formatJson(s: string): string {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
</script>

<div class="flex-1 flex flex-col bg-(--color-bg) text-(--color-text)">
  <div class="p-4 border-b border-(--color-border) bg-(--color-bg-alt) space-y-3">
    <div class="flex flex-wrap gap-2 items-end">
      <div class="flex-1 min-w-[300px]">
        <label for="url" class="block text-xs text-(--color-text-light) mb-1">SSE Endpoint</label>
        <input
          id="url"
          type="url"
          bind:value={url}
          disabled={connected || connecting}
          placeholder="https://example.com/events"
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono disabled:opacity-50"
        />
      </div>
      <div>
        <label for="types" class="block text-xs text-(--color-text-light) mb-1">Custom event types (comma-separated)</label>
        <input
          id="types"
          type="text"
          bind:value={customEventTypes}
          disabled={connected || connecting}
          placeholder="ping, alert"
          class="w-56 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm disabled:opacity-50"
        />
      </div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" bind:checked={withCredentials} disabled={connected || connecting} class="accent-(--color-accent)" />
        with credentials
      </label>
      {#if !connected && !connecting}
        <button onclick={connect} class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Connect</button>
      {:else}
        <button onclick={disconnect} class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg)">Disconnect</button>
      {/if}
    </div>

    <div class="flex items-center gap-3 text-xs">
      <span>State:
        <span class="font-mono px-2 py-0.5 rounded {connected ? 'bg-green-500/20 text-green-500' : connecting ? 'bg-yellow-500/20 text-yellow-500' : 'bg-(--color-border) text-(--color-text-light)'}">
          {rsLabel(readyState)}
        </span>
      </span>
      <span class="text-(--color-text-light)">Events received: <span class="font-mono">{events.length}</span></span>
      {#if error}
        <span class="text-red-500">{error}</span>
      {/if}
    </div>
  </div>

  <div class="p-3 border-b border-(--color-border) bg-(--color-bg-alt) flex items-center gap-2">
    <input
      type="text"
      bind:value={filter}
      placeholder="Filter events…"
      class="flex-1 px-3 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm"
    />
    <label class="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" bind:checked={autoScroll} class="accent-(--color-accent)" />
      Newest on top
    </label>
    <button onclick={clearEvents} class="px-3 py-1.5 text-xs border border-(--color-border) hover:bg-(--color-bg)">Clear</button>
  </div>

  <div class="flex-1 overflow-auto p-2 space-y-1 font-mono text-xs">
    {#if filteredEvents.length === 0}
      <div class="text-center text-(--color-text-light) py-12">
        {events.length === 0 ? "No events yet. Connect to a stream to begin." : "No events match the filter."}
      </div>
    {/if}
    {#each filteredEvents as e (e.id)}
      <details class="border border-(--color-border) bg-(--color-bg-alt)">
        <summary class="px-2 py-1 cursor-pointer hover:bg-(--color-bg) flex items-center gap-2">
          <span class="text-(--color-text-light)">{new Date(e.timestamp).toLocaleTimeString()}</span>
          <span class="px-1.5 py-0.5 bg-(--color-accent) text-(--color-btn-text) rounded text-[10px]">{e.type}</span>
          {#if e.eventId}<span class="text-(--color-text-light)">id: {e.eventId}</span>{/if}
          <span class="truncate flex-1">{e.data.slice(0, 200)}</span>
          <button
            onclick={(ev) => { ev.preventDefault(); ev.stopPropagation(); copyEventData(e); }}
            class="text-(--color-text-light) hover:text-(--color-text)"
            title="Copy data"
          >📋</button>
        </summary>
        <pre class="p-2 border-t border-(--color-border) bg-(--color-bg) overflow-auto max-h-96 whitespace-pre-wrap break-all">{formatJson(e.data)}</pre>
      </details>
    {/each}
  </div>
</div>
