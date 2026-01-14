<script lang="ts">
    import {
        env,
        pipeline,
        type TextGenerationPipeline,
    } from "@huggingface/transformers";
    import { onMount, tick } from "svelte";

    // Configuration for transformers.js
    env.allowLocalModels = false;

    // Models
    const MODELS = [
        {
            value: "HuggingFaceTB/SmolLM2-135M-Instruct",
            label: "SmolLM2-135M (Instruct, Fast, ~140MB)",
            supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
        },
        {
            value: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
            label: "SmolLM2-1.7B (Instruct, High Quality, ~1.7GB)",
            supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
        },
        {
            value: "Xenova/Phi-3-mini-4k-instruct",
            label: "Phi-3 Mini 4k (Instruct, Smart, ~2.5GB)",
            supportedDtypes: ["q4"],
        },
    ];

    // Available devices
    const DEVICES = [
        { value: "webgpu", label: "WebGPU (Fastest - Recommended)" },
        { value: "wasm", label: "WASM (CPU)" },
    ];

    // Data types / Quantization
    const DTYPES = [
        { value: "fp32", label: "fp32 (Full Precision)" },
        { value: "fp16", label: "fp16 (Half Precision)" },
        { value: "q8", label: "q8 (8-bit Quant)" },
        { value: "q4", label: "q4 (4-bit Quant)" },
        { value: "q4f16", label: "q4f16 (Optimized WebGPU)" },
    ];

    // System Prompt Presets
    const SYSTEM_PRESETS = [
        {
            id: "rewriter",
            name: "Polite Rewriter",
            prompt: "You are an AI writing assistant. Your task is to rewrite the user's message to make it more professional and approachable while maintaining its main points and key message. Do not return any text other than the rewritten message.",
            convertPrefix:
                "Rewrite the message below to make it friendly and approachable while maintaining its main points and key message.  This message not about you continue to process, not telling to you so process as 3rd party talks. Do not add any new information or return any text other than the rewritten message\nThe message:\n",
            params: { max_new_tokens: 50, temperature: 0.3 },
        },
        {
            id: "assistant",
            name: "Helpful Assistant",
            prompt: "You are a helpful and friendly AI assistant. Answer the user's questions clearly and concisely.",
            params: { max_new_tokens: 512, temperature: 0.7 },
        },
        {
            id: "coder",
            name: "Code Expert",
            prompt: "You are an expert programmer. Provide clean, efficient, and well-commented code examples. Explain your logic.",
            params: { max_new_tokens: 1024, temperature: 0.2 },
        },
        {
            id: "dude",
            name: "Dude",
            prompt: "You are my dude and best bro. Talk like a chill and casual person would, using slang and informal language. Keep it light and fun. Just continue the conservation as my dude.",
            params: { max_new_tokens: 40, temperature: 0.7, top_p: 0.7 },
        },
        {
            id: "custom",
            name: "Custom...",
            prompt: "",
        },
    ];

    type Message = {
        role: "user" | "assistant" | "system";
        content: string;
        timestamp: number;
    };

    // Storage key
    const STORAGE_KEY = "assistant-tool-settings";

    // Load saved settings from localStorage
    function loadSettings() {
        if (typeof window === "undefined") return null;
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    }

    // Save settings to localStorage
    function saveSettings() {
        if (typeof window === "undefined") return;
        try {
            const settings = {
                activeTab,
                selectedPresetId,
                selectedDevice,
                selectedModel,
                selectedDtype,
                genMaxTokens,
                genTemperature,
                genTopP,
                genRepetitionPenalty,
                customSystemPrompt,
                convertPrefix,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Ignore storage errors
        }
    }

    const savedSettings = loadSettings();

    // State
    let activeTab = $state<"chat" | "convert">(
        savedSettings?.activeTab ?? "convert",
    );
    let messages = $state<Message[]>([]);
    let userInput = $state("");

    // Convert Tab State
    let convertInput = $state("");
    let convertPrefix = $state(savedSettings?.convertPrefix ?? "");
    let convertOutput = $state("");

    // Generation Settings
    let genMaxTokens = $state(savedSettings?.genMaxTokens ?? 512);
    let genTemperature = $state(savedSettings?.genTemperature ?? 0.7);
    let genTopP = $state(savedSettings?.genTopP ?? 0.9);
    let genRepetitionPenalty = $state(
        savedSettings?.genRepetitionPenalty ?? 1.1,
    );

    // Diagnostics
    let activeDevice = $state<string>("checking...");
    let webGpuSupported = $state<boolean | null>(null);

    let isGenerating = $state(false);
    let isModelLoading = $state(false);
    let loadProgress = $state(0);
    let statusMessage = $state("");
    let errorMessage = $state("");
    let shouldStop = $state(false);

    let selectedPresetId = $state(
        savedSettings?.selectedPresetId ?? "rewriter",
    );
    let selectedDevice = $state(savedSettings?.selectedDevice ?? "webgpu");
    let selectedModel = $state(
        savedSettings?.selectedModel ?? "HuggingFaceTB/SmolLM2-135M-Instruct",
    );
    let selectedDtype = $state(savedSettings?.selectedDtype ?? "q4f16");
    let generator = $state<TextGenerationPipeline | null>(null);
    let currentModelId = $state("");

    // State
    let systemPrompt = $state("");
    let customSystemPrompt = $state(savedSettings?.customSystemPrompt ?? "");

    // Derived
    let activePreset = $derived(
        SYSTEM_PRESETS.find((p) => p.id === selectedPresetId),
    );

    let activeModel = $derived(MODELS.find((m) => m.value === selectedModel));

    let availableDtypes = $derived(
        DTYPES.filter((d) => activeModel?.supportedDtypes.includes(d.value)),
    );

    // Auto-select compatible dtype when model changes
    $effect(() => {
        if (
            activeModel &&
            !activeModel.supportedDtypes.includes(selectedDtype)
        ) {
            // Pick the best available dtype for this model
            const preferred = ["q4f16", "q4", "q8", "fp16", "fp32"];
            const compatible = preferred.find((d) =>
                activeModel.supportedDtypes.includes(d),
            );
            if (compatible) {
                selectedDtype = compatible;
            }
        }
    });

    // Watch for preset changes to update systemPrompt, convertPrefix and params
    $effect(() => {
        if (activePreset) {
            if (activePreset.id !== "custom") {
                systemPrompt = activePreset.prompt || "";
            } else {
                systemPrompt = customSystemPrompt;
            }

            if ("convertPrefix" in activePreset) {
                convertPrefix = (activePreset as any).convertPrefix;
            } else {
                convertPrefix = "";
            }

            if ("params" in activePreset) {
                const params = (activePreset as any).params;
                if (params.max_new_tokens !== undefined)
                    genMaxTokens = params.max_new_tokens;
                if (params.temperature !== undefined)
                    genTemperature = params.temperature;
            }
        }
    });

    // Mirror custom prompt to the local state if needed
    $effect(() => {
        if (selectedPresetId === "custom") {
            customSystemPrompt = systemPrompt;
        }
    });

    // Save settings to localStorage when they change
    $effect(() => {
        // Access all the values we want to track
        activeTab;
        selectedPresetId;
        selectedDevice;
        selectedModel;
        selectedDtype;
        genMaxTokens;
        genTemperature;
        genTopP;
        genRepetitionPenalty;
        customSystemPrompt;
        convertPrefix;
        // Save them
        saveSettings();
    });

    let chatContainer = $state<HTMLDivElement>();

    async function scrollToBottom() {
        await tick();
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    async function initModel() {
        if (generator && currentModelId === selectedModel) return generator;

        try {
            isModelLoading = true;
            errorMessage = "";
            statusMessage =
                "Downloading AI model... (Check your network tab if stuck)";

            console.log(`[Assistant] Initializing model: ${selectedModel}`);
            console.log(`[Assistant] Requested device: ${selectedDevice}`);

            // Check for WebGPU support if requested
            if (selectedDevice === "webgpu") {
                if ("gpu" in navigator) {
                    const adapter = await (
                        navigator as any
                    ).gpu.requestAdapter();
                    webGpuSupported = !!adapter;
                } else {
                    webGpuSupported = false;
                }
            }

            const task = selectedModel.includes("t5")
                ? "text2text-generation"
                : "text-generation";

            // Use explicitly selected dtype
            const dtype = selectedDtype;

            console.log(
                `[Assistant] Using device: ${selectedDevice}, dtype: ${dtype}`,
            );

            // Track progress across multiple files
            const fileProgress: Record<string, number> = {};

            const instance = await pipeline(task, selectedModel, {
                device: selectedDevice as any,
                dtype: dtype as any,
                progress_callback: (p: any) => {
                    if (p.status === "progress" && p.file) {
                        fileProgress[p.file] = p.progress;
                        // Calculate average progress across all files
                        const files = Object.values(fileProgress);
                        const avgProgress =
                            files.reduce((a, b) => a + b, 0) / files.length;
                        loadProgress = avgProgress;
                        statusMessage = `Downloading: ${p.file.split("/").pop()} (${Math.round(p.progress)}%)`;
                    } else if (p.status === "ready") {
                        loadProgress = 100;
                        statusMessage = "Model loaded!";
                    } else if (p.status === "initiate" && p.file) {
                        fileProgress[p.file] = 0;
                        statusMessage = `Initiating: ${p.file.split("/").pop()}`;
                    }
                },
            });

            generator = instance as TextGenerationPipeline;
            currentModelId = selectedModel;

            // Diagnostics: Check where it actually ended up
            activeDevice = (generator as any).device || selectedDevice;
            console.log(`[Assistant] Model loaded successfully!`);
            console.log(`[Assistant] Active backend: ${activeDevice}`);
            console.log(
                `[Assistant] Actual dtype: ${(generator as any).dtype || dtype}`,
            );

            isModelLoading = false;
            statusMessage = "";
            return generator;
        } catch (err: any) {
            isModelLoading = false;
            let detail = err.message || String(err) || "Unknown error";

            // Handle common error cases
            if (detail.includes("Aborted") || detail.includes("memory")) {
                detail =
                    "Memory limit exceeded. Try a smaller model or different quantization (q4/q8).";
            } else if (
                detail.includes("await") ||
                /^\d+$/.test(detail.trim())
            ) {
                // WebAssembly/memory errors often show as numbers or "await" errors
                detail =
                    "Model loading failed (likely out of memory). Try a smaller model, different quantization, or switch to WASM device.";
            } else if (
                detail.includes("WebGPU") ||
                detail.includes("adapter")
            ) {
                detail =
                    "WebGPU not available or failed. Try switching to WASM device.";
            }

            errorMessage = `Failed to load model: ${detail}`;
            console.error("[Assistant] Init Error:", err);
            throw err;
        }
    }

    async function generateCore(inputs: any, model: any) {
        statusMessage = "Thinking...";
        shouldStop = false;
        console.log("[Assistant] Starting generation...");
        const timerName = "[Assistant] Generation Time";
        console.time(timerName);

        try {
            // Settings based on model
            const max_new_tokens = genMaxTokens;
            const do_sample = true;
            const temperature = genTemperature;
            const top_p = genTopP;
            const repetition_penalty = genRepetitionPenalty;

            const output = await model(inputs, {
                max_new_tokens,
                temperature,
                do_sample,
                top_p,
                repetition_penalty,
                return_full_text: false,
                // Stopping criteria to allow manual interruption
                stopping_criteria: [
                    (ids: any) => {
                        if (shouldStop) {
                            console.log(
                                "[Assistant] Stopping via stopping_criteria",
                            );
                        }
                        return shouldStop;
                    },
                ],
                // Fallback: Check stop in callback and throw to interrupt
                callback_function: () => {
                    if (shouldStop) {
                        console.log(
                            "[Assistant] Interrupting via callback_function",
                        );
                        throw new Error("GENERATION_INTERRUPTED");
                    }
                },
            });

            let generatedText = "";
            if (Array.isArray(output)) {
                const result = output[0] as any;
                if (result.generated_text) {
                    if (Array.isArray(result.generated_text)) {
                        // Some pipelines return array of messages
                        const lastMsg =
                            result.generated_text[
                                result.generated_text.length - 1
                            ];
                        generatedText =
                            lastMsg.role === "assistant" ? lastMsg.content : "";
                    } else if (typeof result.generated_text === "string") {
                        generatedText = result.generated_text;
                    }
                }
            }
            return generatedText;
        } finally {
            console.timeEnd(timerName);
        }
    }

    async function handleSubmit() {
        if (!userInput.trim() || isGenerating) return;

        const text = userInput;
        userInput = "";
        errorMessage = "";

        // Add user message
        messages = [
            ...messages,
            { role: "user", content: text, timestamp: Date.now() },
        ];
        await scrollToBottom();

        try {
            isGenerating = true;
            const model = await initModel();

            // Construct prompt based on model requirement
            const chatHistory = [
                { role: "system", content: systemPrompt },
                ...messages,
            ];

            const responseText = await generateCore(chatHistory, model);

            if (responseText) {
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content: responseText,
                        timestamp: Date.now(),
                    },
                ];
            } else {
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content: "(No response generated)",
                        timestamp: Date.now(),
                    },
                ];
            }

            await scrollToBottom();
        } catch (err: any) {
            if (err.message === "GENERATION_INTERRUPTED") {
                console.log("[Assistant] Generation was manually stopped.");
                statusMessage = "Generation stopped.";
                return;
            }
            errorMessage = `Error generating response: ${err.message}`;
            console.error(err);
        } finally {
            isGenerating = false;
            statusMessage = "";
        }
    }

    async function handleConvert() {
        if (!convertInput.trim() || isGenerating) return;

        convertOutput = "";
        errorMessage = "";

        try {
            isGenerating = true;
            const model = await initModel();

            // For one-shot conversion, we construct a simple prompt depending on user intent
            // But since we just have input, we treat it as a user message with system prompt
            let fullInput = convertPrefix
                ? `${convertPrefix}\n${convertInput}`
                : convertInput;
            let inputs;

            if (
                selectedModel.includes("t5") ||
                selectedModel.includes("base")
            ) {
                // Base models/Seq2Seq often work better with raw input
                inputs = fullInput;
            } else {
                // Chat models
                inputs = [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: fullInput },
                ];
            }

            const responseText = await generateCore(inputs, model);
            convertOutput = responseText || "(No output)";
        } catch (err: any) {
            if (err.message === "GENERATION_INTERRUPTED") {
                console.log("[Assistant] Conversion was manually stopped.");
                statusMessage = "Generation stopped.";
                return;
            }
            errorMessage = `Error converting: ${err.message}`;
        } finally {
            isGenerating = false;
            statusMessage = "";
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    function clearChat() {
        messages = [];
    }

    function stopGeneration() {
        console.log("[Assistant] Stop button clicked");
        shouldStop = true;
        statusMessage = "Generation stopped.";
    }

    function resetSettings() {
        if (activePreset) {
            const params = (activePreset as any).params || {};
            genMaxTokens =
                params.max_new_tokens !== undefined
                    ? params.max_new_tokens
                    : 512;
            genTemperature =
                params.temperature !== undefined ? params.temperature : 0.7;
            genTopP = 0.9;
            genRepetitionPenalty = 1.1;

            if (activeTab === "convert" && "convertPrefix" in activePreset) {
                convertPrefix = (activePreset as any).convertPrefix;
            }

            systemPrompt = activePreset.prompt || "";
        } else {
            // Defaults for custom
            genMaxTokens = 512;
            genTemperature = 0.7;
            genTopP = 0.9;
            genRepetitionPenalty = 1.1;
            systemPrompt = "";
        }
    }

    // Format preset timestamp
    function formatTime(ts: number) {
        return new Date(ts).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

<div class="h-full flex flex-col gap-4">
    <header>
        <p class="text-sm text-(--color-text-muted)">
            Chat with a local AI assistant. Everything runs privately in your
            browser. Large models require more memory and a WebGPU-capable
            device.
        </p>
    </header>

    {#if errorMessage}
        <div
            class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm"
        >
            {errorMessage}
        </div>
    {/if}

    <div class="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <!-- Sidebar / Settings -->
        <div class="lg:w-72 flex flex-col gap-2">
            <div
                class="px-4 py-2 border border-(--color-border) bg-(--color-bg-alt) flex flex-col gap-2"
            >
                <div>
                    <h3
                        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
                    >
                        Model
                    </h3>
                    <select
                        bind:value={selectedModel}
                        disabled={messages.length > 0 || isModelLoading}
                        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                    >
                        {#each MODELS as model}
                            <option value={model.value}>{model.label}</option>
                        {/each}
                    </select>
                </div>

                <div class="h-px bg-(--color-border)"></div>

                <div>
                    <h3
                        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
                    >
                        Device
                    </h3>
                    <select
                        bind:value={selectedDevice}
                        disabled={messages.length > 0 || isModelLoading}
                        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                    >
                        {#each DEVICES as device}
                            <option value={device.value}>{device.label}</option>
                        {/each}
                    </select>
                </div>

                <div class="h-px bg-(--color-border)"></div>

                <div>
                    <h3
                        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
                    >
                        Quantization (dtype)
                    </h3>
                    <select
                        bind:value={selectedDtype}
                        disabled={messages.length > 0 || isModelLoading}
                        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                    >
                        {#each availableDtypes as d}
                            <option value={d.value}>{d.label}</option>
                        {/each}
                    </select>
                </div>

                <div class="h-px bg-(--color-border)"></div>

                <div>
                    <div class="flex justify-between items-center mb-3">
                        <h3
                            class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                        >
                            Generation Settings
                        </h3>
                        <button
                            onclick={resetSettings}
                            class="text-[10px] text-(--color-accent) hover:underline"
                        >
                            Reset
                        </button>
                    </div>
                    <div class="flex flex-col gap-3">
                        <div class="flex flex-col gap-1">
                            <div
                                class="flex justify-between text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-max-tokens">Max Tokens</label>
                                <span>{genMaxTokens}</span>
                            </div>
                            <input
                                id="gen-max-tokens"
                                type="range"
                                min="1"
                                max="2048"
                                step="1"
                                bind:value={genMaxTokens}
                                class="w-full accent-(--color-accent) h-1.5 bg-(--color-border) appearance-none cursor-pointer range-rect"
                            />
                        </div>

                        <div class="flex flex-col gap-1">
                            <div
                                class="flex justify-between text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-temp">Temperature</label>
                                <span>{genTemperature}</span>
                            </div>
                            <input
                                id="gen-temp"
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                bind:value={genTemperature}
                                class="w-full accent-(--color-accent) h-1.5 bg-(--color-border) appearance-none cursor-pointer range-rect"
                            />
                        </div>

                        <div class="flex flex-col gap-1">
                            <div
                                class="flex justify-between text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-top-p">Top P</label>
                                <span>{genTopP}</span>
                            </div>
                            <input
                                id="gen-top-p"
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                bind:value={genTopP}
                                class="w-full accent-(--color-accent) h-1.5 bg-(--color-border) appearance-none cursor-pointer range-rect"
                            />
                        </div>

                        <div class="flex flex-col gap-1">
                            <div
                                class="flex justify-between text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-penalty">Penalty</label>
                                <span>{genRepetitionPenalty}</span>
                            </div>
                            <input
                                id="gen-penalty"
                                type="range"
                                min="1"
                                max="2"
                                step="0.05"
                                bind:value={genRepetitionPenalty}
                                class="w-full accent-(--color-accent) h-1.5 bg-(--color-border) appearance-none cursor-pointer range-rect"
                            />
                        </div>
                    </div>
                </div>

                <div class="h-px bg-(--color-border)"></div>
                <div class="flex justify-between items-center">
                    <h3
                        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                    >
                        System Prompt
                    </h3>
                    <button
                        onclick={resetSettings}
                        class="text-[10px] text-(--color-accent) hover:underline"
                    >
                        Reset
                    </button>
                </div>

                <div class="flex flex-col gap-2">
                    <select
                        bind:value={selectedPresetId}
                        disabled={messages.length > 0}
                        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                    >
                        {#each SYSTEM_PRESETS as preset}
                            <option value={preset.id}>{preset.name}</option>
                        {/each}
                    </select>
                </div>

                <textarea
                    bind:value={systemPrompt}
                    placeholder="Enter instructions for the AI..."
                    class={`w-full text-xs p-2 bg-(--color-bg) border border-(--color-border) focus:outline-none focus:border-(--color-accent) resize-y min-h-[80px] ${messages.length > 0 ? "opacity-50" : ""} ${selectedPresetId !== "custom" && systemPrompt === activePreset?.prompt ? "text-(--color-text-muted) italic" : ""}`}
                    disabled={messages.length > 0}
                ></textarea>

                <div class="text-[10px] text-yellow-500 mt-1">
                    Note: Changing system prompt requires starting a new chat.
                </div>

                {#if activeTab === "convert"}
                    <div class="h-px bg-(--color-border) mt-2"></div>
                    <div class="flex flex-col gap-2">
                        <label
                            for="convert-prefix"
                            class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wider"
                            >Pre-text (Prefix)</label
                        >
                        <textarea
                            id="convert-prefix"
                            bind:value={convertPrefix}
                            placeholder="Optional prefix for the input..."
                            class={`w-full text-xs p-2 bg-(--color-bg) border border-(--color-border) focus:outline-none focus:border-(--color-accent) resize-y min-h-[80px] ${selectedPresetId !== "custom" && convertPrefix === (activePreset as any)?.convertPrefix ? "text-(--color-text-muted) italic" : ""}`}
                        ></textarea>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Main Area -->
        <div
            class="flex-1 flex flex-col border border-(--color-border) bg-(--color-bg-alt) overflow-hidden"
        >
            <!-- Tabs -->
            <div class="flex border-b border-(--color-border)">
                <button
                    onclick={() => (activeTab = "convert")}
                    class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab ===
                    'convert'
                        ? 'border-(--color-accent) text-(--color-text)'
                        : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                    Convert
                </button>
                <button
                    onclick={() => (activeTab = "chat")}
                    class="px-4 py-2 text-sm font-medium transition-colors border-b-2 {activeTab ===
                    'chat'
                        ? 'border-(--color-accent) text-(--color-text)'
                        : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                    Chat
                </button>

                <div class="flex-1 flex justify-end items-center px-4">
                    {#if activeTab === "chat"}
                        <button
                            onclick={clearChat}
                            disabled={messages.length === 0}
                            class="text-xs text-red-400 hover:text-red-500 disabled:opacity-30 disabled:pointer-events-none"
                        >
                            Clear Chat
                        </button>
                    {/if}
                </div>
            </div>

            {#if activeTab === "chat"}
                <!-- Messages -->
                <div class="flex-1 min-h-0 relative">
                    <div
                        class="absolute inset-0 overflow-y-auto p-4 flex flex-col gap-4"
                        bind:this={chatContainer}
                    >
                        {#if messages.length === 0}
                            <div
                                class="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-8"
                            >
                                <p class="text-lg font-medium">Ready to chat</p>
                                <p class="text-sm">
                                    Select a system preset and say hello!
                                </p>
                            </div>
                        {/if}

                        {#each messages as msg}
                            <div
                                class="flex flex-col gap-1 max-w-[85%] {msg.role ===
                                'user'
                                    ? 'self-end items-end'
                                    : 'self-start items-start'}"
                            >
                                <div
                                    class="px-4 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                            {msg.role === 'user'
                                        ? 'bg-(--color-accent) text-(--color-btn-text) rounded-tr-sm'
                                        : 'bg-(--color-bg) border border-(--color-border) text-(--color-text) rounded-tl-sm shadow-sm'}"
                                >
                                    {msg.content}
                                </div>
                                <span
                                    class="text-[10px] text-(--color-text-muted) px-1"
                                >
                                    {formatTime(msg.timestamp)}
                                </span>
                            </div>
                        {/each}

                        {#if isGenerating || isModelLoading}
                            <div
                                class="self-start flex items-center gap-2 p-2 text-xs text-(--color-text-muted)"
                            >
                                {#if isModelLoading}
                                    <div
                                        class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"
                                    ></div>
                                    <span>{statusMessage}</span>
                                {:else}
                                    <div class="flex gap-1">
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-(--color-text-muted) animate-bounce delay-0"
                                        ></div>
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-(--color-text-muted) animate-bounce delay-150"
                                        ></div>
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-(--color-text-muted) animate-bounce delay-300"
                                        ></div>
                                    </div>
                                    <span>Assistant is thinking...</span>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Progress Bar for specific states -->
                {#if isModelLoading}
                    <div class="h-1 w-full bg-(--color-border)">
                        <div
                            class="h-full bg-(--color-accent) transition-all duration-300"
                            style="width: {loadProgress}%"
                        ></div>
                    </div>
                {/if}

                <!-- Input Area -->
                <div
                    class="p-2 bg-(--color-bg) border-t border-(--color-border)"
                >
                    <div class="flex gap-2">
                        <textarea
                            id="chat-input"
                            bind:value={userInput}
                            onkeydown={handleKeydown}
                            disabled={isGenerating || isModelLoading}
                            placeholder="Type your message here..."
                            class="flex-1 min-h-[50px] max-h-[150px] p-3 border border-(--color-border) bg-(--color-bg-alt) resize-y focus:outline-none focus:border-(--color-accent) text-sm"
                            rows="1"
                        ></textarea>
                        {#if isGenerating}
                            <button
                                onclick={stopGeneration}
                                class="px-4 py-2 bg-red-500 text-white font-medium hover:bg-red-600 transition-colors self-end h-[50px] w-[50px] flex items-center justify-center"
                                title="Stop Generation"
                            >
                                <div class="w-3 h-3 bg-white"></div>
                            </button>
                        {:else}
                            <button
                                onclick={handleSubmit}
                                disabled={!userInput.trim() || isModelLoading}
                                class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end h-[50px] w-[50px] flex items-center justify-center"
                                title="Send"
                            >
                                ...
                            </button>
                        {/if}
                    </div>
                    <div
                        class="text-[10px] text-(--color-text-muted) mt-2 flex justify-between items-center"
                    >
                        <span>Shift+Enter for new line</span>
                        {#if generator}
                            <div class="flex items-center gap-2">
                                <span class="text-green-500"
                                    >● Model Loaded</span
                                >
                                <span
                                    class="px-1.5 py-0.5 rounded bg-(--color-bg-alt) border border-(--color-border) text-[9px] uppercase font-bold text-(--color-text)"
                                >
                                    {activeDevice}
                                </span>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else}
                <!-- Convert Tab -->
                <div
                    class="flex-1 px-4 py-2 flex flex-col gap-2 overflow-y-auto"
                >
                    <div class="flex flex-col gap-2 flex-1 min-h-0">
                        <div class="flex justify-between items-center">
                            <label
                                for="convert-input"
                                class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wider"
                                >Input</label
                            >
                            <div class="flex gap-2">
                                {#if isGenerating}
                                    <button
                                        onclick={stopGeneration}
                                        class="px-4 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-medium hover:bg-red-500 hover:text-white transition-colors flex items-center gap-2"
                                    >
                                        <div class="w-2 h-2 bg-current"></div>
                                        <span>Stop</span>
                                    </button>
                                {:else}
                                    <button
                                        onclick={handleConvert}
                                        disabled={!convertInput.trim() ||
                                            isModelLoading}
                                        class="px-4 py-1.5 bg-(--color-accent-hover)/10 text-(--color-text) border border-(--color-border) text-xs font-medium hover:bg-(--color-accent-hover) hover:text-(--color-btn-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <span>Process</span>
                                    </button>
                                {/if}
                            </div>
                        </div>
                        <textarea
                            id="convert-input"
                            bind:value={convertInput}
                            placeholder="Enter text to process..."
                            class="flex-1 w-full p-2 bg-(--color-bg) border border-(--color-border) focus:outline-none focus:border-(--color-accent) resize-none"
                        ></textarea>
                    </div>

                    <div class="flex flex-col gap-2 flex-1 min-h-0">
                        <div class="flex justify-between">
                            <label
                                for="convert-output"
                                class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wider"
                                >Output</label
                            >
                            {#if convertOutput}
                                <button
                                    onclick={() =>
                                        navigator.clipboard.writeText(
                                            convertOutput,
                                        )}
                                    class="text-[10px] text-(--color-accent) hover:underline"
                                >
                                    Copy
                                </button>
                            {/if}
                        </div>
                        <div
                            id="convert-output"
                            class="flex-1 w-full p-2 bg-(--color-bg) border border-(--color-border) overflow-y-auto whitespace-pre-wrap relative"
                        >
                            {#if convertOutput}
                                {convertOutput}
                            {:else if isGenerating}
                                <span
                                    class="text-(--color-text-muted) animate-pulse"
                                    >Generating...</span
                                >
                            {:else}
                                <span
                                    class="text-(--color-text-muted) opacity-50"
                                    >Results will appear here</span
                                >
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .range-rect::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        background: var(--color-accent);
        cursor: pointer;
        border: none;
        border-radius: 0;
    }

    .range-rect::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: var(--color-accent);
        cursor: pointer;
        border: none;
        border-radius: 0;
    }
</style>
