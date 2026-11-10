# World Clock dashboard

Route: `/timers/world-clock/`.

The World Clock is an always-visible clock board, not a meeting planner. It follows the existing site's typography, neutral theme variables, square controls, and local-first behavior.

## Using the board

- **Add city** searches time zones available in the browser's `Intl` database. Search accepts city names, accent-insensitive text, or a valid IANA time zone such as `Asia/Kathmandu`. Arrow keys and Enter select a result. An optional display name can identify an office or teammate.
- **Edit clocks** reveals move-earlier/later, rename/change-zone, reference, and remove actions. Move buttons work with keyboard or touch; desktop drag-and-drop is also available. The normal board hides editing controls.
- Removing a clock or restoring default cities offers **Undo**. Undo restores the previous list, ordering, and reference clock. Subsequent list edits replace/dismiss that single undo snapshot.
- **Appearance** contains 12/24-hour time, seconds, dates, time differences, spacing, and reference-city selection. **Advanced layout** retains all previous column/mixed-row choices. Requested columns are reduced at narrow widths so full times remain readable.
- Default cities are the browser's local time zone, UTC, Amsterdam, Istanbul, and Tokyo, without duplicate zones. The local zone is resolved on mount, not from the static-build server.
- **Fullscreen** shows only the board. Escape exits through the browser's fullscreen behavior. Automatic layout balances both width and height instead of creating tall, narrow columns. Cards grow with their available width and screen height; large boards may still scroll.
- **Keep screen awake** is an opt-in, session-only Screen Wake Lock request. It requires a supporting browser and secure context. The setting reports Active/Paused, reacquires after returning to a visible tab, and releases on disable or component teardown. The browser/OS can refuse or release it (for example, to save battery).

## Time and date behavior

- Dates are always `YYYY-MM-DD`, with a weekday. Times default to 24-hour format; midnight is `00:00`, not `24:00`.
- Each card shows the actual UTC offset for the displayed instant, including DST and fractional offsets such as `UTC+05:45`. Offsets come from `Intl.DateTimeFormat(..., { timeZoneName: "longOffset" })`, not localized-string reparsing.
- Optional differences read “8h behind” or “2h 45m ahead” relative to the selected reference city. Yesterday/Tomorrow flags also compare against that city, not necessarily the viewer's local calendar date.
- Day/night (the phase label, dial arc, and day bar) uses sunrise/sunset estimated with the standard solar equations (about a minute of accuracy) for the zone's representative location from the tz database (`zone.tab`, plus legacy aliases), stored in `src/data/timezone-coordinates.ts`. This is the zone's reference city, not the viewer's position, so cities far from it within the same zone can differ by tens of minutes. Polar day/night is shown as Midnight sun / Polar night. Zones without a location (UTC, `Etc/GMT±N`) fall back to fixed 06:00–18:00 and say so in the hover text. Hovering either edge of the daylight band shows the sunrise/sunset time.
- Updates use the device's current clock. There is no external time synchronization or time-zone service; accuracy depends on the device clock and browser's time-zone database. Timers may be throttled in background tabs; returning to the tab refreshes the displayed time.

## Storage and compatibility

Settings use the existing `world-clock-settings` local-storage key. Previous clock lists, custom names, display preferences, and all old layout values are accepted. Malformed entries/invalid time zones are filtered and duplicate identifiers repaired; blocked/corrupt storage produces an explicit notice rather than crashing the board. Appearance preferences remain when restoring default cities.

No location permission, account, or external API is required. Wake locks are never persisted. All personal clock settings stay in the browser; the shared site still loads its normal application/font assets.

## Verification

- `pnpm test:world-clock` covers midnight/noon, ISO dates, DST transitions under multiple device zones, fractional offsets, date-line/year changes, multiword city names, search normalization, legacy/corrupt storage, and responsive column selection.
- Browser verification uses production Chromium on desktop/mobile and light/dark themes; it exercises search/keyboard selection, rename, reference changes, reorder, remove/reset/undo, persistence, and fullscreen. Wake-lock permission/visibility paths can be exercised with a browser API stub; this does not verify physical-device screen behavior.
- Existing archive/workbench/SEO tests must remain passing. This change does not modify other tools, navigation, or global theme tokens.

Implementation verification: production build and all 55 focused/existing tests passed (13 World Clock, 28 workbench, 12 archive, 2 SEO). A targeted Svelte/TypeScript check found zero errors or warnings in the two clock components and time helper. Production Chromium checks passed at 1440px desktop and 390/320/280px mobile widths, including normal and automatic fullscreen layouts, keyboard search, drag/drop, long labels, restored legacy settings, remove/reset/undo, and clock ticking. Wake-lock lifecycle and permission refusal were verified with an API stub, and storage recovery was tested by rejecting reads/writes of the tool's own key. Actual device sleep prevention, screen readers, and other browser engines were not verified. Browser screenshots and temporary QA scripts are under `/tmp/opencode/world-clock-review/dashboard/` and its parent directory.
