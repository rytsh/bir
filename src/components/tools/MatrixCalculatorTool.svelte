<script lang="ts">
  import { create, all, type MathType, type Matrix } from "mathjs";

  const math = create(all, {});

  // Lazy-loaded KaTeX (already a project dependency, used by MarkdownPreviewTool).
  // Loading on demand keeps the initial bundle small.
  let katexMod: typeof import("katex") | undefined;
  let katexCssLoaded = false;

  async function ensureKatex(): Promise<typeof import("katex")> {
    if (!katexCssLoaded && typeof document !== "undefined") {
      const id = "katex-css-cdn";
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.css";
        document.head.appendChild(link);
      }
      katexCssLoaded = true;
    }
    if (!katexMod) {
      katexMod = await import("katex");
    }
    return katexMod;
  }

  type Op =
    | "A+B"
    | "A-B"
    | "A*B"
    | "scalar"
    | "transpose"
    | "inverse"
    | "determinant"
    | "rank"
    | "trace"
    | "rref"
    | "lu"
    | "qr"
    | "eigen"
    | "solve";

  let aRows = $state(3);
  let aCols = $state(3);
  let bRows = $state(3);
  let bCols = $state(3);
  let scalar = $state("2");
  let useFractions = $state(true);

  // Matrices stored as string grids so user input survives invalid intermediates
  let aGrid = $state<string[][]>([
    ["1", "2", "3"],
    ["0", "1", "4"],
    ["5", "6", "0"],
  ]);
  let bGrid = $state<string[][]>([
    ["1", "0", "0"],
    ["0", "1", "0"],
    ["0", "0", "1"],
  ]);
  let bVec = $state<string[]>(["1", "2", "3"]);

  let op = $state<Op>("A+B");
  let resultDisplay = $state<string>("");
  let resultArray = $state<string[][]>([]);
  let resultError = $state<string>("");
  let resultSteps = $state<string[]>([]);
  let showSteps = $state(false);

  function resizeGrid(grid: string[][], rows: number, cols: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < rows; i++) {
      const row: string[] = [];
      for (let j = 0; j < cols; j++) {
        row.push(grid[i]?.[j] ?? "0");
      }
      out.push(row);
    }
    return out;
  }

  // Only react to dimension changes (aRows, aCols). The grid itself is
  // intentionally NOT a dependency here — otherwise the assignment below
  // would re-trigger this effect every time and cause an infinite loop.
  $effect(() => {
    const r = aRows;
    const c = aCols;
    if (aGrid.length === r && aGrid[0]?.length === c) return;
    aGrid = resizeGrid(aGrid, r, c);
  });
  $effect(() => {
    const r = bRows;
    const c = bCols;
    if (bGrid.length === r && bGrid[0]?.length === c) return;
    bGrid = resizeGrid(bGrid, r, c);
  });
  $effect(() => {
    const r = aRows;
    if (bVec.length === r) return;
    const out: string[] = [];
    for (let i = 0; i < r; i++) out.push(bVec[i] ?? "0");
    bVec = out;
  });

  function gridToMatrix(grid: string[][]): Matrix {
    const data = grid.map((row) =>
      row.map((cell) => {
        const trimmed = cell.trim();
        if (trimmed === "") return 0;
        try {
          return math.evaluate(trimmed) as MathType;
        } catch {
          return Number(trimmed);
        }
      }),
    );
    const finalData = useFractions
      ? data.map((r) => r.map((c) => math.fraction(c as number)))
      : data;
    return math.matrix(finalData as unknown as number[][]) as Matrix;
  }

  function vecToMatrix(arr: string[]): Matrix {
    const data = arr.map((cell) => {
      const t = cell.trim();
      if (t === "") return 0;
      try {
        return math.evaluate(t) as MathType;
      } catch {
        return Number(t);
      }
    });
    return math.matrix(data.map((v) => [v]) as unknown as number[][]) as Matrix;
  }

  function formatValue(v: MathType): string {
    try {
      if (useFractions) {
        // Detect Fraction object — print as integer when denominator is 1.
        // mathjs may store n/d as BigInt in newer versions, so coerce both
        // to plain Number / String before comparing.
        const f = v as unknown as {
          isFraction?: boolean;
          s?: number | bigint;
          n?: number | bigint;
          d?: number | bigint;
        };
        if (f && f.isFraction) {
          const s = typeof f.s === "bigint" ? Number(f.s) : (f.s ?? 1);
          const n = String(f.n ?? 0);
          const d = String(f.d ?? 1);
          const sign = s < 0 ? "-" : "";
          if (d === "1") return `${sign}${n}`;
          return `${sign}${n}/${d}`;
        }
        // Numbers should not be expressed as n/1
        if (typeof v === "number") {
          if (Number.isInteger(v)) return String(v);
          const str = math.format(v, { fraction: "ratio" });
          return str.endsWith("/1") ? str.slice(0, -2) : str;
        }
        const str = math.format(v, { fraction: "ratio" });
        return str.endsWith("/1") ? str.slice(0, -2) : str;
      }
      return math.format(v, { precision: 6 });
    } catch {
      return String(v);
    }
  }

  function formatMatrix(m: MathType): string {
    if (math.isMatrix(m) || Array.isArray(m)) {
      const arr = (math.isMatrix(m) ? m.toArray() : m) as unknown as MathType[][];
      const formatted = arr.map((row) =>
        Array.isArray(row) ? row.map((c) => formatValue(c as MathType)) : [formatValue(row as MathType)],
      );
      const colWidths = formatted[0].map((_, j) =>
        Math.max(...formatted.map((r) => (r[j] ?? "").length)),
      );
      return formatted
        .map((row) => "[ " + row.map((c, j) => c.padStart(colWidths[j])).join("  ") + " ]")
        .join("\n");
    }
    return formatValue(m);
  }

  // RREF with steps
  function rrefWithSteps(matrix: number[][]): { result: number[][]; steps: string[] } {
    const m = matrix.map((r) => [...r]);
    const rows = m.length;
    const cols = m[0]?.length ?? 0;
    const steps: string[] = [];
    let lead = 0;
    for (let r = 0; r < rows; r++) {
      if (lead >= cols) break;
      let i = r;
      while (i < rows && Math.abs(m[i][lead]) < 1e-12) i++;
      if (i === rows) {
        lead++;
        r--;
        continue;
      }
      if (i !== r) {
        [m[i], m[r]] = [m[r], m[i]];
        steps.push(`R${r + 1} ↔ R${i + 1}`);
      }
      const lv = m[r][lead];
      if (Math.abs(lv - 1) > 1e-12) {
        for (let j = 0; j < cols; j++) m[r][j] /= lv;
        steps.push(`R${r + 1} ← R${r + 1} / ${lv.toFixed(4)}`);
      }
      for (let i2 = 0; i2 < rows; i2++) {
        if (i2 === r) continue;
        const factor = m[i2][lead];
        if (Math.abs(factor) > 1e-12) {
          for (let j = 0; j < cols; j++) m[i2][j] -= factor * m[r][j];
          steps.push(`R${i2 + 1} ← R${i2 + 1} − (${factor.toFixed(4)})·R${r + 1}`);
        }
      }
      lead++;
    }
    return { result: m, steps };
  }

  function compute() {
    resultError = "";
    resultDisplay = "";
    resultArray = [];
    resultSteps = [];
    try {
      const A = gridToMatrix(aGrid);
      let B: Matrix | null = null;
      try {
        B = gridToMatrix(bGrid);
      } catch {
        B = null;
      }

      let r: MathType;
      switch (op) {
        case "A+B":
          if (!B) throw new Error("B is required");
          r = math.add(A, B);
          break;
        case "A-B":
          if (!B) throw new Error("B is required");
          r = math.subtract(A, B);
          break;
        case "A*B":
          if (!B) throw new Error("B is required");
          r = math.multiply(A, B);
          break;
        case "scalar": {
          const s = math.evaluate(scalar);
          r = math.multiply(A, s as MathType);
          break;
        }
        case "transpose":
          r = math.transpose(A);
          break;
        case "inverse":
          r = math.inv(A);
          break;
        case "determinant":
          r = math.det(A);
          break;
        case "rank": {
          const arr = A.toArray() as number[][];
          const { result } = rrefWithSteps(arr.map((row) => row.map((v) => Number(v))));
          let rank = 0;
          for (const row of result) {
            if (row.some((v) => Math.abs(v) > 1e-9)) rank++;
          }
          r = rank;
          break;
        }
        case "trace":
          r = math.trace(A);
          break;
        case "rref": {
          const arr = (A.toArray() as number[][]).map((row) => row.map((v) => Number(v)));
          const { result, steps } = rrefWithSteps(arr);
          r = math.matrix(result);
          resultSteps = steps;
          break;
        }
        case "lu": {
          const lu = math.lup(A);
          resultDisplay = `L =\n${formatMatrix(lu.L)}\n\nU =\n${formatMatrix(lu.U)}\n\nP =\n${formatMatrix(lu.p)}`;
          return;
        }
        case "qr": {
          const qr = math.qr(A);
          resultDisplay = `Q =\n${formatMatrix(qr.Q)}\n\nR =\n${formatMatrix(qr.R)}`;
          return;
        }
        case "eigen": {
          const e = math.eigs(A);
          const values = e.values;
          const vectors = (e as unknown as { eigenvectors?: { value: MathType; vector: MathType }[] }).eigenvectors;
          let out = `λ = ${formatMatrix(values)}`;
          if (vectors) {
            out += "\n\nEigenvectors:";
            for (const v of vectors) {
              out += `\n  λ=${formatValue(v.value)} →\n${formatMatrix(v.vector)}`;
            }
          }
          resultDisplay = out;
          return;
        }
        case "solve": {
          const bm = vecToMatrix(bVec);
          r = math.lusolve(A, bm);
          break;
        }
        default:
          throw new Error("Unknown op");
      }

      resultDisplay = formatMatrix(r);
      resultArray = toFormattedArray(r);
    } catch (e) {
      resultError = (e as Error).message || "Computation failed";
    }
  }

  // Convert a result to a 2D array of pre-formatted strings (no n/1 garbage)
  function toFormattedArray(v: MathType): string[][] {
    if (math.isMatrix(v) || Array.isArray(v)) {
      const arr = (math.isMatrix(v) ? (v as Matrix).toArray() : v) as unknown as MathType[][];
      return arr.map((row) =>
        Array.isArray(row)
          ? row.map((c) => formatValue(c as MathType))
          : [formatValue(row as MathType)],
      );
    }
    return [[formatValue(v)]];
  }

  const resultLatex = $derived.by(() => {
    if (resultArray.length === 0) return "";
    const rows = resultArray.map((row) => row.join(" & "));
    return `\\begin{pmatrix}\n${rows.join(" \\\\\n")}\n\\end{pmatrix}`;
  });

  const resultCsv = $derived(resultArray.map((row) => row.join(",")).join("\n"));

  // View mode for the result panel.
  type ViewMode = "pretty" | "latex" | "csv" | "table";
  const VIEW_MODES: { val: ViewMode; label: string }[] = [
    { val: "pretty", label: "Pretty" },
    { val: "latex", label: "LaTeX" },
    { val: "csv", label: "CSV" },
    { val: "table", label: "Table" },
  ];
  let viewMode = $state<ViewMode>("pretty");

  // Rendered LaTeX HTML — recomputed reactively when LaTeX or view changes.
  let latexHtml = $state<string>("");
  let latexRenderError = $state<string>("");

  $effect(() => {
    const src = resultLatex;
    if (!src || viewMode !== "latex") return;
    let cancelled = false;
    ensureKatex()
      .then((katex) => {
        if (cancelled) return;
        try {
          latexHtml = katex.default.renderToString(src, {
            displayMode: true,
            throwOnError: false,
            output: "html",
          });
          latexRenderError = "";
        } catch (e) {
          latexRenderError = (e as Error).message;
        }
      })
      .catch((e) => {
        if (!cancelled) latexRenderError = (e as Error).message;
      });
    return () => {
      cancelled = true;
    };
  });

  let copiedKey = $state<string>("");
  function copyText(text: string, key: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 1500);
  }

  function pasteIntoGrid(target: "A" | "B") {
    navigator.clipboard.readText().then((text) => {
      const lines = text.trim().split(/\r?\n/);
      const rows = lines.map((l) => l.split(/[,\t ]+/).filter(Boolean));
      if (rows.length === 0 || rows[0].length === 0) return;
      if (target === "A") {
        aRows = rows.length;
        aCols = rows[0].length;
        aGrid = rows.map((row) => [...row]);
      } else {
        bRows = rows.length;
        bCols = rows[0].length;
        bGrid = rows.map((row) => [...row]);
      }
    });
  }

  function setIdentity(target: "A" | "B") {
    if (target === "A") {
      const out: string[][] = [];
      for (let i = 0; i < aRows; i++) {
        const row: string[] = [];
        for (let j = 0; j < aCols; j++) row.push(i === j ? "1" : "0");
        out.push(row);
      }
      aGrid = out;
    } else {
      const out: string[][] = [];
      for (let i = 0; i < bRows; i++) {
        const row: string[] = [];
        for (let j = 0; j < bCols; j++) row.push(i === j ? "1" : "0");
        out.push(row);
      }
      bGrid = out;
    }
  }

  function setZero(target: "A" | "B") {
    if (target === "A") aGrid = aGrid.map((row) => row.map(() => "0"));
    else bGrid = bGrid.map((row) => row.map(() => "0"));
  }

  function showB(): boolean {
    return op === "A+B" || op === "A-B" || op === "A*B";
  }

  const operationGroups: { label: string; ops: { id: Op; label: string }[] }[] = [
    {
      label: "Binary",
      ops: [
        { id: "A+B", label: "A + B" },
        { id: "A-B", label: "A − B" },
        { id: "A*B", label: "A · B" },
        { id: "scalar", label: "k · A" },
      ],
    },
    {
      label: "Unary",
      ops: [
        { id: "transpose", label: "Aᵀ" },
        { id: "inverse", label: "A⁻¹" },
        { id: "determinant", label: "det(A)" },
        { id: "trace", label: "tr(A)" },
        { id: "rank", label: "rank(A)" },
      ],
    },
    {
      label: "Decompose",
      ops: [
        { id: "rref", label: "RREF" },
        { id: "lu", label: "LU" },
        { id: "qr", label: "QR" },
        { id: "eigen", label: "Eigen" },
      ],
    },
    {
      label: "Solve",
      ops: [{ id: "solve", label: "A·x = b" }],
    },
  ];
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Matrix calculator with addition, multiplication, inverse, determinant, RREF, LU/QR, eigenvalues, and linear-system solver. Cell input accepts expressions like <code class="px-1 bg-(--color-bg-alt)">1/3</code> or <code class="px-1 bg-(--color-bg-alt)">sqrt(2)</code>.
    </p>
  </header>

  <div class="flex-1 flex flex-col gap-3 overflow-auto">
    <!-- Operation chooser -->
    <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-wrap gap-3 items-start">
      {#each operationGroups as group}
        <div>
          <span class="text-[10px] uppercase tracking-wider text-(--color-text-light) font-medium block mb-1">{group.label}</span>
          <div class="flex flex-wrap gap-1">
            {#each group.ops as o}
              <button
                onclick={() => (op = o.id)}
                class="px-2 py-1 text-xs border transition-colors {op === o.id
                  ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                  : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
              >
                {o.label}
              </button>
            {/each}
          </div>
        </div>
      {/each}
      <label class="flex items-center gap-1.5 text-xs text-(--color-text-muted) cursor-pointer ml-auto">
        <input type="checkbox" bind:checked={useFractions} class="cursor-pointer" />
        Exact (fractions)
      </label>
    </div>

    {#if op === "scalar"}
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex items-center gap-2">
        <label class="text-sm text-(--color-text-muted)">Scalar k =</label>
        <input
          type="text"
          bind:value={scalar}
          class="w-32 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
        />
      </div>
    {/if}

    <!-- A and B side by side -->
    <div class="grid grid-cols-1 {showB() ? 'lg:grid-cols-2' : ''} gap-3">
      <!-- A -->
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-(--color-text)">Matrix A</span>
            <label class="text-xs text-(--color-text-muted)">
              rows
              <input type="number" min="1" max="12" bind:value={aRows} class="w-14 ml-1 px-1 py-0.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs font-mono focus:border-(--color-text-light) outline-none" />
            </label>
            <label class="text-xs text-(--color-text-muted)">
              cols
              <input type="number" min="1" max="12" bind:value={aCols} class="w-14 ml-1 px-1 py-0.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs font-mono focus:border-(--color-text-light) outline-none" />
            </label>
          </div>
          <div class="flex gap-1">
            <button onclick={() => setIdentity("A")} class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">I</button>
            <button onclick={() => setZero("A")} class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">0</button>
            <button onclick={() => pasteIntoGrid("A")} class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">Paste</button>
          </div>
        </div>
        <div class="overflow-auto">
          <table class="border-collapse">
            <tbody>
              {#each aGrid as row, i}
                <tr>
                  {#each row as _cell, j}
                    <td class="p-0.5">
                      <input
                        type="text"
                        bind:value={aGrid[i][j]}
                        class="w-16 px-1 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs text-center focus:border-(--color-text-light) outline-none"
                      />
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- B -->
      {#if showB()}
        <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-(--color-text)">Matrix B</span>
              <label class="text-xs text-(--color-text-muted)">
                rows
                <input type="number" min="1" max="12" bind:value={bRows} class="w-14 ml-1 px-1 py-0.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs font-mono focus:border-(--color-text-light) outline-none" />
              </label>
              <label class="text-xs text-(--color-text-muted)">
                cols
                <input type="number" min="1" max="12" bind:value={bCols} class="w-14 ml-1 px-1 py-0.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs font-mono focus:border-(--color-text-light) outline-none" />
              </label>
            </div>
            <div class="flex gap-1">
              <button onclick={() => setIdentity("B")} class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">I</button>
              <button onclick={() => setZero("B")} class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">0</button>
              <button onclick={() => pasteIntoGrid("B")} class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">Paste</button>
            </div>
          </div>
          <div class="overflow-auto">
            <table class="border-collapse">
              <tbody>
                {#each bGrid as row, i}
                  <tr>
                    {#each row as _cell, j}
                      <td class="p-0.5">
                        <input
                          type="text"
                          bind:value={bGrid[i][j]}
                          class="w-16 px-1 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs text-center focus:border-(--color-text-light) outline-none"
                        />
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>

    <!-- Vector b for solve -->
    {#if op === "solve"}
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        <div class="text-sm font-medium text-(--color-text) mb-2">Vector b ({aRows}×1)</div>
        <div class="flex flex-wrap gap-1">
          {#each bVec as _v, i}
            <input
              type="text"
              bind:value={bVec[i]}
              class="w-16 px-1 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs text-center focus:border-(--color-text-light) outline-none"
            />
          {/each}
        </div>
      </div>
    {/if}

    <!-- Compute -->
    <div class="flex gap-2 items-center flex-wrap">
      <button
        onclick={compute}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
      >
        Compute
      </button>
      {#if resultSteps.length > 0}
        <label class="text-xs text-(--color-text-muted) flex items-center gap-1.5 cursor-pointer ml-2">
          <input type="checkbox" bind:checked={showSteps} class="cursor-pointer" />
          Show steps ({resultSteps.length})
        </label>
      {/if}
    </div>

    <!-- Result -->
    {#if resultError}
      <div class="bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm p-3">{resultError}</div>
    {:else if resultDisplay}
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        <!-- Header: title + view selector + copy -->
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Result</span>
          <div class="flex items-center gap-2 flex-wrap">
            {#if resultArray.length > 0}
              <div class="flex gap-1">
                {#each VIEW_MODES as v (v.val)}
                  <button
                    type="button"
                    onclick={() => (viewMode = v.val)}
                    class="px-2 py-1 text-xs border transition-colors {viewMode === v.val
                      ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                      : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                  >
                    {v.label}
                  </button>
                {/each}
              </div>
            {/if}
            <button
              type="button"
              onclick={() => {
                if (resultArray.length === 0) {
                  copyText(resultDisplay, "current");
                  return;
                }
                const text =
                  viewMode === "latex"
                    ? resultLatex
                    : viewMode === "csv" || viewMode === "table"
                      ? resultCsv
                      : resultDisplay;
                copyText(text, "current");
              }}
              class="px-2 py-1 text-xs border bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copiedKey === "current" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <!-- View body -->
        {#if resultArray.length === 0 || viewMode === "pretty"}
          <pre class="text-sm font-mono text-(--color-text) overflow-auto m-0">{resultDisplay}</pre>
        {:else if viewMode === "latex"}
          <div class="flex flex-col gap-3">
            {#if latexRenderError}
              <div class="text-xs text-(--color-error-text)">{latexRenderError}</div>
            {/if}
            <div class="overflow-auto bg-(--color-bg) border border-(--color-border) p-4 flex justify-center min-h-[3rem] text-(--color-text)">
              {#if latexHtml}
                <!-- KaTeX HTML output is sanitized by katex itself -->
                {@html latexHtml}
              {:else}
                <span class="text-xs text-(--color-text-muted) self-center">Rendering…</span>
              {/if}
            </div>
            <details>
              <summary class="text-xs text-(--color-text-muted) cursor-pointer hover:text-(--color-text) transition-colors">
                Show LaTeX source
              </summary>
              <pre class="mt-2 text-xs font-mono text-(--color-text) overflow-auto m-0 whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) p-2">{resultLatex}</pre>
            </details>
          </div>
        {:else if viewMode === "csv"}
          <pre class="text-xs font-mono text-(--color-text) overflow-auto m-0 whitespace-pre-wrap break-all">{resultCsv}</pre>
        {:else if viewMode === "table"}
          <div class="overflow-auto">
            <table class="border-collapse">
              <tbody>
                {#each resultArray as row, ri}
                  <tr>
                    {#each row as cell, ci}
                      <td class="border border-(--color-border) px-3 py-1.5 font-mono text-sm text-(--color-text) text-right" data-row={ri} data-col={ci}>
                        {cell}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      {#if showSteps && resultSteps.length > 0}
        <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
          <div class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Row operations</div>
          <ol class="text-xs font-mono text-(--color-text-muted) space-y-0.5 pl-5 list-decimal">
            {#each resultSteps as step}
              <li>{step}</li>
            {/each}
          </ol>
        </div>
      {/if}
    {/if}
  </div>
</div>
