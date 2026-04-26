<script lang="ts">
  // Ishihara-style color vision test. We render a grid of colored dots forming
  // a digit. The user selects what they see; we tally results and infer a
  // possible deficiency type.

  type AnswerType = "normal" | "protan" | "deutan" | "tritan" | "none";

  interface Plate {
    id: number;
    digit: string; // visible to people with normal vision
    fgColors: string[]; // foreground (digit) palette
    bgColors: string[]; // background palette
    // Secondary digit visible to a specific deficiency, optional
    altDigit?: string;
    altType?: AnswerType;
  }

  // Colour pairings designed to roughly mimic classic Ishihara plates.
  // Note: this is for educational/casual screening only and is NOT a medical test.
  const plates: Plate[] = [
    {
      id: 1,
      digit: "12",
      // Demo plate, visible to everyone
      fgColors: ["#d97706", "#b45309", "#f59e0b"],
      bgColors: ["#a3a3a3", "#737373", "#d4d4d4"],
    },
    {
      id: 2,
      digit: "8",
      fgColors: ["#dc2626", "#b91c1c", "#ef4444"], // red
      bgColors: ["#16a34a", "#15803d", "#22c55e", "#65a30d"], // green/olive
      altDigit: "3",
      altType: "protan",
    },
    {
      id: 3,
      digit: "29",
      fgColors: ["#dc2626", "#ef4444", "#f87171"],
      bgColors: ["#65a30d", "#16a34a", "#84cc16"],
      altDigit: "70",
      altType: "deutan",
    },
    {
      id: 4,
      digit: "5",
      fgColors: ["#16a34a", "#22c55e", "#15803d"],
      bgColors: ["#dc2626", "#b45309", "#92400e"],
      altDigit: "2",
      altType: "deutan",
    },
    {
      id: 5,
      digit: "74",
      fgColors: ["#0891b2", "#0e7490", "#06b6d4"], // teal/cyan
      bgColors: ["#eab308", "#ca8a04", "#facc15"], // yellow
      altDigit: "21",
      altType: "tritan",
    },
    {
      id: 6,
      digit: "6",
      fgColors: ["#dc2626", "#ef4444", "#b91c1c"],
      bgColors: ["#65a30d", "#84cc16", "#a3e635"],
      altDigit: "",
      altType: "protan",
    },
  ];

  let plateIndex = $state(0);
  let answers = $state<{ plateId: number; answer: string }[]>([]);
  let userInput = $state("");
  let phase = $state<"intro" | "test" | "result">("intro");

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  const W = 400;
  const H = 400;

  function drawPlate(plate: Plate) {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;

    canvasRef.width = W;
    canvasRef.height = H;
    ctx.clearRect(0, 0, W, H);

    // Pre-render digit shape into offscreen mask
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, W, H);
    octx.fillStyle = "#fff";
    octx.font = "bold 220px sans-serif";
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillText(plate.digit, W / 2, H / 2);
    const maskData = octx.getImageData(0, 0, W, H).data;

    // Random circles within a circular plate boundary
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) / 2 - 4;

    // Background fill
    ctx.fillStyle = "#0f0f0f";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    const dotsToTry = 1500;
    const dots: { x: number; y: number; r: number; fg: boolean }[] = [];

    for (let i = 0; i < dotsToTry; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const r = 4 + Math.random() * 6;

      // Reject overlap
      let overlap = false;
      for (const d of dots) {
        const ddx = d.x - x;
        const ddy = d.y - y;
        if (ddx * ddx + ddy * ddy < (d.r + r) * (d.r + r)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;

      // Sample mask
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const idx = (iy * W + ix) * 4;
      const isFg = maskData[idx] > 128;

      dots.push({ x, y, r, fg: isFg });
    }

    for (const d of dots) {
      const palette = d.fg ? plate.fgColors : plate.bgColors;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  $effect(() => {
    if (phase === "test" && canvasRef) {
      const p = plates[plateIndex];
      if (p) drawPlate(p);
    }
  });

  function startTest() {
    phase = "test";
    plateIndex = 0;
    answers = [];
    userInput = "";
  }

  function regenerate() {
    if (phase === "test") drawPlate(plates[plateIndex]);
  }

  function submit() {
    const p = plates[plateIndex];
    answers = [...answers, { plateId: p.id, answer: userInput.trim() }];
    userInput = "";
    if (plateIndex < plates.length - 1) {
      plateIndex++;
    } else {
      phase = "result";
    }
  }

  function skip() {
    const p = plates[plateIndex];
    answers = [...answers, { plateId: p.id, answer: "" }];
    userInput = "";
    if (plateIndex < plates.length - 1) plateIndex++;
    else phase = "result";
  }

  function classifyResult() {
    let normalCount = 0;
    const tally: Record<AnswerType, number> = { normal: 0, protan: 0, deutan: 0, tritan: 0, none: 0 };
    for (const a of answers) {
      const plate = plates.find((p) => p.id === a.plateId);
      if (!plate) continue;
      const ans = a.answer.toLowerCase().replace(/\s/g, "");
      if (ans === plate.digit.toLowerCase()) normalCount++;
      else if (plate.altDigit && plate.altType && ans === plate.altDigit.toLowerCase()) {
        tally[plate.altType]++;
      } else if (ans === "") {
        tally.none++;
      }
    }
    return { normal: normalCount, protan: tally.protan, deutan: tally.deutan, tritan: tally.tritan, none: tally.none };
  }

  let result = $derived(phase === "result" ? classifyResult() : null);
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-3xl mx-auto space-y-6">

    {#if phase === "intro"}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6">
        <h2 class="text-xl font-medium mb-3">Color Vision Screening Test</h2>
        <p class="text-sm text-(--color-text-light) mb-3">
          A short Ishihara-style test. You'll see {plates.length} plates of colored dots.
          Type the number you see in each plate. Leave the field blank if you can't tell.
        </p>
        <div class="bg-yellow-900/20 border border-yellow-700/40 text-yellow-300 p-3 text-xs rounded mb-4">
          ⚠ For educational/casual screening only. Display calibration, lighting, and CSS rendering
          will affect results. This is NOT a medical diagnostic tool — see an optometrist for proper testing.
        </div>
        <button onclick={startTest} class="px-5 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Start test</button>
      </section>
    {:else if phase === "test"}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-medium">Plate {plateIndex + 1} of {plates.length}</h2>
          <button onclick={regenerate} class="text-xs text-(--color-accent) hover:underline">↻ Regenerate</button>
        </div>
        <div class="flex justify-center">
          <canvas bind:this={canvasRef} class="border border-(--color-border)" style="background: #0f0f0f; max-width: 100%;"></canvas>
        </div>
        <div class="mt-4">
          <label for="answer" class="block text-sm mb-1">What number do you see?</label>
          <div class="flex gap-2">
            <input
              id="answer"
              type="text"
              bind:value={userInput}
              onkeydown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. 12  (or leave blank)"
              class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text)"
              autofocus
            />
            <button onclick={submit} class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Next</button>
            <button onclick={skip} class="px-4 py-2 border border-(--color-border) hover:bg-(--color-bg)">Skip</button>
          </div>
        </div>
      </section>
    {:else if phase === "result" && result}
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-6">
        <h2 class="text-xl font-medium mb-3">Results</h2>
        <div class="space-y-2 text-sm mb-4">
          <div>Plates with normal answer: <span class="font-mono">{result.normal} / {plates.length}</span></div>
          {#if result.protan > 0}
            <div>Possible <strong>protan</strong> (red-deficient) responses: <span class="font-mono">{result.protan}</span></div>
          {/if}
          {#if result.deutan > 0}
            <div>Possible <strong>deutan</strong> (green-deficient) responses: <span class="font-mono">{result.deutan}</span></div>
          {/if}
          {#if result.tritan > 0}
            <div>Possible <strong>tritan</strong> (blue-deficient) responses: <span class="font-mono">{result.tritan}</span></div>
          {/if}
          {#if result.none > 0}
            <div>Skipped/blank: <span class="font-mono">{result.none}</span></div>
          {/if}
        </div>

        <div class="border-t border-(--color-border) pt-4">
          <h3 class="text-sm font-medium mb-2">Per-plate breakdown</h3>
          <div class="text-xs font-mono space-y-1">
            {#each plates as p, i}
              {@const a = answers[i]}
              <div class="flex gap-3">
                <span class="text-(--color-text-light)">#{p.id}</span>
                <span>expected: <strong>{p.digit}</strong></span>
                <span>got: <strong>{a?.answer || "—"}</strong></span>
                {#if p.altDigit}<span class="text-(--color-text-light)">(alt for {p.altType}: {p.altDigit})</span>{/if}
              </div>
            {/each}
          </div>
        </div>

        <button onclick={() => (phase = "intro")} class="mt-6 px-4 py-2 border border-(--color-border) hover:bg-(--color-bg)">Restart</button>
      </section>
    {/if}
  </div>
</div>
