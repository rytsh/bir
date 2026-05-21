<script lang="ts">
  import type { Tool } from "../data/tools";
  import {
    FAVORITES_CHANGED_EVENT,
    FAVORITES_STORAGE_KEY,
    getFavoriteIds,
    toggleFavoriteId,
  } from "../lib/favorites";

  interface Props {
    tool?: Tool;
    variant?: "card" | "navbar";
    showLabel?: boolean;
  }

  let { tool, variant = "card", showLabel = false }: Props = $props();

  let favoriteIds = $state<string[]>([]);
  let isFavorited = $derived(tool ? favoriteIds.includes(tool.id) : false);

  function loadFavorites(): void {
    favoriteIds = getFavoriteIds();
  }

  function handleFavoritesChanged(event: Event): void {
    const detail = (event as CustomEvent<{ favoriteIds?: string[] }>).detail;
    favoriteIds = detail?.favoriteIds ?? getFavoriteIds();
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key === FAVORITES_STORAGE_KEY) {
      loadFavorites();
    }
  }

  function toggleFavorite(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!tool) return;

    favoriteIds = toggleFavoriteId(tool.id);
  }

  $effect(() => {
    loadFavorites();

    window.addEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
      window.removeEventListener("storage", handleStorage);
    };
  });
</script>

{#if tool}
  <button
    type="button"
    onclick={toggleFavorite}
    class={variant === "navbar"
      ? "inline-flex items-center gap-1.5 px-2 py-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      : "absolute right-2 top-2 inline-flex items-center justify-center w-8 h-8 text-(--color-text-light) hover:text-(--color-accent) hover:bg-(--color-bg) transition-colors"}
    aria-label={isFavorited
      ? `Remove ${tool.name} from favorites`
      : `Add ${tool.name} to favorites`}
    aria-pressed={isFavorited}
    title={isFavorited ? "Remove from favorites" : "Add to favorites"}
  >
    <svg
      class="w-4 h-4"
      viewBox="0 0 24 24"
      fill={isFavorited ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      aria-hidden="true"
    >
      <path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.1 5.1a.56.56 0 0 0 .47.35l5.51.44a.56.56 0 0 1 .32.98l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.38a.56.56 0 0 1-.84.61l-4.72-2.88a.56.56 0 0 0-.58 0l-4.72 2.88a.56.56 0 0 1-.84-.61l1.28-5.38a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.98l5.51-.44a.56.56 0 0 0 .47-.35l2.1-5.1Z" />
    </svg>
    {#if showLabel}
      <span class="hidden sm:inline text-sm">
        {isFavorited ? "Favorited" : "Favorite"}
      </span>
    {/if}
  </button>
{/if}
