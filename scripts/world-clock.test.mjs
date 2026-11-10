import assert from "node:assert/strict";
import test from "node:test";
import {
  clockColumns, clockLayouts, defaultClockSettings, isValidTimezone, normalizeCitySearch, readClock,
  relativeClockDay, relativeClockTime, restoreClockSettings, timezoneLabel, timezoneOptions,
  sunTimes, isDaylight, formatClockMinutes,
} from "../src/lib/world-clock.ts";

test("24-hour midnight starts at 00 and ISO dates retain their year", () => {
  const reading = readClock(new Date("2026-01-01T00:05:09Z"), "UTC");
  assert.equal(reading.time, "00:05");
  assert.equal(reading.seconds, "09");
  assert.equal(reading.date, "2026-01-01");
  assert.equal(reading.offset, "UTC+00:00");
  assert.equal(reading.period, "");
  assert.equal(reading.daytime, false);
});

test("12-hour noon, midnight, and day/night indicators are consistent", () => {
  for (const [instant, time, period, daytime] of [
    ["2026-11-10T00:00:00Z", "12:00", "AM", false],
    ["2026-11-10T12:00:00Z", "12:00", "PM", true],
    ["2026-11-10T18:00:00Z", "06:00", "PM", false],
    ["2026-11-10T06:00:00Z", "06:00", "AM", true],
  ]) {
    const reading = readClock(new Date(instant), "UTC", false);
    assert.equal(reading.time, time);
    assert.equal(reading.period, period);
    assert.equal(reading.daytime, daytime);
  }
});

test("UTC offsets remain correct through DST in any device time zone", () => {
  const original = process.env.TZ;
  try {
    for (const deviceTimezone of ["UTC", "America/New_York", "Europe/Istanbul", "Australia/Sydney"]) {
      process.env.TZ = deviceTimezone;
      for (const [instant, offset, time] of [
        ["2026-03-08T06:30:00Z", -300, "01:30"],
        ["2026-03-08T07:30:00Z", -240, "03:30"],
        ["2026-11-01T05:30:00Z", -240, "01:30"],
        ["2026-11-01T06:30:00Z", -300, "01:30"],
      ]) {
        const reading = readClock(new Date(instant), "America/New_York");
        assert.equal(reading.offsetMinutes, offset, `${deviceTimezone} at ${instant}`);
        assert.equal(reading.time, time);
      }
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("fractional offsets include quarter hours and southern hemisphere DST", () => {
  const summer = new Date("2026-01-01T12:00:00Z");
  assert.equal(readClock(summer, "Asia/Kathmandu").offsetMinutes, 345);
  assert.equal(readClock(summer, "Asia/Kathmandu").offset, "UTC+05:45");
  assert.equal(readClock(summer, "America/St_Johns").offsetMinutes, -210);
  assert.equal(readClock(summer, "Australia/Lord_Howe").offsetMinutes, 660);
  assert.equal(readClock(new Date("2026-07-01T12:00:00Z"), "Australia/Lord_Howe").offsetMinutes, 630);
});

test("relative dates handle year boundaries and the international date line", () => {
  const now = new Date("2026-12-31T23:30:00Z");
  const utc = readClock(now, "UTC");
  const tokyo = readClock(now, "Asia/Tokyo");
  assert.equal(tokyo.date, "2027-01-01");
  assert.equal(relativeClockDay(tokyo.dayNumber - utc.dayNumber), "Tomorrow");
  const west = readClock(now, "Etc/GMT+12");
  const east = readClock(now, "Etc/GMT-14");
  assert.equal(east.offsetMinutes - west.offsetMinutes, 26 * 60);
  assert.equal(relativeClockTime(east.offsetMinutes - west.offsetMinutes), "26h ahead");
  assert.equal(relativeClockDay(-1), "Yesterday");
  assert.equal(relativeClockDay(0), "Today");
  assert.equal(relativeClockDay(2), "2 days ahead");
});

test("time differences are explicit without misleading fractional-hour rounding", () => {
  assert.equal(relativeClockTime(0), "Same time");
  assert.equal(relativeClockTime(345), "5h 45m ahead");
  assert.equal(relativeClockTime(-30), "30m behind");
  assert.equal(relativeClockTime(-90), "1h 30m behind");
});

test("city labels preserve multiword names and Etc/GMT sign inversion", () => {
  assert.equal(timezoneLabel("America/New_York"), "New York");
  assert.equal(timezoneLabel("America/Los_Angeles"), "Los Angeles");
  assert.equal(timezoneLabel("America/Sao_Paulo"), "São Paulo");
  assert.equal(timezoneLabel("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(timezoneLabel("Etc/GMT+12"), "UTC−12");
  assert.equal(timezoneLabel("Etc/GMT-14"), "UTC+14");
});

test("search is accent-insensitive and includes supported and custom time zones", () => {
  assert.equal(normalizeCitySearch("São_Paulo"), "sao paulo");
  assert.equal(normalizeCitySearch("İstanbul"), "istanbul");
  assert.equal(normalizeCitySearch("Europe/Istanbul"), "europe istanbul");
  const choices = timezoneOptions("Europe/Istanbul");
  assert.ok(choices.some((choice) => choice.timezone === "America/New_York"));
  assert.ok(choices.some((choice) => choice.timezone === "Asia/Kathmandu"));
  assert.ok(choices.every((choice) => isValidTimezone(choice.timezone)));
  assert.ok(choices.some((choice) => choice.search.includes("mumbai")));
  assert.ok(choices.some((choice) => choice.search.includes("delhi")));
  assert.equal(choices.filter((choice) => ["Asia/Calcutta", "Asia/Kolkata"].includes(choice.timezone)).length, 1);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
  assert.equal(isValidTimezone(""), false);
});

test("default clocks do not duplicate the local zone, and use automatic layout", () => {
  for (const local of ["UTC", "Europe/Istanbul", "Europe/Amsterdam", "Asia/Tokyo", "America/New_York"]) {
    const settings = defaultClockSettings(local);
    assert.equal(new Set(settings.clocks.map((clock) => clock.timezone)).size, settings.clocks.length);
    assert.equal(settings.clocks[0].timezone, local);
    assert.equal(settings.referenceId, settings.clocks[0].id);
    assert.equal(settings.layout, "auto");
  }
});

test("saved legacy clock lists and every old layout are preserved", () => {
  for (const layout of clockLayouts) {
    const result = restoreClockSettings({ clocks: [{ id: "1", timezone: "America/New_York", label: "NY office" }], use24Hour: false, showSeconds: false, layout: layout.value }, "UTC");
    assert.equal(result.clocks[0].label, "NY office");
    assert.equal(result.layout, layout.value);
    assert.equal(result.use24Hour, false);
    assert.equal(result.showSeconds, false);
    assert.equal(result.referenceId, "1");
  }
});

test("corrupt settings are sanitized, including duplicate ids and invalid time zones", () => {
  const result = restoreClockSettings({
    clocks: [null, 42, { timezone: "Mars/Olympus" }, { id: "a", timezone: "UTC", label: "" }, { id: "a", timezone: "Europe/Istanbul", label: "Office" }],
    layout: "__proto__", use24Hour: "false", showSeconds: false, density: "unknown", referenceId: "missing",
  }, "UTC");
  assert.equal(result.clocks.length, 2);
  assert.equal(new Set(result.clocks.map((clock) => clock.id)).size, 2);
  assert.equal(result.clocks[0].label, "UTC");
  assert.equal(result.layout, "auto");
  assert.equal(result.use24Hour, true);
  assert.equal(result.showSeconds, false);
  assert.equal(result.density, "comfortable");
  assert.equal(result.referenceId, result.clocks[0].id);
  assert.equal(restoreClockSettings({ clocks: [] }, "UTC").clocks.length, 0);
  assert.deepEqual(restoreClockSettings(null, "UTC"), defaultClockSettings("UTC"));
});

test("column preferences never force unreadable mobile card widths", () => {
  for (const width of [280, 320, 358, 390]) {
    for (const preference of [0, 1, 2, 3, 4, 5, 6]) assert.equal(clockColumns(width, 5, preference), 1);
  }
  assert.equal(clockColumns(1200, 5, 0), 3);
  assert.equal(clockColumns(1200, 4, 0), 2);
  assert.equal(clockColumns(1200, 5, 2), 2);
  assert.equal(clockColumns(1200, 5, 6), 3);
  assert.equal(clockColumns(0, 0, 0), 1);
  assert.equal(clockColumns(1200, 5, 6, true), 4);
});

test("automatic fullscreen layout considers height instead of creating tall narrow columns", () => {
  assert.equal(clockColumns(1400, 4, 0, false, 900), 2);
  assert.equal(clockColumns(1400, 6, 0, false, 900), 3);
  assert.equal(clockColumns(1400, 3, 0, false, 900), 3);
  assert.equal(clockColumns(358, 4, 0, false, 700), 1);
  assert.equal(clockColumns(1400, 4, 4, false, 900), 4);
});

test("sun times use the zone's tz-database location, including aliases and polar days", () => {
  const amsterdam = readClock(new Date("2026-11-10T12:00:00Z"), "Europe/Amsterdam");
  const sun = sunTimes("Europe/Amsterdam", amsterdam.dayNumber, amsterdam.offsetMinutes);
  assert.ok(Math.abs(sun.sunrise - (7 * 60 + 52)) <= 5);
  assert.ok(Math.abs(sun.sunset - (16 * 60 + 57)) <= 5);
  assert.equal(isDaylight(12 * 60, sun), true);
  assert.equal(isDaylight(5 * 60, sun), false);
  const calcutta = readClock(new Date("2026-11-10T06:00:00Z"), "Asia/Calcutta");
  assert.ok(sunTimes("Asia/Calcutta", calcutta.dayNumber, calcutta.offsetMinutes).sunrise > 0);
  const svalbard = readClock(new Date("2026-06-21T12:00:00Z"), "Arctic/Longyearbyen");
  assert.equal(sunTimes("Arctic/Longyearbyen", svalbard.dayNumber, svalbard.offsetMinutes).polar, "day");
  assert.equal(sunTimes("UTC", amsterdam.dayNumber, 0), null);
  assert.equal(formatClockMinutes(7 * 60 + 52, true), "07:52");
  assert.equal(formatClockMinutes(16 * 60 + 57, false), "4:57 PM");
  assert.equal(formatClockMinutes(0, false), "12:00 AM");
});
