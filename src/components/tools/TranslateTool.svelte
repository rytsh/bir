<script lang="ts">
    import {
        env,
        pipeline,
        type TranslationPipeline,
    } from "@huggingface/transformers";
    import { onMount, tick } from "svelte";

    // Configuration for transformers.js
    env.allowLocalModels = false;
    env.useBrowserCache = true; // Enable browser cache (IndexedDB)

    // Models
    const MODELS = [
        {
            value: "Xenova/m2m100_418M",
            label: "M2M-100 (418M, 100 languages)",
        },
    ];

    // M2M-100 supported languages (100 languages with simple ISO codes)
    const LANGUAGES = [
        { code: "en", name: "English", speechCode: "en-US" },
        { code: "tr", name: "Turkish", speechCode: "tr-TR" },
        { code: "de", name: "German", speechCode: "de-DE" },
        { code: "fr", name: "French", speechCode: "fr-FR" },
        { code: "es", name: "Spanish", speechCode: "es-ES" },
        { code: "it", name: "Italian", speechCode: "it-IT" },
        { code: "pt", name: "Portuguese", speechCode: "pt-PT" },
        { code: "ru", name: "Russian", speechCode: "ru-RU" },
        { code: "uk", name: "Ukrainian", speechCode: "uk-UA" },
        { code: "pl", name: "Polish", speechCode: "pl-PL" },
        { code: "nl", name: "Dutch", speechCode: "nl-NL" },
        { code: "el", name: "Greek", speechCode: "el-GR" },
        { code: "cs", name: "Czech", speechCode: "cs-CZ" },
        { code: "ro", name: "Romanian", speechCode: "ro-RO" },
        { code: "hu", name: "Hungarian", speechCode: "hu-HU" },
        { code: "bg", name: "Bulgarian", speechCode: "bg-BG" },
        { code: "sr", name: "Serbian", speechCode: "sr-RS" },
        { code: "hr", name: "Croatian", speechCode: "hr-HR" },
        { code: "sk", name: "Slovak", speechCode: "sk-SK" },
        { code: "sl", name: "Slovenian", speechCode: "sl-SI" },
        { code: "sv", name: "Swedish", speechCode: "sv-SE" },
        { code: "da", name: "Danish", speechCode: "da-DK" },
        { code: "fi", name: "Finnish", speechCode: "fi-FI" },
        { code: "no", name: "Norwegian", speechCode: "nb-NO" },
        { code: "ar", name: "Arabic", speechCode: "ar-SA" },
        { code: "he", name: "Hebrew", speechCode: "he-IL" },
        { code: "fa", name: "Persian", speechCode: "fa-IR" },
        { code: "hi", name: "Hindi", speechCode: "hi-IN" },
        { code: "bn", name: "Bengali", speechCode: "bn-IN" },
        { code: "ta", name: "Tamil", speechCode: "ta-IN" },
        { code: "te", name: "Telugu", speechCode: "te-IN" },
        { code: "mr", name: "Marathi", speechCode: "mr-IN" },
        { code: "gu", name: "Gujarati", speechCode: "gu-IN" },
        { code: "kn", name: "Kannada", speechCode: "kn-IN" },
        { code: "ml", name: "Malayalam", speechCode: "ml-IN" },
        { code: "pa", name: "Punjabi", speechCode: "pa-IN" },
        { code: "ur", name: "Urdu", speechCode: "ur-PK" },
        { code: "zh", name: "Chinese", speechCode: "zh-CN" },
        { code: "ja", name: "Japanese", speechCode: "ja-JP" },
        { code: "ko", name: "Korean", speechCode: "ko-KR" },
        { code: "vi", name: "Vietnamese", speechCode: "vi-VN" },
        { code: "th", name: "Thai", speechCode: "th-TH" },
        { code: "id", name: "Indonesian", speechCode: "id-ID" },
        { code: "ms", name: "Malay", speechCode: "ms-MY" },
        { code: "tl", name: "Filipino", speechCode: "fil-PH" },
        { code: "sw", name: "Swahili", speechCode: "sw-KE" },
        { code: "af", name: "Afrikaans", speechCode: "af-ZA" },
        { code: "am", name: "Amharic", speechCode: "am-ET" },
        { code: "ha", name: "Hausa", speechCode: "ha-NG" },
        { code: "yo", name: "Yoruba", speechCode: "yo-NG" },
        { code: "ig", name: "Igbo", speechCode: "ig-NG" },
        { code: "zu", name: "Zulu", speechCode: "zu-ZA" },
        { code: "ca", name: "Catalan", speechCode: "ca-ES" },
        { code: "gl", name: "Galician", speechCode: "gl-ES" },
        { code: "ga", name: "Irish", speechCode: "ga-IE" },
        { code: "cy", name: "Welsh", speechCode: "cy-GB" },
        { code: "is", name: "Icelandic", speechCode: "is-IS" },
        { code: "et", name: "Estonian", speechCode: "et-EE" },
        { code: "lv", name: "Latvian", speechCode: "lv-LV" },
        { code: "lt", name: "Lithuanian", speechCode: "lt-LT" },
        { code: "be", name: "Belarusian", speechCode: "be-BY" },
        { code: "kk", name: "Kazakh", speechCode: "kk-KZ" },
        { code: "az", name: "Azerbaijani", speechCode: "az-AZ" },
        { code: "ka", name: "Georgian", speechCode: "ka-GE" },
        { code: "hy", name: "Armenian", speechCode: "hy-AM" },
        { code: "mn", name: "Mongolian", speechCode: "mn-MN" },
        { code: "ne", name: "Nepali", speechCode: "ne-NP" },
        { code: "si", name: "Sinhala", speechCode: "si-LK" },
        { code: "my", name: "Burmese", speechCode: "my-MM" },
        { code: "km", name: "Khmer", speechCode: "km-KH" },
        { code: "lo", name: "Lao", speechCode: "lo-LA" },
        { code: "sq", name: "Albanian", speechCode: "sq-AL" },
        { code: "mk", name: "Macedonian", speechCode: "mk-MK" },
        { code: "bs", name: "Bosnian", speechCode: "bs-BA" },
        { code: "lb", name: "Luxembourgish", speechCode: "lb-LU" },
        { code: "oc", name: "Occitan", speechCode: "oc-FR" },
        { code: "br", name: "Breton", speechCode: "br-FR" },
        { code: "fy", name: "Frisian", speechCode: "fy-NL" },
        { code: "gd", name: "Scottish Gaelic", speechCode: "gd-GB" },
        { code: "jv", name: "Javanese", speechCode: "jv-ID" },
        { code: "su", name: "Sundanese", speechCode: "su-ID" },
        { code: "mg", name: "Malagasy", speechCode: "mg-MG" },
        { code: "so", name: "Somali", speechCode: "so-SO" },
        { code: "sd", name: "Sindhi", speechCode: "sd-PK" },
        { code: "ps", name: "Pashto", speechCode: "ps-AF" },
        { code: "or", name: "Odia", speechCode: "or-IN" },
        { code: "as", name: "Assamese", speechCode: "as-IN" },
        { code: "ht", name: "Haitian Creole", speechCode: "ht-HT" },
        { code: "yi", name: "Yiddish", speechCode: "yi-DE" },
        { code: "uz", name: "Uzbek", speechCode: "uz-UZ" },
        { code: "xh", name: "Xhosa", speechCode: "xh-ZA" },
        { code: "ss", name: "Swati", speechCode: "ss-SZ" },
        { code: "tn", name: "Tswana", speechCode: "tn-ZA" },
        { code: "ns", name: "Northern Sotho", speechCode: "nso-ZA" },
        { code: "wo", name: "Wolof", speechCode: "wo-SN" },
        { code: "ff", name: "Fulah", speechCode: "ff-SN" },
        { code: "ln", name: "Lingala", speechCode: "ln-CD" },
        { code: "lg", name: "Luganda", speechCode: "lg-UG" },
        { code: "ceb", name: "Cebuano", speechCode: "ceb-PH" },
        { code: "ilo", name: "Ilocano", speechCode: "ilo-PH" },
    ].sort((a, b) => a.name.localeCompare(b.name));

    // Storage key
    const STORAGE_KEY = "translate-tool-settings";

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
                selectedModel,
                sourceLang,
                targetLang,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Ignore storage errors
        }
    }

    const savedSettings = loadSettings();

    // State
    let selectedModel = $state(
        savedSettings?.selectedModel ?? "Xenova/m2m100_418M",
    );
    let sourceLang = $state(savedSettings?.sourceLang ?? "en");
    let targetLang = $state(savedSettings?.targetLang ?? "tr");
    let inputText = $state("");
    let outputText = $state("");

    // Model state - NOT reactive to prevent re-initialization
    let translator: TranslationPipeline | null = null;
    let currentModelId = "";
    
    // UI state - reactive
    let isModelLoaded = $state(false);
    let isModelLoading = $state(false);
    let isTranslating = $state(false);
    let loadProgress = $state(0);
    let statusMessage = $state("");
    let errorMessage = $state("");

    // Speech recognition state
    let isListening = $state(false);
    let speechSupported = $state(false);
    let recognition: any = null;

    // Initialize speech recognition on mount
    onMount(() => {
        const SpeechRecognitionAPI =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (SpeechRecognitionAPI) {
            speechSupported = true;
            recognition = new SpeechRecognitionAPI();
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onresult = (event: any) => {
                let transcript = "";
                for (let i = 0; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                inputText = transcript;
            };

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error:", event.error);
                isListening = false;
                if (event.error === "not-allowed") {
                    errorMessage =
                        "Microphone access denied. Please allow microphone access.";
                } else if (event.error === "no-speech") {
                    errorMessage = "No speech detected. Please try again.";
                } else if (event.error === "network") {
                    errorMessage = "Network error. Speech recognition requires internet connection.";
                }
            };

            recognition.onend = () => {
                isListening = false;
            };

            // Set initial language
            const lang = LANGUAGES.find((l) => l.code === sourceLang);
            if (lang) {
                recognition.lang = lang.speechCode;
            }
        }

        return () => {
            if (recognition) {
                recognition.abort();
            }
        };
    });

    // Save settings when they change
    $effect(() => {
        selectedModel;
        sourceLang;
        targetLang;
        saveSettings();
    });

    // Update speech recognition language when source language changes
    $effect(() => {
        if (recognition) {
            const lang = LANGUAGES.find((l) => l.code === sourceLang);
            if (lang) {
                recognition.lang = lang.speechCode;
            }
        }
    });

    // Get current source language info
    let sourceLanguageInfo = $derived(
        LANGUAGES.find((l) => l.code === sourceLang),
    );

    async function initModel() {
        // Return cached instance if already loaded
        if (translator && currentModelId === selectedModel) {
            console.log(`[Translate] Using cached model instance`);
            return translator;
        }

        try {
            isModelLoading = true;
            isModelLoaded = false;
            errorMessage = "";
            loadProgress = 0;
            statusMessage = "Loading translation model...";

            console.log(`[Translate] Initializing model: ${selectedModel}`);

            // Track progress across multiple files
            const fileProgress: Record<string, number> = {};
            let isFromCache = true;

            const instance = await pipeline("translation", selectedModel, {
                progress_callback: (p: any) => {
                    if (p.status === "progress" && p.file) {
                        fileProgress[p.file] = p.progress;
                        const files = Object.values(fileProgress);
                        const avgProgress =
                            files.reduce((a, b) => a + b, 0) / files.length;
                        loadProgress = avgProgress;
                        const fileName = p.file.split("/").pop();
                        statusMessage = `Loading: ${fileName} (${Math.round(p.progress)}%)`;
                    } else if (p.status === "ready") {
                        loadProgress = 100;
                        statusMessage = "Model ready!";
                    } else if (p.status === "initiate" && p.file) {
                        fileProgress[p.file] = 0;
                        statusMessage = `Preparing: ${p.file.split("/").pop()}`;
                    } else if (p.status === "download" && p.file) {
                        // Actually downloading from network (not cached)
                        isFromCache = false;
                        statusMessage = `Downloading: ${p.file.split("/").pop()}`;
                    } else if (p.status === "done" && p.file) {
                        console.log(`[Translate] Loaded: ${p.file}`);
                    }
                },
            });

            translator = instance as TranslationPipeline;
            currentModelId = selectedModel;

            console.log(`[Translate] Model loaded successfully! (from cache: ${isFromCache})`);

            isModelLoading = false;
            isModelLoaded = true;
            statusMessage = "";
            return translator;
        } catch (err: any) {
            isModelLoading = false;
            isModelLoaded = false;
            errorMessage = `Failed to load model: ${err.message || String(err)}`;
            console.error("[Translate] Init Error:", err);
            throw err;
        }
    }

    async function handleTranslate() {
        if (!inputText.trim() || isTranslating) return;

        try {
            isTranslating = true;
            errorMessage = "";
            outputText = "";
            statusMessage = "Translating...";

            // Force UI update before heavy computation
            await tick();

            const model = await initModel();

            console.log(
                `[Translate] Translating from ${sourceLang} to ${targetLang}`,
            );

            const result = await model(inputText, {
                tgt_lang: targetLang,
                src_lang: sourceLang,
            } as any);

            if (Array.isArray(result) && result.length > 0) {
                outputText = (result[0] as any).translation_text || "";
            }

            statusMessage = "";
        } catch (err: any) {
            errorMessage = `Translation failed: ${err.message || String(err)}`;
            console.error("[Translate] Error:", err);
        } finally {
            isTranslating = false;
        }
    }

    function swapLanguages() {
        const temp = sourceLang;
        sourceLang = targetLang;
        targetLang = temp;

        // Also swap texts if there's output
        if (outputText) {
            const tempText = inputText;
            inputText = outputText;
            outputText = tempText;
        }
    }

    function clearAll() {
        inputText = "";
        outputText = "";
        errorMessage = "";
    }

    async function copyOutput() {
        if (outputText) {
            await navigator.clipboard.writeText(outputText);
        }
    }

    function toggleListening() {
        if (!recognition) return;

        if (isListening) {
            recognition.stop();
            isListening = false;
        } else {
            try {
                const lang = LANGUAGES.find((l) => l.code === sourceLang);
                if (lang) {
                    recognition.lang = lang.speechCode;
                }
                recognition.start();
                isListening = true;
                errorMessage = "";
            } catch (err: any) {
                console.error("Failed to start recognition:", err);
                errorMessage = "Failed to start speech recognition";
            }
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleTranslate();
        }
    }
</script>

<div class="h-full flex flex-col gap-2">
    <header>
        <p class="text-sm text-(--color-text-muted)">
            Translate text between 100 languages using AI. Everything runs
            privately in your browser.
            {#if speechSupported}
                <span class="text-yellow-600 dark:text-yellow-500"
                    >(Voice input requires internet)</span
                >
            {/if}
        </p>
    </header>

    {#if errorMessage}
        <div
            class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm"
        >
            {errorMessage}
        </div>
    {/if}

    <!-- Model Selection -->
    <div
        class="px-2 py-2 justify-between border border-(--color-border) bg-(--color-bg-alt) flex flex-wrap items-center gap-4"
    >
        <div class="flex items-center gap-2">
            <label
                for="model-select"
                class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
            >
                Model
            </label>
            <select
                id="model-select"
                bind:value={selectedModel}
                disabled={isModelLoading || isTranslating}
                class="px-3 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
            >
                {#each MODELS as model}
                    <option value={model.value}>{model.label}</option>
                {/each}
            </select>

        <div class="">
        {#if isModelLoaded}
            <div class="flex items-center gap-2 text-xs">
                <span class="text-green-500">Model Loaded</span>
            </div>
        {/if}

        {#if isModelLoading}
            <div class="flex-1 flex items-center gap-2">
                <div
                    class="flex-1 h-1.5 bg-(--color-border) overflow-hidden max-w-xs"
                >
                    <div
                        class="h-full bg-(--color-accent) transition-all duration-300"
                        style="width: {loadProgress}%"
                    ></div>
                </div>
                <span class="text-xs text-(--color-text-muted)">
                    {statusMessage}
                </span>
            </div>
        {/if}
        </div>
        </div>


        <!-- Swap Button (centered between panels) -->
        <div class="flex items-center justify-center gap-2">
            <button
                onclick={swapLanguages}
                disabled={isTranslating || isModelLoading}
                class="p-2 border border-(--color-border) bg-(--color-bg-alt) hover:bg-(--color-bg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Swap languages"
            >
                <svg
                    class="w-5 h-5 lg:rotate-0 rotate-90"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                </svg>
            </button>

            <button
                onclick={handleTranslate}
                disabled={!inputText.trim() || isTranslating || isModelLoading}
                class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
                {#if isTranslating}
                    <svg
                        class="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        ></circle>
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                    </svg>
                    <span class="hidden lg:inline">Translating...</span>
                {:else}
                    <span>Translate</span>
                {/if}
            </button>
        </div>
    </div>

    <!-- Translation Area -->
    <div class="flex-1 flex flex-col lg:flex-row gap-2 min-h-0">
        <!-- Source Panel -->
        <div
            class="flex-1 flex flex-col border border-(--color-border) bg-(--color-bg-alt) min-h-[200px]"
        >
            <div
                class="px-2 py-1 border-b border-(--color-border) flex items-center gap-2"
            >
                <select
                    bind:value={sourceLang}
                    disabled={isTranslating}
                    class="flex-1 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                >
                    {#each LANGUAGES as lang}
                        <option value={lang.code}>{lang.name}</option>
                    {/each}
                </select>

                {#if speechSupported}
                    <button
                        onclick={toggleListening}
                        disabled={isTranslating || isModelLoading}
                        class="p-2 border border-(--color-border) hover:bg-(--color-bg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed {isListening
                            ? 'bg-red-500/20 border-red-500 text-red-500'
                            : 'border-yellow-500/50'}"
                        title={isListening
                            ? "Stop listening"
                            : `Voice input (requires internet) - ${sourceLanguageInfo?.name || "source language"}`}
                    >
                        {#if isListening}
                            <svg
                                class="w-4 h-4 animate-pulse"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"
                                />
                            </svg>
                        {:else}
                            <svg
                                class="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"
                                />
                            </svg>
                        {/if}
                    </button>
                {/if}

                <button
                    onclick={clearAll}
                    disabled={!inputText && !outputText}
                    class="p-2 border border-(--color-border) hover:bg-(--color-bg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                    title="Clear all"
                >
                    <svg
                        class="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                    </svg>
                </button>
            </div>

            <textarea
                bind:value={inputText}
                onkeydown={handleKeydown}
                placeholder="Enter text to translate..."
                disabled={isTranslating || isModelLoading}
                class="flex-1 w-full p-3 bg-(--color-bg-alt) resize-none focus:outline-none text-sm disabled:opacity-50"
            ></textarea>

            <div
                class="px-2 py-1 border-t border-(--color-border) text-[10px] text-(--color-text-muted)"
            >
                {inputText.length} characters
                {#if isListening}
                    <span class="text-red-500 ml-2">● Listening...</span>
                {/if}
            </div>
        </div>

        <!-- Target Panel -->
        <div
            class="flex-1 flex flex-col border border-(--color-border) bg-(--color-bg-alt) min-h-[200px]"
        >
            <div
                class="px-2 py-1 border-b border-(--color-border) flex items-center gap-2"
            >
                <select
                    bind:value={targetLang}
                    disabled={isTranslating}
                    class="flex-1 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
                >
                    {#each LANGUAGES as lang}
                        <option value={lang.code}>{lang.name}</option>
                    {/each}
                </select>

                <button
                    onclick={copyOutput}
                    disabled={!outputText}
                    class="p-2 border border-(--color-border) hover:bg-(--color-bg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Copy translation"
                >
                    <svg
                        class="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                    </svg>
                </button>
            </div>

            <div
                class="flex-1 w-full p-3 bg-(--color-bg-alt) overflow-y-auto text-sm whitespace-pre-wrap"
            >
                {#if outputText}
                    {outputText}
                {:else if isTranslating}
                    <span class="text-(--color-text-muted) animate-pulse"
                        >Translating...</span
                    >
                {:else}
                    <span class="text-(--color-text-muted) opacity-50"
                        >Translation will appear here</span
                    >
                {/if}
            </div>

            <div
                class="px-2 py-1 border-t border-(--color-border) text-[10px] text-(--color-text-muted)"
            >
                {outputText.length} characters
            </div>
        </div>
    </div>

    <!-- Attribution -->
    <div
        class="text-[10px] text-(--color-text-muted) text-end border-t border-(--color-border) pt-1"
    >
        Powered by
        <a
            href="https://huggingface.co/facebook/m2m100_418M"
            target="_blank"
            rel="noopener noreferrer"
            class="text-(--color-accent) hover:underline"
        >
            M2M-100
        </a>
        model by
        <a
            href="https://ai.meta.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-(--color-accent) hover:underline"
        >
            Meta AI
        </a>
        (MIT License) ·
        <a
            href="https://huggingface.co/Xenova/m2m100_418M"
            target="_blank"
            rel="noopener noreferrer"
            class="text-(--color-accent) hover:underline"
        >
            ONNX conversion
        </a>
        by Xenova
    </div>
</div>
