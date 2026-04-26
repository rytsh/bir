<script lang="ts">
  type Mode = "basic" | "scientific" | "programmer";

  let mode = $state<Mode>("basic");
  let display = $state("0");
  let expression = $state("");
  let history = $state<{ expr: string; result: string }[]>([]);
  let memory = $state(0);
  let angleMode = $state<"deg" | "rad">("deg");
  let progBase = $state<2 | 8 | 10 | 16>(10);

  // Tokenize and evaluate a math expression with sci functions.
  // Supports: + - * / % ^ ( ), unary -, sin/cos/tan/asin/acos/atan, sinh/cosh/tanh,
  // log (base 10), ln, sqrt, cbrt, abs, exp, floor, ceil, round, fact (n!), pi, e
  function evalExpr(input: string): number {
    if (!input.trim()) return 0;

    const angleScale = angleMode === "deg" ? Math.PI / 180 : 1;

    // Replace constants and operators
    let src = input
      .replace(/\bpi\b/gi, `(${Math.PI})`)
      .replace(/(?<![a-z])e(?![a-z0-9])/gi, `(${Math.E})`)
      .replace(/\^/g, "**")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-");

    // Factorial: handle n! (integer prefix only)
    src = src.replace(/(\d+(?:\.\d+)?)\s*!/g, (_m, n) => {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0 || Math.floor(v) !== v) return "NaN";
      let f = 1;
      for (let i = 2; i <= v; i++) f *= i;
      return String(f);
    });

    const fns: Record<string, (x: number) => number> = {
      sin: (x) => Math.sin(x * angleScale),
      cos: (x) => Math.cos(x * angleScale),
      tan: (x) => Math.tan(x * angleScale),
      asin: (x) => Math.asin(x) / angleScale,
      acos: (x) => Math.acos(x) / angleScale,
      atan: (x) => Math.atan(x) / angleScale,
      sinh: Math.sinh,
      cosh: Math.cosh,
      tanh: Math.tanh,
      log: Math.log10,
      ln: Math.log,
      sqrt: Math.sqrt,
      cbrt: Math.cbrt,
      abs: Math.abs,
      exp: Math.exp,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
    };

    // eslint-disable-next-line no-new-func
    const fn = new Function("__fns", `with(__fns){return (${src});}`);
    return fn(fns);
  }

  function append(s: string) {
    if (display === "0" || display === "Error") {
      display = /[0-9.\-(]/.test(s) ? s : "0" + s;
    } else {
      display += s;
    }
  }

  function clearAll() {
    display = "0";
    expression = "";
  }

  function backspace() {
    if (display.length <= 1 || display === "Error") {
      display = "0";
    } else {
      display = display.slice(0, -1);
    }
  }

  function compute() {
    try {
      const result = evalExpr(display);
      if (!Number.isFinite(result)) throw new Error("Math error");
      const rounded = Math.abs(result) < 1e-12 ? 0 : result;
      const out = formatNumber(rounded);
      history = [{ expr: display, result: out }, ...history].slice(0, 50);
      expression = display + " =";
      display = out;
    } catch {
      display = "Error";
    }
  }

  function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return "Error";
    if (Math.abs(n) >= 1e16 || (Math.abs(n) < 1e-6 && n !== 0)) {
      return n.toExponential(10);
    }
    // Trim trailing zeros from float
    const s = n.toPrecision(15);
    return parseFloat(s).toString();
  }

  function applyFn(fnName: string) {
    if (display === "0" || display === "Error") {
      display = `${fnName}(`;
    } else {
      display = `${fnName}(${display})`;
    }
  }

  // Memory ops
  function mem(op: "MC" | "MR" | "M+" | "M-" | "MS") {
    const cur = parseFloat(display);
    if (!Number.isFinite(cur) && op !== "MC" && op !== "MR") return;
    if (op === "MC") memory = 0;
    else if (op === "MR") {
      display = formatNumber(memory);
    } else if (op === "M+") memory += cur;
    else if (op === "M-") memory -= cur;
    else if (op === "MS") memory = cur;
  }

  // Programmer mode helpers
  let progValue = $derived.by(() => {
    const n = parseInt(display.replace(/[^0-9a-fA-F-]/g, ""), progBase);
    return Number.isFinite(n) ? n : 0;
  });

  function changeBase(newBase: 2 | 8 | 10 | 16) {
    const n = parseInt(display, progBase);
    if (Number.isFinite(n)) {
      display = n.toString(newBase).toUpperCase();
    }
    progBase = newBase;
  }

  function progOp(op: "AND" | "OR" | "XOR" | "NOT" | "SHL" | "SHR") {
    const n = progValue;
    let out: number;
    if (op === "NOT") out = ~n;
    else if (op === "SHL") out = n << 1;
    else if (op === "SHR") out = n >> 1;
    else {
      // Binary op needs a second operand: treat current as left, prompt simple chain
      // For UX simplicity, store pending operator. Lightweight approach:
      pendingOp = op;
      pendingLeft = n;
      display = "0";
      return;
    }
    display = (out >>> 0).toString(progBase).toUpperCase();
  }

  let pendingOp = $state<null | "AND" | "OR" | "XOR">(null);
  let pendingLeft = $state(0);

  function progEquals() {
    if (pendingOp === null) return;
    const r = progValue;
    let out: number;
    if (pendingOp === "AND") out = pendingLeft & r;
    else if (pendingOp === "OR") out = pendingLeft | r;
    else out = pendingLeft ^ r;
    display = (out >>> 0).toString(progBase).toUpperCase();
    pendingOp = null;
  }

  // Keyboard input
  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      if (/^[0-9.+\-*/()%^]$/.test(k)) {
        e.preventDefault();
        append(k);
      } else if (k === "Enter" || k === "=") {
        e.preventDefault();
        if (mode === "programmer" && pendingOp) progEquals();
        else compute();
      } else if (k === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (k === "Escape") {
        e.preventDefault();
        clearAll();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Hex digits available based on base
  const hexDigits = ["A", "B", "C", "D", "E", "F"];
</script>

<div class="flex-1 flex flex-col bg-(--color-bg) text-(--color-text) p-4 gap-4">
  <!-- Mode tabs -->
  <div class="flex gap-2">
    {#each ["basic", "scientific", "programmer"] as m}
      <button
        onclick={() => { mode = m as Mode; clearAll(); }}
        class="px-4 py-2 text-sm border border-(--color-border) capitalize {mode === m
          ? 'bg-(--color-accent) text-(--color-btn-text)'
          : 'bg-(--color-bg-alt) hover:bg-(--color-bg)'}"
      >{m}</button>
    {/each}
    <div class="flex-1"></div>
    {#if mode === "scientific"}
      <button
        onclick={() => (angleMode = angleMode === "deg" ? "rad" : "deg")}
        class="px-3 py-2 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:bg-(--color-bg) uppercase"
      >{angleMode}</button>
    {/if}
    {#if mode === "programmer"}
      <div class="flex">
        {#each [["HEX", 16], ["DEC", 10], ["OCT", 8], ["BIN", 2]] as [label, b]}
          <button
            onclick={() => changeBase(b as 2 | 8 | 10 | 16)}
            class="px-3 py-2 text-xs border border-(--color-border) {progBase === b ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-bg-alt) hover:bg-(--color-bg)'}"
          >{label}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="flex gap-4 flex-1 min-h-0">
    <div class="flex-1 flex flex-col gap-2">
      <!-- Display -->
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-3 text-right">
        <div class="text-xs text-(--color-text-light) min-h-[1em]">{expression}&nbsp;</div>
        <div class="text-3xl font-mono break-all">{display}</div>
        {#if mode === "programmer"}
          <div class="mt-2 grid grid-cols-2 gap-x-4 text-[11px] font-mono text-(--color-text-light) text-left">
            <div>HEX: {(progValue >>> 0).toString(16).toUpperCase()}</div>
            <div>DEC: {progValue}</div>
            <div>OCT: {(progValue >>> 0).toString(8)}</div>
            <div>BIN: {(progValue >>> 0).toString(2)}</div>
          </div>
        {/if}
      </div>

      <!-- Buttons -->
      {#if mode === "basic"}
        <div class="grid grid-cols-4 gap-1 flex-1">
          <button onclick={() => clearAll()} class="btn-cal danger">C</button>
          <button onclick={() => backspace()} class="btn-cal">⌫</button>
          <button onclick={() => append("%")} class="btn-cal op">%</button>
          <button onclick={() => append("/")} class="btn-cal op">÷</button>
          {#each ["7", "8", "9"] as n}<button onclick={() => append(n)} class="btn-cal">{n}</button>{/each}
          <button onclick={() => append("*")} class="btn-cal op">×</button>
          {#each ["4", "5", "6"] as n}<button onclick={() => append(n)} class="btn-cal">{n}</button>{/each}
          <button onclick={() => append("-")} class="btn-cal op">−</button>
          {#each ["1", "2", "3"] as n}<button onclick={() => append(n)} class="btn-cal">{n}</button>{/each}
          <button onclick={() => append("+")} class="btn-cal op">+</button>
          <button onclick={() => append("0")} class="btn-cal col-span-2">0</button>
          <button onclick={() => append(".")} class="btn-cal">.</button>
          <button onclick={() => compute()} class="btn-cal accent">=</button>
        </div>
      {:else if mode === "scientific"}
        <div class="grid grid-cols-6 gap-1 flex-1">
          <button onclick={() => mem("MC")} class="btn-cal sm">MC</button>
          <button onclick={() => mem("MR")} class="btn-cal sm">MR</button>
          <button onclick={() => mem("M+")} class="btn-cal sm">M+</button>
          <button onclick={() => mem("M-")} class="btn-cal sm">M-</button>
          <button onclick={() => mem("MS")} class="btn-cal sm">MS</button>
          <button onclick={() => clearAll()} class="btn-cal sm danger">C</button>

          <button onclick={() => applyFn("sin")} class="btn-cal sm">sin</button>
          <button onclick={() => applyFn("cos")} class="btn-cal sm">cos</button>
          <button onclick={() => applyFn("tan")} class="btn-cal sm">tan</button>
          <button onclick={() => applyFn("ln")} class="btn-cal sm">ln</button>
          <button onclick={() => applyFn("log")} class="btn-cal sm">log</button>
          <button onclick={() => backspace()} class="btn-cal sm">⌫</button>

          <button onclick={() => applyFn("asin")} class="btn-cal sm">sin⁻¹</button>
          <button onclick={() => applyFn("acos")} class="btn-cal sm">cos⁻¹</button>
          <button onclick={() => applyFn("atan")} class="btn-cal sm">tan⁻¹</button>
          <button onclick={() => append("^")} class="btn-cal op">x^y</button>
          <button onclick={() => applyFn("sqrt")} class="btn-cal">√</button>
          <button onclick={() => append("/")} class="btn-cal op">÷</button>

          <button onclick={() => append("(")} class="btn-cal sm">(</button>
          <button onclick={() => append(")")} class="btn-cal sm">)</button>
          <button onclick={() => append("!")} class="btn-cal sm">n!</button>
          <button onclick={() => append("pi")} class="btn-cal sm">π</button>
          <button onclick={() => append("e")} class="btn-cal sm">e</button>
          <button onclick={() => append("*")} class="btn-cal op">×</button>

          <button onclick={() => append("7")} class="btn-cal">7</button>
          <button onclick={() => append("8")} class="btn-cal">8</button>
          <button onclick={() => append("9")} class="btn-cal">9</button>
          <button onclick={() => applyFn("abs")} class="btn-cal sm">|x|</button>
          <button onclick={() => applyFn("exp")} class="btn-cal sm">eˣ</button>
          <button onclick={() => append("-")} class="btn-cal op">−</button>

          <button onclick={() => append("4")} class="btn-cal">4</button>
          <button onclick={() => append("5")} class="btn-cal">5</button>
          <button onclick={() => append("6")} class="btn-cal">6</button>
          <button onclick={() => append("%")} class="btn-cal op">%</button>
          <button onclick={() => applyFn("cbrt")} class="btn-cal sm">∛</button>
          <button onclick={() => append("+")} class="btn-cal op">+</button>

          <button onclick={() => append("1")} class="btn-cal">1</button>
          <button onclick={() => append("2")} class="btn-cal">2</button>
          <button onclick={() => append("3")} class="btn-cal">3</button>
          <button onclick={() => append("0")} class="btn-cal">0</button>
          <button onclick={() => append(".")} class="btn-cal">.</button>
          <button onclick={() => compute()} class="btn-cal accent">=</button>
        </div>
      {:else}
        <!-- Programmer -->
        <div class="grid grid-cols-6 gap-1 flex-1">
          <button onclick={() => progOp("AND")} class="btn-cal op">AND</button>
          <button onclick={() => progOp("OR")} class="btn-cal op">OR</button>
          <button onclick={() => progOp("XOR")} class="btn-cal op">XOR</button>
          <button onclick={() => progOp("NOT")} class="btn-cal op">NOT</button>
          <button onclick={() => progOp("SHL")} class="btn-cal op">«</button>
          <button onclick={() => progOp("SHR")} class="btn-cal op">»</button>

          {#each hexDigits as d}
            <button onclick={() => append(d)} disabled={progBase < 16} class="btn-cal {progBase < 16 ? 'opacity-30' : ''}">{d}</button>
          {/each}

          <button onclick={() => append("7")} disabled={progBase < 8} class="btn-cal {progBase < 8 ? 'opacity-30' : ''}">7</button>
          <button onclick={() => append("8")} disabled={progBase < 10} class="btn-cal {progBase < 10 ? 'opacity-30' : ''}">8</button>
          <button onclick={() => append("9")} disabled={progBase < 10} class="btn-cal {progBase < 10 ? 'opacity-30' : ''}">9</button>
          <button onclick={() => clearAll()} class="btn-cal danger">C</button>
          <button onclick={() => backspace()} class="btn-cal">⌫</button>
          <button onclick={() => progEquals()} class="btn-cal accent">=</button>

          {#each ["4", "5", "6"] as n}<button onclick={() => append(n)} disabled={progBase < 8} class="btn-cal {progBase < 8 ? 'opacity-30' : ''}">{n}</button>{/each}
          <button onclick={() => append("0")} class="btn-cal col-span-3">0</button>

          {#each ["1", "2", "3"] as n}<button onclick={() => append(n)} class="btn-cal">{n}</button>{/each}
          <button onclick={() => append("0")} class="btn-cal col-span-3">00</button>
        </div>
      {/if}
    </div>

    <!-- History panel -->
    <div class="w-64 border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
      <div class="px-3 py-2 border-b border-(--color-border) flex items-center justify-between">
        <span class="text-sm font-medium">History</span>
        <button onclick={() => (history = [])} class="text-xs text-(--color-text-light) hover:text-(--color-text)">Clear</button>
      </div>
      <div class="flex-1 overflow-auto p-2 space-y-2">
        {#if history.length === 0}
          <div class="text-xs text-(--color-text-light) text-center py-4">No calculations yet</div>
        {/if}
        {#each history as h}
          <button
            onclick={() => (display = h.result)}
            class="w-full text-right block hover:bg-(--color-bg) p-2 transition-colors"
          >
            <div class="text-xs text-(--color-text-light) font-mono break-all">{h.expr}</div>
            <div class="text-sm font-mono break-all">= {h.result}</div>
          </button>
        {/each}
      </div>
      {#if memory !== 0}
        <div class="px-3 py-2 border-t border-(--color-border) text-xs">
          <span class="text-(--color-text-light)">M:</span> <span class="font-mono">{formatNumber(memory)}</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .btn-cal {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    min-height: 4rem;
    font-size: 2rem;
    font-weight: 600;
    line-height: 1;
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-alt);
    transition: background-color 150ms;
  }
  .btn-cal:hover:not(:disabled) {
    background-color: var(--color-bg);
  }
  /* Smaller buttons for sci/programmer with longer labels (sin, cos, AND, etc.) */
  .btn-cal.sm {
    font-size: 1.25rem;
    font-weight: 500;
  }
  .btn-cal.op {
    background-color: var(--color-bg);
    color: var(--color-accent);
    font-size: 2.25rem;
    font-weight: 500;
  }
  .btn-cal.accent {
    background-color: var(--color-accent);
    color: var(--color-btn-text);
    font-size: 2.5rem;
    font-weight: 700;
  }
  .btn-cal.accent:hover:not(:disabled) {
    background-color: var(--color-accent-hover);
  }
  .btn-cal.danger {
    color: #ef4444;
  }
  .btn-cal:disabled {
    cursor: not-allowed;
  }

  /* Slightly larger min-height on desktop where there's room */
  @media (min-width: 768px) {
    .btn-cal {
      min-height: 4.5rem;
    }
  }
</style>
