<script lang="ts">
  import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const MODELS = [
    { value: "Xenova/whisper-tiny", label: "Whisper Tiny (~75MB, fast)" },
    { value: "Xenova/whisper-tiny.en", label: "Whisper Tiny EN (English-only, ~75MB)" },
    { value: "Xenova/whisper-base", label: "Whisper Base (~145MB)" },
    { value: "Xenova/whisper-small", label: "Whisper Small (~485MB)" },
  ];

  const LANGUAGES = [
    "auto", "english", "spanish", "french", "german", "italian", "portuguese",
    "dutch", "russian", "polish", "turkish", "chinese", "japanese", "korean",
    "arabic", "hindi", "vietnamese", "thai", "indonesian", "ukrainian",
  ];

  let selectedModel = $state(MODELS[0].value);
  let language = $state("auto");
  let task = $state<"transcribe" | "translate">("transcribe");
  let returnTimestamps = $state(true);

  let pipe: AutomaticSpeechRecognitionPipeline | null = null;
  let currentModelId = "";
  let isLoading = $state(false);
  let isRunning = $state(false);
  let loadProgress = $state(0);
  let statusMessage = $state("");
  let errorMessage = $state("");

  // Audio sources
  let audioFile = $state<File | null>(null);
  let audioUrl = $state("");
  let isRecording = $state(false);
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordedBlob = $state<Blob | null>(null);
  let recordedUrl = $state("");
  let recordingDuration = $state(0);
  let recTimer: number | null = null;

  // Result
  let resultText = $state("");
  let resultChunks = $state<{ text: string; timestamp: [number, number] }[]>([]);

  async function loadModel() {
    if (pipe && currentModelId === selectedModel) return pipe;
    isLoading = true;
    errorMessage = "";
    loadProgress = 0;
    statusMessage = "Loading Whisper model…";

    try {
      const fileProgress: Record<string, number> = {};
      const instance = await pipeline("automatic-speech-recognition", selectedModel, {
        progress_callback: (p: { status: string; file?: string; progress?: number }) => {
          if (p.status === "progress" && p.file) {
            fileProgress[p.file] = p.progress ?? 0;
            const files = Object.values(fileProgress);
            loadProgress = files.reduce((a, b) => a + b, 0) / files.length;
            statusMessage = `Loading ${p.file.split("/").pop()} (${Math.round(p.progress ?? 0)}%)`;
          } else if (p.status === "ready") {
            loadProgress = 100;
            statusMessage = "Model ready!";
          } else if (p.status === "download" && p.file) {
            statusMessage = `Downloading ${p.file.split("/").pop()}…`;
          }
        },
      });
      pipe = instance as AutomaticSpeechRecognitionPipeline;
      currentModelId = selectedModel;
      isLoading = false;
      statusMessage = "";
      return pipe;
    } catch (e) {
      isLoading = false;
      errorMessage = `Failed to load model: ${(e as Error).message}`;
      throw e;
    }
  }

  // Decode audio file/blob into Float32Array at 16kHz mono
  async function decodeAudio(input: Blob | File): Promise<Float32Array> {
    const arrayBuffer = await input.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 16000 });
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      // Mix down to mono
      const mono = new Float32Array(decoded.length);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const data = decoded.getChannelData(ch);
        for (let i = 0; i < data.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
      }
      // Resample if needed
      if (decoded.sampleRate !== 16000) {
        return resample(mono, decoded.sampleRate, 16000);
      }
      return mono;
    } finally {
      ctx.close().catch(() => {});
    }
  }

  function resample(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
    if (srcRate === dstRate) return input;
    const ratio = srcRate / dstRate;
    const len = Math.floor(input.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const idx = i * ratio;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, input.length - 1);
      const frac = idx - lo;
      out[i] = input[lo] * (1 - frac) + input[hi] * frac;
    }
    return out;
  }

  async function transcribe(source: Blob | File) {
    errorMessage = "";
    resultText = "";
    resultChunks = [];
    try {
      const p = await loadModel();
      isRunning = true;
      statusMessage = "Decoding audio…";
      const audio = await decodeAudio(source);
      statusMessage = "Transcribing…";

      const opts: Record<string, unknown> = {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: returnTimestamps,
      };
      if (language !== "auto") opts.language = language;
      if (task) opts.task = task;

      const out = (await p(audio, opts)) as { text: string; chunks?: { text: string; timestamp: [number, number] }[] };
      resultText = out.text;
      resultChunks = out.chunks ?? [];
      statusMessage = "";
    } catch (e) {
      errorMessage = `Transcription failed: ${(e as Error).message}`;
    } finally {
      isRunning = false;
    }
  }

  function handleFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    audioFile = f;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(f);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      const mr = new MediaRecorder(stream);
      mediaRecorder = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mr.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: mr.mimeType || "audio/webm" });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        recordedUrl = URL.createObjectURL(recordedBlob);
        stream.getTracks().forEach((t) => {
          t.stop();
        });
      };
      mr.start();
      isRecording = true;
      recordingDuration = 0;
      recTimer = window.setInterval(() => recordingDuration++, 1000);
    } catch (e) {
      errorMessage = `Microphone error: ${(e as Error).message}`;
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    isRecording = false;
    if (recTimer) {
      clearInterval(recTimer);
      recTimer = null;
    }
  }

  function downloadText() {
    const blob = new Blob([resultText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyText() {
    navigator.clipboard.writeText(resultText).catch(() => {});
  }

  function fmtTime(s: number): string {
    if (!Number.isFinite(s)) return "?";
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return `${m}:${sec.padStart(4, "0")}`;
  }
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-4xl mx-auto space-y-6">

    <!-- Settings -->
    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label for="w-model" class="block text-xs text-(--color-text-light) mb-1">Model</label>
          <select id="w-model" bind:value={selectedModel} disabled={isLoading || isRunning}
            class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm">
            {#each MODELS as m}<option value={m.value}>{m.label}</option>{/each}
          </select>
        </div>
        <div>
          <label for="w-lang" class="block text-xs text-(--color-text-light) mb-1">Language</label>
          <select id="w-lang" bind:value={language} disabled={isRunning}
            class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm capitalize">
            {#each LANGUAGES as l}<option value={l}>{l}</option>{/each}
          </select>
        </div>
        <div>
          <label for="w-task" class="block text-xs text-(--color-text-light) mb-1">Task</label>
          <select id="w-task" bind:value={task} disabled={isRunning}
            class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm">
            <option value="transcribe">Transcribe</option>
            <option value="translate">Translate to English</option>
          </select>
        </div>
        <div class="flex items-end">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={returnTimestamps} class="accent-(--color-accent)" />
            Timestamps
          </label>
        </div>
      </div>

      {#if isLoading}
        <div class="mt-3">
          <div class="text-xs text-(--color-text-light) mb-1">{statusMessage}</div>
          <div class="w-full h-2 bg-(--color-bg) rounded overflow-hidden">
            <div class="h-full bg-(--color-accent) transition-all" style="width: {loadProgress}%"></div>
          </div>
        </div>
      {/if}
    </section>

    <!-- Upload -->
    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <h3 class="font-medium mb-3">Audio source</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- File upload -->
        <div>
          <label for="audio-file" class="block text-xs text-(--color-text-light) mb-1">Upload audio file</label>
          <input
            id="audio-file"
            type="file"
            accept="audio/*,video/*"
            onchange={handleFile}
            disabled={isRunning}
            class="w-full text-sm"
          />
          {#if audioUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <audio src={audioUrl} controls class="w-full mt-2"></audio>
            <button onclick={() => audioFile && transcribe(audioFile)} disabled={isRunning || isLoading}
              class="mt-2 px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40">
              Transcribe file
            </button>
          {/if}
        </div>

        <!-- Mic recording -->
        <div>
          <div class="text-xs text-(--color-text-light) mb-1">Record from microphone</div>
          {#if !isRecording}
            <button onclick={startRecording} disabled={isRunning}
              class="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
              ● Start recording
            </button>
          {:else}
            <div class="flex items-center gap-2">
              <button onclick={stopRecording}
                class="px-3 py-1.5 text-sm border border-(--color-border) hover:bg-(--color-bg)">
                ■ Stop
              </button>
              <span class="text-sm text-red-500">● {recordingDuration}s</span>
            </div>
          {/if}
          {#if recordedUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <audio src={recordedUrl} controls class="w-full mt-2"></audio>
            <button onclick={() => recordedBlob && transcribe(recordedBlob)} disabled={isRunning || isLoading}
              class="mt-2 px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40">
              Transcribe recording
            </button>
          {/if}
        </div>
      </div>
    </section>

    {#if errorMessage}
      <div class="border border-red-500/40 bg-red-500/10 text-red-500 p-3 text-sm">{errorMessage}</div>
    {/if}

    {#if isRunning}
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-3 text-sm text-center">
        <span class="inline-block animate-pulse">⏳ {statusMessage || "Processing…"}</span>
      </div>
    {/if}

    {#if resultText}
      <section class="border border-(--color-border) bg-(--color-bg-alt)">
        <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between">
          <h3 class="font-medium">Transcript</h3>
          <div class="flex gap-2">
            <button onclick={copyText} class="px-3 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg)">Copy</button>
            <button onclick={downloadText} class="px-3 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg)">Download</button>
          </div>
        </div>
        <div class="p-4">
          <p class="whitespace-pre-wrap">{resultText}</p>
          {#if resultChunks.length > 0}
            <details class="mt-4">
              <summary class="cursor-pointer text-xs text-(--color-text-light) hover:text-(--color-text)">
                Show timestamps ({resultChunks.length} segments)
              </summary>
              <div class="mt-2 text-xs font-mono space-y-1">
                {#each resultChunks as c}
                  <div>
                    <span class="text-(--color-text-light)">[{fmtTime(c.timestamp[0])} – {fmtTime(c.timestamp[1])}]</span>
                    {c.text}
                  </div>
                {/each}
              </div>
            </details>
          {/if}
        </div>
      </section>
    {/if}

  </div>
</div>
