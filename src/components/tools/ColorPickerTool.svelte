<script lang="ts">
  type Tab = "picker" | "palette";

  interface RGB {
    r: number;
    g: number;
    b: number;
  }

  interface HSL {
    h: number;
    s: number;
    l: number;
  }

  interface HSV {
    h: number;
    s: number;
    v: number;
  }

  interface CMYK {
    c: number;
    m: number;
    y: number;
    k: number;
  }

  interface XYZ {
    x: number;
    y: number;
    z: number;
  }

  interface LAB {
    l: number;
    a: number;
    b: number;
  }

  interface LCH {
    l: number;
    c: number;
    h: number;
  }

  interface LUV {
    l: number;
    u: number;
    v: number;
  }

  interface HWB {
    h: number;
    w: number;
    b: number;
  }

  // Trending color palettes - curated collection
  interface ColorPalette {
    name: string;
    colors: string[];
  }

  const trendingPalettes: ColorPalette[] = [
    {
      name: "Coastal Vibes",
      colors: ["#3D5A80", "#98C1D9", "#E0FBFC", "#EE6C4D", "#293241"],
    },
    {
      name: "Cool Coastal Vibes",
      colors: ["#2B2D42", "#8D99AE", "#EDF2F4", "#EF233C", "#D90429"],
    },
    {
      name: "Rustic Charm",
      colors: ["#FFFCF2", "#CCC5B9", "#403D39", "#252422", "#EB5E28"],
    },
    {
      name: "Summer Ocean Breeze",
      colors: ["#E63946", "#F1FAEE", "#A8DADC", "#457B9D", "#1D3557"],
    },
    {
      name: "Tropical Sunrise",
      colors: ["#FF9F1C", "#FFBF69", "#FFFFFF", "#CBF3F0", "#2EC4B6"],
    },
    {
      name: "Candy Pop",
      colors: ["#9B5DE5", "#F15BB5", "#FEE440", "#00BBF9", "#00F5D4"],
    },
    {
      name: "Neutral Harmony Bliss",
      colors: ["#F4F1DE", "#E07A5F", "#3D405B", "#81B29A", "#F2CC8F"],
    },
    {
      name: "Pastel Pop",
      colors: ["#5AA9E6", "#7FC8F8", "#F9F9F9", "#FFE45E", "#FF6392"],
    },
    {
      name: "Golden Summer Glow",
      colors: ["#0D3B66", "#FAF0CA", "#F4D35E", "#EE964B", "#F95738"],
    },
    {
      name: "Watermelon Sorbet",
      colors: ["#EF476F", "#FFD166", "#06D6A0", "#118AB2", "#073B4C"],
    },
    {
      name: "Autumn Harvest",
      colors: ["#202C39", "#283845", "#B8B08D", "#F2D492", "#F29559"],
    },
    {
      name: "Warm Autumn Glow",
      colors: ["#003049", "#D62828", "#F77F00", "#FCBF49", "#EAE2B7"],
    },
  ];

  let activeTab = $state<Tab>("picker");
  let hexValue = $state("#ffbc0b");
  let rgbValue = $state<RGB>({ r: 255, g: 188, b: 11 });
  let hslValue = $state<HSL>({ h: 44, s: 100, l: 52 });
  let hsvValue = $state<HSV>({ h: 44, s: 96, v: 100 });
  let alpha = $state(100);
  let copied = $state<string | null>(null);

  // Track which color was just copied for icon display
  let copiedColor = $state<string | null>(null);

  // Saved colors - now stores objects with hex and alpha
  interface SavedColor {
    hex: string;
    alpha: number;
  }
  let savedColors = $state<SavedColor[]>([]);

  // Load saved colors from localStorage on mount
  $effect(() => {
    const stored = localStorage.getItem("colorpicker-saved-colors");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Handle migration from old format (string[]) to new format (SavedColor[])
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === "string") {
            // Old format: convert to new format
            savedColors = parsed.map((hex: string) => ({ hex, alpha: 100 }));
          } else {
            savedColors = parsed;
          }
        }
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
  });

  // Save to localStorage whenever savedColors changes
  $effect(() => {
    if (savedColors.length > 0) {
      localStorage.setItem(
        "colorpicker-saved-colors",
        JSON.stringify(savedColors)
      );
    } else {
      localStorage.removeItem("colorpicker-saved-colors");
    }
  });

  // EyeDropper support
  let eyeDropperSupported = $state(false);

  $effect(() => {
    eyeDropperSupported = "EyeDropper" in window;
  });

  async function pickColorFromScreen() {
    if (!("EyeDropper" in window)) return;

    try {
      // @ts-ignore - EyeDropper API types not in TS lib
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      hexValue = result.sRGBHex;
      updateFromHex(result.sRGBHex);
    } catch (e) {
      // User cancelled or error occurred
    }
  }

  function addToSavedColors() {
    const normalizedHex = hexValue.toLowerCase();
    const exists = savedColors.some(
      (c) => c.hex.toLowerCase() === normalizedHex && c.alpha === alpha
    );
    if (!exists) {
      savedColors = [...savedColors, { hex: normalizedHex, alpha }];
    }
  }

  function removeFromSavedColors(color: SavedColor) {
    savedColors = savedColors.filter(
      (c) => !(c.hex === color.hex && c.alpha === color.alpha)
    );
  }

  function clearSavedColors() {
    savedColors = [];
  }

  function copyAllSavedColors() {
    const allColors = savedColors
      .map((c) => {
        if (c.alpha < 100) {
          const alphaHex = Math.round((c.alpha / 100) * 255)
            .toString(16)
            .padStart(2, "0");
          return (c.hex + alphaHex).toUpperCase();
        }
        return c.hex.toUpperCase();
      })
      .join(", ");
    navigator.clipboard.writeText(allColors);
    copied = "saved-all";
    setTimeout(() => {
      copied = null;
    }, 2000);
  }

  function selectSavedColor(color: SavedColor) {
    hexValue = color.hex;
    alpha = color.alpha;
    updateFromHex(color.hex);
  }

  // Conversion functions
  function hexToRgb(hex: string): RGB | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  function rgbToHsl(r: number, g: number, b: number): HSL {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  function hslToRgb(h: number, s: number, l: number): RGB {
    h /= 360;
    s /= 100;
    l /= 100;
    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  function rgbToHsv(r: number, g: number, b: number): HSV {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;

    if (max !== min) {
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      v: Math.round(v * 100),
    };
  }

  function hsvToRgb(h: number, s: number, v: number): RGB {
    h /= 360;
    s /= 100;
    v /= 100;
    let r: number, g: number, b: number;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      default:
        r = v;
        g = p;
        b = q;
        break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  // CMYK conversions
  function rgbToCmyk(r: number, g: number, b: number): CMYK {
    r /= 255;
    g /= 255;
    b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) {
      return { c: 0, m: 0, y: 0, k: 100 };
    }
    const c = (1 - r - k) / (1 - k);
    const m = (1 - g - k) / (1 - k);
    const y = (1 - b - k) / (1 - k);
    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100),
    };
  }

  // XYZ conversions (using D65 illuminant)
  function rgbToXyz(r: number, g: number, b: number): XYZ {
    // Convert to linear RGB
    let rLin = r / 255;
    let gLin = g / 255;
    let bLin = b / 255;

    rLin =
      rLin > 0.04045 ? Math.pow((rLin + 0.055) / 1.055, 2.4) : rLin / 12.92;
    gLin =
      gLin > 0.04045 ? Math.pow((gLin + 0.055) / 1.055, 2.4) : gLin / 12.92;
    bLin =
      bLin > 0.04045 ? Math.pow((bLin + 0.055) / 1.055, 2.4) : bLin / 12.92;

    rLin *= 100;
    gLin *= 100;
    bLin *= 100;

    // RGB to XYZ matrix (sRGB, D65)
    const x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
    const y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.072175;
    const z = rLin * 0.0193339 + gLin * 0.119192 + bLin * 0.9503041;

    return {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
    };
  }

  // LAB conversions (using D65 illuminant)
  function xyzToLab(x: number, y: number, z: number): LAB {
    // D65 reference white
    const refX = 95.047;
    const refY = 100.0;
    const refZ = 108.883;

    x /= refX;
    y /= refY;
    z /= refZ;

    const epsilon = 0.008856;
    const kappa = 903.3;

    x = x > epsilon ? Math.pow(x, 1 / 3) : (kappa * x + 16) / 116;
    y = y > epsilon ? Math.pow(y, 1 / 3) : (kappa * y + 16) / 116;
    z = z > epsilon ? Math.pow(z, 1 / 3) : (kappa * z + 16) / 116;

    const l = 116 * y - 16;
    const a = 500 * (x - y);
    const b = 200 * (y - z);

    return {
      l: Math.round(l * 100) / 100,
      a: Math.round(a * 100) / 100,
      b: Math.round(b * 100) / 100,
    };
  }

  function rgbToLab(r: number, g: number, b: number): LAB {
    const xyz = rgbToXyz(r, g, b);
    return xyzToLab(xyz.x, xyz.y, xyz.z);
  }

  // LCH conversions (CIELCh, cylindrical LAB)
  function labToLch(l: number, a: number, b: number): LCH {
    const c = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * (180 / Math.PI);
    if (h < 0) h += 360;

    return {
      l: Math.round(l * 100) / 100,
      c: Math.round(c * 100) / 100,
      h: Math.round(h * 100) / 100,
    };
  }

  function rgbToLch(r: number, g: number, b: number): LCH {
    const lab = rgbToLab(r, g, b);
    return labToLch(lab.l, lab.a, lab.b);
  }

  // LUV conversions
  function xyzToLuv(x: number, y: number, z: number): LUV {
    // D65 reference white
    const refX = 95.047;
    const refY = 100.0;
    const refZ = 108.883;

    const uPrime = (4 * x) / (x + 15 * y + 3 * z) || 0;
    const vPrime = (9 * y) / (x + 15 * y + 3 * z) || 0;

    const uPrimeRef = (4 * refX) / (refX + 15 * refY + 3 * refZ);
    const vPrimeRef = (9 * refY) / (refX + 15 * refY + 3 * refZ);

    const yr = y / refY;
    const epsilon = 0.008856;
    const kappa = 903.3;

    const l = yr > epsilon ? 116 * Math.pow(yr, 1 / 3) - 16 : kappa * yr;
    const u = 13 * l * (uPrime - uPrimeRef);
    const v = 13 * l * (vPrime - vPrimeRef);

    return {
      l: Math.round(l * 100) / 100,
      u: Math.round(u * 100) / 100,
      v: Math.round(v * 100) / 100,
    };
  }

  function rgbToLuv(r: number, g: number, b: number): LUV {
    const xyz = rgbToXyz(r, g, b);
    return xyzToLuv(xyz.x, xyz.y, xyz.z);
  }

  // HWB conversions
  function rgbToHwb(r: number, g: number, b: number): HWB {
    const hsl = rgbToHsl(r, g, b);
    const w = Math.min(r, g, b) / 255;
    const bk = 1 - Math.max(r, g, b) / 255;

    return {
      h: hsl.h,
      w: Math.round(w * 100),
      b: Math.round(bk * 100),
    };
  }

  function updateFromHex(hex: string) {
    const rgb = hexToRgb(hex);
    if (rgb) {
      rgbValue = rgb;
      hslValue = rgbToHsl(rgb.r, rgb.g, rgb.b);
      hsvValue = rgbToHsv(rgb.r, rgb.g, rgb.b);
    }
  }

  function updateFromRgb(rgb: RGB) {
    hexValue = rgbToHex(rgb.r, rgb.g, rgb.b);
    hslValue = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsvValue = rgbToHsv(rgb.r, rgb.g, rgb.b);
  }

  function updateFromHsl(hsl: HSL) {
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    rgbValue = rgb;
    hexValue = rgbToHex(rgb.r, rgb.g, rgb.b);
    hsvValue = rgbToHsv(rgb.r, rgb.g, rgb.b);
  }

  function updateFromHsv(hsv: HSV) {
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    rgbValue = rgb;
    hexValue = rgbToHex(rgb.r, rgb.g, rgb.b);
    hslValue = rgbToHsl(rgb.r, rgb.g, rgb.b);
  }

  function handleColorInput(e: Event) {
    const target = e.target as HTMLInputElement;
    hexValue = target.value;
    updateFromHex(target.value);
  }

  function handleHexInput(e: Event) {
    const target = e.target as HTMLInputElement;
    let value = target.value.trim();
    if (!value.startsWith("#")) {
      value = "#" + value;
    }
    // Support HEX8 format (#RRGGBBAA)
    if (/^#[0-9A-Fa-f]{8}$/.test(value)) {
      const hex6 = value.slice(0, 7);
      const alphaHex = value.slice(7, 9);
      const alphaValue = Math.round((parseInt(alphaHex, 16) / 255) * 100);
      hexValue = hex6;
      alpha = alphaValue;
      updateFromHex(hex6);
    } else if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      hexValue = value;
      updateFromHex(value);
    } else if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
      // Support shorthand HEX (#RGB -> #RRGGBB)
      const r = value[1];
      const g = value[2];
      const b = value[3];
      const expanded = `#${r}${r}${g}${g}${b}${b}`;
      hexValue = expanded;
      updateFromHex(expanded);
    } else if (/^#[0-9A-Fa-f]{4}$/.test(value)) {
      // Support shorthand HEX with alpha (#RGBA -> #RRGGBBAA)
      const r = value[1];
      const g = value[2];
      const b = value[3];
      const a = value[4];
      const expanded = `#${r}${r}${g}${g}${b}${b}`;
      const alphaValue = Math.round((parseInt(a + a, 16) / 255) * 100);
      hexValue = expanded;
      alpha = alphaValue;
      updateFromHex(expanded);
    }
  }

  function handleRgbStringInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value.trim();
    // Match rgb(r, g, b) or rgba(r, g, b, a) or just "r, g, b" or "r g b"
    const rgbaMatch = value.match(
      /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i
    );
    const simpleMatch = value.match(
      /^(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)(?:\s*[,\s]\s*([\d.]+))?$/
    );

    const match = rgbaMatch || simpleMatch;
    if (match) {
      const r = Math.max(0, Math.min(255, parseInt(match[1]) || 0));
      const g = Math.max(0, Math.min(255, parseInt(match[2]) || 0));
      const b = Math.max(0, Math.min(255, parseInt(match[3]) || 0));
      rgbValue = { r, g, b };
      if (match[4] !== undefined) {
        const a = parseFloat(match[4]);
        alpha =
          a <= 1
            ? Math.round(a * 100)
            : Math.max(0, Math.min(100, Math.round(a)));
      }
      updateFromRgb(rgbValue);
    }
  }

  function handleHslStringInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value.trim();
    // Match hsl(h, s%, l%) or hsla(h, s%, l%, a) or just "h, s, l" or "h s l"
    const hslaMatch = value.match(
      /^hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*(?:,\s*([\d.]+))?\s*\)$/i
    );
    const simpleMatch = value.match(
      /^(\d+)\s*[,\s]\s*(\d+)%?\s*[,\s]\s*(\d+)%?(?:\s*[,\s]\s*([\d.]+))?$/
    );

    const match = hslaMatch || simpleMatch;
    if (match) {
      const h = Math.max(0, Math.min(360, parseInt(match[1]) || 0));
      const s = Math.max(0, Math.min(100, parseInt(match[2]) || 0));
      const l = Math.max(0, Math.min(100, parseInt(match[3]) || 0));
      hslValue = { h, s, l };
      if (match[4] !== undefined) {
        const a = parseFloat(match[4]);
        alpha =
          a <= 1
            ? Math.round(a * 100)
            : Math.max(0, Math.min(100, Math.round(a)));
      }
      updateFromHsl(hslValue);
    }
  }

  function handleHsvStringInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value.trim();
    // Match hsv(h, s%, v%) or hsva(h, s%, v%, a) or just "h, s, v" or "h s v"
    const hsvaMatch = value.match(
      /^hsva?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*(?:,\s*([\d.]+))?\s*\)$/i
    );
    const simpleMatch = value.match(
      /^(\d+)\s*[,\s]\s*(\d+)%?\s*[,\s]\s*(\d+)%?(?:\s*[,\s]\s*([\d.]+))?$/
    );

    const match = hsvaMatch || simpleMatch;
    if (match) {
      const h = Math.max(0, Math.min(360, parseInt(match[1]) || 0));
      const s = Math.max(0, Math.min(100, parseInt(match[2]) || 0));
      const v = Math.max(0, Math.min(100, parseInt(match[3]) || 0));
      hsvValue = { h, s, v };
      if (match[4] !== undefined) {
        const a = parseFloat(match[4]);
        alpha =
          a <= 1
            ? Math.round(a * 100)
            : Math.max(0, Math.min(100, Math.round(a)));
      }
      updateFromHsv(hsvValue);
    }
  }

  function copyToClipboard(format: string, value: string) {
    navigator.clipboard.writeText(value);
    copied = format;
    setTimeout(() => {
      copied = null;
    }, 2000);
  }

  function randomColor() {
    const r = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    const g = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    const b = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    hexValue = `#${r}${g}${b}`;
    updateFromHex(hexValue);
  }

  function copyPaletteColor(color: string) {
    navigator.clipboard.writeText(color.toUpperCase());
    copiedColor = color;
    setTimeout(() => {
      copiedColor = null;
    }, 1500);
  }

  function copyEntirePalette(colors: string[]) {
    const allColors = colors.map((c) => c.toUpperCase()).join(", ");
    navigator.clipboard.writeText(allColors);
    copied = "palette-all";
    setTimeout(() => {
      copied = null;
    }, 2000);
  }

  let hexString = $derived(hexValue.toUpperCase());
  let hex8String = $derived(
    hexValue.toUpperCase() +
      Math.round((alpha / 100) * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase()
  );
  let rgbString = $derived(`rgb(${rgbValue.r}, ${rgbValue.g}, ${rgbValue.b})`);
  let rgbaString = $derived(
    `rgba(${rgbValue.r}, ${rgbValue.g}, ${rgbValue.b}, ${(alpha / 100).toFixed(2)})`
  );
  let hslString = $derived(
    `hsl(${hslValue.h}, ${hslValue.s}%, ${hslValue.l}%)`
  );
  let hslaString = $derived(
    `hsla(${hslValue.h}, ${hslValue.s}%, ${hslValue.l}%, ${(alpha / 100).toFixed(2)})`
  );
  let hsvString = $derived(
    `hsv(${hsvValue.h}, ${hsvValue.s}%, ${hsvValue.v}%)`
  );
  let hsvaString = $derived(
    `hsva(${hsvValue.h}, ${hsvValue.s}%, ${hsvValue.v}%, ${(alpha / 100).toFixed(2)})`
  );

  // Additional color format derived values
  let cmykValue = $derived(rgbToCmyk(rgbValue.r, rgbValue.g, rgbValue.b));
  let cmykString = $derived(
    `cmyk(${cmykValue.c}%, ${cmykValue.m}%, ${cmykValue.y}%, ${cmykValue.k}%)`
  );

  let xyzValue = $derived(rgbToXyz(rgbValue.r, rgbValue.g, rgbValue.b));
  let xyzString = $derived(`xyz(${xyzValue.x}, ${xyzValue.y}, ${xyzValue.z})`);

  let labValue = $derived(rgbToLab(rgbValue.r, rgbValue.g, rgbValue.b));
  let labString = $derived(`lab(${labValue.l}% ${labValue.a} ${labValue.b})`);

  let lchValue = $derived(rgbToLch(rgbValue.r, rgbValue.g, rgbValue.b));
  let lchString = $derived(`lch(${lchValue.l}% ${lchValue.c} ${lchValue.h})`);

  let luvValue = $derived(rgbToLuv(rgbValue.r, rgbValue.g, rgbValue.b));
  let luvString = $derived(`luv(${luvValue.l}, ${luvValue.u}, ${luvValue.v})`);

  let hwbValue = $derived(rgbToHwb(rgbValue.r, rgbValue.g, rgbValue.b));
  let hwbString = $derived(`hwb(${hwbValue.h} ${hwbValue.w}% ${hwbValue.b}%)`);
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Pick colors, convert between formats, and explore trending color palettes.
    </p>
  </header>

  <!-- Tabs -->
  <div class="flex border-b border-(--color-border) mb-4">
    <button
      onclick={() => (activeTab = "picker")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab ===
      'picker'
        ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Picker
    </button>
    <button
      onclick={() => (activeTab = "palette")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab ===
      'palette'
        ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Palette
    </button>
  </div>

  {#if activeTab === "picker"}
    <!-- Color Picker Tab -->
    <div class="flex flex-col lg:flex-row gap-6">
      <div class="flex flex-col lg:w-64 shrink-0">
        <!-- Color Preview and Picker -->
        <div class="flex flex-col gap-4">
          <div
            class="w-full lg:w-64 h-48 border border-(--color-border) relative overflow-hidden"
            style="background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0px; background-color: white;"
          >
            <div
              class="absolute inset-0"
              style="background-color: {hexValue}; opacity: {alpha / 100}"
            ></div>
            <input
              type="color"
              value={hexValue}
              oninput={handleColorInput}
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              class="absolute bottom-2 right-2 text-xs font-mono px-2 py-1 bg-black/50 text-white"
            >
              {hexString}
              {alpha < 100 ? `${alpha}%` : ""}
            </div>
          </div>
          <!-- Alpha Slider -->
          <div class="flex items-center gap-2">
            <label class="text-xs text-(--color-text-muted) w-8">A</label>
            <input
              type="range"
              min="0"
              max="100"
              bind:value={alpha}
              class="flex-1 h-2 appearance-none rounded cursor-pointer"
              style="background: linear-gradient(to right, transparent, {hexValue}), linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 100% 100%, 8px 8px, 8px 8px, 8px 8px, 8px 8px; background-position: 0 0, 0 0, 0 4px, 4px -4px, -4px 0px;"
            />
            <input
              type="number"
              min="0"
              max="100"
              bind:value={alpha}
              class="w-14 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm text-center focus:outline-none focus:border-(--color-accent)"
            />
            <span class="text-xs text-(--color-text-muted)">%</span>
          </div>
          <div class="flex gap-2">
            {#if eyeDropperSupported}
              <button
                onclick={pickColorFromScreen}
                class="p-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
                title="Pick color from screen"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path
                    d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"
                  />
                </svg>
              </button>
            {/if}
            <button
              onclick={addToSavedColors}
              class="p-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
              title="Add to saved colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              onclick={randomColor}
              class="flex-1 px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
            >
              Random
            </button>
          </div>
        </div>

        <!-- Saved Colors -->
        {#if savedColors.length > 0}
          <div
            class="mt-4 p-3 border border-(--color-border) bg-(--color-bg-alt)"
          >
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >Saved ({savedColors.length})</span
              >
              <div class="flex gap-2">
                <button
                  onclick={copyAllSavedColors}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  {copied === "saved-all" ? "Copied!" : "Copy"}
                </button>
                <button
                  onclick={clearSavedColors}
                  class="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              {#each savedColors as color}
                {@const isSelected =
                  color.hex.toLowerCase() === hexValue.toLowerCase() &&
                  color.alpha === alpha}
                {@const displayHex =
                  color.alpha < 100
                    ? color.hex.toUpperCase() +
                      Math.round((color.alpha / 100) * 255)
                        .toString(16)
                        .padStart(2, "0")
                        .toUpperCase()
                    : color.hex.toUpperCase()}
                <button
                  onclick={(e) =>
                    e.ctrlKey || e.metaKey
                      ? removeFromSavedColors(color)
                      : selectSavedColor(color)}
                  class="w-10 h-10 border border-(--color-border) hover:border-(--color-accent) transition-colors relative overflow-hidden {isSelected
                    ? 'ring-2 ring-(--color-accent)'
                    : ''}"
                  style="background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 8px 8px; background-position: 0 0, 0 4px, 4px -4px, -4px 0px; background-color: white;"
                  title="{displayHex} (Ctrl+Click to delete)"
                >
                  <div
                    class="absolute inset-0"
                    style="background-color: {color.hex}; opacity: {color.alpha /
                      100}"
                  ></div>
                </button>
              {/each}
            </div>
            <p class="mt-2 text-xs text-(--color-text-muted)">
              Ctrl+Click to delete
            </p>
          </div>
        {/if}
      </div>

      <!-- Color Values -->
      <div class="flex-1 flex flex-col gap-4 min-w-0">
        <!-- HEX -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between mb-2">
            <span
              class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
              >{alpha < 100 ? "HEX8" : "HEX"}</span
            >
            <button
              onclick={() =>
                copyToClipboard("hex", alpha < 100 ? hex8String : hexString)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied === "hex" ? "Copied!" : "Copy"}
            </button>
          </div>
          <input
            type="text"
            value={hexValue}
            oninput={handleHexInput}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
            placeholder="#000000"
          />
          {#if alpha < 100}
            <div class="mt-2 text-xs font-mono text-(--color-text-muted)">
              {hex8String}
            </div>
          {/if}
        </div>

        <!-- RGB/RGBA -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between mb-2">
            <span
              class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
              >{alpha < 100 ? "RGBA" : "RGB"}</span
            >
            <button
              onclick={() =>
                copyToClipboard("rgb", alpha < 100 ? rgbaString : rgbString)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied === "rgb" ? "Copied!" : "Copy"}
            </button>
          </div>
          <input
            type="text"
            value={alpha < 100 ? rgbaString : rgbString}
            oninput={handleRgbStringInput}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
            placeholder="rgb(0, 0, 0)"
          />
        </div>

        <details class="border border-(--color-border) bg-(--color-bg-alt)">
          <summary
            class="px-4 py-2 cursor-pointer text-sm font-medium text-(--color-accent) hover:bg-(--color-bg) transition-colors"
          >
            More Formats
          </summary>
        <!-- Additional Color Formats Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
          <!-- HSL/HSLA -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >{alpha < 100 ? "HSLA" : "HSL"}</span
              >
              <button
                onclick={() =>
                  copyToClipboard("hsl", alpha < 100 ? hslaString : hslString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "hsl" ? "Copied!" : "Copy"}
              </button>
            </div>
            <input
              type="text"
              value={alpha < 100 ? hslaString : hslString}
              oninput={handleHslStringInput}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
              placeholder="hsl(0, 0%, 0%)"
            />
          </div>

          <!-- HSV/HSVA -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >{alpha < 100 ? "HSVA" : "HSV"}</span
              >
              <button
                onclick={() =>
                  copyToClipboard("hsv", alpha < 100 ? hsvaString : hsvString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "hsv" ? "Copied!" : "Copy"}
              </button>
            </div>
            <input
              type="text"
              value={alpha < 100 ? hsvaString : hsvString}
              oninput={handleHsvStringInput}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
              placeholder="hsv(0, 0%, 0%)"
            />
          </div>
          <!-- CMYK -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >CMYK</span
              >
              <button
                onclick={() => copyToClipboard("cmyk", cmykString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "cmyk" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm"
            >
              {cmykString}
            </div>
          </div>

          <!-- HWB -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >HWB</span
              >
              <button
                onclick={() => copyToClipboard("hwb", hwbString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "hwb" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm"
            >
              {hwbString}
            </div>
          </div>

          <!-- LAB -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >LAB</span
              >
              <button
                onclick={() => copyToClipboard("lab", labString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "lab" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm"
            >
              {labString}
            </div>
          </div>

          <!-- LCH -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >LCH</span
              >
              <button
                onclick={() => copyToClipboard("lch", lchString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "lch" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm"
            >
              {lchString}
            </div>
          </div>

          <!-- XYZ -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >XYZ</span
              >
              <button
                onclick={() => copyToClipboard("xyz", xyzString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "xyz" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm"
            >
              {xyzString}
            </div>
          </div>

          <!-- LUV -->
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                >LUV</span
              >
              <button
                onclick={() => copyToClipboard("luv", luvString)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copied === "luv" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              class="px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm"
            >
              {luvString}
            </div>
          </div>
        </div>
        </details>
      </div>
    </div>
  {:else}
    <!-- Palette Tab -->
    <div class="flex flex-col gap-6">
      <!-- Trending Palettes Section -->
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h3
            class="text-sm tracking-wider text-(--color-text-light) font-medium"
          >
            Trending Palettes
          </h3>
          <span class="text-xs text-(--color-text-muted)">
            from
          <a
              href="https://coolors.co/"
              target="_blank"
              class="text-(--color-accent) hover:underline">coolors.co</a
            >
            </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each trendingPalettes as palette}
            <div
              class="border border-(--color-border) bg-(--color-bg-alt) overflow-hidden"
            >
              <div
                class="flex items-center justify-between px-3 py-2 border-b border-(--color-border)"
              >
                <span class="text-sm font-medium text-(--color-text)"
                  >{palette.name}</span
                >
                <button
                  onclick={() => copyEntirePalette(palette.colors)}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  {copied === "palette-all" ? "Copied!" : "Copy All"}
                </button>
              </div>
              <div class="flex h-16">
                {#each palette.colors as color}
                  <button
                    onclick={() => copyPaletteColor(color)}
                    class="group relative flex-1 transition-all duration-200 ease-out hover:flex-[2] focus:flex-[2] focus:outline-none"
                    style="background-color: {color}"
                    title="Click to copy {color.toUpperCase()}"
                  >
                    <div
                      class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200"
                    >
                      {#if copiedColor === color}
                        <div
                          class="bg-black/70 text-white px-2 py-1 text-xs font-mono flex items-center gap-1"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          Copied
                        </div>
                      {:else}
                        <span
                          class="bg-black/70 text-white px-2 py-1 text-xs font-mono"
                        >
                          {color.toUpperCase()}
                        </span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
