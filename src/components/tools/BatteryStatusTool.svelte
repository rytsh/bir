<script lang="ts">
  interface BatteryManager extends EventTarget {
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
    level: number;
  }

  let supported = $state<boolean | null>(null);
  let battery = $state<BatteryManager | null>(null);
  let history = $state<{ t: number; level: number; charging: boolean }[]>([]);

  $effect(() => {
    const nav = navigator as unknown as { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) {
      supported = false;
      return;
    }
    supported = true;
    let b: BatteryManager | null = null;
    let cleanups: (() => void)[] = [];
    nav.getBattery().then((bm) => {
      b = bm;
      battery = bm;
      const update = () => {
        battery = bm;
        history = [...history, { t: Date.now(), level: bm.level, charging: bm.charging }].slice(-300);
      };
      update();
      const events = ["chargingchange", "levelchange", "chargingtimechange", "dischargingtimechange"];
      for (const ev of events) {
        bm.addEventListener(ev, update);
        cleanups.push(() => bm.removeEventListener(ev, update));
      }
    }).catch(() => {
      supported = false;
    });
    return () => {
      cleanups.forEach((c) => {
        c();
      });
    };
  });

  function fmtTime(s: number): string {
    if (!Number.isFinite(s) || s === Infinity) return "—";
    if (s === 0) return "0s";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  let levelPct = $derived(battery ? Math.round(battery.level * 100) : 0);
  let levelColor = $derived(
    levelPct > 50 ? "#22c55e" : levelPct > 20 ? "#eab308" : "#ef4444"
  );
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-3xl mx-auto space-y-6">

    {#if supported === false}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6 text-center">
        <h2 class="text-lg font-medium mb-2">Battery Status API not available</h2>
        <p class="text-sm text-(--color-text-light)">
          Most browsers (Firefox, Safari, and recent Chromium versions for desktop)
          have removed or restricted this API for privacy reasons. Try on Android Chrome
          or older Chromium-based browsers.
        </p>
      </section>
    {:else if supported === null || !battery}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6 text-center">
        <div class="text-sm text-(--color-text-light)">Loading battery info…</div>
      </section>
    {:else}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6">
        <h2 class="font-medium mb-4">Current status</h2>

        <!-- Battery icon -->
        <div class="flex items-center gap-6 mb-6">
          <div class="relative" style="width: 140px; height: 70px;">
            <div class="absolute inset-0 border-2 border-(--color-text) rounded-md overflow-hidden">
              <div
                class="h-full transition-all duration-500"
                style="width: {levelPct}%; background: {levelColor};"
              ></div>
              <div class="absolute inset-0 flex items-center justify-center font-bold text-lg" style="color: {levelPct > 50 ? '#000' : 'inherit'};">
                {levelPct}%
              </div>
            </div>
            <div class="absolute top-1/2 -translate-y-1/2 -right-2 w-2 h-6 bg-(--color-text) rounded-r"></div>
          </div>

          <div class="text-sm space-y-1">
            <div class="flex items-center gap-2">
              {#if battery.charging}
                <span class="text-yellow-500">⚡</span>
                <span>Charging</span>
              {:else}
                <span>🔋</span>
                <span>Discharging</span>
              {/if}
            </div>
            {#if battery.charging && battery.chargingTime !== Infinity}
              <div class="text-(--color-text-light)">Time to full: {fmtTime(battery.chargingTime)}</div>
            {/if}
            {#if !battery.charging && battery.dischargingTime !== Infinity}
              <div class="text-(--color-text-light)">Time remaining: {fmtTime(battery.dischargingTime)}</div>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm font-mono">
          <div><span class="text-(--color-text-light)">Level:</span> {(battery.level * 100).toFixed(2)}%</div>
          <div><span class="text-(--color-text-light)">Charging:</span> {battery.charging}</div>
          <div><span class="text-(--color-text-light)">Charging time:</span> {fmtTime(battery.chargingTime)}</div>
          <div><span class="text-(--color-text-light)">Discharging time:</span> {fmtTime(battery.dischargingTime)}</div>
        </div>
      </section>

      {#if history.length > 1}
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          <div class="flex items-center justify-between mb-2">
            <h2 class="font-medium">Session history</h2>
            <button onclick={() => (history = history.slice(-1))} class="text-xs text-(--color-text-light) hover:text-(--color-text)">Clear</button>
          </div>
          <svg viewBox="0 0 600 120" class="w-full h-32 bg-(--color-bg) border border-(--color-border)">
            {#each history as h, i}
              {@const x = (i / Math.max(history.length - 1, 1)) * 600}
              {@const y = 120 - h.level * 120}
              {#if i > 0}
                {@const px = ((i - 1) / Math.max(history.length - 1, 1)) * 600}
                {@const py = 120 - history[i - 1].level * 120}
                <line x1={px} y1={py} x2={x} y2={y} stroke="var(--color-accent)" stroke-width="2" />
              {/if}
              <circle cx={x} cy={y} r="2" fill={h.charging ? "#eab308" : "var(--color-accent)"} />
            {/each}
          </svg>
          <div class="text-xs text-(--color-text-light) mt-2">
            {history.length} sample(s) since page load. Yellow dots = charging.
          </div>
        </section>
      {/if}
    {/if}

  </div>
</div>
