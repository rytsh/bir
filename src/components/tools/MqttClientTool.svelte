<script lang="ts">
  import mqtt, { type MqttClient } from "mqtt";

  interface MqttMessage {
    id: number;
    topic: string;
    payload: string;
    qos: number;
    retain: boolean;
    timestamp: number;
    incoming: boolean;
  }

  // Connection
  let url = $state("wss://test.mosquitto.org:8081/mqtt");
  let clientId = $state("bir-" + Math.random().toString(16).slice(2, 10));
  let username = $state("");
  let password = $state("");
  let cleanSession = $state(true);
  let keepalive = $state(60);

  let client: MqttClient | null = null;
  let connected = $state(false);
  let connecting = $state(false);
  let error = $state("");

  // Subscriptions
  let subTopic = $state("#");
  let subQos = $state<0 | 1 | 2>(0);
  let subscriptions = $state<{ topic: string; qos: number }[]>([]);

  // Publishing
  let pubTopic = $state("test/topic");
  let pubPayload = $state("hello");
  let pubQos = $state<0 | 1 | 2>(0);
  let pubRetain = $state(false);

  // Messages
  let messages = $state<MqttMessage[]>([]);
  let messageFilter = $state("");
  let counter = 0;

  function connect() {
    disconnect();
    error = "";
    connecting = true;

    try {
      const c = mqtt.connect(url, {
        clientId,
        username: username || undefined,
        password: password || undefined,
        clean: cleanSession,
        keepalive,
        reconnectPeriod: 0, // manual reconnect
      });

      client = c;

      c.on("connect", () => {
        connected = true;
        connecting = false;
        error = "";
      });

      c.on("error", (err) => {
        error = err.message;
        connecting = false;
      });

      c.on("close", () => {
        connected = false;
        connecting = false;
      });

      c.on("offline", () => {
        connected = false;
      });

      c.on("message", (topic, payload, packet) => {
        const text = new TextDecoder().decode(payload);
        messages = [
          {
            id: ++counter,
            topic,
            payload: text,
            qos: packet.qos ?? 0,
            retain: packet.retain ?? false,
            timestamp: Date.now(),
            incoming: true,
          },
          ...messages,
        ].slice(0, 500);
      });
    } catch (e) {
      error = (e as Error).message;
      connecting = false;
    }
  }

  function disconnect() {
    if (client) {
      try {
        client.end(true);
      } catch {}
      client = null;
    }
    connected = false;
    connecting = false;
    subscriptions = [];
  }

  function subscribe() {
    if (!client || !connected || !subTopic.trim()) return;
    client.subscribe(subTopic, { qos: subQos }, (err) => {
      if (err) {
        error = err.message;
      } else {
        if (!subscriptions.some((s) => s.topic === subTopic)) {
          subscriptions = [...subscriptions, { topic: subTopic, qos: subQos }];
        }
      }
    });
  }

  function unsubscribe(topic: string) {
    if (!client) return;
    client.unsubscribe(topic, () => {
      subscriptions = subscriptions.filter((s) => s.topic !== topic);
    });
  }

  function publish() {
    if (!client || !connected || !pubTopic.trim()) return;
    client.publish(
      pubTopic,
      pubPayload,
      { qos: pubQos, retain: pubRetain },
      (err) => {
        if (err) {
          error = err.message;
          return;
        }
        messages = [
          {
            id: ++counter,
            topic: pubTopic,
            payload: pubPayload,
            qos: pubQos,
            retain: pubRetain,
            timestamp: Date.now(),
            incoming: false,
          },
          ...messages,
        ].slice(0, 500);
      }
    );
  }

  function clearMessages() {
    messages = [];
  }

  let filtered = $derived(
    messageFilter
      ? messages.filter(
          (m) =>
            m.topic.toLowerCase().includes(messageFilter.toLowerCase()) ||
            m.payload.toLowerCase().includes(messageFilter.toLowerCase())
        )
      : messages
  );

  $effect(() => {
    return () => disconnect();
  });

  function formatPayload(s: string): string {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
</script>

<div class="flex-1 flex flex-col bg-(--color-bg) text-(--color-text) overflow-hidden">
  <div class="flex flex-col lg:flex-row flex-1 min-h-0">
    <!-- Left: Connection / sub / pub controls -->
    <div class="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-(--color-border) bg-(--color-bg-alt) overflow-auto">

      <section class="p-3 border-b border-(--color-border)">
        <h3 class="text-sm font-medium mb-2">Connection</h3>
        <div class="space-y-2">
          <div>
            <label for="mqtt-url" class="text-xs text-(--color-text-light)">Broker URL (ws/wss)</label>
            <input id="mqtt-url" type="text" bind:value={url} disabled={connected || connecting}
              class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm font-mono disabled:opacity-50" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="mqtt-cid" class="text-xs text-(--color-text-light)">Client ID</label>
              <input id="mqtt-cid" type="text" bind:value={clientId} disabled={connected || connecting}
                class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm font-mono disabled:opacity-50" />
            </div>
            <div>
              <label for="mqtt-ka" class="text-xs text-(--color-text-light)">Keepalive (s)</label>
              <input id="mqtt-ka" type="number" bind:value={keepalive} disabled={connected || connecting}
                class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm disabled:opacity-50" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="mqtt-user" class="text-xs text-(--color-text-light)">Username</label>
              <input id="mqtt-user" type="text" bind:value={username} disabled={connected || connecting}
                class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm disabled:opacity-50" />
            </div>
            <div>
              <label for="mqtt-pw" class="text-xs text-(--color-text-light)">Password</label>
              <input id="mqtt-pw" type="password" bind:value={password} disabled={connected || connecting}
                class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm disabled:opacity-50" />
            </div>
          </div>
          <label class="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" bind:checked={cleanSession} disabled={connected || connecting} class="accent-(--color-accent)" />
            Clean session
          </label>
          <div class="flex items-center gap-2 pt-1">
            {#if !connected && !connecting}
              <button onclick={connect} class="px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Connect</button>
            {:else}
              <button onclick={disconnect} class="px-3 py-1.5 text-sm border border-(--color-border) hover:bg-(--color-bg)">Disconnect</button>
            {/if}
            <span class="text-xs px-2 py-0.5 rounded {connected ? 'bg-green-500/20 text-green-500' : connecting ? 'bg-yellow-500/20 text-yellow-500' : 'bg-(--color-border) text-(--color-text-light)'}">
              {connected ? "CONNECTED" : connecting ? "CONNECTING" : "DISCONNECTED"}
            </span>
          </div>
          {#if error}<div class="text-xs text-red-500">{error}</div>{/if}
        </div>
      </section>

      <section class="p-3 border-b border-(--color-border)">
        <h3 class="text-sm font-medium mb-2">Subscribe</h3>
        <div class="flex gap-2 mb-2">
          <input type="text" bind:value={subTopic} placeholder="topic/+/#"
            class="flex-1 px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          <select bind:value={subQos} class="px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm">
            <option value={0}>QoS 0</option>
            <option value={1}>QoS 1</option>
            <option value={2}>QoS 2</option>
          </select>
          <button onclick={subscribe} disabled={!connected} class="px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40">+</button>
        </div>
        {#if subscriptions.length > 0}
          <div class="space-y-1">
            {#each subscriptions as s}
              <div class="flex items-center justify-between text-xs bg-(--color-bg) border border-(--color-border) px-2 py-1">
                <span class="font-mono truncate">{s.topic} <span class="text-(--color-text-light)">(QoS {s.qos})</span></span>
                <button onclick={() => unsubscribe(s.topic)} class="text-red-500 hover:text-red-400 ml-2">✕</button>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="p-3">
        <h3 class="text-sm font-medium mb-2">Publish</h3>
        <input type="text" bind:value={pubTopic} placeholder="topic/path"
          class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm font-mono mb-2" />
        <textarea bind:value={pubPayload} rows="3"
          class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm font-mono mb-2"></textarea>
        <div class="flex items-center gap-2 mb-2">
          <select bind:value={pubQos} class="px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm">
            <option value={0}>QoS 0</option>
            <option value={1}>QoS 1</option>
            <option value={2}>QoS 2</option>
          </select>
          <label class="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" bind:checked={pubRetain} class="accent-(--color-accent)" />
            Retain
          </label>
        </div>
        <button onclick={publish} disabled={!connected} class="w-full px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40">Publish</button>
      </section>
    </div>

    <!-- Right: Messages -->
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="p-3 border-b border-(--color-border) bg-(--color-bg-alt) flex items-center gap-2">
        <input type="text" bind:value={messageFilter} placeholder="Filter messages…"
          class="flex-1 px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm" />
        <span class="text-xs text-(--color-text-light)">{messages.length} message(s)</span>
        <button onclick={clearMessages} class="px-3 py-1.5 text-xs border border-(--color-border) hover:bg-(--color-bg)">Clear</button>
      </div>
      <div class="flex-1 overflow-auto p-2 space-y-1 font-mono text-xs">
        {#if filtered.length === 0}
          <div class="text-center text-(--color-text-light) py-12">No messages yet.</div>
        {/if}
        {#each filtered as m (m.id)}
          <details class="border border-(--color-border) bg-(--color-bg-alt)">
            <summary class="px-2 py-1 cursor-pointer hover:bg-(--color-bg) flex items-center gap-2">
              <span class="text-(--color-text-light) shrink-0">{new Date(m.timestamp).toLocaleTimeString()}</span>
              <span class="px-1.5 py-0.5 rounded text-[10px] shrink-0 {m.incoming ? 'bg-blue-500/20 text-blue-500' : 'bg-green-500/20 text-green-500'}">{m.incoming ? "RX" : "TX"}</span>
              <span class="text-[10px] text-(--color-text-light) shrink-0">QoS {m.qos}{m.retain ? " R" : ""}</span>
              <span class="font-mono truncate text-(--color-accent)">{m.topic}</span>
              <span class="truncate flex-1 text-(--color-text-light)">{m.payload.slice(0, 100)}</span>
            </summary>
            <pre class="p-2 border-t border-(--color-border) bg-(--color-bg) overflow-auto max-h-96 whitespace-pre-wrap break-all">{formatPayload(m.payload)}</pre>
          </details>
        {/each}
      </div>
    </div>
  </div>
</div>
