<script lang="ts">
  interface UnitDef {
    id: string;
    name: string;
    symbol: string;
    toBase: ((v: number) => number) | number;
    fromBase: ((v: number) => number) | number;
  }

  interface UnitCategory {
    id: string;
    name: string;
    icon: string;
    baseUnit: string;
    units: UnitDef[];
  }

  const categories: UnitCategory[] = [
    {
      id: "length",
      name: "Length",
      icon: "📏",
      baseUnit: "meter",
      units: [
        { id: "km", name: "Kilometer", symbol: "km", toBase: 1000, fromBase: 0.001 },
        { id: "m", name: "Meter", symbol: "m", toBase: 1, fromBase: 1 },
        { id: "cm", name: "Centimeter", symbol: "cm", toBase: 0.01, fromBase: 100 },
        { id: "mm", name: "Millimeter", symbol: "mm", toBase: 0.001, fromBase: 1000 },
        { id: "um", name: "Micrometer", symbol: "\u00B5m", toBase: 1e-6, fromBase: 1e6 },
        { id: "nm", name: "Nanometer", symbol: "nm", toBase: 1e-9, fromBase: 1e9 },
        { id: "mi", name: "Mile", symbol: "mi", toBase: 1609.344, fromBase: 1 / 1609.344 },
        { id: "yd", name: "Yard", symbol: "yd", toBase: 0.9144, fromBase: 1 / 0.9144 },
        { id: "ft", name: "Foot", symbol: "ft", toBase: 0.3048, fromBase: 1 / 0.3048 },
        { id: "in", name: "Inch", symbol: "in", toBase: 0.0254, fromBase: 1 / 0.0254 },
        { id: "nmi", name: "Nautical Mile", symbol: "nmi", toBase: 1852, fromBase: 1 / 1852 },
        { id: "ly", name: "Light Year", symbol: "ly", toBase: 9.461e15, fromBase: 1 / 9.461e15 },
        { id: "au", name: "Astronomical Unit", symbol: "AU", toBase: 1.496e11, fromBase: 1 / 1.496e11 },
      ],
    },
    {
      id: "weight",
      name: "Weight / Mass",
      icon: "⚖️",
      baseUnit: "kilogram",
      units: [
        { id: "t", name: "Metric Ton", symbol: "t", toBase: 1000, fromBase: 0.001 },
        { id: "kg", name: "Kilogram", symbol: "kg", toBase: 1, fromBase: 1 },
        { id: "g", name: "Gram", symbol: "g", toBase: 0.001, fromBase: 1000 },
        { id: "mg", name: "Milligram", symbol: "mg", toBase: 1e-6, fromBase: 1e6 },
        { id: "ug", name: "Microgram", symbol: "\u00B5g", toBase: 1e-9, fromBase: 1e9 },
        { id: "lb", name: "Pound", symbol: "lb", toBase: 0.453592, fromBase: 1 / 0.453592 },
        { id: "oz", name: "Ounce", symbol: "oz", toBase: 0.0283495, fromBase: 1 / 0.0283495 },
        { id: "st", name: "Stone", symbol: "st", toBase: 6.35029, fromBase: 1 / 6.35029 },
        { id: "ust", name: "US Ton (Short)", symbol: "US ton", toBase: 907.185, fromBase: 1 / 907.185 },
        { id: "ukt", name: "Imperial Ton (Long)", symbol: "long ton", toBase: 1016.05, fromBase: 1 / 1016.05 },
        { id: "ct", name: "Carat", symbol: "ct", toBase: 0.0002, fromBase: 5000 },
      ],
    },
    {
      id: "temperature",
      name: "Temperature",
      icon: "🌡️",
      baseUnit: "kelvin",
      units: [
        {
          id: "c",
          name: "Celsius",
          symbol: "\u00B0C",
          toBase: (v: number) => v + 273.15,
          fromBase: (v: number) => v - 273.15,
        },
        {
          id: "f",
          name: "Fahrenheit",
          symbol: "\u00B0F",
          toBase: (v: number) => (v - 32) * (5 / 9) + 273.15,
          fromBase: (v: number) => (v - 273.15) * (9 / 5) + 32,
        },
        { id: "k", name: "Kelvin", symbol: "K", toBase: 1, fromBase: 1 },
        {
          id: "r",
          name: "Rankine",
          symbol: "\u00B0R",
          toBase: (v: number) => v * (5 / 9),
          fromBase: (v: number) => v * (9 / 5),
        },
      ],
    },
    {
      id: "speed",
      name: "Speed",
      icon: "🏎️",
      baseUnit: "m/s",
      units: [
        { id: "ms", name: "Meters per Second", symbol: "m/s", toBase: 1, fromBase: 1 },
        { id: "kmh", name: "Kilometers per Hour", symbol: "km/h", toBase: 1 / 3.6, fromBase: 3.6 },
        { id: "mph", name: "Miles per Hour", symbol: "mph", toBase: 0.44704, fromBase: 1 / 0.44704 },
        { id: "kn", name: "Knot", symbol: "kn", toBase: 0.514444, fromBase: 1 / 0.514444 },
        { id: "fts", name: "Feet per Second", symbol: "ft/s", toBase: 0.3048, fromBase: 1 / 0.3048 },
        { id: "mach", name: "Mach", symbol: "Mach", toBase: 343, fromBase: 1 / 343 },
        { id: "c", name: "Speed of Light", symbol: "c", toBase: 299792458, fromBase: 1 / 299792458 },
      ],
    },
    {
      id: "area",
      name: "Area",
      icon: "📐",
      baseUnit: "m²",
      units: [
        { id: "km2", name: "Square Kilometer", symbol: "km\u00B2", toBase: 1e6, fromBase: 1e-6 },
        { id: "m2", name: "Square Meter", symbol: "m\u00B2", toBase: 1, fromBase: 1 },
        { id: "cm2", name: "Square Centimeter", symbol: "cm\u00B2", toBase: 1e-4, fromBase: 1e4 },
        { id: "mm2", name: "Square Millimeter", symbol: "mm\u00B2", toBase: 1e-6, fromBase: 1e6 },
        { id: "ha", name: "Hectare", symbol: "ha", toBase: 10000, fromBase: 1e-4 },
        { id: "ac", name: "Acre", symbol: "ac", toBase: 4046.86, fromBase: 1 / 4046.86 },
        { id: "mi2", name: "Square Mile", symbol: "mi\u00B2", toBase: 2.59e6, fromBase: 1 / 2.59e6 },
        { id: "yd2", name: "Square Yard", symbol: "yd\u00B2", toBase: 0.836127, fromBase: 1 / 0.836127 },
        { id: "ft2", name: "Square Foot", symbol: "ft\u00B2", toBase: 0.092903, fromBase: 1 / 0.092903 },
        { id: "in2", name: "Square Inch", symbol: "in\u00B2", toBase: 6.4516e-4, fromBase: 1 / 6.4516e-4 },
      ],
    },
    {
      id: "volume",
      name: "Volume",
      icon: "🧪",
      baseUnit: "liter",
      units: [
        { id: "m3", name: "Cubic Meter", symbol: "m\u00B3", toBase: 1000, fromBase: 0.001 },
        { id: "l", name: "Liter", symbol: "L", toBase: 1, fromBase: 1 },
        { id: "ml", name: "Milliliter", symbol: "mL", toBase: 0.001, fromBase: 1000 },
        { id: "gal", name: "US Gallon", symbol: "gal", toBase: 3.78541, fromBase: 1 / 3.78541 },
        { id: "qt", name: "US Quart", symbol: "qt", toBase: 0.946353, fromBase: 1 / 0.946353 },
        { id: "pt", name: "US Pint", symbol: "pt", toBase: 0.473176, fromBase: 1 / 0.473176 },
        { id: "cup", name: "US Cup", symbol: "cup", toBase: 0.236588, fromBase: 1 / 0.236588 },
        { id: "floz", name: "US Fluid Ounce", symbol: "fl oz", toBase: 0.0295735, fromBase: 1 / 0.0295735 },
        { id: "tbsp", name: "Tablespoon", symbol: "tbsp", toBase: 0.0147868, fromBase: 1 / 0.0147868 },
        { id: "tsp", name: "Teaspoon", symbol: "tsp", toBase: 0.00492892, fromBase: 1 / 0.00492892 },
        { id: "igal", name: "Imperial Gallon", symbol: "imp gal", toBase: 4.54609, fromBase: 1 / 4.54609 },
        { id: "ft3", name: "Cubic Foot", symbol: "ft\u00B3", toBase: 28.3168, fromBase: 1 / 28.3168 },
        { id: "in3", name: "Cubic Inch", symbol: "in\u00B3", toBase: 0.0163871, fromBase: 1 / 0.0163871 },
      ],
    },
    {
      id: "data",
      name: "Data Storage",
      icon: "💾",
      baseUnit: "byte",
      units: [
        { id: "bit", name: "Bit", symbol: "bit", toBase: 0.125, fromBase: 8 },
        { id: "b", name: "Byte", symbol: "B", toBase: 1, fromBase: 1 },
        { id: "kb", name: "Kilobyte", symbol: "KB", toBase: 1024, fromBase: 1 / 1024 },
        { id: "mb", name: "Megabyte", symbol: "MB", toBase: 1048576, fromBase: 1 / 1048576 },
        { id: "gb", name: "Gigabyte", symbol: "GB", toBase: 1073741824, fromBase: 1 / 1073741824 },
        { id: "tb", name: "Terabyte", symbol: "TB", toBase: 1099511627776, fromBase: 1 / 1099511627776 },
        { id: "pb", name: "Petabyte", symbol: "PB", toBase: 1125899906842624, fromBase: 1 / 1125899906842624 },
        { id: "kib", name: "Kibibyte", symbol: "KiB", toBase: 1024, fromBase: 1 / 1024 },
        { id: "mib", name: "Mebibyte", symbol: "MiB", toBase: 1048576, fromBase: 1 / 1048576 },
        { id: "gib", name: "Gibibyte", symbol: "GiB", toBase: 1073741824, fromBase: 1 / 1073741824 },
        { id: "kbit", name: "Kilobit", symbol: "kbit", toBase: 128, fromBase: 1 / 128 },
        { id: "mbit", name: "Megabit", symbol: "Mbit", toBase: 131072, fromBase: 1 / 131072 },
        { id: "gbit", name: "Gigabit", symbol: "Gbit", toBase: 134217728, fromBase: 1 / 134217728 },
      ],
    },
    {
      id: "time",
      name: "Time",
      icon: "⏱️",
      baseUnit: "second",
      units: [
        { id: "ns", name: "Nanosecond", symbol: "ns", toBase: 1e-9, fromBase: 1e9 },
        { id: "us", name: "Microsecond", symbol: "\u00B5s", toBase: 1e-6, fromBase: 1e6 },
        { id: "ms", name: "Millisecond", symbol: "ms", toBase: 0.001, fromBase: 1000 },
        { id: "s", name: "Second", symbol: "s", toBase: 1, fromBase: 1 },
        { id: "min", name: "Minute", symbol: "min", toBase: 60, fromBase: 1 / 60 },
        { id: "hr", name: "Hour", symbol: "h", toBase: 3600, fromBase: 1 / 3600 },
        { id: "day", name: "Day", symbol: "d", toBase: 86400, fromBase: 1 / 86400 },
        { id: "wk", name: "Week", symbol: "wk", toBase: 604800, fromBase: 1 / 604800 },
        { id: "mo", name: "Month (30 days)", symbol: "mo", toBase: 2592000, fromBase: 1 / 2592000 },
        { id: "yr", name: "Year (365.25 days)", symbol: "yr", toBase: 31557600, fromBase: 1 / 31557600 },
      ],
    },
    {
      id: "pressure",
      name: "Pressure",
      icon: "🌊",
      baseUnit: "pascal",
      units: [
        { id: "pa", name: "Pascal", symbol: "Pa", toBase: 1, fromBase: 1 },
        { id: "kpa", name: "Kilopascal", symbol: "kPa", toBase: 1000, fromBase: 0.001 },
        { id: "mpa", name: "Megapascal", symbol: "MPa", toBase: 1e6, fromBase: 1e-6 },
        { id: "bar", name: "Bar", symbol: "bar", toBase: 100000, fromBase: 1e-5 },
        { id: "mbar", name: "Millibar", symbol: "mbar", toBase: 100, fromBase: 0.01 },
        { id: "atm", name: "Atmosphere", symbol: "atm", toBase: 101325, fromBase: 1 / 101325 },
        { id: "psi", name: "PSI", symbol: "psi", toBase: 6894.76, fromBase: 1 / 6894.76 },
        { id: "torr", name: "Torr", symbol: "Torr", toBase: 133.322, fromBase: 1 / 133.322 },
        { id: "mmhg", name: "mmHg", symbol: "mmHg", toBase: 133.322, fromBase: 1 / 133.322 },
      ],
    },
    {
      id: "energy",
      name: "Energy",
      icon: "⚡",
      baseUnit: "joule",
      units: [
        { id: "j", name: "Joule", symbol: "J", toBase: 1, fromBase: 1 },
        { id: "kj", name: "Kilojoule", symbol: "kJ", toBase: 1000, fromBase: 0.001 },
        { id: "mj", name: "Megajoule", symbol: "MJ", toBase: 1e6, fromBase: 1e-6 },
        { id: "cal", name: "Calorie", symbol: "cal", toBase: 4.184, fromBase: 1 / 4.184 },
        { id: "kcal", name: "Kilocalorie", symbol: "kcal", toBase: 4184, fromBase: 1 / 4184 },
        { id: "wh", name: "Watt-hour", symbol: "Wh", toBase: 3600, fromBase: 1 / 3600 },
        { id: "kwh", name: "Kilowatt-hour", symbol: "kWh", toBase: 3.6e6, fromBase: 1 / 3.6e6 },
        { id: "ev", name: "Electron Volt", symbol: "eV", toBase: 1.602e-19, fromBase: 1 / 1.602e-19 },
        { id: "btu", name: "BTU", symbol: "BTU", toBase: 1055.06, fromBase: 1 / 1055.06 },
        { id: "ftlb", name: "Foot-Pound", symbol: "ft\u00B7lbf", toBase: 1.35582, fromBase: 1 / 1.35582 },
      ],
    },
    {
      id: "power",
      name: "Power",
      icon: "🔌",
      baseUnit: "watt",
      units: [
        { id: "w", name: "Watt", symbol: "W", toBase: 1, fromBase: 1 },
        { id: "kw", name: "Kilowatt", symbol: "kW", toBase: 1000, fromBase: 0.001 },
        { id: "mw", name: "Megawatt", symbol: "MW", toBase: 1e6, fromBase: 1e-6 },
        { id: "gw", name: "Gigawatt", symbol: "GW", toBase: 1e9, fromBase: 1e-9 },
        { id: "hp", name: "Horsepower (mechanical)", symbol: "hp", toBase: 745.7, fromBase: 1 / 745.7 },
        { id: "hpm", name: "Horsepower (metric)", symbol: "PS", toBase: 735.499, fromBase: 1 / 735.499 },
        { id: "btuh", name: "BTU/hour", symbol: "BTU/h", toBase: 0.293071, fromBase: 1 / 0.293071 },
        { id: "ftlbs", name: "Foot-Pound/second", symbol: "ft\u00B7lbf/s", toBase: 1.35582, fromBase: 1 / 1.35582 },
      ],
    },
    {
      id: "frequency",
      name: "Frequency",
      icon: "📻",
      baseUnit: "hertz",
      units: [
        { id: "hz", name: "Hertz", symbol: "Hz", toBase: 1, fromBase: 1 },
        { id: "khz", name: "Kilohertz", symbol: "kHz", toBase: 1000, fromBase: 0.001 },
        { id: "mhz", name: "Megahertz", symbol: "MHz", toBase: 1e6, fromBase: 1e-6 },
        { id: "ghz", name: "Gigahertz", symbol: "GHz", toBase: 1e9, fromBase: 1e-9 },
        { id: "rpm", name: "RPM", symbol: "rpm", toBase: 1 / 60, fromBase: 60 },
      ],
    },
    {
      id: "angle",
      name: "Angle",
      icon: "📐",
      baseUnit: "radian",
      units: [
        { id: "deg", name: "Degree", symbol: "\u00B0", toBase: Math.PI / 180, fromBase: 180 / Math.PI },
        { id: "rad", name: "Radian", symbol: "rad", toBase: 1, fromBase: 1 },
        { id: "grad", name: "Gradian", symbol: "grad", toBase: Math.PI / 200, fromBase: 200 / Math.PI },
        { id: "turn", name: "Turn", symbol: "turn", toBase: Math.PI * 2, fromBase: 1 / (Math.PI * 2) },
        { id: "arcmin", name: "Arc Minute", symbol: "'", toBase: Math.PI / 10800, fromBase: 10800 / Math.PI },
        { id: "arcsec", name: "Arc Second", symbol: "\"", toBase: Math.PI / 648000, fromBase: 648000 / Math.PI },
      ],
    },
  ];

  let selectedCategoryId = $state("length");
  let inputValue = $state("1");
  let fromUnitId = $state("m");
  let showAllUnits = $state(true);
  let copiedId = $state("");

  const selectedCategory = $derived(categories.find((c) => c.id === selectedCategoryId)!);
  const fromUnit = $derived(selectedCategory.units.find((u) => u.id === fromUnitId));

  function convert(value: number, from: UnitDef, to: UnitDef): number {
    const baseValue = typeof from.toBase === "function" ? from.toBase(value) : value * from.toBase;
    return typeof to.fromBase === "function" ? to.fromBase(baseValue) : baseValue * to.fromBase;
  }

  function formatNumber(n: number): string {
    if (n === 0) return "0";
    if (!isFinite(n)) return "Infinity";
    const abs = Math.abs(n);
    if (abs >= 1e15 || (abs < 1e-10 && abs > 0)) {
      return n.toExponential(10).replace(/\.?0+e/, "e");
    }
    // Up to 12 significant digits
    const formatted = parseFloat(n.toPrecision(12));
    return formatted.toLocaleString("en-US", { maximumFractionDigits: 12, useGrouping: false });
  }

  const allResults = $derived.by(() => {
    const num = parseFloat(inputValue);
    if (isNaN(num) || !fromUnit) return [];
    return selectedCategory.units
      .filter((u) => u.id !== fromUnitId)
      .map((u) => ({
        unit: u,
        value: formatNumber(convert(num, fromUnit, u)),
      }));
  });

  function selectCategory(catId: string) {
    selectedCategoryId = catId;
    const cat = categories.find((c) => c.id === catId)!;
    fromUnitId = cat.units[0]?.id ?? "";
  }

  async function copyResult(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { copiedId = ""; }, 1500);
    } catch {
      // Clipboard not available
    }
  }
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Convert between 200+ units across length, weight, temperature, speed, area, volume, data storage, time, pressure, energy, power, frequency, and angle.
    </p>
  </header>

  <!-- Category selector -->
  <div class="flex-none py-2 px-3 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap gap-1.5">
      {#each categories as cat}
        <button
          onclick={() => selectCategory(cat.id)}
          class="px-2.5 py-1 text-sm font-medium transition-colors border {selectedCategoryId === cat.id
            ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
            : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text) hover:border-(--color-text-muted)'}"
        >
          <span class="mr-1">{cat.icon}</span>{cat.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Input section -->
  <div class="flex-none flex items-end gap-3 flex-wrap">
    <div class="flex flex-col gap-1 flex-1 min-w-[200px]">
      <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Value</label>
      <input
        type="number"
        bind:value={inputValue}
        class="w-full px-4 py-3 text-lg font-mono bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
        placeholder="Enter value"
      />
    </div>
    <div class="flex flex-col gap-1 min-w-[180px]">
      <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">From</label>
      <select
        bind:value={fromUnitId}
        class="w-full px-3 py-3 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none cursor-pointer"
      >
        {#each selectedCategory.units as unit}
          <option value={unit.id}>{unit.name} ({unit.symbol})</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- All conversions list -->
  {#if allResults.length > 0}
    <div class="flex-1 overflow-auto min-h-0">
      <div class="border border-(--color-border) bg-(--color-bg-alt)">
        {#each allResults as row}
          <div class="flex items-center gap-2 px-3 py-2 border-b border-(--color-border) last:border-b-0">
            <span class="w-40 shrink-0 text-xs text-(--color-text-muted) truncate">{row.unit.name}</span>
            <span class="w-12 shrink-0 text-xs text-(--color-text-light)">{row.unit.symbol}</span>
            <span class="flex-1 font-mono text-sm text-(--color-text) break-all select-all">{row.value}</span>
            <button
              onclick={() => copyResult(row.value, row.unit.id)}
              class="shrink-0 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copiedId === row.unit.id ? "Copied!" : "Copy"}
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
