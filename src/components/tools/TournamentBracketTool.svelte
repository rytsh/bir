<script lang="ts">
  import { random } from "../../lib/random";

  type Format = "single" | "double" | "round-robin";

  interface Match {
    id: string;
    round: number;
    matchInRound: number;
    p1: string | null;
    p2: string | null;
    score1: number | null;
    score2: number | null;
    winner: string | null;
  }

  let participantsText = $state("Alice\nBob\nCharlie\nDana\nErin\nFrank\nGrace\nHenry");
  let format = $state<Format>("single");
  let seed = $state<"order" | "random">("order");
  let matches = $state<Match[]>([]);
  let rrSchedule = $state<Match[][]>([]); // round-robin: rounds of matches
  let standings = $state<{ name: string; w: number; l: number; pts: number }[]>([]);

  function getParticipants(): string[] {
    return participantsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  function generate() {
    let players = getParticipants();
    if (players.length < 2) {
      matches = [];
      rrSchedule = [];
      standings = [];
      return;
    }
    if (seed === "random") {
      players = [...players];
      for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
      }
    }

    if (format === "single" || format === "double") {
      generateSingle(players);
      // Double-elim losers bracket is intentionally minimal (skipped here):
      // we still show the winners bracket; double-elim full implementation
      // requires extensive UI which is out of scope for now.
    } else {
      generateRoundRobin(players);
    }
  }

  function generateSingle(players: string[]) {
    const size = nextPow2(players.length);
    const slotted: (string | null)[] = [...players];
    while (slotted.length < size) slotted.push(null); // BYEs

    const newMatches: Match[] = [];
    const round1: Match[] = [];
    for (let i = 0; i < size; i += 2) {
      const m: Match = {
        id: `r1-m${i / 2}`,
        round: 1,
        matchInRound: i / 2,
        p1: slotted[i],
        p2: slotted[i + 1],
        score1: null,
        score2: null,
        winner: null,
      };
      // Auto-advance BYEs
      if (m.p1 && !m.p2) m.winner = m.p1;
      else if (!m.p1 && m.p2) m.winner = m.p2;
      round1.push(m);
    }
    newMatches.push(...round1);

    let prev = round1;
    let r = 2;
    while (prev.length > 1) {
      const next: Match[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        const m: Match = {
          id: `r${r}-m${i / 2}`,
          round: r,
          matchInRound: i / 2,
          p1: prev[i].winner,
          p2: prev[i + 1].winner,
          score1: null,
          score2: null,
          winner: null,
        };
        next.push(m);
      }
      newMatches.push(...next);
      prev = next;
      r++;
    }
    matches = newMatches;
    rrSchedule = [];
  }

  function generateRoundRobin(players: string[]) {
    const list = [...players];
    if (list.length % 2 === 1) list.push("BYE");
    const n = list.length;
    const rounds: Match[][] = [];
    const arr = [...list];
    for (let r = 0; r < n - 1; r++) {
      const round: Match[] = [];
      for (let i = 0; i < n / 2; i++) {
        const p1 = arr[i];
        const p2 = arr[n - 1 - i];
        if (p1 !== "BYE" && p2 !== "BYE") {
          round.push({
            id: `rr-r${r}-m${i}`,
            round: r + 1,
            matchInRound: i,
            p1,
            p2,
            score1: null,
            score2: null,
            winner: null,
          });
        }
      }
      rounds.push(round);
      // rotate (keep first fixed)
      arr.splice(1, 0, arr.pop()!);
    }
    rrSchedule = rounds;
    matches = [];
    recomputeStandings();
  }

  function setScore(m: Match, s1: string, s2: string) {
    const n1 = s1 === "" ? null : parseInt(s1, 10);
    const n2 = s2 === "" ? null : parseInt(s2, 10);
    m.score1 = Number.isFinite(n1 as number) ? (n1 as number) : null;
    m.score2 = Number.isFinite(n2 as number) ? (n2 as number) : null;
    if (m.score1 !== null && m.score2 !== null && m.score1 !== m.score2) {
      m.winner = m.score1 > m.score2 ? m.p1 : m.p2;
    } else {
      m.winner = null;
    }
    if (format === "round-robin") {
      rrSchedule = [...rrSchedule]; // trigger update
      recomputeStandings();
    } else {
      // Cascade: clear downstream and re-fill p1/p2 of next round
      cascadeWinners();
      matches = [...matches];
    }
  }

  function pickWinner(m: Match, who: 1 | 2) {
    m.winner = who === 1 ? m.p1 : m.p2;
    if (format === "round-robin") {
      // round-robin: winner without score still increments W
      rrSchedule = [...rrSchedule];
      recomputeStandings();
    } else {
      cascadeWinners();
      matches = [...matches];
    }
  }

  function cascadeWinners() {
    // For single-elim: parent of round r match i is round r+1 match floor(i/2),
    // populating p1 if i even else p2.
    const byRound = new Map<number, Match[]>();
    for (const m of matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    const rounds = [...byRound.keys()].sort((a, b) => a - b);
    for (const r of rounds) {
      const cur = byRound.get(r)!.sort((a, b) => a.matchInRound - b.matchInRound);
      const next = byRound.get(r + 1);
      if (!next) continue;
      next.sort((a, b) => a.matchInRound - b.matchInRound);
      for (let i = 0; i < cur.length; i++) {
        const parent = cur[i];
        const childIdx = Math.floor(i / 2);
        const child = next[childIdx];
        if (!child) continue;
        if (i % 2 === 0) child.p1 = parent.winner;
        else child.p2 = parent.winner;
        // Reset child winner if its inputs changed
        if (child.score1 === null && child.score2 === null) child.winner = null;
      }
    }
  }

  function recomputeStandings() {
    const tally: Record<string, { w: number; l: number; pts: number }> = {};
    for (const round of rrSchedule) {
      for (const m of round) {
        if (!m.p1 || !m.p2) continue;
        tally[m.p1] = tally[m.p1] ?? { w: 0, l: 0, pts: 0 };
        tally[m.p2] = tally[m.p2] ?? { w: 0, l: 0, pts: 0 };
        if (m.winner === m.p1) {
          tally[m.p1].w++;
          tally[m.p2].l++;
          tally[m.p1].pts += 3;
        } else if (m.winner === m.p2) {
          tally[m.p2].w++;
          tally[m.p1].l++;
          tally[m.p2].pts += 3;
        }
      }
    }
    standings = Object.entries(tally)
      .map(([name, t]) => ({ name, ...t }))
      .sort((a, b) => b.pts - a.pts || b.w - a.w || a.name.localeCompare(b.name));
  }

  function reset() {
    matches = [];
    rrSchedule = [];
    standings = [];
  }

  // Bracket grouping for rendering
  let rounds = $derived.by(() => {
    if (matches.length === 0) return [];
    const map = new Map<number, Match[]>();
    for (const m of matches) {
      const arr = map.get(m.round) ?? [];
      arr.push(m);
      map.set(m.round, arr);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([r, ms]) => ({ round: r, matches: ms.sort((a, b) => a.matchInRound - b.matchInRound) }));
  });

  function roundLabel(r: number, total: number): string {
    if (r === total) return "Final";
    if (r === total - 1) return "Semifinal";
    if (r === total - 2) return "Quarterfinal";
    return `Round ${r}`;
  }

  // -------- Layout for single-elim bracket with connector lines --------
  const MATCH_W = 220;
  const MATCH_H = 60;
  const COL_GAP = 56; // horizontal space between rounds (where lines live)
  const COL_W = MATCH_W + COL_GAP;
  const LABEL_H = 28;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;
  const ROW_GAP = 24; // vertical gap between round-1 matches

  interface PositionedMatch {
    match: Match;
    x: number;
    y: number;
    cy: number;
  }

  let bracketLayout = $derived.by(() => {
    if (rounds.length === 0) return null;
    const round1Count = rounds[0].matches.length;
    // Position round 1 evenly
    const positions: PositionedMatch[][] = [];
    const round1: PositionedMatch[] = rounds[0].matches.map((m, i) => {
      const y = PAD_TOP + LABEL_H + i * (MATCH_H + ROW_GAP);
      return { match: m, x: 0, y, cy: y + MATCH_H / 2 };
    });
    positions.push(round1);

    // Each subsequent round: center between parent matches
    for (let r = 1; r < rounds.length; r++) {
      const prev = positions[r - 1];
      const cur: PositionedMatch[] = rounds[r].matches.map((m, i) => {
        const p1 = prev[i * 2];
        const p2 = prev[i * 2 + 1];
        const cy = p1 && p2 ? (p1.cy + p2.cy) / 2 : (p1?.cy ?? PAD_TOP + LABEL_H + MATCH_H / 2);
        return { match: m, x: r * COL_W, y: cy - MATCH_H / 2, cy };
      });
      positions.push(cur);
    }

    const totalW = rounds.length * COL_W - COL_GAP + MATCH_W;
    const lastRow = positions[0][positions[0].length - 1];
    const totalH = (lastRow ? lastRow.y + MATCH_H : 200) + PAD_BOTTOM;

    // Connectors: from each match in round r to its parent in round r+1
    interface Connector {
      x1: number; y1: number; x2: number; y2: number; midX: number;
    }
    const connectors: Connector[] = [];
    for (let r = 0; r < positions.length - 1; r++) {
      const cur = positions[r];
      const next = positions[r + 1];
      for (let i = 0; i < cur.length; i++) {
        const child = cur[i];
        const parentIdx = Math.floor(i / 2);
        const parent = next[parentIdx];
        if (!parent) continue;
        const x1 = child.x + MATCH_W;
        const y1 = child.cy;
        const x2 = parent.x;
        const y2 = parent.cy;
        const midX = (x1 + x2) / 2;
        connectors.push({ x1, y1, x2, y2, midX });
      }
    }

    return { positions, connectors, totalW, totalH };
  });
</script>

<div class="flex-1 flex flex-col bg-(--color-bg) text-(--color-text) overflow-hidden">
  <div class="p-4 border-b border-(--color-border) bg-(--color-bg-alt) flex flex-wrap gap-3 items-end">
    <div class="flex-1 min-w-[240px]">
      <label for="players" class="block text-xs text-(--color-text-light) mb-1">Participants (one per line)</label>
      <textarea
        id="players"
        bind:value={participantsText}
        rows="4"
        class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono"
      ></textarea>
    </div>
    <div>
      <label for="format" class="block text-xs text-(--color-text-light) mb-1">Format</label>
      <select id="format" bind:value={format} class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm">
        <option value="single">Single elimination</option>
        <option value="double">Double elimination (winners bracket)</option>
        <option value="round-robin">Round-robin</option>
      </select>
    </div>
    <div>
      <label for="seed" class="block text-xs text-(--color-text-light) mb-1">Seeding</label>
      <select id="seed" bind:value={seed} class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm">
        <option value="order">As entered</option>
        <option value="random">Random</option>
      </select>
    </div>
    <div class="flex gap-2">
      <button onclick={generate} class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Generate</button>
      <button onclick={reset} class="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-bg)">Reset</button>
    </div>
  </div>

  <div class="flex-1 overflow-auto p-4">
    {#if matches.length === 0 && rrSchedule.length === 0}
      <div class="text-center text-sm text-(--color-text-light) mt-8">
        Add participants and click Generate to build a bracket.
      </div>
    {/if}

    {#if matches.length > 0 && bracketLayout}
      <!-- Single elimination bracket with SVG connectors -->
      <div class="overflow-auto">
        <div
          class="relative"
          style="width: {bracketLayout.totalW}px; height: {bracketLayout.totalH}px;"
        >
          <!-- Round labels -->
          {#each rounds as r, ri}
            <div
              class="absolute text-xs font-medium text-(--color-text-light) uppercase tracking-wider"
              style="left: {ri * COL_W}px; top: 0; width: {MATCH_W}px;"
            >
              {roundLabel(r.round, rounds.length)}
            </div>
          {/each}

          <!-- Connector lines (SVG layer behind matches) -->
          <svg
            class="absolute inset-0 pointer-events-none"
            width={bracketLayout.totalW}
            height={bracketLayout.totalH}
          >
            {#each bracketLayout.connectors as c}
              <!-- Horizontal out from child, vertical to mid, horizontal into parent -->
              <path
                d="M {c.x1} {c.y1} L {c.midX} {c.y1} L {c.midX} {c.y2} L {c.x2} {c.y2}"
                stroke="var(--color-border)"
                stroke-width="1.5"
                fill="none"
              />
            {/each}
          </svg>

          <!-- Match boxes -->
          {#each bracketLayout.positions as col}
            {#each col as pm}
              {@const m = pm.match}
              <div
                class="absolute border border-(--color-border) bg-(--color-bg-alt) shadow-sm flex flex-col overflow-hidden"
                style="left: {pm.x}px; top: {pm.y}px; width: {MATCH_W}px; height: {MATCH_H}px;"
              >
                <div class="flex flex-1 min-h-0 border-b border-(--color-border) {m.winner === m.p1 ? 'bg-green-500/15' : ''}">
                  <button
                    onclick={() => m.p1 && pickWinner(m, 1)}
                    disabled={!m.p1 || !m.p2}
                    class="flex-1 min-w-0 px-2 text-sm text-left truncate hover:bg-(--color-bg) disabled:opacity-50 {m.winner === m.p1 ? 'font-semibold' : ''}"
                  >{m.p1 ?? "—"}</button>
                  <input
                    type="number"
                    value={m.score1 ?? ""}
                    oninput={(e) => setScore(m, (e.target as HTMLInputElement).value, m.score2?.toString() ?? "")}
                    class="w-10 px-1 text-xs text-center bg-(--color-bg) border-l border-(--color-border) self-stretch"
                  />
                </div>
                <div class="flex flex-1 min-h-0 {m.winner === m.p2 ? 'bg-green-500/15' : ''}">
                  <button
                    onclick={() => m.p2 && pickWinner(m, 2)}
                    disabled={!m.p1 || !m.p2}
                    class="flex-1 min-w-0 px-2 text-sm text-left truncate hover:bg-(--color-bg) disabled:opacity-50 {m.winner === m.p2 ? 'font-semibold' : ''}"
                  >{m.p2 ?? "—"}</button>
                  <input
                    type="number"
                    value={m.score2 ?? ""}
                    oninput={(e) => setScore(m, m.score1?.toString() ?? "", (e.target as HTMLInputElement).value)}
                    class="w-10 px-1 text-xs text-center bg-(--color-bg) border-l border-(--color-border) self-stretch"
                  />
                </div>
              </div>
            {/each}
          {/each}
        </div>
      </div>

      {#if format === "double"}
        <p class="text-xs text-(--color-text-light) mt-6">
          Note: double-elimination losers bracket is not yet implemented. Currently only the winners
          bracket is shown.
        </p>
      {/if}
    {/if}

    {#if rrSchedule.length > 0}
      <!-- Round-robin -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          {#each rrSchedule as round, idx}
            <div class="border border-(--color-border) bg-(--color-bg-alt)">
              <div class="px-3 py-2 border-b border-(--color-border) text-xs font-medium uppercase tracking-wider">
                Round {idx + 1}
              </div>
              <div class="divide-y divide-(--color-border)">
                {#each round as m}
                  <div class="flex items-center gap-2 px-3 py-2">
                    <button
                      onclick={() => m.p1 && pickWinner(m, 1)}
                      class="flex-1 text-sm text-right hover:underline truncate {m.winner === m.p1 ? 'font-bold text-green-500' : ''}"
                    >{m.p1}</button>
                    <input
                      type="number"
                      value={m.score1 ?? ""}
                      oninput={(e) => setScore(m, (e.target as HTMLInputElement).value, m.score2?.toString() ?? "")}
                      class="w-10 px-1 py-1 text-xs text-center bg-(--color-bg) border border-(--color-border)"
                    />
                    <span class="text-xs text-(--color-text-light)">vs</span>
                    <input
                      type="number"
                      value={m.score2 ?? ""}
                      oninput={(e) => setScore(m, m.score1?.toString() ?? "", (e.target as HTMLInputElement).value)}
                      class="w-10 px-1 py-1 text-xs text-center bg-(--color-bg) border border-(--color-border)"
                    />
                    <button
                      onclick={() => m.p2 && pickWinner(m, 2)}
                      class="flex-1 text-sm text-left hover:underline truncate {m.winner === m.p2 ? 'font-bold text-green-500' : ''}"
                    >{m.p2}</button>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <!-- Standings -->
        <div class="border border-(--color-border) bg-(--color-bg-alt) self-start sticky top-0">
          <div class="px-3 py-2 border-b border-(--color-border) text-xs font-medium uppercase tracking-wider">
            Standings
          </div>
          <table class="w-full text-sm">
            <thead class="text-xs text-(--color-text-light) bg-(--color-bg)">
              <tr>
                <th class="text-left px-3 py-1">#</th>
                <th class="text-left px-3 py-1">Name</th>
                <th class="text-right px-3 py-1">W</th>
                <th class="text-right px-3 py-1">L</th>
                <th class="text-right px-3 py-1">Pts</th>
              </tr>
            </thead>
            <tbody>
              {#each standings as s, i}
                <tr class="border-t border-(--color-border)">
                  <td class="px-3 py-1 text-(--color-text-light)">{i + 1}</td>
                  <td class="px-3 py-1">{s.name}</td>
                  <td class="px-3 py-1 text-right font-mono">{s.w}</td>
                  <td class="px-3 py-1 text-right font-mono">{s.l}</td>
                  <td class="px-3 py-1 text-right font-mono font-bold">{s.pts}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>
