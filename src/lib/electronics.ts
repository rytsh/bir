export type ESeries = "E6" | "E12" | "E24" | "E48" | "E96";

const PREFIXES: { symbol: string; exponent: number }[] = [
  { symbol: "T", exponent: 12 },
  { symbol: "G", exponent: 9 },
  { symbol: "M", exponent: 6 },
  { symbol: "k", exponent: 3 },
  { symbol: "", exponent: 0 },
  { symbol: "m", exponent: -3 },
  { symbol: "µ", exponent: -6 },
  { symbol: "n", exponent: -9 },
  { symbol: "p", exponent: -12 },
];

const PREFIX_MULTIPLIERS: Record<string, number> = {
  t: 1e12,
  T: 1e12,
  g: 1e9,
  G: 1e9,
  M: 1e6,
  meg: 1e6,
  MEG: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  u: 1e-6,
  U: 1e-6,
  "µ": 1e-6,
  "μ": 1e-6,
  n: 1e-9,
  N: 1e-9,
  p: 1e-12,
  P: 1e-12,
};

/**
 * Parses engineering notation such as "4.7k", "4k7", "100n", "2.2uF", "1M", "10mA", "1e-6".
 * A lone "M" means mega, "m" means milli. Unit suffixes (Ω, ohm, F, H, V, A, W, Hz, s, R) are ignored.
 */
export const parseSI = (input: string): number | null => {
  let text = input.trim().replace(/\s+/g, "").replace(/,/g, ".");
  if (!text) return null;

  text = text.replace(/(ohms?|Ω|Hz|hz|[FfHhVvAaWwSs])$/u, "");

  const european = text.match(/^(\d*)([RrKkMGgTtunpµμ])(\d+)$/u);
  if (european) {
    const [, whole, prefix, fraction] = european;
    const multiplier = /[Rr]/.test(prefix) ? 1 : PREFIX_MULTIPLIERS[prefix];
    if (multiplier === undefined) return null;
    return parseFloat(`${whole || "0"}.${fraction}`) * multiplier;
  }

  const match = text.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(meg|MEG|[TtGgMKkmuUµμnNpPRr])?$/u);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const prefix = match[2];
  if (!prefix || prefix === "R" || prefix === "r") return value;
  const multiplier = PREFIX_MULTIPLIERS[prefix];
  return multiplier === undefined ? null : value * multiplier;
};

const trimNumber = (value: number, significant: number): string => {
  const rounded = Number(value.toPrecision(significant));
  return rounded.toString();
};

/** Formats a value with an SI prefix: formatSI(4700, "Ω") → "4.7 kΩ". */
export const formatSI = (value: number, unit: string, significant = 4): string => {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(Number(value.toPrecision(significant)));
  const prefix =
    PREFIXES.find((candidate) => abs >= Math.pow(10, candidate.exponent) * 0.9999999) ??
    PREFIXES[PREFIXES.length - 1];
  const scaled = value / Math.pow(10, prefix.exponent);
  return `${trimNumber(scaled, significant)} ${prefix.symbol}${unit}`;
};

/** Formats for an input box without unit: 4700 → "4.7k". */
export const formatSIInput = (value: number, significant = 4): string =>
  formatSI(value, "", significant).replace(" ", "");

const E_SERIES_VALUES: Record<ESeries, number[]> = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [
    1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5,
    8.2, 9.1,
  ],
  E48: [
    1.0, 1.05, 1.1, 1.15, 1.21, 1.27, 1.33, 1.4, 1.47, 1.54, 1.62, 1.69, 1.78, 1.87, 1.96, 2.05, 2.15, 2.26, 2.37,
    2.49, 2.61, 2.74, 2.87, 3.01, 3.16, 3.32, 3.48, 3.65, 3.83, 4.02, 4.22, 4.42, 4.64, 4.87, 5.11, 5.36, 5.62,
    5.9, 6.19, 6.49, 6.81, 7.15, 7.5, 7.87, 8.25, 8.66, 9.09, 9.53,
  ],
  E96: [
    1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54,
    1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.0, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43,
    2.49, 2.55, 2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83,
    3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9, 6.04,
    6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53,
    9.76,
  ],
};

export const E_SERIES: ESeries[] = ["E6", "E12", "E24", "E48", "E96"];

/** Returns all standard values of a series from 1 Ω to 10 MΩ, ascending. */
export const seriesValues = (series: ESeries, minDecade = 0, maxDecade = 7): number[] => {
  const values: number[] = [];
  for (let decade = minDecade; decade < maxDecade; decade++) {
    for (const base of E_SERIES_VALUES[series]) {
      values.push(Number((base * Math.pow(10, decade)).toPrecision(3)));
    }
  }
  values.push(Math.pow(10, maxDecade));
  return values;
};

/** Nearest standard value; mode "up" returns the next value ≥ target (safe for current limiting). */
export const nearestStandard = (
  target: number,
  series: ESeries,
  mode: "nearest" | "up" | "down" = "nearest",
): number | null => {
  if (!(target > 0)) return null;
  const decade = Math.floor(Math.log10(target));
  const candidates = seriesValues(series, decade - 1, decade + 2);
  if (mode === "up") return candidates.find((value) => value >= target * 0.999999) ?? null;
  if (mode === "down") return [...candidates].reverse().find((value) => value <= target * 1.000001) ?? null;
  return candidates.reduce((best, value) =>
    Math.abs(Math.log(value / target)) < Math.abs(Math.log(best / target)) ? value : best,
  );
};

/** Standard resistor power ratings in watts. */
export const POWER_RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10];

export const recommendedPowerRating = (watts: number, safetyFactor = 2): number | null =>
  POWER_RATINGS.find((rating) => rating >= watts * safetyFactor) ?? null;

export const formatPowerRating = (watts: number): string => {
  const fractions: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return fractions[watts] ? `${fractions[watts]} W` : `${watts} W`;
};
