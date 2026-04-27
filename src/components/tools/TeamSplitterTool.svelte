<script lang="ts">
  // Seedable PRNG (mulberry32) so the same seed reproduces the same split.
  function mulberry32(seed: number) {
    let s = seed;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  interface Participant {
    id: string;
    name: string;
    weight: number;
    locked: boolean;
    lockedTeam: number | null;
  }

  interface Team {
    members: Participant[];
    color: string;
    name: string;
  }

  type Mode = "fixed-teams" | "fixed-size";

  // Inputs
  let participantsInput = $state(
    "Alice\nBob\nCharlie\nDavid\nEva\nFrank\nGrace\nHenry\nIris\nJack | 2\nKate\nLeo",
  );
  let mode = $state<Mode>("fixed-teams");
  let numTeams = $state(3);
  let teamSize = $state(4);
  let balanceByWeight = $state(false);
  let seedInput = $state("");
  let useSeed = $state(false);

  // Keep-together / keep-apart pairs (one per line, "name1, name2")
  let keepTogetherInput = $state("");
  let keepApartInput = $state("");

  // Team naming
  let useTeamNames = $state(true);
  const adjectives = [
    "Mighty", "Brave", "Swift", "Silent", "Fierce", "Bold", "Cosmic", "Stealthy",
    "Electric", "Crimson", "Golden", "Shadow", "Iron", "Wild", "Lucky", "Royal",
    "Frozen", "Blazing", "Mystic", "Thunder",
  ];
  const animals = [
    "Tigers", "Eagles", "Wolves", "Sharks", "Dragons", "Falcons", "Lions", "Panthers",
    "Hawks", "Foxes", "Cobras", "Bears", "Phoenixes", "Ravens", "Vipers", "Stallions",
    "Otters", "Owls", "Pumas", "Jaguars",
  ];
  const teamColors = [
    "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899",
    "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#a855f7", "#f43f5e",
  ];

  // Parsed participants
  const participants = $derived.by<Participant[]>(() => {
    return participantsInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, idx) => {
        // Format: "name | weight"
        const parts = line.split("|").map((p) => p.trim());
        const name = parts[0];
        const weight = parts[1] ? Math.max(0.01, parseFloat(parts[1]) || 1) : 1;
        return {
          id: `${idx}-${name}`,
          name,
          weight,
          locked: false,
          lockedTeam: null,
        };
      });
  });

  function parsePairs(input: string): [string, string][] {
    return input
      .split("\n")
      .map((line) => line.trim())
      .filter((l) => l.length > 0)
      .map((l) => {
        const parts = l.split(/[,|;]/).map((p) => p.trim());
        return [parts[0] || "", parts[1] || ""] as [string, string];
      })
      .filter(([a, b]) => a && b);
  }

  const keepTogetherPairs = $derived(parsePairs(keepTogetherInput));
  const keepApartPairs = $derived(parsePairs(keepApartInput));

  // Computed teams
  let teams = $state<Team[]>([]);
  let lockedAssignments = $state<Map<string, number>>(new Map());

  function shuffle<T>(arr: T[], rng: () => number): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateTeams() {
    const pps = participants;
    if (pps.length === 0) {
      teams = [];
      return;
    }

    // Determine number of teams
    let k: number;
    if (mode === "fixed-teams") {
      k = Math.max(1, Math.min(numTeams, pps.length));
    } else {
      const size = Math.max(1, teamSize);
      k = Math.max(1, Math.ceil(pps.length / size));
    }

    // Seed
    const seedValue = useSeed && seedInput.trim()
      ? hashString(seedInput.trim())
      : Math.floor(Math.random() * 0xffffffff);
    const rng = mulberry32(seedValue);

    // Group participants into "lumps" via keep-together (union-find)
    const idIndex = new Map<string, number>();
    pps.forEach((p, i) => {
      idIndex.set(p.name.toLowerCase(), i);
    });
    const parent = pps.map((_, i) => i);
    const find = (i: number): number => {
      if (parent[i] !== i) parent[i] = find(parent[i]);
      return parent[i];
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (const [a, b] of keepTogetherPairs) {
      const ia = idIndex.get(a.toLowerCase());
      const ib = idIndex.get(b.toLowerCase());
      if (ia !== undefined && ib !== undefined) union(ia, ib);
    }
    const groups = new Map<number, Participant[]>();
    pps.forEach((p, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(p);
    });

    // keep-apart: build a forbidden set per name
    const forbidden = new Map<string, Set<string>>();
    for (const [a, b] of keepApartPairs) {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      if (!forbidden.has(al)) forbidden.set(al, new Set());
      if (!forbidden.has(bl)) forbidden.set(bl, new Set());
      forbidden.get(al)!.add(bl);
      forbidden.get(bl)!.add(al);
    }

    // Pre-assign locked
    const teamArr: Participant[][] = Array.from({ length: k }, () => []);
    const lumps: Participant[][] = [...groups.values()];

    // Apply existing lock state to lumps that contain a locked person — pin lump to that team
    const lockedLumps = new Map<number, number>(); // lump-idx -> team-idx
    lumps.forEach((lump, li) => {
      for (const p of lump) {
        const t = lockedAssignments.get(p.id);
        if (t !== undefined && t < k) {
          lockedLumps.set(li, t);
          break;
        }
      }
    });

    // Place locked lumps first
    const remaining: { lump: Participant[]; weight: number }[] = [];
    lumps.forEach((lump, li) => {
      const w = lump.reduce((s, p) => s + p.weight, 0);
      const lt = lockedLumps.get(li);
      if (lt !== undefined) {
        teamArr[lt].push(...lump);
      } else {
        remaining.push({ lump, weight: w });
      }
    });

    // Sort remaining lumps by weight desc (greedy LPT for balance) or shuffle
    if (balanceByWeight) {
      remaining.sort((a, b) => b.weight - a.weight);
    } else {
      // Random shuffle
      const shuffled = shuffle(remaining, rng);
      remaining.length = 0;
      remaining.push(...shuffled);
    }

    // Greedy assign each lump to the team with the smallest current weight,
    // skipping teams that violate keep-apart, with multi-attempt fallback.
    const teamWeight = (idx: number) =>
      teamArr[idx].reduce((s, p) => s + p.weight, 0);

    function violatesKeepApart(lump: Participant[], teamIdx: number): boolean {
      const team = teamArr[teamIdx];
      for (const p of lump) {
        const f = forbidden.get(p.name.toLowerCase());
        if (!f) continue;
        for (const q of team) {
          if (f.has(q.name.toLowerCase())) return true;
        }
      }
      return false;
    }

    for (const { lump } of remaining) {
      // Order team indices by ascending weight (or size, in random mode)
      let order = Array.from({ length: k }, (_, i) => i);
      if (balanceByWeight) {
        order.sort((a, b) => teamWeight(a) - teamWeight(b));
      } else if (mode === "fixed-size") {
        order.sort((a, b) => teamArr[a].length - teamArr[b].length);
      } else {
        // round-robin-ish: pick smallest team, shuffle ties
        order = shuffle(order, rng).sort(
          (a, b) => teamArr[a].length - teamArr[b].length,
        );
      }

      let placed = false;
      for (const ti of order) {
        if (mode === "fixed-size" && teamArr[ti].length + lump.length > teamSize) continue;
        if (violatesKeepApart(lump, ti)) continue;
        teamArr[ti].push(...lump);
        placed = true;
        break;
      }
      if (!placed) {
        // Fallback: place in least loaded ignoring keep-apart constraint
        const ti = order[0];
        teamArr[ti].push(...lump);
      }
    }

    teams = teamArr.map((members, i) => ({
      members,
      color: teamColors[i % teamColors.length],
      name: useTeamNames
        ? `${adjectives[Math.floor(rng() * adjectives.length)]} ${animals[Math.floor(rng() * animals.length)]}`
        : `Team ${i + 1}`,
    }));
  }

  function reshuffleUnlocked() {
    // Save lock state for everyone currently in a team
    const newLocks = new Map<string, number>();
    teams.forEach((team, ti) => {
      for (const m of team.members) {
        if (lockedAssignments.has(m.id)) {
          newLocks.set(m.id, ti);
        }
      }
    });
    lockedAssignments = newLocks;
    generateTeams();
  }

  function clearLocks() {
    lockedAssignments = new Map();
    generateTeams();
  }

  function toggleLock(participantId: string, teamIdx: number) {
    const m = new Map(lockedAssignments);
    if (m.has(participantId)) {
      m.delete(participantId);
    } else {
      m.set(participantId, teamIdx);
    }
    lockedAssignments = m;
  }

  // Auto-regenerate when key inputs change (but not when locks toggle)
  $effect(() => {
    void participantsInput;
    void mode;
    void numTeams;
    void teamSize;
    void balanceByWeight;
    void useSeed;
    void seedInput;
    void useTeamNames;
    void keepTogetherInput;
    void keepApartInput;
    generateTeams();
  });

  // Stats
  const teamStats = $derived(
    teams.map((t) => ({
      count: t.members.length,
      weight: t.members.reduce((s, p) => s + p.weight, 0),
    })),
  );
  const totalCount = $derived(participants.length);
  const totalWeight = $derived(
    participants.reduce((s, p) => s + p.weight, 0),
  );

  // Export
  let copied = $state(false);

  function exportText(): string {
    return teams
      .map(
        (t) =>
          `${t.name} (${t.members.length}${balanceByWeight ? `, weight ${t.members.reduce((s, p) => s + p.weight, 0).toFixed(1)}` : ""}):\n` +
          t.members.map((m) => `  - ${m.name}${m.weight !== 1 ? ` (${m.weight})` : ""}`).join("\n"),
      )
      .join("\n\n");
  }

  function exportCSV(): string {
    const rows = ["team,name,weight"];
    teams.forEach((t) => {
      t.members.forEach((m) => {
        rows.push(`"${t.name}","${m.name}",${m.weight}`);
      });
    });
    return rows.join("\n");
  }

  function exportJSON(): string {
    return JSON.stringify(
      teams.map((t) => ({
        name: t.name,
        color: t.color,
        members: t.members.map((m) => ({ name: m.name, weight: m.weight })),
      })),
      null,
      2,
    );
  }

  function copyExport(format: "text" | "csv" | "json") {
    const data = format === "text" ? exportText() : format === "csv" ? exportCSV() : exportJSON();
    navigator.clipboard.writeText(data);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1500);
  }

  function downloadExport(format: "text" | "csv" | "json") {
    const data = format === "text" ? exportText() : format === "csv" ? exportCSV() : exportJSON();
    const ext = format === "text" ? "txt" : format;
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain";
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teams.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Split a list of participants into balanced random teams. Use <code class="px-1 bg-(--color-bg-alt)">name | weight</code> for skill weighting.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
    <!-- Left: configuration -->
    <div class="lg:w-96 flex flex-col gap-3 overflow-auto">
      <!-- Participants -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Participants ({totalCount})</span>
          {#if balanceByWeight}
            <span class="text-xs text-(--color-text-muted)">Total weight: {totalWeight.toFixed(1)}</span>
          {/if}
        </div>
        <textarea
          bind:value={participantsInput}
          placeholder="One name per line, or 'name | weight'"
          rows="10"
          class="w-full px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none resize-y"
        ></textarea>
      </div>

      <!-- Mode -->
      <div>
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-2">Mode</span>
        <div class="flex gap-1">
          <button
            onclick={() => (mode = "fixed-teams")}
            class="flex-1 px-3 py-1.5 text-sm border transition-colors {mode === 'fixed-teams'
              ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
              : 'bg-(--color-bg-alt) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            Fixed teams
          </button>
          <button
            onclick={() => (mode = "fixed-size")}
            class="flex-1 px-3 py-1.5 text-sm border transition-colors {mode === 'fixed-size'
              ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
              : 'bg-(--color-bg-alt) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            Fixed team size
          </button>
        </div>
        <div class="mt-2">
          {#if mode === "fixed-teams"}
            <label class="text-sm text-(--color-text-muted) flex items-center gap-2">
              Number of teams:
              <input
                type="number"
                min="1"
                max="50"
                bind:value={numTeams}
                class="w-20 px-2 py-1 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none"
              />
            </label>
          {:else}
            <label class="text-sm text-(--color-text-muted) flex items-center gap-2">
              Players per team:
              <input
                type="number"
                min="1"
                max="50"
                bind:value={teamSize}
                class="w-20 px-2 py-1 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none"
              />
            </label>
          {/if}
        </div>
      </div>

      <!-- Options -->
      <div>
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-2">Options</span>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm text-(--color-text) flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={balanceByWeight} class="cursor-pointer" />
            Balance by weight (LPT greedy)
          </label>
          <label class="text-sm text-(--color-text) flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={useTeamNames} class="cursor-pointer" />
            Generate team names
          </label>
          <label class="text-sm text-(--color-text) flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={useSeed} class="cursor-pointer" />
            Use seed (reproducible)
          </label>
          {#if useSeed}
            <input
              type="text"
              bind:value={seedInput}
              placeholder="any seed string"
              class="w-full px-2 py-1 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none"
            />
          {/if}
        </div>
      </div>

      <!-- Constraints -->
      <details class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        <summary class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium cursor-pointer">
          Constraints (optional)
        </summary>
        <div class="mt-3 flex flex-col gap-3">
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">
              Keep together (one pair per line, comma-separated)
            </label>
            <textarea
              bind:value={keepTogetherInput}
              placeholder="Alice, Bob"
              rows="2"
              class="w-full px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
            ></textarea>
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Keep apart</label>
            <textarea
              bind:value={keepApartInput}
              placeholder="Charlie, David"
              rows="2"
              class="w-full px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
            ></textarea>
          </div>
        </div>
      </details>

      <!-- Actions -->
      <div class="flex flex-wrap gap-2">
        <button
          onclick={reshuffleUnlocked}
          class="flex-1 px-3 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
        >
          Reshuffle
        </button>
        {#if lockedAssignments.size > 0}
          <button
            onclick={clearLocks}
            class="px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) text-sm hover:text-(--color-text) transition-colors"
          >
            Clear locks ({lockedAssignments.size})
          </button>
        {/if}
      </div>
    </div>

    <!-- Right: teams -->
    <div class="flex-1 flex flex-col gap-3 overflow-auto min-h-0">
      <!-- Export bar -->
      {#if teams.length > 0}
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <span class="text-xs text-(--color-text-muted)">
            {teams.length} team{teams.length !== 1 ? "s" : ""} · click a name to lock/unlock
          </span>
          <div class="flex gap-1">
            {#each ["text", "csv", "json"] as fmt}
              <button
                onclick={() => copyExport(fmt as "text" | "csv" | "json")}
                class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Copy {fmt.toUpperCase()}
              </button>
              <button
                onclick={() => downloadExport(fmt as "text" | "csv" | "json")}
                class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                ⬇
              </button>
            {/each}
          </div>
        </div>
        {#if copied}
          <div class="text-xs text-(--color-text-muted)">Copied!</div>
        {/if}
      {/if}

      <!-- Team grid -->
      <div class="flex-1 grid gap-3 overflow-auto" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
        {#each teams as team, ti}
          <div class="flex flex-col bg-(--color-bg-alt) border border-(--color-border)" style="border-top: 4px solid {team.color};">
            <div class="px-3 py-2 border-b border-(--color-border) flex items-center justify-between">
              <span class="text-sm font-medium text-(--color-text)">{team.name}</span>
              <span class="text-xs text-(--color-text-muted)">
                {teamStats[ti]?.count ?? 0}{balanceByWeight ? ` · ${(teamStats[ti]?.weight ?? 0).toFixed(1)}` : ""}
              </span>
            </div>
            <div class="flex-1 p-2 flex flex-col gap-1">
              {#each team.members as m}
                <button
                  onclick={() => toggleLock(m.id, ti)}
                  class="px-2 py-1 text-sm text-left flex items-center justify-between gap-2 transition-colors {lockedAssignments.has(m.id)
                    ? 'bg-(--color-bg) border border-(--color-text-light) text-(--color-text)'
                    : 'border border-transparent text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)'}"
                  title={lockedAssignments.has(m.id) ? "Locked — click to unlock" : "Click to lock to this team"}
                >
                  <span>
                    {#if lockedAssignments.has(m.id)}🔒 {/if}{m.name}
                  </span>
                  {#if m.weight !== 1}
                    <span class="text-xs text-(--color-text-light) font-mono">{m.weight}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      {#if teams.length === 0}
        <div class="flex-1 flex items-center justify-center text-sm text-(--color-text-muted)">
          Add participants to generate teams
        </div>
      {/if}
    </div>
  </div>
</div>
