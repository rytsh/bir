<script lang="ts">
  type TestPhase = "idle" | "latency" | "download" | "upload" | "done";

  interface SpeedSample {
    time: number;  // seconds since test start
    mbps: number;
    type: "download" | "upload";
  }

  let phase = $state<TestPhase>("idle");
  let progress = $state(0);
  let latencyMs = $state(0);
  let downloadMbps = $state(0);
  let uploadMbps = $state(0);
  let error = $state("");
  let abortController = $state<AbortController | null>(null);
  let samples = $state<SpeedSample[]>([]);
  let testStartTime = $state(0);

  // History
  interface SpeedResult {
    date: string;
    latency: number;
    download: number;
    upload: number;
  }
  let history = $state<SpeedResult[]>([]);

  $effect(() => {
    try {
      const saved = localStorage.getItem("speed-test-history");
      if (saved) history = JSON.parse(saved);
    } catch {
      // ignore
    }
  });

  function saveHistory() {
    try {
      localStorage.setItem("speed-test-history", JSON.stringify(history.slice(-20)));
    } catch {
      // ignore
    }
  }

  const TEST_URL = "https://speed.cloudflare.com/__down?bytes=";
  const UPLOAD_URL = "https://speed.cloudflare.com/__up";

  async function measureLatency(signal: AbortSignal): Promise<number> {
    const pings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      try {
        await fetch(TEST_URL + "0", { signal, cache: "no-store" });
        const end = performance.now();
        pings.push(end - start);
      } catch {
        if (signal.aborted) throw new Error("Aborted");
      }
      progress = ((i + 1) / 5) * 100;
    }
    if (pings.length === 0) return 0;
    pings.sort((a, b) => a - b);
    if (pings.length > 2) {
      pings.shift();
      pings.pop();
    }
    return pings.reduce((a, b) => a + b, 0) / pings.length;
  }

  async function measureDownload(signal: AbortSignal): Promise<number> {
    const sizes = [100_000, 1_000_000, 5_000_000, 10_000_000, 25_000_000];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      if (signal.aborted) throw new Error("Aborted");
      progress = ((i + 1) / sizes.length) * 100;
      const start = performance.now();
      try {
        const res = await fetch(TEST_URL + sizes[i], { signal, cache: "no-store" });
        const blob = await res.blob();
        const end = performance.now();
        const elapsed = (end - start) / 1000;
        if (i > 0) {
          totalBytes += blob.size;
          totalTime += elapsed;
        }
        if (totalTime > 0) {
          downloadMbps = (totalBytes * 8) / (totalTime * 1_000_000);
          // Record sample
          const sampleTime = (performance.now() - testStartTime) / 1000;
          samples = [...samples, { time: sampleTime, mbps: downloadMbps, type: "download" }];
        }
        if (totalTime > 8) break;
      } catch {
        if (signal.aborted) throw new Error("Aborted");
        break;
      }
    }
    return totalTime > 0 ? (totalBytes * 8) / (totalTime * 1_000_000) : 0;
  }

  async function measureUpload(signal: AbortSignal): Promise<number> {
    const sizes = [100_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      if (signal.aborted) throw new Error("Aborted");
      progress = ((i + 1) / sizes.length) * 100;
      const data = new Uint8Array(sizes[i]);
      for (let j = 0; j < data.length; j += 4) {
        data[j] = j & 0xff;
      }
      const start = performance.now();
      try {
        await fetch(UPLOAD_URL, {
          method: "POST",
          body: data,
          signal,
          headers: { "Content-Type": "application/octet-stream" },
        });
        const end = performance.now();
        const elapsed = (end - start) / 1000;
        if (i > 0) {
          totalBytes += sizes[i];
          totalTime += elapsed;
        }
        if (totalTime > 0) {
          uploadMbps = (totalBytes * 8) / (totalTime * 1_000_000);
          const sampleTime = (performance.now() - testStartTime) / 1000;
          samples = [...samples, { time: sampleTime, mbps: uploadMbps, type: "upload" }];
        }
        if (totalTime > 8) break;
      } catch {
        if (signal.aborted) throw new Error("Aborted");
        break;
      }
    }
    return totalTime > 0 ? (totalBytes * 8) / (totalTime * 1_000_000) : 0;
  }

  async function runTest() {
    error = "";
    latencyMs = 0;
    downloadMbps = 0;
    uploadMbps = 0;
    progress = 0;
    samples = [];
    testStartTime = performance.now();

    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      phase = "latency";
      latencyMs = await measureLatency(signal);

      phase = "download";
      progress = 0;
      downloadMbps = await measureDownload(signal);

      phase = "upload";
      progress = 0;
      uploadMbps = await measureUpload(signal);

      phase = "done";
      progress = 100;

      history = [...history, {
        date: new Date().toLocaleString(),
        latency: Math.round(latencyMs),
        download: Math.round(downloadMbps * 100) / 100,
        upload: Math.round(uploadMbps * 100) / 100,
      }];
      saveHistory();
    } catch (err) {
      if (err instanceof Error && err.message === "Aborted") {
        phase = "idle";
      } else {
        error = err instanceof Error ? err.message : "Speed test failed. This may be due to network restrictions or CORS policy.";
        phase = "idle";
      }
    }
    abortController = null;
  }

  function cancelTest() {
    if (abortController) {
      abortController.abort();
    }
  }

  function clearHistory() {
    history = [];
    try {
      localStorage.removeItem("speed-test-history");
    } catch {
      // ignore
    }
  }

  function formatSpeed(mbps: number): string {
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${(mbps * 1000).toFixed(0)} Kbps`;
  }

  const isRunning = $derived(phase !== "idle" && phase !== "done");

  const phaseSteps = $derived.by(() => {
    const steps = [
      { id: "latency" as TestPhase, label: "Latency" },
      { id: "download" as TestPhase, label: "Download" },
      { id: "upload" as TestPhase, label: "Upload" },
    ];
    return steps.map((s) => {
      const order = ["latency", "download", "upload"];
      const currentIdx = order.indexOf(phase);
      const stepIdx = order.indexOf(s.id);
      let status: "pending" | "active" | "done" = "pending";
      if (phase === "done" || stepIdx < currentIdx) status = "done";
      else if (s.id === phase) status = "active";
      return { ...s, status };
    });
  });

  // Chart constants
  const CHART_W = 600;
  const CHART_H = 180;
  const PAD_L = 50;
  const PAD_R = 16;
  const PAD_T = 12;
  const PAD_B = 28;
  const PLOT_W = CHART_W - PAD_L - PAD_R;
  const PLOT_H = CHART_H - PAD_T - PAD_B;

  const downloadSamples = $derived(samples.filter((s) => s.type === "download"));
  const uploadSamples = $derived(samples.filter((s) => s.type === "upload"));

  const chartMaxMbps = $derived.by(() => {
    const allMbps = samples.map((s) => s.mbps);
    if (allMbps.length === 0) return 100;
    const max = Math.max(...allMbps);
    // Round up to a nice number
    if (max <= 10) return 10;
    if (max <= 25) return 25;
    if (max <= 50) return 50;
    if (max <= 100) return 100;
    if (max <= 250) return 250;
    if (max <= 500) return 500;
    if (max <= 1000) return 1000;
    return Math.ceil(max / 500) * 500;
  });

  const chartMaxTime = $derived.by(() => {
    if (samples.length === 0) return 20;
    const max = Math.max(...samples.map((s) => s.time));
    return Math.ceil(max / 5) * 5;
  });

  function samplesToPath(pts: SpeedSample[]): string {
    if (pts.length === 0) return "";
    return pts
      .map((s, i) => {
        const x = PAD_L + (s.time / chartMaxTime) * PLOT_W;
        const y = PAD_T + PLOT_H - (s.mbps / chartMaxMbps) * PLOT_H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function samplesToArea(pts: SpeedSample[]): string {
    if (pts.length === 0) return "";
    const linePath = samplesToPath(pts);
    const lastX = PAD_L + (pts[pts.length - 1].time / chartMaxTime) * PLOT_W;
    const firstX = PAD_L + (pts[0].time / chartMaxTime) * PLOT_W;
    const baseY = PAD_T + PLOT_H;
    return `${linePath} L${lastX.toFixed(1)},${baseY} L${firstX.toFixed(1)},${baseY} Z`;
  }

  const downloadPath = $derived(samplesToPath(downloadSamples));
  const downloadArea = $derived(samplesToArea(downloadSamples));
  const uploadPath = $derived(samplesToPath(uploadSamples));
  const uploadArea = $derived(samplesToArea(uploadSamples));

  // Y-axis gridlines
  const yGridLines = $derived.by(() => {
    const lines: number[] = [];
    const step = chartMaxMbps <= 50 ? 10 : chartMaxMbps <= 250 ? 50 : chartMaxMbps <= 1000 ? 200 : 500;
    for (let v = 0; v <= chartMaxMbps; v += step) {
      lines.push(v);
    }
    return lines;
  });

  // X-axis labels
  const xLabels = $derived.by(() => {
    const labels: number[] = [];
    const step = chartMaxTime <= 10 ? 2 : chartMaxTime <= 30 ? 5 : 10;
    for (let v = 0; v <= chartMaxTime; v += step) {
      labels.push(v);
    }
    return labels;
  });

  // Phase region boundaries for background shading
  const downloadTimeRange = $derived.by(() => {
    if (downloadSamples.length === 0) return null;
    return { start: downloadSamples[0].time, end: downloadSamples[downloadSamples.length - 1].time };
  });
  const uploadTimeRange = $derived.by(() => {
    if (uploadSamples.length === 0) return null;
    return { start: uploadSamples[0].time, end: uploadSamples[uploadSamples.length - 1].time };
  });
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Estimate your internet connection speed by measuring latency, download, and upload throughput using Cloudflare's speed test endpoints.
    </p>
  </header>

  {#if error}
    <div class="flex-none p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <div class="flex-1 flex flex-col gap-4 overflow-auto min-h-0">
    <!-- Phase steps indicator -->
    {#if isRunning || phase === "done"}
      <div class="flex-none flex items-center gap-0 py-2 px-3 bg-(--color-bg-alt) border border-(--color-border)">
        {#each phaseSteps as step, i}
          {#if i > 0}
            <div class="flex-1 h-px mx-2 {step.status === 'pending' ? 'bg-(--color-border)' : 'bg-(--color-accent)'}"></div>
          {/if}
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 flex items-center justify-center border text-xs font-mono
              {step.status === 'done'
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : step.status === 'active'
                  ? 'border-(--color-accent) text-(--color-accent)'
                  : 'border-(--color-border) text-(--color-text-light)'}">
              {#if step.status === "done"}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1.5,5.5 4,8 8.5,2"/></svg>
              {:else}
                {i + 1}
              {/if}
            </div>
            <span class="text-xs font-medium {step.status === 'active' ? 'text-(--color-text)' : 'text-(--color-text-muted)'}">{step.label}</span>
          </div>
        {/each}

        {#if isRunning}
          <div class="ml-auto flex items-center gap-2">
            <span class="text-xs font-mono text-(--color-text-muted)">{Math.round(progress)}%</span>
            <button
              onclick={cancelTest}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Cancel
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Results row -->
    <div class="flex-none flex items-stretch gap-0 border border-(--color-border) bg-(--color-bg-alt)">
      <div class="flex-1 p-3 flex flex-col items-center gap-0.5 border-r border-(--color-border)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Download</span>
        <span class="font-mono text-2xl font-bold text-(--color-text) tabular-nums">
          {downloadMbps > 0 ? formatSpeed(downloadMbps) : "—"}
        </span>
      </div>
      <div class="flex-1 p-3 flex flex-col items-center gap-0.5 border-r border-(--color-border)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Upload</span>
        <span class="font-mono text-2xl font-bold text-(--color-text) tabular-nums">
          {uploadMbps > 0 ? formatSpeed(uploadMbps) : "—"}
        </span>
      </div>
      <div class="flex-1 p-3 flex flex-col items-center gap-0.5">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Latency</span>
        <span class="font-mono text-2xl font-bold text-(--color-text) tabular-nums">
          {latencyMs > 0 ? `${Math.round(latencyMs)} ms` : "—"}
        </span>
      </div>
    </div>

    <!-- Time series chart -->
    {#if samples.length > 0 || isRunning}
      <div class="flex-none p-3 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Speed over time</span>
          {#if samples.length > 0}
            <div class="flex items-center gap-4 text-xs">
              <span class="flex items-center gap-1.5">
                <span class="inline-block w-3 h-0.5" style="background: var(--color-accent)"></span>
                <span class="text-(--color-text-muted)">Download</span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="inline-block w-3 h-0.5" style="background: var(--color-text-muted)"></span>
                <span class="text-(--color-text-muted)">Upload</span>
              </span>
            </div>
          {/if}
        </div>
        <svg viewBox="0 0 {CHART_W} {CHART_H}" class="w-full" style="height: 180px;" preserveAspectRatio="xMidYMid meet">
          <!-- Y-axis gridlines -->
          {#each yGridLines as v}
            {@const y = PAD_T + PLOT_H - (v / chartMaxMbps) * PLOT_H}
            <line x1={PAD_L} y1={y} x2={PAD_L + PLOT_W} y2={y} stroke="var(--color-border)" stroke-width="0.5" />
            <text x={PAD_L - 6} y={y + 3} text-anchor="end" fill="var(--color-text-light)" font-size="9" font-family="var(--font-mono)">{v}</text>
          {/each}

          <!-- X-axis labels -->
          {#each xLabels as v}
            {@const x = PAD_L + (v / chartMaxTime) * PLOT_W}
            <text x={x} y={CHART_H - 4} text-anchor="middle" fill="var(--color-text-light)" font-size="9" font-family="var(--font-mono)">{v}s</text>
          {/each}

          <!-- Y-axis label -->
          <text x="10" y={PAD_T + PLOT_H / 2} text-anchor="middle" fill="var(--color-text-light)" font-size="8" font-family="var(--font-mono)" transform="rotate(-90, 10, {PAD_T + PLOT_H / 2})">Mbps</text>

          <!-- Phase region shading -->
          {#if downloadTimeRange}
            {@const x1 = PAD_L + (downloadTimeRange.start / chartMaxTime) * PLOT_W}
            {@const x2 = PAD_L + (downloadTimeRange.end / chartMaxTime) * PLOT_W}
            <rect x={x1} y={PAD_T} width={x2 - x1} height={PLOT_H} fill="var(--color-accent)" opacity="0.04" />
          {/if}
          {#if uploadTimeRange}
            {@const x1 = PAD_L + (uploadTimeRange.start / chartMaxTime) * PLOT_W}
            {@const x2 = PAD_L + (uploadTimeRange.end / chartMaxTime) * PLOT_W}
            <rect x={x1} y={PAD_T} width={x2 - x1} height={PLOT_H} fill="var(--color-text-muted)" opacity="0.06" />
          {/if}

          <!-- Download area + line -->
          {#if downloadArea}
            <path d={downloadArea} fill="var(--color-accent)" opacity="0.12" />
          {/if}
          {#if downloadPath}
            <path d={downloadPath} fill="none" stroke="var(--color-accent)" stroke-width="2" />
            <!-- Data points -->
            {#each downloadSamples as s}
              {@const x = PAD_L + (s.time / chartMaxTime) * PLOT_W}
              {@const y = PAD_T + PLOT_H - (s.mbps / chartMaxMbps) * PLOT_H}
              <circle cx={x} cy={y} r="3" fill="var(--color-accent)" />
            {/each}
          {/if}

          <!-- Upload area + line -->
          {#if uploadArea}
            <path d={uploadArea} fill="var(--color-text-muted)" opacity="0.1" />
          {/if}
          {#if uploadPath}
            <path d={uploadPath} fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-dasharray="4,3" />
            {#each uploadSamples as s}
              {@const x = PAD_L + (s.time / chartMaxTime) * PLOT_W}
              {@const y = PAD_T + PLOT_H - (s.mbps / chartMaxMbps) * PLOT_H}
              <circle cx={x} cy={y} r="3" fill="var(--color-text-muted)" />
            {/each}
          {/if}

          <!-- Axes -->
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H} stroke="var(--color-border)" stroke-width="1" />
          <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H} stroke="var(--color-border)" stroke-width="1" />
        </svg>
      </div>
    {/if}

    <!-- Start / Run Again button -->
    <div class="flex-none">
      {#if phase === "idle" || phase === "done"}
        <button
          onclick={runTest}
          class="px-6 py-3 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors"
        >
          {#if phase === "done"}
            <span class="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Run Again
            </span>
          {:else}
            Start Test
          {/if}
        </button>
      {/if}
    </div>

    <!-- History -->
    {#if history.length > 0}
      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">History</span>
          <button
            onclick={clearHistory}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
        <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-(--color-border)">
                <th class="text-left py-2 px-3 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Date</th>
                <th class="text-right py-2 px-3 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Ping</th>
                <th class="text-right py-2 px-3 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Download</th>
                <th class="text-right py-2 px-3 text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Upload</th>
              </tr>
            </thead>
            <tbody>
              {#each [...history].reverse() as result}
                <tr class="border-b border-(--color-border) last:border-b-0">
                  <td class="py-2 px-3 text-(--color-text-muted) text-xs">{result.date}</td>
                  <td class="py-2 px-3 text-right font-mono text-(--color-text)">{result.latency} ms</td>
                  <td class="py-2 px-3 text-right font-mono text-(--color-text)">{formatSpeed(result.download)}</td>
                  <td class="py-2 px-3 text-right font-mono text-(--color-text)">{formatSpeed(result.upload)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <!-- Disclaimer -->
    <p class="text-xs text-(--color-text-light) mt-auto">
      Results are approximate. Speed test uses Cloudflare's endpoints. Browser overhead, network congestion, and geographic distance to servers affect accuracy.
    </p>
  </div>
</div>
