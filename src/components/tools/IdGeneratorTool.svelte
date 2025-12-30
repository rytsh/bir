<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { placeholder } from "@codemirror/view";
  import { oneDark } from "@codemirror/theme-one-dark";
  import {
    v1 as uuidv1,
    v3 as uuidv3,
    v4 as uuidv4,
    v5 as uuidv5,
    v6 as uuidv6,
    v7 as uuidv7,
    v1ToV6,
    v6ToV1,
  } from "uuid";
  import { ulid } from "ulid";

  type IdType =
    | "uuid-v1"
    | "uuid-v3"
    | "uuid-v4"
    | "uuid-v5"
    | "uuid-v6"
    | "uuid-v7"
    | "uuid-v1-to-v6"
    | "uuid-v6-to-v1"
    | "ulid";

  let selectedType = $state<IdType>("ulid");
  let count = $state(1);
  let copied = $state(false);
  let isDark = $state(false);

  // For v3 and v5 UUIDs
  let namespace = $state("dns");
  let name = $state("example.com");

  // For v1ToV6 and v6ToV1 conversions
  let inputUuid = $state("");

  let outputEditorContainer: HTMLDivElement;
  let outputEditor: EditorView;

  const namespaceOptions = [
    { value: "dns", label: "DNS", uuid: uuidv3.DNS },
    { value: "url", label: "URL", uuid: uuidv3.URL },
    { value: "custom", label: "Custom UUID", uuid: "" },
  ];

  let customNamespace = $state("00000000-0000-0000-0000-000000000000");

  const idTypeOptions: { value: IdType; label: string; description: string }[] = [
    {
      value: "uuid-v1",
      label: "UUID v1",
      description: "Time-based UUID using timestamp and node ID",
    },
    {
      value: "uuid-v3",
      label: "UUID v3",
      description: "Name-based UUID using MD5 hashing",
    },
    {
      value: "uuid-v4",
      label: "UUID v4",
      description: "Random UUID - most commonly used",
    },
    {
      value: "uuid-v5",
      label: "UUID v5",
      description: "Name-based UUID using SHA-1 hashing",
    },
    {
      value: "uuid-v6",
      label: "UUID v6",
      description: "Reordered time-based UUID, sortable",
    },
    {
      value: "uuid-v7",
      label: "UUID v7",
      description: "Unix timestamp-based, sortable UUID",
    },
    {
      value: "uuid-v1-to-v6",
      label: "UUID v1 to v6",
      description: "Convert UUID v1 to v6 format",
    },
    {
      value: "uuid-v6-to-v1",
      label: "UUID v6 to v1",
      description: "Convert UUID v6 to v1 format",
    },
    {
      value: "ulid",
      label: "ULID",
      description: "Universally Unique Lexicographically Sortable Identifier",
    },
  ];

  const getNamespaceUuid = (): string => {
    if (namespace === "custom") {
      return customNamespace;
    }
    const found = namespaceOptions.find((opt) => opt.value === namespace);
    return found?.uuid || uuidv3.DNS;
  };

  const generateId = (type: IdType): string => {
    switch (type) {
      case "uuid-v1":
        return uuidv1();
      case "uuid-v3":
        return uuidv3(name, getNamespaceUuid());
      case "uuid-v4":
        return uuidv4();
      case "uuid-v5":
        return uuidv5(name, getNamespaceUuid());
      case "uuid-v6":
        return uuidv6();
      case "uuid-v7":
        return uuidv7();
      case "uuid-v1-to-v6":
        return inputUuid.trim() ? v1ToV6(inputUuid.trim()) : "";
      case "uuid-v6-to-v1":
        return inputUuid.trim() ? v6ToV1(inputUuid.trim()) : "";
      case "ulid":
        return ulid();
    }
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
    return [
      EditorView.theme({
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
      }),
    ];
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
          ...createTheme(isDark),
          placeholder("Click \"Generate\" to create IDs..."),
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

  const isConversionType = (type: IdType): boolean => {
    return type === "uuid-v1-to-v6" || type === "uuid-v6-to-v1";
  };

  const needsNameInput = (type: IdType): boolean => {
    return type === "uuid-v3" || type === "uuid-v5";
  };

  const handleGenerate = () => {
    try {
      const safeCount = Math.min(Math.max(1, count), 1000);
      const ids: string[] = [];

      if (isConversionType(selectedType)) {
        // For conversion types, convert each line of input
        const inputLines = inputUuid.trim().split("\n").filter((line) => line.trim());
        if (inputLines.length === 0) {
          updateOutput("Please enter UUID(s) to convert");
          return;
        }
        for (const line of inputLines) {
          inputUuid = line.trim();
          const result = generateId(selectedType);
          if (result) {
            ids.push(result);
          }
        }
      } else {
        for (let i = 0; i < safeCount; i++) {
          ids.push(generateId(selectedType));
        }
      }

      const output = ids.join("\n");
      updateOutput(output);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Generation failed";
      updateOutput(`Error: ${errorMessage}`);
    }
  };

  const updateOutput = (content: string) => {
    if (outputEditor) {
      outputEditor.dispatch({
        changes: { from: 0, to: outputEditor.state.doc.length, insert: content },
      });
    }
  };

  const handleCopy = () => {
    const output = outputEditor?.state.doc.toString() || "";
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handleClear = () => {
    updateOutput("");
  };

  onMount(() => {
    isDark = document.documentElement.classList.contains("dark");

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDark = document.documentElement.classList.contains("dark");
          if (newIsDark !== isDark) {
            isDark = newIsDark;
            const outputContent = outputEditor?.state.doc.toString() || "";
            createOutputEditor();
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
      createOutputEditor();
    });

    return () => {
      observer.disconnect();
      outputEditor?.destroy();
    };
  });

  let selectedDescription = $derived(
    idTypeOptions.find((opt) => opt.value === selectedType)?.description || ""
  );
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl lg:text-2xl font-medium text-(--color-text) mb-2">
      ID Generator
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Generate UUIDs (v1, v3, v4, v5, v6, v7), convert between formats, and create ULIDs.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-1 flex flex-col gap-4">
    <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
      <!-- ID Type Selection -->
      <div class="flex-1 max-w-xs">
        <label
          for="type-select"
          class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          ID Type
        </label>
        <select
          id="type-select"
          bind:value={selectedType}
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          {#each idTypeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <!-- Count Input (only for non-conversion types) -->
      {#if !isConversionType(selectedType)}
        <div>
          <label
            for="count-input"
            class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
          >
            Count
          </label>
          <input
            id="count-input"
            type="number"
            min="1"
            max="1000"
            bind:value={count}
            class="w-24 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      {/if}

      <!-- Generate Button -->
      <button
        onclick={handleGenerate}
        class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
      >
        {isConversionType(selectedType) ? "Convert" : "Generate"}
      </button>
    </div>

    <!-- Name-based UUID options (v3, v5) -->
    {#if needsNameInput(selectedType)}
      <div class="flex flex-col sm:flex-row gap-4 p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex-1">
          <label
            for="namespace-select"
            class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
          >
            Namespace
          </label>
          <select
            id="namespace-select"
            bind:value={namespace}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            {#each namespaceOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        {#if namespace === "custom"}
          <div class="flex-1">
            <label
              for="custom-namespace"
              class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
            >
              Custom Namespace UUID
            </label>
            <input
              id="custom-namespace"
              type="text"
              bind:value={customNamespace}
              placeholder="00000000-0000-0000-0000-000000000000"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono"
            />
          </div>
        {/if}

        <div class="flex-1">
          <label
            for="name-input"
            class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
          >
            Name
          </label>
          <input
            id="name-input"
            type="text"
            bind:value={name}
            placeholder="example.com"
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      </div>
    {/if}

    <!-- Conversion input (v1ToV6, v6ToV1) -->
    {#if isConversionType(selectedType)}
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <label
          for="input-uuid"
          class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          {selectedType === "uuid-v1-to-v6" ? "UUID v1 to Convert" : "UUID v6 to Convert"}
          <span class="normal-case font-normal">(one per line for batch conversion)</span>
        </label>
        <textarea
          id="input-uuid"
          bind:value={inputUuid}
          placeholder={selectedType === "uuid-v1-to-v6"
            ? "Enter UUID v1 (e.g., f47ac10b-58cc-11e1-a4f5-0050568b5678)"
            : "Enter UUID v6 (e.g., 1e158ccf-47ac-610b-a4f5-0050568b5678)"}
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono min-h-[80px] resize-y"
        ></textarea>
      </div>
    {/if}
  </div>

  <p class="mb-2 text-xs text-(--color-text-muted)">{selectedDescription}</p>

  <!-- Output -->
  <div class="flex-1 flex flex-col min-h-[200px]">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
        {isConversionType(selectedType) ? "Converted UUIDs" : "Generated IDs"}
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
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
      bind:this={outputEditorContainer}
      class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
    ></div>
  </div>
</div>
