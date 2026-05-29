<script lang="ts">
    import {
        env,
        pipeline,
        type TokenClassificationPipeline,
        type TextGenerationPipeline,
    } from "@huggingface/transformers";
    import { onMount, tick } from "svelte";

    // Configuration for transformers.js
    env.allowLocalModels = false;

    type ModelTask =
        | "text-generation"
        | "text2text-generation"
        | "token-classification";
    type RuntimeMode = "local" | "cloud";

    interface ModelOption {
        value: string;
        label: string;
        supportedDtypes: string[];
        defaultDtype: string;
        task: ModelTask;
    }

    interface GenerationParams {
        max_new_tokens?: number;
        temperature?: number;
        top_p?: number;
        repetition_penalty?: number;
    }

    interface SystemPreset {
        id: string;
        name: string;
        prompt: string;
        description?: string;
        convertPrefix?: string;
        params?: GenerationParams;
    }

    interface EndpointModelOption {
        value: string;
        label: string;
    }

    interface EndpointProvider {
        id: string;
        name: string;
        baseUrl: string;
        description: string;
        apiKeyUrl: string;
        models: EndpointModelOption[];
        defaultModel: string;
    }

    interface PrivacyToken {
        entity?: string;
        score: number;
        index?: number;
        word: string;
        start?: number;
        end?: number;
        entity_group?: string;
    }

    interface PrivacySpan {
        label: string;
        score: number;
        text: string;
        start?: number;
        end?: number;
    }

    interface ChatImageAttachment {
        id: string;
        name: string;
        type: string;
        dataUrl: string;
    }

    // Models
    const MODELS: ModelOption[] = [
        {
            value: "HuggingFaceTB/SmolLM2-135M-Instruct",
            label: "SmolLM2-135M (Instruct, Fast, ~140MB)",
            supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
            defaultDtype: "q4f16",
            task: "text-generation",
        },
        {
            value: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
            label: "SmolLM2-1.7B (Instruct, High Quality, ~1.7GB)",
            supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
            defaultDtype: "q4f16",
            task: "text-generation",
        },
        {
            value: "Xenova/Phi-3-mini-4k-instruct",
            label: "Phi-3 Mini 4k (Instruct, Smart, ~2.5GB)",
            supportedDtypes: ["q4"],
            defaultDtype: "q4",
            task: "text-generation",
        },
        {
            value: "openai/privacy-filter",
            label: "OpenAI Privacy Filter (PII Detection, ~1B)",
            supportedDtypes: ["q4"],
            defaultDtype: "q4",
            task: "token-classification",
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

    const ENDPOINT_PROVIDERS: EndpointProvider[] = [
        {
            id: "nvidia",
            name: "NVIDIA NIM (external)",
            baseUrl: "https://integrate.api.nvidia.com/v1",
            description:
                "OpenAI-compatible NVIDIA NIM catalog. Free Endpoint means free trial/quota, not anonymous access: an NVIDIA API key is still required. Direct browser calls may need a CORS-disabling extension or a proxy/custom backend.",
            apiKeyUrl: "https://build.nvidia.com/models",
            defaultModel: "meta/llama-3.1-8b-instruct",
            models: [
                {
                    value: "meta/llama-3.1-8b-instruct",
                    label: "Llama 3.1 8B Instruct",
                },
                {
                    value: "meta/llama-3.1-70b-instruct",
                    label: "Llama 3.1 70B Instruct",
                },
                {
                    value: "meta/llama-3.3-70b-instruct",
                    label: "Llama 3.3 70B Instruct",
                },
                {
                    value: "meta/llama-3.2-3b-instruct",
                    label: "Llama 3.2 3B Instruct",
                },
                {
                    value: "mistralai/mistral-7b-instruct-v0.3",
                    label: "Mistral 7B Instruct v0.3",
                },
                {
                    value: "mistralai/mixtral-8x22b-instruct",
                    label: "Mixtral 8x22B Instruct",
                },
                {
                    value: "mistralai/mistral-nemotron",
                    label: "Mistral Nemotron",
                },
                {
                    value: "mistralai/magistral-small-2506",
                    label: "Magistral Small 2506",
                },
                {
                    value: "qwen/qwen2.5-coder-32b-instruct",
                    label: "Qwen2.5 Coder 32B Instruct",
                },
                {
                    value: "qwen/qwen3-coder-480b-a35b-instruct",
                    label: "Qwen3 Coder 480B A35B Instruct",
                },
                {
                    value: "qwen/qwen3-next-80b-a3b-instruct",
                    label: "Qwen3 Next 80B A3B Instruct",
                },
                {
                    value: "qwen/qwq-32b",
                    label: "QwQ 32B",
                },
                {
                    value: "openai/gpt-oss-20b",
                    label: "GPT-OSS 20B",
                },
                {
                    value: "openai/gpt-oss-120b",
                    label: "GPT-OSS 120B",
                },
                {
                    value: "minimaxai/minimax-m2.7",
                    label: "MiniMax M2.7",
                },
                {
                    value: "z-ai/glm-5.1",
                    label: "GLM-5.1",
                },
                {
                    value: "stepfun-ai/step-3.7-flash",
                    label: "Step 3.7 Flash",
                },
                {
                    value: "moonshotai/kimi-k2-instruct",
                    label: "Kimi K2 Instruct",
                },
                {
                    value: "moonshotai/kimi-k2-thinking",
                    label: "Kimi K2 Thinking",
                },
                {
                    value: "nvidia/nemotron-3-nano-30b-a3b",
                    label: "Nemotron 3 Nano 30B A3B",
                },
                {
                    value: "nvidia/nemotron-3-super-120b-a12b",
                    label: "Nemotron 3 Super 120B A12B",
                },
                {
                    value: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
                    label: "Llama 3.3 Nemotron Super 49B v1.5",
                },
                {
                    value: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
                    label: "Llama 3.1 Nemotron Ultra 253B v1",
                },
                {
                    value: "nvidia/llama-3.1-nemotron-nano-8b-v1",
                    label: "Llama 3.1 Nemotron Nano 8B v1",
                },
                {
                    value: "nvidia/nvidia-nemotron-nano-9b-v2",
                    label: "NVIDIA Nemotron Nano 9B v2",
                },
                {
                    value: "nvidia/nemotron-mini-4b-instruct",
                    label: "Nemotron Mini 4B Instruct",
                },
            ],
        },
        {
            id: "groq",
            name: "Groq (external)",
            baseUrl: "https://api.groq.com/openai/v1",
            description:
                "OpenAI-compatible Groq API. Has a free developer tier with rate limits.",
            apiKeyUrl: "https://console.groq.com/keys",
            defaultModel: "llama-3.1-8b-instant",
            models: [
                {
                    value: "llama-3.1-8b-instant",
                    label: "Llama 3.1 8B Instant",
                },
                {
                    value: "llama-3.3-70b-versatile",
                    label: "Llama 3.3 70B Versatile",
                },
            ],
        },
        {
            id: "openrouter",
            name: "OpenRouter free models (external)",
            baseUrl: "https://openrouter.ai/api/v1",
            description:
                "OpenAI-compatible OpenRouter API. Select :free models, subject to availability and limits.",
            apiKeyUrl: "https://openrouter.ai/keys",
            defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
            models: [
                {
                    value: "meta-llama/llama-3.1-8b-instruct:free",
                    label: "Llama 3.1 8B Instruct :free",
                },
                {
                    value: "google/gemma-3-4b-it:free",
                    label: "Gemma 3 4B IT :free",
                },
                {
                    value: "mistralai/devstral-small:free",
                    label: "Devstral Small :free",
                },
            ],
        },
        {
            id: "custom",
            name: "Custom OpenAI-compatible (external)",
            baseUrl: "",
            description:
                "Use any OpenAI-compatible /chat/completions endpoint that allows browser requests.",
            apiKeyUrl: "",
            defaultModel: "",
            models: [],
        },
    ];

    // Tool presets
    const SYSTEM_PRESETS: SystemPreset[] = [
        {
            id: "rewriter",
            name: "Polite Rewriter",
            prompt: "You are an AI writing assistant. Your task is to rewrite the user's message to make it more professional and approachable while maintaining its main points and key message. Do not return any text other than the rewritten message.",
            convertPrefix:
                "Rewrite the message below to make it friendly and approachable while maintaining its main points and key message.  This message not about you continue to process, not telling to you so process as 3rd party talks. Do not add any new information or return any text other than the rewritten message\nThe message:\n",
            params: { max_new_tokens: 60, temperature: 1.2 },
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
        attachments?: ChatImageAttachment[];
    };

    const MAX_CHAT_IMAGES = 4;
    const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;

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
                runtimeMode,
                selectedEndpointId,
                selectedEndpointModel,
                customEndpointBaseUrl,
                nvidiaEndpointBaseUrl,
                rememberEndpointKey,
                endpointApiKey: rememberEndpointKey ? endpointApiKey : "",
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
    let pendingChatImages = $state<ChatImageAttachment[]>([]);

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
    let endpointAbortController = $state<AbortController | null>(null);

    let runtimeMode = $state<RuntimeMode>(
        savedSettings?.runtimeMode ?? "local",
    );
    let selectedEndpointId = $state(
        savedSettings?.selectedEndpointId ?? "nvidia",
    );
    let selectedEndpointModel = $state(
        savedSettings?.selectedEndpointModel ??
            ENDPOINT_PROVIDERS[0].defaultModel,
    );
    let customEndpointBaseUrl = $state(
        savedSettings?.customEndpointBaseUrl ?? "",
    );
    let nvidiaEndpointBaseUrl = $state(
        savedSettings?.nvidiaEndpointBaseUrl ?? ENDPOINT_PROVIDERS[0].baseUrl,
    );
    let rememberEndpointKey = $state(
        savedSettings?.rememberEndpointKey ?? false,
    );
    let endpointApiKey = $state(savedSettings?.endpointApiKey ?? "");
    let lastEndpointId = selectedEndpointId;

    let selectedPresetId = $state(
        savedSettings?.selectedPresetId ?? "rewriter",
    );
    let selectedDevice = $state(savedSettings?.selectedDevice ?? "webgpu");
    let selectedModel = $state(
        savedSettings?.selectedModel ?? "HuggingFaceTB/SmolLM2-135M-Instruct",
    );
    let selectedDtype = $state(savedSettings?.selectedDtype ?? "q4f16");
    let generator = $state<
        TextGenerationPipeline | TokenClassificationPipeline | null
    >(null);
    let currentPipelineKey = $state("");

    // State
    let systemPrompt = $state("");
    let customSystemPrompt = $state(savedSettings?.customSystemPrompt ?? "");

    // Derived
    let activePreset = $derived(
        SYSTEM_PRESETS.find((p) => p.id === selectedPresetId),
    );

    let activeModel = $derived(MODELS.find((m) => m.value === selectedModel));
    let activeEndpoint = $derived(
        ENDPOINT_PROVIDERS.find((p) => p.id === selectedEndpointId),
    );
    let endpointModels = $derived(activeEndpoint?.models ?? []);
    let isPrivacyFilterMode = $derived(
        runtimeMode === "local" && activeModel?.task === "token-classification",
    );
    let lastUserMessageIndex = $derived(
        messages.findLastIndex((message) => message.role === "user"),
    );

    let availableDtypes = $derived(
        DTYPES.filter((d) => activeModel?.supportedDtypes.includes(d.value)),
    );

    // Auto-select model's default dtype when the current dtype is unsupported
    $effect(() => {
        if (activeModel && !activeModel.supportedDtypes.includes(selectedDtype)) {
            selectedDtype = activeModel.defaultDtype;
        }
    });

    $effect(() => {
        if (selectedEndpointId !== lastEndpointId) {
            lastEndpointId = selectedEndpointId;
            if (activeEndpoint?.defaultModel) {
                selectedEndpointModel = activeEndpoint.defaultModel;
            }
        }
    });

    $effect(() => {
        if (!activePreset) selectedPresetId = "rewriter";
    });

    $effect(() => {
        if (isPrivacyFilterMode) {
            activeTab = "convert";
            systemPrompt = "";
            convertPrefix = "";
        }
    });

    $effect(() => {
        if (runtimeMode !== "cloud") {
            pendingChatImages = [];
        }
    });

    function applyGenerationParams(params: GenerationParams | undefined): void {
        if (!params) return;
        if (params.max_new_tokens !== undefined)
            genMaxTokens = params.max_new_tokens;
        if (params.temperature !== undefined)
            genTemperature = params.temperature;
        if (params.top_p !== undefined) genTopP = params.top_p;
        if (params.repetition_penalty !== undefined)
            genRepetitionPenalty = params.repetition_penalty;
    }

    function applyPresetSettings(preset: SystemPreset): void {
        if (isPrivacyFilterMode) return;

        if (preset.id !== "custom") {
            systemPrompt = preset.prompt || "";
        } else {
            systemPrompt = customSystemPrompt;
        }

        convertPrefix = preset.convertPrefix ?? "";
        applyGenerationParams(preset.params);
    }

    // Watch for preset changes to update systemPrompt, convertPrefix and params
    $effect(() => {
        if (activePreset) {
            applyPresetSettings(activePreset);
        }
    });

    // Mirror custom prompt to the local state if needed
    $effect(() => {
        if (selectedPresetId === "custom" && !isPrivacyFilterMode) {
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
        runtimeMode;
        selectedEndpointId;
        selectedEndpointModel;
        customEndpointBaseUrl;
        nvidiaEndpointBaseUrl;
        rememberEndpointKey;
        endpointApiKey;
        // Save them
        saveSettings();
    });

    let chatContainer = $state<HTMLDivElement>();
    let chatImageInput = $state<HTMLInputElement>();

    async function scrollToBottom() {
        await tick();
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    function getPipelineKey(): string {
        return `${selectedModel}:${selectedDevice}:${selectedDtype}`;
    }

    function getEndpointBaseUrl(): string {
        const baseUrl = selectedEndpointId === "custom"
            ? customEndpointBaseUrl
            : selectedEndpointId === "nvidia"
                ? nvidiaEndpointBaseUrl || activeEndpoint?.baseUrl
                : activeEndpoint?.baseUrl;
        return (baseUrl ?? "").trim().replace(/\/+$/, "");
    }

    function endpointRequiresApiKey(): boolean {
        if (selectedEndpointId === "custom") return false;

        const defaultBaseUrl = (activeEndpoint?.baseUrl ?? "").replace(
            /\/+$/,
            "",
        );
        return getEndpointBaseUrl() === defaultBaseUrl;
    }

    function getEndpointApiUrl(): string {
        const baseUrl = getEndpointBaseUrl();
        return baseUrl.endsWith("/chat/completions")
            ? baseUrl
            : `${baseUrl}/chat/completions`;
    }

    function getEndpointHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (endpointApiKey.trim()) {
            headers.Authorization = `Bearer ${endpointApiKey.trim()}`;
        }

        if (selectedEndpointId === "openrouter" && typeof window !== "undefined") {
            headers["HTTP-Referer"] = window.location.origin;
            headers["X-Title"] = "BIR Tools Assistant";
        }

        return headers;
    }

    function getEndpointErrorMessage(response: Response, body: unknown): string {
        if (body && typeof body === "object") {
            const maybeError = body as {
                error?: { message?: string } | string;
                message?: string;
            };
            if (typeof maybeError.error === "string") return maybeError.error;
            if (maybeError.error?.message) return maybeError.error.message;
            if (maybeError.message) return maybeError.message;
        }
        return `${response.status} ${response.statusText}`.trim();
    }

    function getEndpointNetworkErrorMessage(err: unknown): string {
        const detail = err instanceof Error ? err.message : String(err);
        if (selectedEndpointId === "nvidia") {
            return `Failed to fetch NVIDIA NIM endpoint. In browsers this usually means CORS blocked the request. Use a CORS-disabling extension, a proxy/custom backend, or call the endpoint from server-side code. NVIDIA Free Endpoint still requires an API key. Original error: ${detail}`;
        }

        return `Failed to fetch endpoint. This usually means CORS blocked the browser request, the endpoint URL is wrong, the network failed, or a browser extension blocked it. Original error: ${detail}`;
    }

    function extractEndpointText(body: unknown): string {
        if (!body || typeof body !== "object") return "";
        const response = body as {
            choices?: Array<{
                message?: { content?: string | Array<{ text?: string }> };
                text?: string;
            }>;
        };
        const choice = response.choices?.[0];
        const content = choice?.message?.content;

        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
            return content.map((part) => part.text ?? "").join("");
        }
        return choice?.text ?? "";
    }

    function buildCloudMessageContent(message: Message) {
        if (message.role !== "user" || !message.attachments?.length) {
            return message.content;
        }

        return [
            ...(message.content.trim()
                ? [{ type: "text", text: message.content }]
                : []),
            ...message.attachments.map((image) => ({
                type: "image_url",
                image_url: { url: image.dataUrl },
            })),
        ];
    }

    function buildCloudMessages(chatMessages: Message[]) {
        const outbound = chatMessages
            .filter((message) => message.role !== "system")
            .map((message) => ({
                role: message.role,
                content: buildCloudMessageContent(message),
            }));

        if (systemPrompt.trim()) {
            return [{ role: "system", content: systemPrompt }, ...outbound];
        }

        return outbound;
    }

    async function runCloudChat(chatMessages: Message[]): Promise<string> {
        if (!selectedEndpointModel.trim()) {
            throw new Error("Select or enter a cloud model ID.");
        }

        if (!endpointApiKey.trim() && endpointRequiresApiKey()) {
            throw new Error("Enter an API key for the selected endpoint.");
        }

        const apiUrl = getEndpointApiUrl();
        if (!apiUrl || apiUrl === "/chat/completions") {
            throw new Error("Enter a valid endpoint base URL.");
        }

        statusMessage = "Calling external endpoint...";
        endpointAbortController = new AbortController();

        let response: Response | null = null;
        let body: unknown;
        try {
            response = await fetch(apiUrl, {
                method: "POST",
                headers: getEndpointHeaders(),
                signal: endpointAbortController.signal,
                body: JSON.stringify({
                    model: selectedEndpointModel.trim(),
                    messages: buildCloudMessages(chatMessages),
                    max_tokens: genMaxTokens,
                    temperature: genTemperature,
                    top_p: genTopP,
                    stream: false,
                }),
            });

            body = await response.json().catch(() => null);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                throw err;
            }
            throw new Error(getEndpointNetworkErrorMessage(err));
        } finally {
            endpointAbortController = null;
        }

        if (!response) {
            throw new Error("Endpoint request failed.");
        }

        if (!response.ok) {
            throw new Error(getEndpointErrorMessage(response, body));
        }

        return extractEndpointText(body) || "(No response generated)";
    }

    async function initModel() {
        const pipelineKey = getPipelineKey();
        if (generator && currentPipelineKey === pipelineKey) return generator;

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

            const task: ModelTask =
                activeModel?.task ??
                (selectedModel.includes("t5")
                    ? "text2text-generation"
                    : "text-generation");

            // Use explicitly selected dtype
            const dtype = selectedDtype;

            console.log(
                `[Assistant] Using device: ${selectedDevice}, dtype: ${dtype}`,
            );

            // Track progress across multiple files
            const fileProgress: Record<string, number> = {};

            const instance = await pipeline(task as any, selectedModel, {
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

            generator = instance as
                | TextGenerationPipeline
                | TokenClassificationPipeline;
            currentPipelineKey = pipelineKey;

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

    function isPrivacyToken(value: unknown): value is PrivacyToken {
        if (!value || typeof value !== "object") return false;
        const token = value as Partial<PrivacyToken>;
        return (
            typeof token.word === "string" &&
            typeof token.score === "number" &&
            (typeof token.entity === "string" ||
                typeof token.entity_group === "string")
        );
    }

    function normalizePrivacyOutput(output: unknown): PrivacyToken[] {
        if (!Array.isArray(output)) return [];
        if (Array.isArray(output[0])) {
            return output[0].filter(isPrivacyToken);
        }
        return output.filter(isPrivacyToken);
    }

    function getPrivacyLabel(token: PrivacyToken): string {
        const label = token.entity_group ?? token.entity ?? "private_data";
        return label.replace(/^[BIES]-/, "");
    }

    function getPrivacyBoundary(token: PrivacyToken): "B" | "I" | "E" | "S" {
        const match = token.entity?.match(/^([BIES])-/);
        return (match?.[1] as "B" | "I" | "E" | "S" | undefined) ?? "S";
    }

    function buildPrivacySpans(tokens: PrivacyToken[]): PrivacySpan[] {
        type PrivacySpanDraft = PrivacySpan & {
            scoreTotal: number;
            tokenCount: number;
            lastTokenIndex: number;
        };

        const spans: PrivacySpan[] = [];
        let current: PrivacySpanDraft | null = null;

        const closeCurrent = () => {
            if (!current) return;
            spans.push({
                label: current.label,
                text: current.text,
                score: current.scoreTotal / current.tokenCount,
                start: current.start,
                end: current.end,
            });
            current = null;
        };

        for (const token of tokens) {
            const label = getPrivacyLabel(token);
            const boundary = getPrivacyBoundary(token);
            const tokenIndex = token.index ?? current?.lastTokenIndex ?? 0;
            const startsNewSpan =
                !current ||
                boundary === "B" ||
                boundary === "S" ||
                current.label !== label ||
                tokenIndex > current.lastTokenIndex + 1;

            if (startsNewSpan) {
                closeCurrent();
                current = {
                    label,
                    text: token.word,
                    score: token.score,
                    scoreTotal: token.score,
                    tokenCount: 1,
                    lastTokenIndex: tokenIndex,
                    start: token.start,
                    end: token.end,
                };
            } else if (current) {
                current.text += token.word;
                current.scoreTotal += token.score;
                current.tokenCount += 1;
                current.lastTokenIndex = tokenIndex;
                current.end = token.end ?? current.end;
            }

            if (boundary === "S" || boundary === "E") {
                closeCurrent();
            }
        }

        closeCurrent();
        return spans;
    }

    function findPrivacySpanRange(
        input: string,
        span: PrivacySpan,
        fromIndex: number,
    ): { start: number; end: number } | null {
        if (span.start !== undefined && span.end !== undefined) {
            return { start: span.start, end: span.end };
        }

        const candidates = [span.text.trim(), span.text].filter(
            (text, index, values) => text && values.indexOf(text) === index,
        );

        for (const candidate of candidates) {
            const start = input.indexOf(candidate, fromIndex);
            if (start !== -1) {
                return { start, end: start + candidate.length };
            }
        }

        return null;
    }

    function formatPrivacyLabel(label: string): string {
        return label.toUpperCase().replaceAll("-", "_");
    }

    function formatPrivacyFilterResult(
        input: string,
        tokens: PrivacyToken[],
    ): string {
        const spans = buildPrivacySpans(tokens);
        if (spans.length === 0) return "No private spans detected.";

        let cursor = 0;
        let maskedText = "";
        let unmatchedCount = 0;
        const detectedLabels = new Map<string, number>();

        for (const span of spans) {
            const range = findPrivacySpanRange(input, span, cursor);
            const label = formatPrivacyLabel(span.label);
            detectedLabels.set(label, (detectedLabels.get(label) ?? 0) + 1);

            if (!range || range.start < cursor) {
                unmatchedCount += 1;
                continue;
            }

            maskedText += input.slice(cursor, range.start);
            maskedText += `[${label}]`;
            cursor = range.end;
        }

        maskedText += input.slice(cursor);

        const lines = ["Masked text:", maskedText, "", "Detected spans:"];
        for (const [label, count] of detectedLabels) {
            lines.push(`- ${label}: ${count}`);
        }

        if (unmatchedCount > 0) {
            lines.push(
                "",
                `Warning: ${unmatchedCount} detected span(s) could not be aligned exactly and may remain unmasked.`,
            );
        }

        return lines.join("\n");
    }

    async function runPrivacyFilter(
        input: string,
        model: TokenClassificationPipeline,
    ): Promise<string> {
        statusMessage = "Detecting private data...";
        const output = await model(input, {
            ignore_labels: ["O"],
            aggregation_strategy: "simple",
        });
        const tokens = normalizePrivacyOutput(output);
        return formatPrivacyFilterResult(input, tokens);
    }

    function readFileAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    async function handleChatImagesSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const files = Array.from(input.files ?? []);
        input.value = "";

        if (runtimeMode !== "cloud") {
            errorMessage = "Images are only supported in Cloud endpoint mode.";
            return;
        }

        errorMessage = "";
        const slotsLeft = MAX_CHAT_IMAGES - pendingChatImages.length;
        if (slotsLeft <= 0) {
            errorMessage = `You can attach up to ${MAX_CHAT_IMAGES} images.`;
            return;
        }

        const validFiles = files.slice(0, slotsLeft).filter((file) => {
            if (!file.type.startsWith("image/")) {
                errorMessage = "Only image files can be attached.";
                return false;
            }

            if (file.size > MAX_CHAT_IMAGE_BYTES) {
                errorMessage = "Each image must be 8 MB or smaller.";
                return false;
            }

            return true;
        });

        const images = await Promise.all(
            validFiles.map(async (file) => ({
                id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
                name: file.name,
                type: file.type,
                dataUrl: await readFileAsDataUrl(file),
            })),
        );

        pendingChatImages = [...pendingChatImages, ...images];
    }

    function removePendingChatImage(id: string): void {
        pendingChatImages = pendingChatImages.filter((image) => image.id !== id);
    }

    async function handleSubmit() {
        if ((!userInput.trim() && pendingChatImages.length === 0) || isGenerating) return;

        if (pendingChatImages.length > 0 && runtimeMode !== "cloud") {
            errorMessage = "Images are only supported in Cloud endpoint mode.";
            return;
        }

        const text = userInput;
        const attachments = pendingChatImages;
        userInput = "";
        pendingChatImages = [];
        errorMessage = "";

        // Add user message
        messages = [
            ...messages,
            {
                role: "user",
                content: text,
                timestamp: Date.now(),
                attachments,
            },
        ];
        await scrollToBottom();

        try {
            isGenerating = true;

            if (runtimeMode === "cloud") {
                const responseText = await runCloudChat(messages);
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content: responseText,
                        timestamp: Date.now(),
                    },
                ];
                await scrollToBottom();
                return;
            }

            const model = await initModel();

            if (isPrivacyFilterMode) {
                const responseText = await runPrivacyFilter(
                    text,
                    model as TokenClassificationPipeline,
                );
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content: responseText,
                        timestamp: Date.now(),
                    },
                ];
                await scrollToBottom();
                return;
            }

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
            if (err.message === "GENERATION_INTERRUPTED" || err.name === "AbortError") {
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

            if (runtimeMode === "cloud") {
                const fullInput = convertPrefix
                    ? `${convertPrefix}\n${convertInput}`
                    : convertInput;
                convertOutput = await runCloudChat([
                    { role: "user", content: fullInput, timestamp: Date.now() },
                ]);
                return;
            }

            const model = await initModel();

            if (isPrivacyFilterMode) {
                convertOutput = await runPrivacyFilter(
                    convertInput,
                    model as TokenClassificationPipeline,
                );
                return;
            }

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
            if (err.message === "GENERATION_INTERRUPTED" || err.name === "AbortError") {
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

    async function resendMessage(index: number) {
        if (isGenerating || isModelLoading) return;

        const message = messages[index];
        if (!message || message.role !== "user") return;

        errorMessage = "";
        userInput = message.content;
        pendingChatImages = message.attachments ? [...message.attachments] : [];
        messages = messages.slice(0, index);
        await tick();
        await handleSubmit();
    }

    function stopGeneration() {
        console.log("[Assistant] Stop button clicked");
        shouldStop = true;
        endpointAbortController?.abort();
        statusMessage = "Generation stopped.";
    }

    function resetSettings() {
        if (isPrivacyFilterMode) return;

        if (activePreset) {
            const params = activePreset.params || {};
            genMaxTokens =
                params.max_new_tokens !== undefined
                    ? params.max_new_tokens
                    : 512;
            genTemperature =
                params.temperature !== undefined ? params.temperature : 0.7;
            genTopP = params.top_p !== undefined ? params.top_p : 0.9;
            genRepetitionPenalty =
                params.repetition_penalty !== undefined
                    ? params.repetition_penalty
                    : 1.1;

            convertPrefix = activePreset.convertPrefix ?? "";

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

<div class="h-[calc(100dvh-4.5rem)] min-h-0 overflow-hidden flex flex-col gap-4">
    <header>
        <p class="text-sm text-(--color-text-muted)">
            Chat with a local AI assistant or mask PII with OpenAI Privacy
            Filter. Local modes run privately in your browser; cloud endpoint
            mode sends data to the selected provider.
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
        <div class="lg:w-72 shrink-0 flex flex-col gap-2 min-h-0 max-h-[34dvh] lg:max-h-none overflow-y-auto pr-1">
            <div
                class="px-4 py-2 border border-(--color-border) bg-(--color-bg-alt) flex flex-col gap-2"
            >
                <div>
                    <h3
                        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
                    >
                        Runtime
                    </h3>
                    <select
                        bind:value={runtimeMode}
                        disabled={messages.length > 0 || isGenerating || isModelLoading}
                        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                    >
                        <option value="local">Local browser model</option>
                        <option value="cloud">Cloud endpoint (external)</option>
                    </select>
                </div>

                <div class="h-px bg-(--color-border)"></div>

                {#if runtimeMode === "cloud"}
                    <div class="flex flex-col gap-2">
                        <div class="p-2 border border-yellow-500/40 bg-yellow-500/10 text-xs text-yellow-600 dark:text-yellow-400">
                            External endpoint mode sends your prompt, chat history,
                            system prompt, attached images, and API key to the
                            selected provider.
                        </div>

                        <div>
                            <h3
                                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
                            >
                                Endpoint
                            </h3>
                            <select
                                bind:value={selectedEndpointId}
                                disabled={isGenerating || isModelLoading}
                                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                            >
                                {#each ENDPOINT_PROVIDERS as provider}
                                    <option value={provider.id}>{provider.name}</option>
                                {/each}
                            </select>
                        </div>

                        {#if activeEndpoint?.description}
                            <div class="text-[10px] text-(--color-text-muted)">
                                {activeEndpoint.description}
                            </div>
                        {/if}

                        {#if selectedEndpointId === "nvidia"}
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center justify-between">
                                    <label for="nvidia-base-url" class="text-[10px] uppercase font-medium text-(--color-text-muted)">NVIDIA Base URL / Proxy</label>
                                    <button
                                        type="button"
                                        onclick={() => (nvidiaEndpointBaseUrl = activeEndpoint?.baseUrl ?? "")}
                                        class="text-[10px] text-(--color-accent) hover:underline"
                                    >
                                        Reset
                                    </button>
                                </div>
                                <input
                                    id="nvidia-base-url"
                                    bind:value={nvidiaEndpointBaseUrl}
                                    placeholder="https://integrate.api.nvidia.com/v1 or your proxy /v1"
                                    class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs focus:outline-none focus:border-(--color-accent)"
                                />
                                <div class="text-[10px] text-(--color-text-muted)">
                                    Use NVIDIA directly, or point this to your own proxy that forwards to NVIDIA.
                                </div>
                            </div>
                        {:else if selectedEndpointId === "custom"}
                            <div class="flex flex-col gap-1">
                                <label for="endpoint-base-url" class="text-[10px] uppercase font-medium text-(--color-text-muted)">Base URL</label>
                                <input
                                    id="endpoint-base-url"
                                    bind:value={customEndpointBaseUrl}
                                    placeholder="https://api.example.com/v1"
                                    class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs focus:outline-none focus:border-(--color-accent)"
                                />
                            </div>
                        {/if}

                        {#if endpointModels.length > 0}
                            <div class="flex flex-col gap-1">
                                <label for="endpoint-model-preset" class="text-[10px] uppercase font-medium text-(--color-text-muted)">Model presets</label>
                                <select
                                    id="endpoint-model-preset"
                                    bind:value={selectedEndpointModel}
                                    disabled={isGenerating || isModelLoading}
                                    class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                                >
                                    {#each endpointModels as model}
                                        <option value={model.value}>{model.label}</option>
                                    {/each}
                                </select>
                            </div>
                        {/if}

                        <div class="flex flex-col gap-1">
                            <label for="endpoint-model" class="text-[10px] uppercase font-medium text-(--color-text-muted)">Model ID</label>
                            <input
                                id="endpoint-model"
                                bind:value={selectedEndpointModel}
                                placeholder="provider/model-id"
                                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs focus:outline-none focus:border-(--color-accent)"
                            />
                        </div>

                        <div class="flex flex-col gap-1">
                            <div class="flex items-center justify-between">
                                <label for="endpoint-api-key" class="text-[10px] uppercase font-medium text-(--color-text-muted)">API Key</label>
                                {#if activeEndpoint?.apiKeyUrl}
                                    <a
                                        href={activeEndpoint.apiKeyUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        class="text-[10px] text-(--color-accent) hover:underline"
                                    >
                                        Get key
                                    </a>
                                {/if}
                            </div>
                            <input
                                id="endpoint-api-key"
                                type="password"
                                bind:value={endpointApiKey}
                                autocomplete="off"
                                placeholder="Paste API key"
                                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs focus:outline-none focus:border-(--color-accent)"
                            />
                            <label class="flex items-center gap-2 text-[10px] text-(--color-text-muted)">
                                <input type="checkbox" bind:checked={rememberEndpointKey} class="accent-(--color-accent)" />
                                Remember key in this browser
                            </label>
                        </div>
                    </div>
                {:else}
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
                {/if}

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
                            disabled={isPrivacyFilterMode}
                            class="text-[10px] text-(--color-accent) hover:underline disabled:opacity-40 disabled:pointer-events-none"
                        >
                            Reset
                        </button>
                    </div>
                    {#if isPrivacyFilterMode}
                        <div
                            class="p-2 border border-(--color-border) bg-(--color-bg) text-xs text-(--color-text-muted)"
                        >
                            Privacy Filter uses token classification, so generation
                            settings are ignored.
                        </div>
                    {:else}
                        <div class="flex flex-col gap-3">
                        <div class="flex flex-col gap-1">
                            <div
                                class="flex justify-between items-center text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-max-tokens" class="flex items-center gap-1">
                                    Max Tokens
                                    <span class="inline-flex items-center justify-center w-3 h-3 bg-(--color-border) text-[8px] cursor-help" title="Maximum number of tokens (words/subwords) the model will generate. Higher = longer responses but slower.">?</span>
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="2048"
                                    step="1"
                                    bind:value={genMaxTokens}
                                    class="w-16 px-1 py-0.5 text-right bg-(--color-bg) border border-(--color-border) text-(--color-text) text-[10px] focus:outline-none focus:border-(--color-accent)"
                                />
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
                                class="flex justify-between items-center text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-temp" class="flex items-center gap-1">
                                    Temperature
                                    <span class="inline-flex items-center justify-center w-3 h-3 bg-(--color-border) text-[8px] cursor-help" title="Controls randomness. 0 = deterministic, 0.7 = balanced, 1.5+ = very creative/random.">?</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    bind:value={genTemperature}
                                    class="w-16 px-1 py-0.5 text-right bg-(--color-bg) border border-(--color-border) text-(--color-text) text-[10px] focus:outline-none focus:border-(--color-accent)"
                                />
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
                                class="flex justify-between items-center text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-top-p" class="flex items-center gap-1">
                                    Top P
                                    <span class="inline-flex items-center justify-center w-3 h-3 bg-(--color-border) text-[8px] cursor-help" title="Nucleus sampling: limits word choices to top probability. 0.9 = top 90% likely words. Lower = more focused.">?</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    bind:value={genTopP}
                                    class="w-16 px-1 py-0.5 text-right bg-(--color-bg) border border-(--color-border) text-(--color-text) text-[10px] focus:outline-none focus:border-(--color-accent)"
                                />
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
                                class="flex justify-between items-center text-[10px] uppercase font-medium text-(--color-text-muted)"
                            >
                                <label for="gen-penalty" class="flex items-center gap-1">
                                    Repetition Penalty
                                    <span class="inline-flex items-center justify-center w-3 h-3 bg-(--color-border) text-[8px] cursor-help" title="Penalizes repeated words. 1.0 = off, 1.1 = mild, 1.5+ = strong penalty.">?</span>
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="2"
                                    step="0.05"
                                    bind:value={genRepetitionPenalty}
                                    class="w-16 px-1 py-0.5 text-right bg-(--color-bg) border border-(--color-border) text-(--color-text) text-[10px] focus:outline-none focus:border-(--color-accent)"
                                />
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
                        {#if runtimeMode === "cloud"}
                            <div class="text-[10px] text-(--color-text-muted)">
                                Cloud endpoints use max tokens, temperature, and
                                top P. Repetition penalty is local-model only.
                            </div>
                        {/if}
                        </div>
                    {/if}
                </div>

                <div class="h-px bg-(--color-border)"></div>
                <div class="flex justify-between items-center">
                    <h3
                        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
                    >
                        Preset
                    </h3>
                    <button
                        onclick={resetSettings}
                        disabled={isPrivacyFilterMode}
                        class="text-[10px] text-(--color-accent) hover:underline disabled:opacity-40 disabled:pointer-events-none"
                    >
                        Reset
                    </button>
                </div>

                <div class="flex flex-col gap-2">
                    <select
                        bind:value={selectedPresetId}
                        disabled={messages.length > 0 || isPrivacyFilterMode}
                        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {#each SYSTEM_PRESETS as preset}
                            <option value={preset.id}>{preset.name}</option>
                        {/each}
                    </select>
                </div>

                {#if activePreset?.description}
                    <div class="text-[10px] text-(--color-text-muted)">
                        {activePreset.description}
                    </div>
                {/if}

                {#if isPrivacyFilterMode}
                    <div
                        class="p-2 border border-(--color-border) bg-(--color-bg) text-xs text-(--color-text-muted)"
                    >
                        Paste text in Convert and run Mask PII. The output replaces
                        detected private spans with category labels. Presets are
                        disabled because this model is not a chat/prompt model.
                    </div>
                {:else}
                    <textarea
                        bind:value={systemPrompt}
                        placeholder="Enter instructions for the AI..."
                        class={`w-full text-xs p-2 bg-(--color-bg) border border-(--color-border) focus:outline-none focus:border-(--color-accent) resize-y min-h-[80px] ${messages.length > 0 ? "opacity-50" : ""} ${selectedPresetId !== "custom" && systemPrompt === activePreset?.prompt ? "text-(--color-text-muted) italic" : ""}`}
                        disabled={messages.length > 0}
                    ></textarea>

                    <div class="text-[10px] text-yellow-500 mt-1">
                        Note: Changing system prompt requires starting a new chat.
                    </div>
                {/if}

                {#if activeTab === "convert" && !isPrivacyFilterMode}
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
                            class={`w-full text-xs p-2 bg-(--color-bg) border border-(--color-border) focus:outline-none focus:border-(--color-accent) resize-y min-h-[80px] ${selectedPresetId !== "custom" && convertPrefix === activePreset?.convertPrefix ? "text-(--color-text-muted) italic" : ""}`}
                        ></textarea>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Main Area -->
        <div
            class="flex-1 min-h-0 flex flex-col border border-(--color-border) bg-(--color-bg-alt) overflow-hidden"
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

                        {#each messages as msg, index}
                            <div
                                class="group flex flex-col gap-1 max-w-[85%] {msg.role ===
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
                                    {#if msg.attachments?.length}
                                        <div class="mb-2 flex flex-wrap gap-2">
                                            {#each msg.attachments as image}
                                                <img
                                                    src={image.dataUrl}
                                                    alt={image.name}
                                                    class="max-h-40 max-w-48 border border-white/30 object-contain bg-black/10"
                                                />
                                            {/each}
                                        </div>
                                    {/if}
                                    {#if msg.content}
                                        {msg.content}
                                    {/if}
                                </div>
                                <span
                                    class="text-[10px] text-(--color-text-muted) px-1"
                                >
                                    {formatTime(msg.timestamp)}
                                </span>
                                {#if msg.role === "user" && index === lastUserMessageIndex}
                                    <button
                                        onclick={() => resendMessage(index)}
                                        disabled={isGenerating || isModelLoading}
                                        class="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[10px] text-(--color-accent) hover:underline disabled:opacity-30 disabled:pointer-events-none px-1"
                                        title="Resend this message"
                                    >
                                        Resend
                                    </button>
                                {/if}
                            </div>
                        {/each}

                        {#if isGenerating || isModelLoading}
                            <div
                                class="self-start flex items-center gap-2 p-2 text-xs text-(--color-text-muted)"
                            >
                                {#if isModelLoading}
                                    <div
                                        class="w-2 h-2 bg-blue-500 animate-pulse"
                                    ></div>
                                    <span>{statusMessage}</span>
                                {:else}
                                    <div class="flex gap-1">
                                        <div
                                            class="w-1.5 h-1.5 bg-(--color-text-muted) animate-bounce delay-0"
                                        ></div>
                                        <div
                                            class="w-1.5 h-1.5 bg-(--color-text-muted) animate-bounce delay-150"
                                        ></div>
                                        <div
                                            class="w-1.5 h-1.5 bg-(--color-text-muted) animate-bounce delay-300"
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
                    {#if pendingChatImages.length > 0}
                        <div class="mb-2 flex flex-wrap gap-2">
                            {#each pendingChatImages as image}
                                <div class="relative border border-(--color-border) bg-(--color-bg-alt) p-1">
                                    <img
                                        src={image.dataUrl}
                                        alt={image.name}
                                        class="h-16 w-16 object-cover"
                                    />
                                    <button
                                        type="button"
                                        onclick={() => removePendingChatImage(image.id)}
                                        class="absolute -right-1.5 -top-1.5 h-5 w-5 bg-red-500 text-white text-xs leading-5 hover:bg-red-600"
                                        title="Remove image"
                                    >
                                        x
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {/if}
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
                        {#if runtimeMode === "cloud"}
                            <button
                                type="button"
                                onclick={() => chatImageInput?.click()}
                                disabled={isGenerating || isModelLoading || pendingChatImages.length >= MAX_CHAT_IMAGES}
                                class="px-3 py-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end h-[50px] flex items-center justify-center text-xs"
                                title="Attach image"
                            >
                                Image
                            </button>
                            <input
                                bind:this={chatImageInput}
                                type="file"
                                accept="image/*"
                                multiple
                                class="hidden"
                                onchange={handleChatImagesSelected}
                            />
                        {/if}
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
                                disabled={(!userInput.trim() && pendingChatImages.length === 0) || isModelLoading}
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
                        {#if runtimeMode === "cloud"}
                            <span>Images require a vision-capable model</span>
                        {/if}
                        {#if runtimeMode === "local" && generator}
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
                                        <span>{isPrivacyFilterMode ? "Mask PII" : "Process"}</span>
                                    </button>
                                {/if}
                            </div>
                        </div>
                        <textarea
                            id="convert-input"
                            bind:value={convertInput}
                            placeholder={isPrivacyFilterMode ? "Enter text to detect and mask private data..." : "Enter text to process..."}
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
                            {:else if isModelLoading}
                                <div class="flex flex-col gap-3">
                                    <div class="flex items-center gap-2 text-xs text-(--color-text-muted)">
                                        <div class="w-2 h-2 bg-blue-500 animate-pulse"></div>
                                        <span>{statusMessage || "Loading model..."}</span>
                                    </div>
                                    <div class="h-1.5 w-full bg-(--color-border) rounded overflow-hidden">
                                        <div
                                            class="h-full bg-(--color-accent) transition-all duration-300"
                                            style="width: {loadProgress}%"
                                        ></div>
                                    </div>
                                </div>
                            {:else if isGenerating}
                                <div class="flex items-center gap-2 text-xs text-(--color-text-muted)">
                                    <div class="flex gap-1">
                                        <div class="w-1.5 h-1.5 bg-(--color-text-muted) animate-bounce delay-0"></div>
                                        <div class="w-1.5 h-1.5 bg-(--color-text-muted) animate-bounce delay-150"></div>
                                        <div class="w-1.5 h-1.5 bg-(--color-text-muted) animate-bounce delay-300"></div>
                                    </div>
                                    <span>{statusMessage || "Processing..."}</span>
                                </div>
                            {:else}
                                <span
                                    class="text-(--color-text-muted) opacity-50"
                                    >{isPrivacyFilterMode ? "Masked text will appear here" : "Results will appear here"}</span
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
