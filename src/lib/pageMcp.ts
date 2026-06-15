/**
 * Helper for publishing a tool page's own MCP tools to the mcp-page-bridge
 * browser extension via `window.mcp`.
 *
 * When the extension is installed and the tab is enabled, the tools declared
 * here are tunnelled to a local MCP bridge and become callable by a coding
 * agent (namespaced as `<label>__<tool>`). When the extension is NOT installed,
 * `window.mcp` is just inert page data, so this is safe to ship in production.
 *
 * Each tool page registers its OWN `label` + `tools` (page-scoped). Because the
 * site uses Astro's ClientRouter (client-side navigation swaps the DOM without a
 * full reload), `window.mcp` would otherwise leak from one tool to the next, so
 * `registerPageMcp` returns a cleanup that must run on component unmount.
 */

export type ToolHandler = (
  args: Record<string, any>,
) => unknown | Promise<unknown>;

export interface ToolDefinition {
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  handler: ToolHandler;
}

export type ToolManifest = ToolHandler | ToolDefinition;

export interface McpManifest {
  label?: string;
  tools?: Record<string, ToolManifest>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    mcp?: McpManifest;
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Publish a page's tools on `window.mcp`. Returns a cleanup function that clears
 * the registered tools so a stale provider does not linger after navigation.
 *
 * Tool handlers should be stable references (defined once) because the
 * extension diffs tools by handler identity on a ~1s rescan; recreating handler
 * closures on every render would churn re-registration.
 */
export function registerPageMcp(
  label: string,
  tools: Record<string, ToolManifest>,
): () => void {
  if (!isBrowser()) return () => {};

  // The extension installs a getter/setter on window.mcp that merges its own API
  // methods onto whatever we assign, so a plain object assignment is enough and
  // also triggers a live re-sync.
  window.mcp = { label, tools };

  return () => {
    // Only clear if we still own the manifest for this label.
    if (window.mcp && window.mcp.label === label) {
      window.mcp = { label, tools: {} };
    }
  };
}
