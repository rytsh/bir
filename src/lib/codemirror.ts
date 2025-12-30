import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { placeholder } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

/**
 * Creates theme extensions for CodeMirror based on dark/light mode.
 * Always returns an array for consistent spreading.
 */
export const createTheme = (dark: boolean): Extension[] => {
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

/**
 * Common editor height/scroller extension for full-height editors.
 */
export const editorHeightExtension = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

export interface EditorConfig {
  dark: boolean;
  placeholderText?: string;
  readOnly?: boolean;
  language?: Extension;
  onUpdate?: (content: string) => void;
}

/**
 * Creates the base extensions array for a CodeMirror editor.
 */
export const createBaseExtensions = (config: EditorConfig): Extension[] => {
  const extensions: Extension[] = [
    basicSetup,
    ...createTheme(config.dark),
    editorHeightExtension,
  ];

  if (config.language) {
    extensions.splice(1, 0, config.language);
  }

  if (config.placeholderText) {
    extensions.push(placeholder(config.placeholderText));
  }

  if (config.readOnly) {
    extensions.push(EditorState.readOnly.of(true));
  }

  if (config.onUpdate) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          config.onUpdate!(update.state.doc.toString());
        }
      })
    );
  }

  return extensions;
};

export interface CreateEditorOptions {
  container: HTMLDivElement;
  config: EditorConfig;
  initialContent?: string;
}

/**
 * Creates a new CodeMirror EditorView with the specified configuration.
 */
export const createEditor = (options: CreateEditorOptions): EditorView => {
  return new EditorView({
    state: EditorState.create({
      doc: options.initialContent ?? "",
      extensions: createBaseExtensions(options.config),
    }),
    parent: options.container,
  });
};

/**
 * Updates the content of an editor.
 */
export const updateEditorContent = (
  editor: EditorView | undefined,
  content: string
): void => {
  if (editor) {
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: content },
    });
  }
};

/**
 * Gets the content of an editor.
 */
export const getEditorContent = (editor: EditorView | undefined): string => {
  return editor?.state.doc.toString() ?? "";
};

export type DarkModeCleanup = () => void;

/**
 * Creates a MutationObserver that watches for dark mode class changes
 * on the document element and calls the provided callback.
 * Returns a cleanup function to disconnect the observer.
 */
export const createDarkModeObserver = (
  onChange: (isDark: boolean) => void
): DarkModeCleanup => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === "class") {
        const isDark = document.documentElement.classList.contains("dark");
        onChange(isDark);
      }
    });
  });

  observer.observe(document.documentElement, { attributes: true });

  return () => observer.disconnect();
};

/**
 * Gets the current dark mode state from the document element.
 */
export const getInitialDarkMode = (): boolean => {
  return document.documentElement.classList.contains("dark");
};

// Re-export commonly used items for convenience
export { EditorView, EditorState, basicSetup, placeholder };
