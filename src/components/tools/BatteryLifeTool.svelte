<script lang="ts">
  import { formatSI, parseSI } from "../../lib/electronics.js";

  interface Phase {
    id: number;
    name: string;
    currentInput: string;
    durationInput: string;
    durationUnit: "µs" | "ms" | "s" | "min";
  }

  interface BatteryPreset {
    label: string;
    capacity: string;
    voltage: string;
  }

  const BATTERY_PRESETS: BatteryPreset[] = [
    { label: "CR2032", capacity: "225m", voltage: "3" },
    { label: "AA alkaline", capacity: "2500m", voltage: "1.5" },
    { label: "AAA alkaline", capacity: "1000m", voltage: "1.5" },
    { label: "AA NiMH", capacity: "2000m", voltage: "1.2" },
    { label: "18650 Li-ion", capacity: "3000m", voltage: "3.7" },
    { label: "LiPo 1S 1000mAh", capacity: "1000m", voltage: "3.7" },
    { label: "9V alkaline", capacity: "550m", voltage: "9" },
    { label: "Phone (5000mAh)", capacity: "5000m", voltage: "3.85" },
  ];

  const DURATION_FACTORS: Record<Phase["durationUnit"], number> = { "µs": 1e-6, ms: 1e-3, s: 1, min: 60 };

  let nextId = 1;
  const phase = (name: string, currentInput: string, durationInput: string, durationUnit: Phase["durationUnit"]): Phase => ({
    id: nextId++,
    name,
    currentInput,
    durationInput,
    durationUnit,
  });

  let capacityInput = $state("2500m");
  let voltageInput = $state("3");
  let derating = $state(80);
  let selfDischarge = $state(2);
  let useProfile = $state(true);
  let simpleCurrentInput = $state("10m");
  let phases = $state<Phase[]>([
    phase("Deep sleep", "5u", "59.5", "s"),
    phase("Sensor read", "8m", "400", "ms"),
    phase("Radio TX", "120m", "100", "ms"),
  ]);

  let capacity = $derived(parseSI(capacityInput));

  let profile = $derived.by(() => {
    const parsed = phases.map((item) => ({
      ...item,
      current: parseSI(item.currentInput),
      duration: (parseSI(item.durationInput) ?? NaN) * DURATION_FACTORS[item.durationUnit],
    }));
    if (parsed.some((item) => item.current === null || !(item.duration > 0) || item.current < 0)) return null;
    const total = parsed.reduce((sum, item) => sum + item.duration, 0);
    const charge = parsed.reduce((sum, item) => sum + item.current! * item.duration, 0);
    return {
      phases: parsed.map((item) => ({ ...item, share: (item.current! * item.duration) / charge, dutyPct: (item.duration / total) * 100 })),
      period: total,
      average: charge / total,
    };
  });

  let averageCurrent = $derived(useProfile ? profile?.average ?? null : parseSI(simpleCurrentInput));

  let life = $derived.by(() => {
    if (!capacity || !averageCurrent || capacity <= 0 || averageCurrent <= 0) return null;
    const usable = capacity * (derating / 100);
    const selfDischargePerHour = (capacity * (selfDischarge / 100)) / (30 * 24);
    const hours = usable / (averageCurrent + selfDischargePerHour);
    const hoursNoSelf = usable / averageCurrent;
    return { hours, hoursNoSelf, usable };
  });

  const formatDuration = (hours: number): string => {
    if (hours < 1) return `${(hours * 60).toFixed(1)} minutes`;
    if (hours < 48) return `${hours.toFixed(1)} hours`;
    const days = hours / 24;
    if (days < 60) return `${days.toFixed(1)} days`;
    const months = days / 30.44;
    if (months < 24) return `${months.toFixed(1)} months`;
    return `${(days / 365.25).toFixed(2)} years`;
  };

  const applyPreset = (preset: BatteryPreset): void => {
    capacityInput = preset.capacity;
    voltageInput = preset.voltage;
  };

  const inputClass =
    "w-full px-3 py-2 font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const smallInputClass =
    "px-2 py-1 font-mono text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
</script>

<div class="h-full flex flex-col max-w-5xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Estimate battery life from capacity and current draw. Model duty-cycled devices (sleep / wake / transmit) to get the true average current, with capacity derating and self-discharge.
    </p>
  </header>

  <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Battery</h2>
  <div class="flex flex-wrap gap-1.5 mb-3">
    {#each BATTERY_PRESETS as preset (preset.label)}
      <button
        onclick={() => applyPreset(preset)}
        class="px-2 py-0.5 text-xs border transition-colors {capacityInput === preset.capacity && voltageInput === preset.voltage
          ? 'border-(--color-text) text-(--color-text)'
          : 'border-(--color-border) text-(--color-text-muted) hover:border-(--color-text-light)'}"
      >
        {preset.label}
      </button>
    {/each}
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <label class="block">
      <span class={labelClass}>Capacity (Ah)</span>
      <input type="text" bind:value={capacityInput} class={inputClass} />
      {#if capacity}<span class="text-xs text-(--color-text-light)">= {formatSI(capacity, "Ah")}</span>{/if}
    </label>
    <label class="block">
      <span class={labelClass}>Nominal voltage (V)</span>
      <input type="text" bind:value={voltageInput} class={inputClass} />
    </label>
    <label class="block">
      <span class={labelClass}>Usable capacity ({derating}%)</span>
      <input type="range" min="50" max="100" bind:value={derating} class="w-full mt-2 accent-(--color-text)" />
    </label>
    <label class="block">
      <span class={labelClass}>Self-discharge (%/month)</span>
      <input type="number" min="0" max="30" step="0.5" bind:value={selfDischarge} class={inputClass} />
    </label>
  </div>

  <div class="flex items-center gap-3 mb-2">
    <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Load</h2>
    <div class="p-0.5 bg-(--color-border) inline-flex gap-0.5">
      {#each [{ id: false, label: "Constant" }, { id: true, label: "Duty-cycle profile" }] as item (item.label)}
        <button
          class="px-2 py-0.5 text-xs font-medium transition-colors {useProfile === item.id
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (useProfile = item.id)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  </div>

  {#if useProfile}
    <div class="border border-(--color-border) bg-(--color-bg-alt) mb-2 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-(--color-border) text-xs uppercase tracking-wider text-(--color-text-light)">
            <th class="px-3 py-2 text-left font-medium">State</th>
            <th class="px-3 py-2 text-left font-medium">Current (A)</th>
            <th class="px-3 py-2 text-left font-medium">Duration per cycle</th>
            <th class="px-3 py-2 text-left font-medium">Time</th>
            <th class="px-3 py-2 text-left font-medium">Energy share</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each phases as item, index (item.id)}
            {@const stats = profile?.phases[index]}
            <tr class="border-b border-(--color-border) last:border-b-0">
              <td class="px-3 py-1.5"><input type="text" bind:value={item.name} aria-label="State name" class="{smallInputClass} font-sans w-32" /></td>
              <td class="px-3 py-1.5"><input type="text" bind:value={item.currentInput} aria-label="Current" class="{smallInputClass} w-24" /></td>
              <td class="px-3 py-1.5">
                <div class="flex">
                  <input type="text" bind:value={item.durationInput} aria-label="Duration" class="{smallInputClass} w-20 border-r-0" />
                  <select bind:value={item.durationUnit} aria-label="Duration unit" class="{smallInputClass} font-sans">
                    <option value="µs">µs</option>
                    <option value="ms">ms</option>
                    <option value="s">s</option>
                    <option value="min">min</option>
                  </select>
                </div>
              </td>
              <td class="px-3 py-1.5 font-mono text-xs text-(--color-text-muted)">{stats ? `${stats.dutyPct.toFixed(stats.dutyPct < 1 ? 3 : 1)} %` : "—"}</td>
              <td class="px-3 py-1.5">
                {#if stats}
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-2 bg-(--color-border)"><div class="h-2 bg-(--color-text)" style="width: {stats.share * 100}%"></div></div>
                    <span class="font-mono text-xs text-(--color-text-muted)">{(stats.share * 100).toFixed(1)} %</span>
                  </div>
                {/if}
              </td>
              <td class="px-3 py-1.5 text-right">
                <button onclick={() => phases.splice(index, 1)} disabled={phases.length === 1} aria-label="Remove state" class="text-(--color-text-light) hover:text-(--color-error-text) disabled:opacity-30">×</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <button onclick={() => phases.push(phase("New state", "1m", "1", "s"))} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">+ Add state</button>
      {#if profile}
        <span class="text-xs text-(--color-text-muted)">Cycle period: <span class="font-mono text-(--color-text)">{formatSI(profile.period, "s")}</span></span>
        <span class="text-xs text-(--color-text-muted)">Average current: <span class="font-mono text-(--color-text)">{formatSI(profile.average, "A")}</span></span>
      {:else}
        <span class="text-xs text-(--color-error-text)">Check the current and duration values.</span>
      {/if}
    </div>
  {:else}
    <label class="block max-w-xs mb-6">
      <span class={labelClass}>Average current (A)</span>
      <input type="text" bind:value={simpleCurrentInput} class={inputClass} />
    </label>
  {/if}

  {#if life && averageCurrent}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <div class="border border-(--color-text) bg-(--color-bg-alt) p-4 sm:col-span-1">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Estimated battery life</div>
        <div class="text-3xl font-mono text-(--color-text)">{formatDuration(life.hours)}</div>
        <div class="text-xs text-(--color-text-muted)">{life.hours.toFixed(0)} hours</div>
      </div>
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Without self-discharge</div>
        <div class="text-2xl font-mono text-(--color-text)">{formatDuration(life.hoursNoSelf)}</div>
      </div>
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Average power</div>
        <div class="text-2xl font-mono text-(--color-text)">{formatSI(averageCurrent * (parseSI(voltageInput) ?? 0), "W")}</div>
        <div class="text-xs text-(--color-text-muted)">Energy: {formatSI(life.usable * (parseSI(voltageInput) ?? 0), "Wh")} usable</div>
      </div>
    </div>
    {#if life.hours > 24 * 365 * 10}
      <p class="text-xs text-(--color-error-text)">⚠ Beyond ~10 years, battery shelf life and chemistry aging usually dominate — real life will be shorter.</p>
    {/if}
  {/if}

  <p class="mt-2 text-xs text-(--color-text-light)">
    Life ≈ (capacity × usable %) / (average current + self-discharge). Real batteries deliver less capacity at high currents, low temperatures, and near cutoff voltage — the derating slider accounts for this. Typical self-discharge: Li primary &lt;1 %, alkaline ~2 %, Li-ion ~2–3 %, NiMH 15–30 %/month.
  </p>
</div>
