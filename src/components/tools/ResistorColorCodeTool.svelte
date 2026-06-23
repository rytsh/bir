<script lang="ts">
  interface ColorDef {
    id: string;
    name: string;
    hex: string;
    digit: number | null;
    multiplier: number | null;
    tolerance: number | null;
  }

  const COLORS: ColorDef[] = [
    { id: "black",  name: "Black",  hex: "#1c1c1c", digit: 0, multiplier: 1,         tolerance: null },
    { id: "brown",  name: "Brown",  hex: "#7a4a1f", digit: 1, multiplier: 10,        tolerance: 0.01 },
    { id: "red",    name: "Red",    hex: "#e10600", digit: 2, multiplier: 100,       tolerance: 0.02 },
    { id: "orange", name: "Orange", hex: "#ff8c00", digit: 3, multiplier: 1000,      tolerance: null },
    { id: "yellow", name: "Yellow", hex: "#f5c518", digit: 4, multiplier: 10000,     tolerance: null },
    { id: "green",  name: "Green",  hex: "#1f9e2d", digit: 5, multiplier: 100000,    tolerance: 0.005 },
    { id: "blue",   name: "Blue",   hex: "#0047ab", digit: 6, multiplier: 1000000,   tolerance: 0.0025 },
    { id: "violet", name: "Violet", hex: "#7b2db8", digit: 7, multiplier: 10000000,  tolerance: 0.001 },
    { id: "gray",   name: "Gray",   hex: "#8a8a8a", digit: 8, multiplier: 100000000, tolerance: 0.0005 },
    { id: "white",  name: "White",  hex: "#f0f0f0", digit: 9, multiplier: 1000000000,tolerance: null },
    { id: "gold",   name: "Gold",   hex: "#d4af37", digit: null, multiplier: 0.1,    tolerance: 0.05 },
    { id: "silver", name: "Silver", hex: "#b8b8b8", digit: null, multiplier: 0.01,   tolerance: 0.10 },
    { id: "none",   name: "None",   hex: "transparent", digit: null, multiplier: null, tolerance: 0.20 },
  ];

  const colorById = (id: string): ColorDef | undefined =>
    COLORS.find((c) => c.id === id);

  let bandCount = $state<4 | 5>(4);
  let bands = $state<string[]>(["yellow", "violet", "red", "gold"]);
  let inputText = $state("4.7k");
  let copied = $state(false);
  let inputTouched = $state(false);

  const fmt = (n: number): string => {
    const r = parseFloat(n.toFixed(4));
    return r.toString();
  };

  const formatOhms = (v: number): string => {
    if (v >= 1e6) return fmt(v / 1e6) + " MΩ";
    if (v >= 1e3) return fmt(v / 1e3) + " kΩ";
    return fmt(v) + " Ω";
  };

  const formatForInput = (v: number): string => {
    if (v >= 1e6) {
      const m = v / 1e6;
      return (Number.isInteger(m) ? m.toString() : m.toString()) + "M";
    }
    if (v >= 1e3) {
      const k = v / 1e3;
      return (Number.isInteger(k) ? k.toString() : k.toString()) + "k";
    }
    return v.toString();
  };

  const formatTolerancePct = (t: number): string => "±" + fmt(t * 100) + "%";

  const parseResistance = (input: string): number | null => {
    let s = input.trim().toLowerCase().replace(/\s/g, "").replace(/(ω|ohm|ohms|r)$/g, "");
    if (!s) return null;

    const eu = s.match(/^(\d*)([rkmg])(\d+)$/);
    if (eu) {
      const whole = eu[1] || "0";
      const suffix = eu[2];
      const frac = eu[3];
      const mult = suffix === "r" ? 1 : suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1e9;
      return parseFloat(`${whole}.${frac}`) * mult;
    }

    let mult = 1;
    const last = s.slice(-1);
    if (last === "k") { mult = 1e3; s = s.slice(0, -1); }
    else if (last === "m") { mult = 1e6; s = s.slice(0, -1); }
    else if (last === "g") { mult = 1e9; s = s.slice(0, -1); }

    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return n * mult;
  };

  const encodeToBands = (ohms: number, currentToleranceBand: string): string[] | null => {
    const digits = bandCount === 4 ? 2 : 3;
    if (ohms <= 0) return null;

    const p = Math.floor(Math.log10(ohms));
    const divisor = Math.pow(10, p - (digits - 1));
    let S = Math.round(ohms / divisor);
    let M = p - (digits - 1);

    const cap = Math.pow(10, digits);
    if (S >= cap) { S = S / 10; M = M + 1; }

    if (M < -2 || M > 9) return null;

    const multColor = COLORS.find((c) => c.multiplier === Math.pow(10, M));
    if (!multColor) return null;

    const digitIds = String(S).padStart(digits, "0").split("").map((d) => {
      const c = COLORS.find((c) => c.digit === parseInt(d));
      return c ? c.id : "black";
    });

    return [...digitIds, multColor.id, currentToleranceBand];
  };

  const decodeResult = $derived.by(() => {
    const bc = bands.map(colorById);
    if (bc.some((b) => !b)) return { error: "Invalid band color" };

    const digitBands = bandCount === 4 ? bc.slice(0, 2) : bc.slice(0, 3);
    const multBand = bc[bandCount === 4 ? 2 : 3];
    const tolBand = bc[bandCount === 4 ? 3 : 4];

    if (digitBands.some((b) => b!.digit === null)) {
      return { error: "Digit bands cannot be gold/silver" };
    }
    if (multBand!.multiplier === null) {
      return { error: "Multiplier band invalid" };
    }
    if (tolBand!.tolerance === null) {
      return { error: "Tolerance band invalid" };
    }

    let digits = 0;
    for (const b of digitBands) digits = digits * 10 + b!.digit!;
    const value = digits * multBand!.multiplier;
    const tol = tolBand!.tolerance;

    return {
      value,
      tol,
      min: value * (1 - tol),
      max: value * (1 + tol),
      error: "",
    };
  });

  const setBand = (index: number, colorId: string) => {
    bands[index] = colorId;
    bands = [...bands];
    if (!decodeResult.error) {
      inputText = formatForInput(decodeResult.value);
    }
  };

  const onValueInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    inputText = target.value;
    inputTouched = true;
    const ohms = parseResistance(inputText);
    if (ohms !== null && ohms > 0) {
      const tolBandId = bands[bandCount === 4 ? 3 : 4] ?? "gold";
      const encoded = encodeToBands(ohms, tolBandId);
      if (encoded) {
        bands = encoded;
      }
    }
  };

  const toggleBandCount = (next: 4 | 5) => {
    if (next === bandCount) return;
    if (next === 5) {
      bands = [bands[0], bands[1], "black", bands[2], bands[3]];
    } else {
      bands = [bands[0], bands[1], bands[3], bands[4]];
    }
    bandCount = next;
    if (!decodeResult.error) {
      inputText = formatForInput(decodeResult.value);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1800);
  };

  const bandLabels = $derived(
    bandCount === 4
      ? ["1st Digit", "2nd Digit", "Multiplier", "Tolerance"]
      : ["1st Digit", "2nd Digit", "3rd Digit", "Multiplier", "Tolerance"]
  );

  const bandRoles = $derived(
    bandCount === 4
      ? (["digit", "digit", "multiplier", "tolerance"] as const)
      : (["digit", "digit", "digit", "multiplier", "tolerance"] as const)
  );

  const swatchesForRole = (role: "digit" | "multiplier" | "tolerance"): ColorDef[] => {
    if (role === "digit") return COLORS.filter((c) => c.digit !== null);
    if (role === "multiplier") return COLORS.filter((c) => c.multiplier !== null && c.id !== "none");
    return COLORS.filter((c) => c.tolerance !== null);
  };

  interface BandPos { x: number; }
  const bandPositions = $derived.by<BandPos[]>(() => {
    const bodyStart = 140;
    const tolX = 280;
    if (bandCount === 4) {
      const w = 22, gap = 8;
      return [
        { x: bodyStart },
        { x: bodyStart + w + gap },
        { x: bodyStart + 2 * (w + gap) },
        { x: tolX },
      ];
    } else {
      const w = 18, gap = 5;
      return [
        { x: bodyStart },
        { x: bodyStart + w + gap },
        { x: bodyStart + 2 * (w + gap) },
        { x: bodyStart + 3 * (w + gap) },
        { x: tolX },
      ];
    }
  });

  const bandWidth = $derived(bandCount === 4 ? 22 : 18);
  const bodyTop = 42;
  const bodyBottom = 102;
  const leadY = 72;
  const bodyStartX = 140;
  const bodyEndX = 310;

  const bandFill = (colorId: string): string => {
    const c = colorById(colorId);
    return c ? c.hex : "transparent";
  };

  const isLight = (hex: string): boolean => {
    if (hex === "transparent") return true;
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Pick color bands to read the resistance, or type a value to see the bands. Both sides stay in sync. Supports 4-band and 5-band resistors with tolerance.
    </p>
  </header>

  <!-- Band count toggle -->
  <div class="mb-4 py-2 px-3 bg-(--color-bg-alt) border border-(--color-border) flex flex-wrap items-center gap-4">
    <div class="flex items-center gap-2">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Bands</span>
      <div class="flex border border-(--color-border)">
        <button
          onclick={() => toggleBandCount(4)}
          class="px-3 py-1 text-sm transition-colors {bandCount === 4 ? 'bg-(--color-text) text-(--color-btn-text)' : 'bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text)'}"
        >4-Band</button>
        <button
          onclick={() => toggleBandCount(5)}
          class="px-3 py-1 text-sm transition-colors {bandCount === 5 ? 'bg-(--color-text) text-(--color-btn-text)' : 'bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text)'}"
        >5-Band</button>
      </div>
    </div>
  </div>

  <!-- Resistor Visual -->
  <div class="mb-4 p-4 sm:p-6 bg-(--color-bg-alt) border border-(--color-border) flex flex-col items-center">
    <svg viewBox="0 0 440 144" class="w-full max-w-xl" role="img" aria-label="Resistor with color bands">
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e8d9b5" />
          <stop offset="45%" stop-color="#d3bd8e" />
          <stop offset="100%" stop-color="#b69b66" />
        </linearGradient>
        <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d9d9d9" />
          <stop offset="50%" stop-color="#9a9a9a" />
          <stop offset="100%" stop-color="#6e6e6e" />
        </linearGradient>
        <linearGradient id="bandShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.28)" />
          <stop offset="50%" stop-color="rgba(255,255,255,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.32)" />
        </linearGradient>
        <radialGradient id="bodyGloss" cx="0.5" cy="0.18" r="0.6">
          <stop offset="0%" stop-color="rgba(255,255,255,0.45)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <rect x="0" y="{leadY - 3}" width="{bodyStartX}" height="6" rx="3" fill="url(#leadGrad)" />
      <rect x="{bodyEndX}" y="{leadY - 3}" width="{440 - bodyEndX}" height="6" rx="3" fill="url(#leadGrad)" />

      <rect x="{bodyStartX - 2}" y="{bodyTop - 4}" width="4" height="{bodyBottom - bodyTop + 8}" fill="#000" opacity="0.06" />
      <rect x="{bodyEndX - 2}" y="{bodyTop - 4}" width="4" height="{bodyBottom - bodyTop + 8}" fill="#000" opacity="0.06" />

      <rect x="{bodyStartX}" y="{bodyTop}" width="{bodyEndX - bodyStartX}" height="{bodyBottom - bodyTop}" rx="14" ry="14" fill="url(#bodyGrad)" stroke="#8a7349" stroke-width="1" />
      <rect x="{bodyStartX}" y="{bodyTop}" width="{bodyEndX - bodyStartX}" height="{bodyBottom - bodyTop}" rx="14" ry="14" fill="url(#bodyGloss)" />

      <ellipse cx="{bodyStartX + 6}" cy="{(bodyTop + bodyBottom) / 2}" rx="6" ry="{(bodyBottom - bodyTop) / 2}" fill="#9c8554" opacity="0.5" />
      <ellipse cx="{bodyEndX - 6}" cy="{(bodyTop + bodyBottom) / 2}" rx="6" ry="{(bodyBottom - bodyTop) / 2}" fill="#9c8554" opacity="0.5" />

      {#each bandPositions as pos, i}
        {#if bands[i] && bands[i] !== "none"}
          <rect
            x="{pos.x}"
            y="{bodyTop}"
            width="{bandWidth}"
            height="{bodyBottom - bodyTop}"
            fill="{bandFill(bands[i])}"
            stroke={isLight(bandFill(bands[i])) ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.4)"}
            stroke-width="0.75"
          />
          <rect
            x="{pos.x}"
            y="{bodyTop}"
            width="{bandWidth}"
            height="{bodyBottom - bodyTop}"
            fill="url(#bandShade)"
          />
        {/if}
      {/each}
    </svg>
  </div>

  <!-- Bidirectional value + bands area -->
  <div class="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- Value input (editable, syncs with bands) -->
    <div class="p-4 bg-(--color-bg-alt) border border-(--color-border) flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          Resistance Value
        </span>
        {#if !decodeResult.error}
          <button
            onclick={() => handleCopy(formatOhms(decodeResult.value))}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        {/if}
      </div>

      <input
        type="text"
        value={inputText}
        oninput={onValueInput}
        placeholder="e.g. 4.7k, 220, 1M, 4k7, 0.47"
        class="w-full px-4 py-3 text-2xl font-mono bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
      />

      {#if decodeResult.error}
        <div class="mt-3 px-3 py-2 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
          {decodeResult.error}
        </div>
      {:else}
        <div class="mt-3 flex flex-col gap-1">
          <div class="flex items-baseline gap-3 flex-wrap">
            <span class="font-mono text-xl text-(--color-text)">
              {formatOhms(decodeResult.value)}
            </span>
            <span class="font-mono text-sm text-(--color-text-muted)">
              {formatTolerancePct(decodeResult.tol)}
            </span>
          </div>
          <div class="text-xs font-mono text-(--color-text-muted)">
            Range: {formatOhms(decodeResult.min)} – {formatOhms(decodeResult.max)}
          </div>
        </div>
      {/if}

      <p class="mt-3 text-xs text-(--color-text-light)">
        Edit the value to update the bands, or pick bands below to update the value. Suffixes: k, M, G, R. European style like <span class="font-mono">4k7</span> works.
      </p>
    </div>

    <!-- Band selectors -->
    <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-3">
        Color Bands
      </span>
      <div class="flex flex-col gap-3">
        {#each bandLabels as label, i}
          <div class="flex items-center gap-3">
            <span class="text-xs text-(--color-text-muted) w-20 shrink-0">{label}</span>
            <span class="text-xs text-(--color-text) capitalize w-16 shrink-0">
              {colorById(bands[i])?.name ?? "—"}
            </span>
            <div class="flex flex-wrap gap-1.5 flex-1">
              {#each swatchesForRole(bandRoles[i]) as c}
                <button
                  onclick={() => setBand(i, c.id)}
                  title={c.name}
                  class="w-6 h-6 border transition-transform hover:scale-110 {bands[i] === c.id ? 'ring-2 ring-offset-1 ring-offset-(--color-bg-alt) ring-(--color-text) border-transparent' : 'border-(--color-border)'}"
                  style="background-color: {c.hex}; {c.hex === 'transparent' ? 'background-image: linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%); background-size: 8px 8px;' : ''}"
                  aria-label={c.name}
                ></button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Color Code Reference -->
  <div class="mt-2">
    <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-3">
      Color Code Reference
    </span>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-(--color-border)">
        <thead class="bg-(--color-bg-alt)">
          <tr class="text-left text-xs uppercase tracking-wider text-(--color-text-light)">
            <th class="py-2 px-3 border-b border-(--color-border)">Color</th>
            <th class="py-2 px-3 border-b border-(--color-border)">Digit</th>
            <th class="py-2 px-3 border-b border-(--color-border)">Multiplier</th>
            <th class="py-2 px-3 border-b border-(--color-border)">Tolerance</th>
          </tr>
        </thead>
        <tbody>
          {#each COLORS.filter(c => c.id !== "none") as c}
            <tr class="border-b border-(--color-border) last:border-0">
              <td class="py-2 px-3 flex items-center gap-2">
                <span
                  class="inline-block w-4 h-4 border border-(--color-border)"
                  style="background-color: {c.hex}"
                ></span>
                <span class="text-(--color-text)">{c.name}</span>
              </td>
              <td class="py-2 px-3 font-mono text-(--color-text-muted)">{c.digit ?? "—"}</td>
              <td class="py-2 px-3 font-mono text-(--color-text-muted)">
                {#if c.multiplier === null}—{:else if c.multiplier >= 1}{c.multiplier.toLocaleString()}{:else}{c.multiplier}{/if}
              </td>
              <td class="py-2 px-3 font-mono text-(--color-text-muted)">
                {c.tolerance === null ? "—" : formatTolerancePct(c.tolerance)}
              </td>
            </tr>
          {/each}
          <tr class="border-b border-(--color-border) last:border-0">
            <td class="py-2 px-3 flex items-center gap-2">
              <span
                class="inline-block w-4 h-4 border border-(--color-border)"
                style="background-image: linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%); background-size: 6px 6px;"
              ></span>
              <span class="text-(--color-text)">None</span>
            </td>
            <td class="py-2 px-3 font-mono text-(--color-text-muted)">—</td>
            <td class="py-2 px-3 font-mono text-(--color-text-muted)">—</td>
            <td class="py-2 px-3 font-mono text-(--color-text-muted)">±20%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
