<script lang="ts">
  import { emojiCategories, emojiCount, emojiUnicodeVersion, filterEmojiCategories } from "../../lib/emoji.ts";

  let searchQuery = $state("");
  let copiedEmoji = $state<string | null>(null);
  let selectedCategory = $state<string | null>(null);

  const filteredCategories = $derived(filterEmojiCategories(searchQuery, selectedCategory));

  function copyEmoji(emoji: string) {
    navigator.clipboard.writeText(emoji);
    copiedEmoji = emoji;
    setTimeout(() => {
      copiedEmoji = null;
    }, 300);
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Browse and copy emojis. Click any emoji to copy it to clipboard. ({emojiCount} emojis · Unicode {emojiUnicodeVersion})
    </p>
    <p class="text-xs text-(--color-text-muted) mt-1">
      Search in English or Turkish. Newer emojis may require an updated operating system or emoji font.
    </p>
  </header>

  <!-- Search and Filter -->
  <div class="flex flex-col sm:flex-row gap-3 mb-4">
    <div class="flex-1">
      <input
        type="text"
        bind:value={searchQuery}
        aria-label="Search emojis"
        placeholder="Search emojis (cigarette, sigara, knot, düğüm)..."
        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
      />
    </div>
    <div>
      <select
        bind:value={selectedCategory}
        aria-label="Emoji category"
        class="w-full sm:w-auto px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
      >
        <option value={null}>All Categories</option>
        {#each emojiCategories as category}
          <option value={category.name}>{category.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Emoji Grid -->
  <div class="flex-1 overflow-y-auto">
    {#each filteredCategories as category (category.name)}
      <div class="mb-6">
        <h2 class="text-sm font-medium text-(--color-text-light) uppercase tracking-wider mb-3 sticky top-0 bg-(--color-bg) py-2">
          {category.name}
          <span class="text-(--color-text-muted) font-normal">({category.emojis.length})</span>
        </h2>
        <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-0 border-l border-t border-(--color-border)">
          {#each category.emojis as item (item.emoji)}
            <button
              onclick={() => copyEmoji(item.emoji)}
              class="flex flex-col items-center justify-center p-2 hover:bg-(--color-bg-alt) border-r border-b border-(--color-border) transition-all duration-150 cursor-pointer {copiedEmoji === item.emoji ? 'bg-(--color-accent) scale-95' : ''}"
              title={item.desc}
            >
              <span class="text-2xl">{item.emoji}</span>
              <span class="text-[10px] text-(--color-text-muted) mt-1 truncate w-full text-center leading-tight">{item.desc}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}

    {#if filteredCategories.length === 0}
      <div class="text-center py-12 text-(--color-text-muted)">
        No emojis found matching "{searchQuery}"
      </div>
    {/if}
  </div>
</div>
