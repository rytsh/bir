<script lang="ts">
  type Who = "owner" | "group" | "others";
  type Perm = "read" | "write" | "execute";
  type Special = "setuid" | "setgid" | "sticky";

  interface PermissionState {
    owner: Record<Perm, boolean>;
    group: Record<Perm, boolean>;
    others: Record<Perm, boolean>;
    special: Record<Special, boolean>;
  }

  const WHO: { id: Who; label: string; short: string }[] = [
    { id: "owner", label: "Owner", short: "u" },
    { id: "group", label: "Group", short: "g" },
    { id: "others", label: "Others", short: "o" },
  ];

  const PERMS: { id: Perm; label: string; bit: number; char: string }[] = [
    { id: "read", label: "Read", bit: 4, char: "r" },
    { id: "write", label: "Write", bit: 2, char: "w" },
    { id: "execute", label: "Execute", bit: 1, char: "x" },
  ];

  const SPECIALS: { id: Special; label: string; bit: number; description: string }[] = [
    { id: "setuid", label: "SetUID", bit: 4, description: "Run as file owner" },
    { id: "setgid", label: "SetGID", bit: 2, description: "Run as group / inherit dir group" },
    { id: "sticky", label: "Sticky", bit: 1, description: "Only owner can delete (dirs)" },
  ];

  const PRESETS: { octal: string; description: string }[] = [
    { octal: "644", description: "Files: owner rw, others read" },
    { octal: "755", description: "Executables & directories" },
    { octal: "600", description: "Private files (SSH keys)" },
    { octal: "700", description: "Private directories (~/.ssh)" },
    { octal: "664", description: "Group-writable files" },
    { octal: "775", description: "Group-writable directories" },
    { octal: "400", description: "Read-only for owner" },
    { octal: "777", description: "Everyone everything (avoid)" },
    { octal: "1777", description: "Shared temp dir (/tmp)" },
    { octal: "2775", description: "Shared group directory" },
    { octal: "4755", description: "SetUID executable" },
  ];

  const emptyTriple = (): Record<Perm, boolean> => ({ read: false, write: false, execute: false });

  let state = $state<PermissionState>({
    owner: { read: true, write: true, execute: true },
    group: { read: true, write: false, execute: true },
    others: { read: true, write: false, execute: true },
    special: { setuid: false, setgid: false, sticky: false },
  });

  let octalInput = $state("755");
  let symbolicInput = $state("rwxr-xr-x");
  let fileName = $state("file");
  let isDirectory = $state(false);
  let recursive = $state(false);
  let octalError = $state("");
  let symbolicError = $state("");
  let copiedKey = $state("");

  const tripleValue = (triple: Record<Perm, boolean>): number =>
    PERMS.reduce((sum, perm) => sum + (triple[perm.id] ? perm.bit : 0), 0);

  const specialValue = (special: Record<Special, boolean>): number =>
    SPECIALS.reduce((sum, item) => sum + (special[item.id] ? item.bit : 0), 0);

  let octal = $derived.by(() => {
    const base = `${tripleValue(state.owner)}${tripleValue(state.group)}${tripleValue(state.others)}`;
    const special = specialValue(state.special);
    return special ? `${special}${base}` : base;
  });

  let symbolic = $derived.by(() => {
    const triple = (who: Who): string[] =>
      PERMS.map((perm) => (state[who][perm.id] ? perm.char : "-"));
    const owner = triple("owner");
    const group = triple("group");
    const others = triple("others");
    if (state.special.setuid) owner[2] = state.owner.execute ? "s" : "S";
    if (state.special.setgid) group[2] = state.group.execute ? "s" : "S";
    if (state.special.sticky) others[2] = state.others.execute ? "t" : "T";
    return [...owner, ...group, ...others].join("");
  });

  let symbolicChmod = $derived.by(() => {
    const parts = WHO.map((who) => {
      const chars = PERMS.filter((perm) => state[who.id][perm.id]).map((perm) => perm.char).join("");
      const extra =
        (who.id === "owner" && state.special.setuid) || (who.id === "group" && state.special.setgid)
          ? "s"
          : who.id === "others" && state.special.sticky
            ? "t"
            : "";
      return `${who.short}=${chars}${extra}`;
    });
    return parts.join(",");
  });

  let lsLine = $derived(`${isDirectory ? "d" : "-"}${symbolic}`);
  let quotedName = $derived(/^[A-Za-z0-9._/-]+$/.test(fileName) ? fileName : `'${fileName.replace(/'/g, "'\\''")}'`);
  let commandOctal = $derived(`chmod ${recursive ? "-R " : ""}${octal} ${quotedName || "file"}`);
  let commandSymbolic = $derived(`chmod ${recursive ? "-R " : ""}${symbolicChmod} ${quotedName || "file"}`);
  let umask = $derived.by(() => {
    const full = isDirectory ? 0o777 : 0o666;
    const mode = parseInt(octal.slice(-3), 8);
    const mask = (0o777 & ~mode) & 0o777;
    const effective = full & ~mask;
    return { mask: mask.toString(8).padStart(3, "0"), exact: effective === mode };
  });

  const applyOctal = (value: string): boolean => {
    const trimmed = value.trim();
    if (!/^[0-7]{3,4}$/.test(trimmed)) return false;
    const digits = trimmed.padStart(4, "0").split("").map(Number);
    const fromDigit = (digit: number): Record<Perm, boolean> => ({
      read: (digit & 4) !== 0,
      write: (digit & 2) !== 0,
      execute: (digit & 1) !== 0,
    });
    state = {
      special: { setuid: (digits[0] & 4) !== 0, setgid: (digits[0] & 2) !== 0, sticky: (digits[0] & 1) !== 0 },
      owner: fromDigit(digits[1]),
      group: fromDigit(digits[2]),
      others: fromDigit(digits[3]),
    };
    return true;
  };

  const applySymbolic = (value: string): boolean => {
    let trimmed = value.trim();
    if (trimmed.length === 10 && /^[-dlcbps]/.test(trimmed)) {
      isDirectory = trimmed[0] === "d";
      trimmed = trimmed.slice(1);
    }
    if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(trimmed)) return false;
    const triple = (offset: number): Record<Perm, boolean> => ({
      read: trimmed[offset] === "r",
      write: trimmed[offset + 1] === "w",
      execute: ["x", "s", "t"].includes(trimmed[offset + 2]),
    });
    state = {
      owner: triple(0),
      group: triple(3),
      others: triple(6),
      special: {
        setuid: "sS".includes(trimmed[2]),
        setgid: "sS".includes(trimmed[5]),
        sticky: "tT".includes(trimmed[8]),
      },
    };
    return true;
  };

  const handleOctalInput = (): void => {
    if (!octalInput.trim()) {
      octalError = "";
      return;
    }
    octalError = applyOctal(octalInput) ? "" : "Enter 3 or 4 octal digits (0-7), e.g. 755 or 2775";
  };

  const handleSymbolicInput = (): void => {
    if (!symbolicInput.trim()) {
      symbolicError = "";
      return;
    }
    symbolicError = applySymbolic(symbolicInput) ? "" : "Expected 9 chars like rwxr-xr-x (optionally prefixed with d or -)";
  };

  $effect(() => {
    const currentOctal = octal;
    const currentSymbolic = symbolic;
    if (document.activeElement?.id !== "chmod-octal") {
      octalInput = currentOctal;
      octalError = "";
    }
    if (document.activeElement?.id !== "chmod-symbolic") {
      symbolicInput = currentSymbolic;
      symbolicError = "";
    }
  });

  const toggle = (who: Who, perm: Perm): void => {
    state[who][perm] = !state[who][perm];
  };

  const setAll = (value: boolean): void => {
    state.owner = value ? { read: true, write: true, execute: true } : emptyTriple();
    state.group = value ? { read: true, write: true, execute: true } : emptyTriple();
    state.others = value ? { read: true, write: true, execute: true } : emptyTriple();
  };

  const handleCopy = (value: string, key: string): void => {
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const describe = (who: Who): string => {
    const granted = PERMS.filter((perm) => state[who][perm.id]).map((perm) => perm.label.toLowerCase());
    return granted.length ? granted.join(", ") : "no access";
  };
</script>

<div class="h-full flex flex-col max-w-4xl">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate Unix file permissions. Toggle checkboxes or type an octal (755) or symbolic (rwxr-xr-x) value. Supports SetUID, SetGID, and sticky bits and generates the matching chmod command.
    </p>
  </header>

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
    <div>
      <label for="chmod-octal" class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
        Octal
      </label>
      <input
        id="chmod-octal"
        type="text"
        inputmode="numeric"
        maxlength="4"
        bind:value={octalInput}
        oninput={handleOctalInput}
        onblur={() => {
          octalInput = octal;
          octalError = "";
        }}
        class="w-full px-3 py-2 text-2xl font-mono tracking-widest border bg-(--color-bg-alt) text-(--color-text) outline-none {octalError
          ? 'border-(--color-error-border)'
          : 'border-(--color-border) focus:border-(--color-text-light)'}"
      />
      {#if octalError}
        <p class="mt-1 text-xs text-(--color-error-text)">{octalError}</p>
      {/if}
    </div>
    <div>
      <label for="chmod-symbolic" class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
        Symbolic
      </label>
      <input
        id="chmod-symbolic"
        type="text"
        maxlength="10"
        spellcheck="false"
        bind:value={symbolicInput}
        oninput={handleSymbolicInput}
        onblur={() => {
          symbolicInput = symbolic;
          symbolicError = "";
        }}
        class="w-full px-3 py-2 text-2xl font-mono tracking-widest border bg-(--color-bg-alt) text-(--color-text) outline-none {symbolicError
          ? 'border-(--color-error-border)'
          : 'border-(--color-border) focus:border-(--color-text-light)'}"
      />
      {#if symbolicError}
        <p class="mt-1 text-xs text-(--color-error-text)">{symbolicError}</p>
      {/if}
    </div>
  </div>

  <!-- Permission grid -->
  <div class="border border-(--color-border) bg-(--color-bg-alt) mb-4 overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-(--color-border)">
          <th class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-(--color-text-light)"></th>
          {#each PERMS as perm (perm.id)}
            <th class="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-(--color-text-light)">
              {perm.label} <span class="font-mono normal-case">({perm.bit})</span>
            </th>
          {/each}
          <th class="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-(--color-text-light)">Value</th>
        </tr>
      </thead>
      <tbody>
        {#each WHO as who (who.id)}
          <tr class="border-b border-(--color-border) last:border-b-0">
            <td class="px-4 py-2">
              <div class="font-medium text-(--color-text)">{who.label}</div>
              <div class="text-xs text-(--color-text-light)">{describe(who.id)}</div>
            </td>
            {#each PERMS as perm (perm.id)}
              <td class="px-4 py-2 text-center">
                <input
                  type="checkbox"
                  checked={state[who.id][perm.id]}
                  onchange={() => toggle(who.id, perm.id)}
                  aria-label="{who.label} {perm.label}"
                  class="w-5 h-5 accent-(--color-text) cursor-pointer"
                />
              </td>
            {/each}
            <td class="px-4 py-2 text-center font-mono text-lg text-(--color-text)">{tripleValue(state[who.id])}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Special bits -->
  <div class="flex flex-wrap gap-x-6 gap-y-2 mb-4">
    {#each SPECIALS as special (special.id)}
      <label class="flex items-center gap-2 cursor-pointer" title={special.description}>
        <input type="checkbox" bind:checked={state.special[special.id]} class="w-4 h-4 accent-(--color-text)" />
        <span class="text-sm text-(--color-text)">{special.label}</span>
        <span class="text-xs text-(--color-text-light)">{special.description}</span>
      </label>
    {/each}
  </div>

  <div class="flex flex-wrap gap-3 mb-4">
    <button
      onclick={() => setAll(true)}
      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
    >
      Select all
    </button>
    <button
      onclick={() => setAll(false)}
      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
    >
      Clear all
    </button>
  </div>

  <!-- Output -->
  <div class="border border-(--color-border) bg-(--color-bg-alt) divide-y divide-(--color-border) mb-4">
    <div class="flex flex-wrap items-center gap-3 px-4 py-2">
      <label class="flex items-center gap-2">
        <span class="text-xs text-(--color-text-light)">Target</span>
        <input
          type="text"
          bind:value={fileName}
          spellcheck="false"
          class="w-48 px-2 py-1 text-sm font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) outline-none focus:border-(--color-text-light)"
        />
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" bind:checked={isDirectory} class="w-3.5 h-3.5 accent-(--color-text)" />
        <span class="text-xs text-(--color-text-muted)">Directory</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" bind:checked={recursive} class="w-3.5 h-3.5 accent-(--color-text)" />
        <span class="text-xs text-(--color-text-muted)">Recursive (-R)</span>
      </label>
    </div>
    {#each [
      { key: "octal", label: "chmod (octal)", value: commandOctal },
      { key: "symbolic", label: "chmod (symbolic)", value: commandSymbolic },
      { key: "ls", label: "ls -l", value: `${lsLine}  ${fileName || "file"}` },
      { key: "umask", label: `umask${umask.exact ? "" : " (approx.)"}`, value: umask.mask },
    ] as row (row.key)}
      <div class="grid grid-cols-[9rem_1fr_auto] gap-3 px-4 py-2 items-center">
        <span class="text-xs text-(--color-text-light)">{row.label}</span>
        <code class="font-mono text-sm text-(--color-text) break-all">{row.value}</code>
        <button
          onclick={() => handleCopy(row.value, row.key)}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copiedKey === row.key ? "Copied!" : "Copy"}
        </button>
      </div>
    {/each}
  </div>

  <!-- Presets -->
  <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Common Permissions</h2>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
    {#each PRESETS as preset (preset.octal)}
      <button
        onclick={() => applyOctal(preset.octal)}
        class="flex items-baseline gap-3 px-3 py-2 text-left border transition-colors {octal === preset.octal
          ? 'border-(--color-text) bg-(--color-bg-alt)'
          : 'border-(--color-border) hover:border-(--color-text-light)'}"
      >
        <span class="font-mono text-sm font-semibold text-(--color-text) w-10">{preset.octal}</span>
        <span class="text-xs text-(--color-text-muted)">{preset.description}</span>
      </button>
    {/each}
  </div>
</div>
