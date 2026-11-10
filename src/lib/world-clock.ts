import { timezoneCoordinates } from "../data/timezone-coordinates.ts";

export interface WorldClock {
  id: string;
  timezone: string;
  label: string;
}

export interface ClockLayout {
  value: string;
  label: string;
  columns: number;
  firstRow?: number;
}

export interface ClockSettings {
  version: number;
  clocks: WorldClock[];
  use24Hour: boolean;
  showSeconds: boolean;
  showDate: boolean;
  showDifference: boolean;
  layout: string;
  density: "comfortable" | "compact";
  referenceId: string;
}

export interface ClockReading {
  time: string;
  seconds: string;
  period: string;
  date: string;
  weekday: string;
  offset: string;
  offsetMinutes: number;
  daytime: boolean;
  dayNumber: number;
  minuteOfDay: number;
}

export interface TimezoneOption {
  timezone: string;
  label: string;
  search: string;
}

export const clockLayouts: ClockLayout[] = [
  { value: "auto", label: "Automatic", columns: 0 },
  ...[1, 2, 3, 4, 5, 6].map((columns: number) => ({ value: String(columns), label: `${columns} ${columns === 1 ? "column" : "columns"}`, columns })),
  ...[[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [4, 5]].map(([firstRow, columns]: number[]) => ({ value: `${firstRow}x${columns}`, label: `${firstRow} top + ${columns} per row`, columns, firstRow })),
];

const formatters: Map<string, Intl.DateTimeFormat> = new Map();
const cityNames: Record<string, string> = {
  "America/Sao_Paulo": "São Paulo",
  "Asia/Calcutta": "Kolkata",
  "Asia/Katmandu": "Kathmandu",
  "Europe/Kiev": "Kyiv",
};
const cityAliases: Record<string, string> = {
  "Asia/Kolkata": "Calcutta Mumbai Delhi New Delhi India",
  "Asia/Calcutta": "Kolkata Mumbai Delhi New Delhi India",
  "Asia/Kathmandu": "Katmandu Nepal",
  "Asia/Katmandu": "Kathmandu Nepal",
  "Europe/Kyiv": "Kiev Ukraine",
  "Europe/Kiev": "Kyiv Ukraine",
};

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return Boolean(timezone.trim());
  } catch {
    return false;
  }
}

export function timezoneLabel(timezone: string): string {
  if (Object.hasOwn(cityNames, timezone)) return cityNames[timezone];
  if (timezone === "UTC") return "UTC";
  if (timezone.startsWith("Etc/GMT")) {
    const hours: number = -Number(timezone.slice(7) || "0");
    return hours === 0 ? "UTC" : `UTC${hours >= 0 ? "+" : "−"}${Math.abs(hours)}`;
  }
  return (timezone.split("/").pop() || timezone).replace(/_/g, " ");
}

export function normalizeCitySearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ı/g, "i").replace(/[_/]+/g, " ").trim();
}

export function timezoneOptions(localTimezone: string): TimezoneOption[] {
  const popular: string[] = [localTimezone, "UTC", "Europe/Istanbul", "Europe/Amsterdam", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Asia/Kolkata", "Asia/Kathmandu", "Australia/Sydney", "Etc/GMT+12", "Etc/GMT-14"];
  const supported: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [
    "America/Chicago", "America/Toronto", "America/Sao_Paulo", "America/Mexico_City", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Asia/Dubai", "Asia/Singapore", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Seoul", "Asia/Tehran", "Africa/Cairo", "Africa/Johannesburg", "Pacific/Auckland",
  ];
  const canonicalZones: Set<string> = new Set();
  return [...new Set([...popular, ...supported])].filter((timezone: string) => {
    try {
      const canonical: string = new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).resolvedOptions().timeZone;
      if (canonicalZones.has(canonical)) return false;
      canonicalZones.add(canonical);
      return true;
    } catch {
      return false;
    }
  }).map((timezone: string) => {
    const label: string = timezoneLabel(timezone);
    return { timezone, label, search: normalizeCitySearch(`${label} ${timezone} ${Object.hasOwn(cityAliases, timezone) ? cityAliases[timezone] : ""}`) };
  });
}

export function defaultClockSettings(localTimezone: string): ClockSettings {
  const zones: string[] = [...new Set([localTimezone, "UTC", "Europe/Amsterdam", "Europe/Istanbul", "Asia/Tokyo"])];
  const clocks: WorldClock[] = zones.map((timezone: string, index: number) => ({ id: `default-${index}`, timezone, label: timezoneLabel(timezone) }));
  return { version: 2, clocks, use24Hour: true, showSeconds: true, showDate: true, showDifference: true, layout: "auto", density: "comfortable", referenceId: clocks[0].id };
}

// Accept the original saved shape as well as the current version. A malformed
// record must never reach Intl or create duplicate keys in a Svelte each block.
export function restoreClockSettings(value: unknown, localTimezone: string): ClockSettings {
  const defaults: ClockSettings = defaultClockSettings(localTimezone);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const saved = value as Record<string, unknown>;
  const ids: Set<string> = new Set();
  const clocks: WorldClock[] = [];
  if (Array.isArray(saved.clocks)) {
    for (const item of saved.clocks) {
      if (!item || typeof item !== "object" || typeof item.timezone !== "string" || !isValidTimezone(item.timezone)) continue;
      let id: string = typeof item.id === "string" && item.id ? item.id : `restored-${clocks.length}`;
      while (ids.has(id)) id = `${id}-copy`;
      ids.add(id);
      clocks.push({ id, timezone: item.timezone, label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : timezoneLabel(item.timezone) });
    }
  }
  const result: ClockSettings = { ...defaults, clocks: Array.isArray(saved.clocks) ? clocks : defaults.clocks };
  for (const key of ["use24Hour", "showSeconds", "showDate", "showDifference"] as const) {
    if (typeof saved[key] === "boolean") result[key] = saved[key];
  }
  if (typeof saved.layout === "string" && clockLayouts.some((layout: ClockLayout) => layout.value === saved.layout)) result.layout = saved.layout;
  if (saved.density === "compact") result.density = "compact";
  result.referenceId = typeof saved.referenceId === "string" && result.clocks.some((clock: WorldClock) => clock.id === saved.referenceId) ? saved.referenceId : result.clocks[0]?.id ?? "";
  return result;
}

export function readClock(date: Date, timezone: string, use24Hour: boolean = true): ClockReading {
  const key: string = `${timezone}|${use24Hour}`;
  let formatter: Intl.DateTimeFormat | undefined = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, calendar: "gregory", numberingSystem: "latn", hourCycle: use24Hour ? "h23" : "h12",
      year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset",
    });
    formatters.set(key, formatter);
  }
  const parts: Record<string, string> = Object.fromEntries(formatter.formatToParts(date).filter((part: Intl.DateTimeFormatPart) => part.type !== "literal").map((part: Intl.DateTimeFormatPart) => [part.type, part.value]));
  const offsetMatch: RegExpMatchArray | null = parts.timeZoneName.match(/^GMT([+−-])(\d{2}):(\d{2})$/);
  const offsetMinutes: number = offsetMatch ? (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3])) * (offsetMatch[1] === "+" ? 1 : -1) : 0;
  const hour: number = use24Hour ? Number(parts.hour) : Number(parts.hour) % 12 + (parts.dayPeriod.toLowerCase() === "pm" ? 12 : 0);
  return {
    time: `${parts.hour}:${parts.minute}`, seconds: parts.second, period: parts.dayPeriod?.toUpperCase() ?? "",
    date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday,
    offset: offsetMatch ? parts.timeZoneName.replace("GMT", "UTC") : "UTC+00:00", offsetMinutes,
    daytime: hour >= 6 && hour < 18, dayNumber: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000,
    minuteOfDay: hour * 60 + Number(parts.minute),
  };
}

export interface SunTimes {
  sunrise: number | null;
  sunset: number | null;
  polar: "day" | "night" | null;
}

const radians = (degrees: number): number => degrees * Math.PI / 180;

// Sunrise equation (NOAA-style approximation, accurate to about a minute) for
// the zone's representative tz-database location, not the user's position.
// Results are minutes after local midnight on the clock's calendar day.
export function sunTimes(timezone: string, dayNumber: number, offsetMinutes: number): SunTimes | null {
  const location: [number, number] | undefined = timezoneCoordinates.get(timezone);
  if (!location) return null;
  const [latitude, longitude] = location;
  const solarDay: number = dayNumber - 10957 - longitude / 360;
  const anomaly: number = (357.5291 + 0.98560028 * solarDay) % 360;
  const center: number = 1.9148 * Math.sin(radians(anomaly)) + 0.02 * Math.sin(radians(2 * anomaly)) + 0.0003 * Math.sin(radians(3 * anomaly));
  const eclipticLongitude: number = (anomaly + center + 282.9372) % 360;
  const transit: number = 2451545 + solarDay + 0.0053 * Math.sin(radians(anomaly)) - 0.0069 * Math.sin(radians(2 * eclipticLongitude));
  const declination: number = Math.asin(Math.sin(radians(eclipticLongitude)) * Math.sin(radians(23.4397)));
  const hourAngle: number = (Math.sin(radians(-0.833)) - Math.sin(radians(latitude)) * Math.sin(declination)) / (Math.cos(radians(latitude)) * Math.cos(declination));
  if (hourAngle > 1) return { sunrise: null, sunset: null, polar: "night" };
  if (hourAngle < -1) return { sunrise: null, sunset: null, polar: "day" };
  const halfDay: number = Math.acos(hourAngle) / (2 * Math.PI);
  const toLocalMinutes = (julian: number): number => (((julian - 2440587.5) * 1440 + offsetMinutes) % 1440 + 1440) % 1440;
  return { sunrise: toLocalMinutes(transit - halfDay), sunset: toLocalMinutes(transit + halfDay), polar: null };
}

export function isDaylight(minuteOfDay: number, sun: SunTimes): boolean {
  if (sun.polar) return sun.polar === "day";
  const sunrise: number = sun.sunrise ?? 360;
  const sunset: number = sun.sunset ?? 1080;
  return sunrise < sunset ? minuteOfDay >= sunrise && minuteOfDay < sunset : minuteOfDay >= sunrise || minuteOfDay < sunset;
}

export function formatClockMinutes(minutes: number, use24Hour: boolean): string {
  const rounded: number = Math.round(minutes) % 1440;
  const hour: number = Math.floor(rounded / 60);
  const minute: string = String(rounded % 60).padStart(2, "0");
  if (use24Hour) return `${String(hour).padStart(2, "0")}:${minute}`;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

export function relativeClockTime(minutes: number): string {
  if (minutes === 0) return "Same time";
  const amount: number = Math.abs(minutes);
  const hours: number = Math.floor(amount / 60);
  const rest: number = amount % 60;
  return `${[hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ")} ${minutes > 0 ? "ahead" : "behind"}`;
}

export function relativeClockDay(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return `${Math.abs(days)} days ${days > 0 ? "ahead" : "behind"}`;
}

export function clockColumns(width: number, count: number, preferred: number, compact: boolean = false, availableHeight?: number): number {
  const capacity: number = Math.max(1, Math.floor((width + 16) / ((compact ? 250 : 300) + 16)));
  const maximum: number = Math.max(1, Math.min(capacity, count || 1, preferred || capacity));
  if (!preferred && availableHeight && count > 0) {
    // On a wallboard, maximize legibility rather than producing narrow columns
    // that run the whole height of the screen. Penalize mostly empty last rows.
    let best: number = 1;
    let bestScore: number = -1;
    for (let columns: number = 1; columns <= maximum; columns++) {
      const rows: number = Math.ceil(count / columns);
      const cellWidth: number = (width - (columns - 1) * 16) / columns;
      const cellHeight: number = (availableHeight - (rows - 1) * 16) / rows;
      const score: number = Math.min(cellWidth, Math.max(1, cellHeight - 120) * 2) * (count / (columns * rows)) ** 2;
      if (score > bestScore) { bestScore = score; best = columns; }
    }
    return best;
  }
  return preferred ? maximum : Math.max(1, Math.ceil(count / Math.max(1, Math.ceil(count / maximum))));
}
