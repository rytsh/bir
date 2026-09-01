/**
 * Helper for publishing a tool page's own MCP tools with
 * [WebMCP](https://github.com/webmachinelearning/webmcp) — the standard
 * `document.modelContext` API for handing client-side functionality to AI
 * agents.
 *
 * `document.modelContext` is native in the Chrome 149 / Edge 150 origin trials,
 * and the mcp-page-bridge browser extension polyfills it everywhere else. When
 * neither is present this module is a no-op, so it is safe to ship in
 * production.
 *
 * With the extension installed and the tab enabled, the tools registered here
 * are tunnelled to a local MCP bridge and become callable by a coding agent,
 * namespaced as `<label>__<tool>`.
 *
 * Each tool page registers its OWN label + tools (page-scoped). Because the site
 * uses Astro's ClientRouter (client-side navigation swaps the DOM without a full
 * reload), tools would otherwise leak from one tool page to the next, so
 * `registerPageMcp` returns a cleanup that must run on component unmount.
 */

/**
 * A WebMCP execute callback. `signal` is aborted if the agent cancels the call.
 */
export type ToolExecute = (
  args: Record<string, any>,
  options: { signal: AbortSignal },
) => unknown | Promise<unknown>;

export interface PageTool {
  /** 1-128 characters of `[A-Za-z0-9_.-]`. */
  name: string;
  /** Human-readable label for UI. */
  title?: string;
  /** Required by WebMCP: what the tool does, in natural language. */
  description: string;
  /** JSON Schema for `args`. Defaults to an empty object schema. */
  inputSchema?: Record<string, unknown>;
  /** `readOnlyHint: true` tells the agent the tool does not mutate state. */
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: ToolExecute;
}

/** Bridge-only knobs, present only when the mcp-page-bridge extension is installed. */
declare global {
  interface Window {
    mcpPageBridge?: {
      setLabel(value: string): void;
      readonly connected: boolean;
      readonly nativeWebMcp: boolean;
    };
  }
}

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const EMPTY_INPUT_SCHEMA = { type: "object", properties: {} };

/**
 * The registration currently owning `document.modelContext`. ClientRouter can
 * mount the next page's island before unmounting the previous one, so we tear
 * the old set down explicitly instead of relying on cleanup ordering.
 */
let active: { label: string; controller: AbortController } | undefined;

/**
 * Register a page's tools with WebMCP. Returns a cleanup function that
 * unregisters them so a stale provider does not linger after navigation.
 */
export function registerPageMcp(label: string, tools: PageTool[]): () => void {
  if (typeof document === "undefined") return () => {};

  const modelContext = document.modelContext;
  if (!modelContext) {
    // No native WebMCP and no mcp-page-bridge extension — nothing to do.
    return () => {};
  }

  active?.controller.abort();

  const controller = new AbortController();
  const registration = { label, controller };
  active = registration;

  // Namespaces the tools for the agent, e.g. `notepad__listNotes`.
  window.mcpPageBridge?.setLabel(label);

  for (const { name, title, description, inputSchema, annotations, execute } of tools) {
    if (!TOOL_NAME_PATTERN.test(name)) {
      console.warn(`[mcp] skipping tool with invalid name: ${name}`);
      continue;
    }
    modelContext
      .registerTool(
        {
          name,
          ...(title === undefined ? {} : { title }),
          description,
          inputSchema: inputSchema ?? EMPTY_INPUT_SCHEMA,
          ...(annotations === undefined ? {} : { annotations }),
          execute,
        },
        { signal: controller.signal },
      )
      .catch((error: unknown) => {
        // Aborting the signal rejects the pending promise — that is the normal
        // unregister path, not a failure.
        if (controller.signal.aborted) return;
        console.warn(`[mcp] could not register "${label}__${name}":`, error);
      });
  }

  return () => {
    controller.abort();
    if (active === registration) active = undefined;
  };
}
