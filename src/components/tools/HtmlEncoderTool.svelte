<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { placeholder } from "@codemirror/view";
  import { html } from "@codemirror/lang-html";
  import { oneDark } from "@codemirror/theme-one-dark";

  let mode = $state<"encode" | "decode">("encode");
  let encodeAllChars = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(false);

  let inputEditorContainer: HTMLDivElement;
  let outputEditorContainer: HTMLDivElement;
  let inputEditor: EditorView;
  let outputEditor: EditorView;

  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  const reverseHtmlEntities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };

  const encodeHtml = (str: string): string => {
    if (encodeAllChars) {
      return str
        .split("")
        .map((char) => {
          if (htmlEntities[char]) {
            return htmlEntities[char];
          }
          const code = char.charCodeAt(0);
          if (code > 127) {
            return `&#${code};`;
          }
          return char;
        })
        .join("");
    }
    return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
  };

  const decodeHtml = (str: string): string => {
    let result = str;
    for (const [entity, char] of Object.entries(reverseHtmlEntities)) {
      result = result.split(entity).join(char);
    }
    result = result.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
    return result;
  };

  const createTheme = (dark: boolean) => {
    if (dark) {
      return [
        oneDark,
        EditorView.theme({
          ".cm-placeholder": {
            color: "var(--color-text-light)",
            fontStyle: "italic",
          },
        }),
      ];
    }
    return EditorView.theme({
      "&": {
        backgroundColor: "var(--color-bg-alt)",
        color: "var(--color-text)",
      },
      ".cm-content": {
        caretColor: "var(--color-text)",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--color-text)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-light)",
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--color-border)",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(0, 0, 0, 0.05)",
      },
      ".cm-placeholder": {
        color: "var(--color-text-light)",
        fontStyle: "italic",
      },
    });
  };

  const convert = () => {
    error = "";
    const input = inputEditor?.state.doc.toString() || "";

    if (!input.trim()) {
      if (outputEditor) {
        outputEditor.dispatch({
          changes: { from: 0, to: outputEditor.state.doc.length, insert: "" },
        });
      }
      return;
    }

    try {
      let result: string;
      if (mode === "encode") {
        result = encodeHtml(input);
      } else {
        result = decodeHtml(input);
      }
      if (outputEditor) {
        outputEditor.dispatch({
          changes: { from: 0, to: outputEditor.state.doc.length, insert: result },
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Conversion failed";
      if (outputEditor) {
        outputEditor.dispatch({
          changes: { from: 0, to: outputEditor.state.doc.length, insert: "" },
        });
      }
    }
  };

  const createInputEditor = () => {
    if (!inputEditorContainer) return;
    if (inputEditor) {
      inputEditor.destroy();
    }

    inputEditor = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          html(),
          createTheme(isDark),
          placeholder(mode === "encode" 
            ? "Enter text with special characters like <div>, \"quotes\", & ampersands..." 
            : "Enter HTML entities like &lt;div&gt;, &quot;quotes&quot;, &amp; ampersands..."),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              convert();
            }
          }),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
      parent: inputEditorContainer,
    });
  };

  const createOutputEditor = () => {
    if (!outputEditorContainer) return;
    if (outputEditor) {
      outputEditor.destroy();
    }

    outputEditor = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          html(),
          createTheme(isDark),
          placeholder("Result will appear here..."),
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
      parent: outputEditorContainer,
    });
  };

  onMount(() => {
    isDark = document.documentElement.classList.contains("dark");

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDark = document.documentElement.classList.contains("dark");
          if (newIsDark !== isDark) {
            isDark = newIsDark;
            const inputContent = inputEditor?.state.doc.toString() || "";
            const outputContent = outputEditor?.state.doc.toString() || "";
            createInputEditor();
            createOutputEditor();
            if (inputContent) {
              inputEditor.dispatch({
                changes: { from: 0, to: 0, insert: inputContent },
              });
            }
            if (outputContent) {
              outputEditor.dispatch({
                changes: { from: 0, to: 0, insert: outputContent },
              });
            }
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    tick().then(() => {
      createInputEditor();
      createOutputEditor();
    });

    return () => {
      observer.disconnect();
      inputEditor?.destroy();
      outputEditor?.destroy();
    };
  });

  // Re-convert when mode or options change
  $effect(() => {
    mode;
    encodeAllChars;
    convert();
  });

  const handleSwap = () => {
    const output = outputEditor?.state.doc.toString() || "";
    if (output && inputEditor) {
      inputEditor.dispatch({
        changes: { from: 0, to: inputEditor.state.doc.length, insert: output },
      });
      mode = mode === "encode" ? "decode" : "encode";
      error = "";
    }
  };

  const handleClear = () => {
    if (inputEditor) {
      inputEditor.dispatch({
        changes: { from: 0, to: inputEditor.state.doc.length, insert: "" },
      });
    }
    error = "";
  };

  const handleCopy = () => {
    const output = outputEditor?.state.doc.toString() || "";
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      if (inputEditor) {
        inputEditor.dispatch({
          changes: { from: 0, to: inputEditor.state.doc.length, insert: text },
        });
      }
    });
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl lg:text-2xl font-medium text-(--color-text) mb-2">
      HTML Encoder / Decoder
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Encode special characters to HTML entities or decode HTML entities back to text.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 lg:px-4 py-1.5 text-sm font-medium transition-colors {mode === 'encode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "encode";
          error = "";
        }}
      >
        Encode
      </button>
      <button
        class="px-3 lg:px-4 py-1.5 text-sm font-medium transition-colors {mode === 'decode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "decode";
          error = "";
        }}
      >
        Decode
      </button>
    </div>

    {#if mode === "encode"}
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={encodeAllChars}
          class="w-4 h-4 accent-(--color-text)"
        />
        <span class="text-sm text-(--color-text-muted)">Encode all non-ASCII characters</span>
      </label>
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
    <!-- Input Editor -->
    <div class="flex-1 flex flex-col min-h-[200px] lg:min-h-0">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          {mode === "encode" ? "Text to Encode" : "HTML to Decode"}
        </span>
        <div class="flex gap-3">
          <button
            onclick={handlePaste}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
          <button
            onclick={handleClear}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div
        bind:this={inputEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>

    <!-- Output Editor -->
    <div class="flex-1 flex flex-col min-h-[200px] lg:min-h-0">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          {mode === "encode" ? "Encoded HTML" : "Decoded Text"}
        </span>
        <div class="flex gap-3">
          <button
            onclick={handleSwap}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            title="Use output as new input"
          >
            Swap
          </button>
          <button
            onclick={handleCopy}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div
        bind:this={outputEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
      ></div>
    </div>
  </div>
</div>
