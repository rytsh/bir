<script lang="ts">
  import { navigate } from "astro:transitions/client";
  import { categories, type Tool } from "../data/tools";
  import { FAVORITES_CHANGED_EVENT, getFavoriteIds } from "../lib/favorites";
  import { RECENT_CHANGED_EVENT, getRecentIds } from "../lib/recent";

  interface PaletteItem {
    tool: Tool;
    category: string;
    section: string;
  }

  interface ScoredTool {
    tool: Tool;
    category: string;
    score: number;
  }

  const MAX_RESULTS = 50;

  const allTools = categories.flatMap((category) =>
    category.tools.map((tool) => ({ tool, category: category.name })),
  );
  const toolsById = new Map(allTools.map((entry) => [entry.tool.id, entry]));

  let open = $state(false);
  let query = $state("");
  let activeIndex = $state(0);
  let recentIds = $state<string[]>([]);
  let favoriteIds = $state<string[]>([]);
  let inputElement: HTMLInputElement | undefined = $state();
  let listElement: HTMLUListElement | undefined = $state();
  let previouslyFocused: Element | null = null;

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const scoreTool = (tool: Tool, category: string, terms: string[]): number => {
    const name = tool.name.toLowerCase();
    const keywords = tool.keywords.toLowerCase();
    const description = tool.description.toLowerCase();
    const categoryName = category.toLowerCase();
    let total = 0;

    for (const term of terms) {
      let best = 0;
      if (name === term) best = 100;
      else if (name.startsWith(term)) best = 80;
      else if (name.split(/[\s/.-]+/).some((word) => word.startsWith(term))) best = 65;
      else if (name.includes(term)) best = 55;
      else if (keywords.split(/,\s*/).some((keyword) => keyword.startsWith(term))) best = 40;
      else if (keywords.includes(term)) best = 30;
      else if (categoryName.includes(term)) best = 20;
      else if (description.includes(term)) best = 10;
      else if (isSubsequence(term, name)) best = 5;
      if (best === 0) return 0;
      total += best;
    }
    return total;
  };

  const isSubsequence = (needle: string, haystack: string): boolean => {
    if (needle.length < 2) return false;
    let index = 0;
    for (const char of haystack) {
      if (char === needle[index]) index++;
      if (index === needle.length) return true;
    }
    return false;
  };

  let items = $derived.by((): PaletteItem[] => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      const recent = recentIds
        .map((id) => toolsById.get(id))
        .filter((entry) => entry !== undefined)
        .map((entry) => ({ ...entry, section: "Recent" }));
      const favorites = favoriteIds
        .filter((id) => !recentIds.includes(id))
        .map((id) => toolsById.get(id))
        .filter((entry) => entry !== undefined)
        .map((entry) => ({ ...entry, section: "Favorites" }));
      const shownIds = new Set([...recent, ...favorites].map((entry) => entry.tool.id));
      const rest = allTools
        .filter((entry) => !shownIds.has(entry.tool.id))
        .map((entry) => ({ ...entry, section: entry.category }));
      return [...recent, ...favorites, ...rest];
    }

    const terms = trimmed.split(/\s+/).filter(Boolean);
    return allTools
      .map((entry): ScoredTool => {
        let score = scoreTool(entry.tool, entry.category, terms);
        if (score > 0 && recentIds.includes(entry.tool.id)) score += 3;
        if (score > 0 && favoriteIds.includes(entry.tool.id)) score += 2;
        return { ...entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
      .slice(0, MAX_RESULTS)
      .map((entry) => ({ tool: entry.tool, category: entry.category, section: "Results" }));
  });

  $effect(() => {
    void query;
    activeIndex = 0;
  });

  $effect(() => {
    if (!open || !listElement) return;
    const active = listElement.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  });

  const show = (): void => {
    if (open) return;
    previouslyFocused = document.activeElement;
    recentIds = getRecentIds();
    favoriteIds = getFavoriteIds();
    query = "";
    activeIndex = 0;
    open = true;
    requestAnimationFrame(() => inputElement?.focus());
  };

  const hide = (): void => {
    open = false;
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };

  const select = (item: PaletteItem | undefined, newTab = false): void => {
    if (!item) return;
    if (newTab) {
      window.open(item.tool.path, "_blank", "noopener");
      return;
    }
    open = false;
    if (window.location.pathname !== item.tool.path) navigate(item.tool.path);
  };

  const handleInputKeydown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      activeIndex = items.length ? (activeIndex + 1) % items.length : 0;
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      activeIndex = items.length ? (activeIndex - 1 + items.length) % items.length : 0;
    } else if (event.key === "PageDown") {
      event.preventDefault();
      activeIndex = Math.min(items.length - 1, activeIndex + 8);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      activeIndex = Math.max(0, activeIndex - 8);
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(items[activeIndex], event.metaKey || event.ctrlKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hide();
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  };

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    );
  };

  $effect(() => {
    const handleGlobalKeydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) hide();
        else show();
      } else if (event.key === "/" && !open && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        show();
      }
    };
    const handleOpenRequest = (): void => show();
    const handleFavoritesChanged = (): void => {
      favoriteIds = getFavoriteIds();
    };
    const handleRecentChanged = (): void => {
      recentIds = getRecentIds();
    };

    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("tools:open-command-palette", handleOpenRequest);
    window.addEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
    window.addEventListener(RECENT_CHANGED_EVENT, handleRecentChanged);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("tools:open-command-palette", handleOpenRequest);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
      window.removeEventListener(RECENT_CHANGED_EVENT, handleRecentChanged);
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center px-3 pt-[10vh]"
    onclick={(event) => {
      if (event.target === event.currentTarget) hide();
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search tools"
      class="w-full max-w-xl bg-(--color-bg-alt) border border-(--color-border) shadow-2xl flex flex-col max-h-[70vh]"
    >
      <div class="flex items-center gap-3 px-4 border-b border-(--color-border)">
        <svg class="w-4 h-4 shrink-0 text-(--color-text-light)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          bind:this={inputElement}
          bind:value={query}
          onkeydown={handleInputKeydown}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={items[activeIndex] ? `command-palette-item-${activeIndex}` : undefined}
          autocomplete="off"
          spellcheck="false"
          placeholder="Search {allTools.length} tools..."
          class="flex-1 py-3 bg-transparent text-(--color-text) text-base outline-none placeholder:text-(--color-text-light)"
        />
        <kbd class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono border border-(--color-border) text-(--color-text-light)">Esc</kbd>
      </div>

      <ul bind:this={listElement} id="command-palette-list" role="listbox" class="flex-1 overflow-y-auto py-1">
        {#each items as item, index (item.section + item.tool.id)}
          {#if index === 0 || items[index - 1].section !== item.section}
            <li role="presentation" class="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wider text-(--color-text-light)">
              {item.section}
            </li>
          {/if}
          <li
            id="command-palette-item-{index}"
            role="option"
            aria-selected={index === activeIndex}
            data-index={index}
          >
            <a
              href={item.tool.path}
              onclick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                select(item);
              }}
              onmousemove={() => {
                if (activeIndex !== index) activeIndex = index;
              }}
              class="flex items-center gap-3 px-4 py-2 text-sm {index === activeIndex
                ? 'bg-(--color-border) text-(--color-text)'
                : 'text-(--color-text-muted)'}"
            >
              <span class="w-5 text-center shrink-0">{item.tool.icon}</span>
              <span class="flex-1 min-w-0">
                <span class="block truncate text-(--color-text)">{item.tool.name}</span>
                {#if query.trim()}
                  <span class="block truncate text-xs text-(--color-text-light)">{item.tool.description}</span>
                {/if}
              </span>
              {#if item.section !== item.category}
                <span class="shrink-0 text-xs text-(--color-text-light)">{item.category}</span>
              {/if}
            </a>
          </li>
        {:else}
          <li class="px-4 py-8 text-center text-sm text-(--color-text-light)">No tools match "{query}"</li>
        {/each}
      </ul>

      <div class="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-(--color-border) text-[11px] text-(--color-text-light)">
        <span><kbd class="font-mono">↑↓</kbd> navigate</span>
        <span><kbd class="font-mono">↵</kbd> open</span>
        <span><kbd class="font-mono">{isMac ? "⌘" : "Ctrl"}+↵</kbd> new tab</span>
        <span class="ml-auto"><kbd class="font-mono">{isMac ? "⌘" : "Ctrl"}+K</kbd> or <kbd class="font-mono">/</kbd> to open</span>
      </div>
    </div>
  </div>
{/if}
