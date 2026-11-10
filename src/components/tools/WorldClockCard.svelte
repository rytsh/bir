<script lang="ts">
  import { ArrowLeft, ArrowRight, Moon, Pencil, Pin, Sun, Sunrise, Sunset, Trash2 } from "@lucide/svelte";
  import { formatClockMinutes, isDaylight, relativeClockDay, relativeClockTime, sunTimes, timezoneLabel, type ClockReading, type SunTimes, type WorldClock } from "../../lib/world-clock.ts";

  interface Props {
    clock: WorldClock;
    reading: ClockReading;
    reference: ClockReading;
    referenceLabel: string;
    isReference: boolean;
    isLocal: boolean;
    showSeconds: boolean;
    showDate: boolean;
    showDifference: boolean;
    editing: boolean;
    first: boolean;
    last: boolean;
    dragging: boolean;
    dropTarget: boolean;
    onedit: () => void;
    onremove: () => void;
    onmove: (direction: -1 | 1) => void;
    onreference: () => void;
    ondragstart: (event: DragEvent) => void;
    ondragover: (event: DragEvent) => void;
    ondrop: (event: DragEvent) => void;
    ondragend: () => void;
  }

  type DayPhase = "Morning" | "Afternoon" | "Evening" | "Night" | "Midnight sun" | "Polar night";

  let { clock, reading, reference, referenceLabel, isReference, isLocal, showSeconds, showDate, showDifference, editing, first, last, dragging, dropTarget, onedit, onremove, onmove, onreference, ondragstart, ondragover, ondrop, ondragend }: Props = $props();
  const use24Hour = $derived(!reading.period);
  const sun = $derived<SunTimes>(sunTimes(clock.timezone, reading.dayNumber, reading.offsetMinutes) ?? { sunrise: null, sunset: null, polar: null });
  const estimated = $derived(!sun.polar && sun.sunrise === null);
  const sunrise = $derived(sun.sunrise ?? 360);
  const sunset = $derived(sun.sunset ?? 1080);
  const daylight = $derived(isDaylight(reading.minuteOfDay, sun));
  const differentDay = $derived(reading.dayNumber - reference.dayNumber);
  const phase = $derived.by((): DayPhase => {
    if (sun.polar) return sun.polar === "day" ? "Midnight sun" : "Polar night";
    if (daylight) return reading.minuteOfDay < 720 ? "Morning" : "Afternoon";
    return reading.minuteOfDay >= sunset && reading.minuteOfDay < 1320 ? "Evening" : "Night";
  });
  const sunSource = $derived(estimated ? "No location for this time zone, so 06:00–18:00 is used." : `Sun times for ${timezoneLabel(clock.timezone)}, from the time zone's reference location.`);
  // 24-hour dial: midnight at the bottom, noon at the top.
  const dialAngle = $derived((reading.minuteOfDay / 1440) * 360 + 180);
  const dialPoint = (minutes: number): string => {
    const angle: number = (minutes / 1440) * 2 * Math.PI + Math.PI;
    return `${(50 + 42 * Math.sin(angle)).toFixed(2)} ${(50 - 42 * Math.cos(angle)).toFixed(2)}`;
  };
  const daylightSpan = $derived((sunset - sunrise + 1440) % 1440);
  const dialDay = $derived(`M ${dialPoint(sunrise)} A 42 42 0 ${daylightSpan > 720 ? 1 : 0} 1 ${dialPoint(sunset)}`);
  const dayProgress = $derived((reading.minuteOfDay / 1440) * 100);
  // Daylight can wrap past midnight in zones far from their reference meridian.
  const bands = $derived.by((): Array<[number, number]> => {
    if (sun.polar) return sun.polar === "day" ? [[0, 100]] : [];
    const start: number = sunrise / 14.4;
    const end: number = sunset / 14.4;
    return start < end ? [[start, end - start]] : [[0, end], [start, 100 - start]];
  });
  const dayBreaks = $derived(sun.polar ? [] : [
    { position: sunrise / 14.4, time: formatClockMinutes(sunrise, use24Hour), label: estimated ? "Day starts" : "Sunrise" },
    { position: sunset / 14.4, time: formatClockMinutes(sunset, use24Hour), label: estimated ? "Night starts" : "Sunset" },
  ]);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Drag is optional; labelled move buttons provide keyboard and touch reordering.) -->
<article class="clock-card" class:night={!daylight} class:reference={isReference} class:editing class:dragging class:drop-target={dropTarget} draggable={editing} {ondragstart} {ondragover} {ondrop} {ondragend} aria-label={`${clock.label} clock`}>
  <header class="clock-heading">
    <div class="clock-title">
      <h2 title={clock.label}>{clock.label}</h2>
      <div class="clock-zone" title={clock.timezone}>
        <span>{clock.timezone.replace(/_/g, " ")}</span>
        {#if isLocal}<span class="tag">Local</span>{/if}
        {#if isReference && showDifference}<span class="tag tag-strong"><Pin size={10} aria-hidden="true" /> Reference</span>{/if}
      </div>
    </div>
    <span class="day-indicator" title={`${phase}. ${sunSource}`}>
      {#if phase === "Morning"}<Sunrise size={15} aria-hidden="true" />{:else if phase === "Afternoon" || phase === "Midnight sun"}<Sun size={15} aria-hidden="true" />{:else if phase === "Evening"}<Sunset size={15} aria-hidden="true" />{:else}<Moon size={15} aria-hidden="true" />{/if}
      <span class="phase-label">{phase}</span>
    </span>
  </header>

  <div class="clock-face">
    <time aria-label={`${reading.time}${showSeconds ? `:${reading.seconds}` : ""} ${reading.period} ${reading.offset}`}>
      <span class="hours-minutes">{reading.time}</span>
      {#if showSeconds || reading.period}
        <span class="time-suffix">
          {#if reading.period}<span class="period">{reading.period}</span>{/if}
          {#if showSeconds}<span class="seconds">{reading.seconds}</span>{/if}
        </span>
      {/if}
    </time>
    <svg class="day-dial" viewBox="0 0 100 100" aria-hidden="true">
      <title>24-hour dial: noon at the top, midnight at the bottom. The darker arc marks daylight.</title>
      <circle class="dial-track" cx="50" cy="50" r="42" />
      {#if sun.polar === "day"}<circle class="dial-day" cx="50" cy="50" r="42" />{:else if !sun.polar}<path class="dial-day" d={dialDay} />{/if}
      {#each [0, 90, 180, 270] as angle}
        <line class="dial-tick" x1="50" y1="2" x2="50" y2="8" transform={`rotate(${angle} 50 50)`} />
      {/each}
      <g transform={`rotate(${dialAngle} 50 50)`}>
        <path class="dial-arrow" d="M 40 32 L 50 20 L 60 32" />
      </g>
    </svg>
  </div>

  <div class="day-track" aria-label={dayBreaks.length ? `${dayBreaks[0].label} ${dayBreaks[0].time}, ${dayBreaks[1].label} ${dayBreaks[1].time}` : phase} role="img" title={sun.polar ? `${phase}. ${sunSource}` : undefined}>
    {#each bands as [left, width]}<span class="day-band" style={`left: ${left}%; width: ${width}%;`}></span>{/each}
    {#each dayBreaks as point}
      <span class="day-break" style={`left: ${point.position}%;`}>
        <span class="day-break-tip" class:edge-start={point.position < 15} class:edge-end={point.position > 85}><strong>{point.time}</strong> {point.label}{#if estimated}<span class="tip-note">(no location)</span>{/if}</span>
      </span>
    {/each}
    <svg class="day-marker" style={`left: ${dayProgress}%;`} viewBox="0 0 12 8"><path d="M 1.5 7 L 6 2 L 10.5 7" /></svg>
  </div>

  <footer class="clock-footer">
    <div class="clock-calendar">
      {#if showDate}<span>{reading.weekday} <time datetime={reading.date}>{reading.date}</time></span>{/if}
      {#if differentDay !== 0}<span class="day-shift" title={`Date relative to ${referenceLabel}`}>{relativeClockDay(differentDay)}</span>{/if}
    </div>
    <div class="clock-offsets">
      <span class="utc-offset">{reading.offset}</span>
      {#if showDifference && !isReference}
        <span class="relative-time" title={`Compared to ${referenceLabel}`}>{relativeClockTime(reading.offsetMinutes - reference.offsetMinutes)}</span>
      {/if}
    </div>
  </footer>

  {#if editing}
    <div class="clock-actions" aria-label={`Manage ${clock.label}`}>
      <button type="button" title="Move earlier" aria-label={`Move ${clock.label} earlier`} disabled={first} onclick={() => onmove(-1)}><ArrowLeft size={17} /></button>
      <button type="button" title="Move later" aria-label={`Move ${clock.label} later`} disabled={last} onclick={() => onmove(1)}><ArrowRight size={17} /></button>
      <button type="button" title="Edit clock" aria-label={`Edit ${clock.label}`} onclick={onedit}><Pencil size={16} /></button>
      <button type="button" title={isReference ? "Reference clock" : "Use as reference"} aria-label={`Use ${clock.label} as reference`} aria-pressed={isReference} onclick={onreference}><Pin size={16} /></button>
      <button type="button" class="remove-clock" title="Remove clock" aria-label={`Remove ${clock.label}`} onclick={onremove}><Trash2 size={16} /></button>
    </div>
  {/if}
</article>

<style>
  .clock-card { position: relative; container-type: inline-size; display: flex; flex-direction: column; min-width: 0; padding: 1.25rem 1.4rem 1.1rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); color: var(--color-text); transition: border-color .15s ease; }
  .clock-card:hover { border-color: color-mix(in srgb, var(--color-border) 55%, var(--color-text-muted)); }
  .clock-card.reference::before { content: ""; position: absolute; inset: -1px -1px auto; height: 2px; background: var(--color-text); }
  .clock-card.editing { cursor: grab; }
  .clock-card.dragging { opacity: .4; }
  .clock-card.drop-target { outline: 2px solid var(--color-accent); outline-offset: -2px; }

  .clock-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .clock-title { min-width: 0; }
  h2 { margin: 0; font-size: 1.0625rem; line-height: 1.35; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .clock-zone { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .5rem; margin-top: .3rem; font-size: .75rem; line-height: 1.5; color: var(--color-text-muted); overflow-wrap: anywhere; }
  .tag { display: inline-flex; align-items: center; gap: .2rem; padding: 0 .35rem; border: 1px solid var(--color-border); font-size: .6875rem; line-height: 1.5; color: var(--color-text); }
  .tag-strong { border-color: var(--color-text); }
  .day-indicator { flex-shrink: 0; display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .5rem; border: 1px solid var(--color-border); font-size: .6875rem; line-height: 1.4; color: var(--color-text-muted); }

  .clock-face { display: flex; align-items: center; min-height: 6.5rem; padding-block: 1.25rem .9rem; }
  .clock-face > time { display: flex; align-items: flex-end; gap: .55rem; white-space: nowrap; font-variant-numeric: tabular-nums; font-family: var(--font-mono); line-height: 1; }
  .hours-minutes { font-size: min(4.75rem, 21cqi); font-weight: 500; letter-spacing: -.05em; }
  .time-suffix { display: flex; flex-direction: column; justify-content: flex-end; gap: .2rem; padding-bottom: .35em; font-size: min(1.5rem, 7cqi); }
  .seconds { color: var(--color-text-muted); font-weight: 400; letter-spacing: -.02em; }
  .period { font-family: var(--font-sans); font-size: .75rem; font-weight: 600; letter-spacing: .04em; }

  .day-dial { flex-shrink: 0; width: min(4.5rem, 18cqi); height: auto; margin-inline-start: auto; overflow: visible; }
  .dial-track { fill: none; stroke: color-mix(in srgb, var(--color-text) 12%, transparent); stroke-width: 5; }
  .dial-day { fill: none; stroke: color-mix(in srgb, var(--color-text) 35%, transparent); stroke-width: 5; }
  .dial-tick { stroke: var(--color-text-muted); stroke-width: 2; }
  .dial-arrow { fill: none; stroke: var(--color-text); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
  .day-track { position: relative; height: 4px; margin-block: .25rem 1.4rem; background: color-mix(in srgb, var(--color-text) 10%, transparent); }
  .day-band { position: absolute; inset-block: 0; background: color-mix(in srgb, var(--color-text) 28%, transparent); }
  .day-marker { position: absolute; top: 7px; width: 12px; height: 8px; overflow: visible; transform: translateX(-50%); }
  .day-marker path { fill: none; stroke: var(--color-text); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .day-break { position: absolute; top: 50%; z-index: 1; width: 20px; height: 20px; transform: translate(-50%, -50%); cursor: default; }
  .day-break::before { content: ""; position: absolute; left: 50%; top: 50%; width: 2px; height: 10px; background: var(--color-text-muted); transform: translate(-50%, -50%); opacity: 0; transition: opacity .12s ease; }
  .day-break-tip { position: absolute; bottom: calc(100% + 4px); left: 50%; display: flex; gap: .35rem; padding: .25rem .5rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); color: var(--color-text-muted); font-size: .6875rem; line-height: 1.4; white-space: nowrap; font-variant-numeric: tabular-nums; transform: translate(-50%, 4px); opacity: 0; pointer-events: none; transition: opacity .12s ease, transform .12s ease; }
  .day-break-tip strong { color: var(--color-text); font-weight: 600; }
  .day-break-tip.edge-start { left: 0; transform: translate(0, 4px); }
  .day-break-tip.edge-end { left: auto; right: 0; transform: translate(0, 4px); }
  .tip-note { opacity: .75; }
  .day-break:hover .day-break-tip.edge-start, .day-break:hover .day-break-tip.edge-end { transform: translate(0, 0); }
  .day-break:hover::before { opacity: 1; }
  .day-break:hover .day-break-tip { opacity: 1; transform: translate(-50%, 0); }

  .clock-footer { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: .35rem 1rem; margin-top: auto; font-size: .75rem; line-height: 1.5; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
  .clock-calendar, .clock-offsets { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .6rem; }
  .clock-offsets { justify-content: flex-end; margin-inline-start: auto; }
  .day-shift { padding: 0 .35rem; background: var(--color-text); color: var(--color-bg-alt); font-weight: 500; }
  .relative-time { color: var(--color-text); font-weight: 500; }

  .clock-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem; margin-top: 1rem; padding-top: .65rem; border-top: 1px solid var(--color-border); }
  .clock-actions button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--color-text-muted); cursor: pointer; }
  .clock-actions button:hover:not(:disabled), .clock-actions button[aria-pressed="true"] { color: var(--color-text); border-color: var(--color-border); background: var(--color-bg); }
  .clock-actions button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .clock-actions .remove-clock { margin-inline-start: auto; }
  .clock-actions .remove-clock:hover { color: var(--color-error-text); }
  .clock-actions button:disabled { opacity: .3; cursor: not-allowed; }

  :global(.clock-board.compact) .clock-card { padding: .95rem 1rem .85rem; }
  :global(.clock-board.compact) .clock-face { min-height: 5rem; padding-block: .85rem .65rem; }
  :global(.clock-board.compact) .hours-minutes { font-size: min(3.5rem, 20cqi); }
  :global(.clock-board.compact) .day-dial { width: min(3.5rem, 16cqi); }
  :global(.clock-board.compact) .day-track { margin-bottom: 1.15rem; }

  :global(.clock-board.fullscreen) .clock-card { justify-content: space-between; }
  :global(.clock-board.fullscreen) .clock-face { flex: 1; }
  :global(.clock-board.fullscreen) h2 { font-size: 1.35rem; }
  :global(.clock-board.fullscreen) .clock-zone { font-size: .875rem; }
  :global(.clock-board.fullscreen) .clock-footer { font-size: .9375rem; }
  :global(.clock-board.fullscreen) .hours-minutes { font-size: min(8rem, 21cqi, 20vh); }
  :global(.clock-board.fullscreen) .time-suffix { font-size: min(2.5rem, 8cqi, 6vh); }
  :global(.clock-board.fullscreen) .day-dial { width: min(7rem, 18cqi, 16vh); }

  @container (max-width: 260px) {
    .phase-label { display: none; }
  }
  @media (max-width: 480px) {
    .clock-card { padding: 1.05rem 1.1rem 1rem; }
  }
</style>
