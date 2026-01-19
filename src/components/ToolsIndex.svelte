<script lang="ts">
  import { categories } from "../data/tools";

  type Tool = {
    name: string;
    description: string;
    path: string;
    icon: string;
    category: string;
    wasm?: boolean;
    api?: boolean;
  };

  let searchQuery = $state("");
  let selectedCategory = $state("");

  // Get all unique categories
  const allCategories = categories.map((cat) => cat.name);
  const allTools: Tool[] = categories.flatMap((cat) =>
    cat.tools.map((tool) => ({ ...tool, category: cat.name })),
  );

  // Reactive filtered and grouped data
  let filteredTools = $state(allTools);
  let groupedTools = $state(getGroupedTools(allTools));

  // Update filtered tools when search or category changes
  $effect(() => {
    let tools = allTools;

    // Filter by category if selected
    if (selectedCategory) {
      tools = tools.filter((tool) => tool.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      tools = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) ||
          tool.description.toLowerCase().includes(query) ||
          tool.category.toLowerCase().includes(query),
      );
    }

    filteredTools = tools;
    groupedTools = getGroupedTools(tools);
  });

  function getGroupedTools(tools: Tool[]) {
    const groups: Record<string, Tool[]> = {};

    tools.forEach((tool: Tool) => {
      if (!groups[tool.category]) {
        groups[tool.category] = [];
      }
      groups[tool.category].push(tool);
    });

    return Object.entries(groups).map(([categoryName, tools]) => ({
      name: categoryName,
      tools: tools as Tool[],
    }));
  }

  const clearFilters = () => {
    searchQuery = "";
    selectedCategory = "";
  };
</script>

<div>
  <header>
    <h1 class="sr-only">Tools Collection</h1>
    <p class="text-(--color-text-muted) text-sm">
      A collection of open-source useful tools for everyday tasks.
    </p>
    <hr class="border-(--color-border) my-2" />
  </header>

  <!-- Search and Filter Controls -->
  <div class="mb-3 px-3 py-1 border border-(--color-border) bg-(--color-bg-alt)">
    <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <!-- Search Input -->
      <div class="flex-1">
        <label
          for="search-input"
          class="block text-xs text-(--color-text-light) mb-2"
        >
          Search Tools
        </label>
        <div class="relative">
          <input
            id="search-input"
            type="text"
            placeholder="Search by name, description, or category..."
            bind:value={searchQuery}
            class="w-full pl-9 pr-4 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
          <div
            class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
          >
            <svg
              class="w-4 h-4 text-(--color-text-light)"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      <!-- Category Filter -->
      <div class="min-w-[180px]">
        <label
          for="category-select"
          class="block text-xs text-(--color-text-light) mb-2"
        >
          Filter by Category
        </label>
        <select
          id="category-select"
          bind:value={selectedCategory}
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          <option value="">All Categories</option>
          {#each allCategories as category}
            <option value={category}>{category}</option>
          {/each}
        </select>
      </div>

      <!-- Clear Filters -->
      <div class="flex items-end self-end">
        <button
          onclick={clearFilters}
          class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm hover:bg-(--color-bg) transition-colors"
          title="Clear all filters"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Results Summary -->
    <div class="mt-3 text-xs text-(--color-text-light)">
      {#if filteredTools.length === 0}
        No tools found matching your search.
      {:else if filteredTools.length === allTools.length}
        Showing all {allTools.length} tools
      {:else}
        Showing {filteredTools.length} of {allTools.length} tools
      {/if}
    </div>
  </div>

  <!-- Tools Grid -->
  {#if groupedTools.length > 0}
    {#each groupedTools as category}
      <section class="mb-4">
        <h2
          class="text-xs uppercase tracking-wider text-(--color-text-light) mb-3 font-medium"
        >
          {category.name}
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {#each category.tools as tool}
            <a
              href={tool.path}
              class="group block p-3 bg-(--color-bg-alt) border border-(--color-border) hover:border-(--color-text-light) active:bg-(--color-border) transition-colors"
            >
              <div class="flex items-center gap-3">
                <span class="text-lg">{tool.icon}</span>
                <div class="flex-1 min-w-0">
                  <h3
                    class="text-sm font-medium text-(--color-text) group-hover:text-(--color-text-muted) transition-colors truncate"
                  >
                    {tool.name}
                  </h3>
                  <p class="text-xs text-(--color-text-light) mt-0.5 truncate">
                    {tool.description}
                  </p>
                </div>
                {#if tool.wasm}
                  <span class="inline-block ml-auto" title="WebAssembly powered">
                    <svg class="w-4 h-4" viewBox="0 0 612 612" fill="currentColor">
                      <path d="m376 0c0 1.08 0 2.16 0 3.3 0 38.76-31.42 70.17-70.17 70.17-38.76 0-70.17-31.42-70.17-70.17l0 0c0-1.14 0-2.22 0-3.3L0 0l0 612 612 0 0-612z" fill="#654ff0"/>
                      <path d="m142.16 329.81 40.56 0 27.69 147.47 0.5 0 33.28-147.47 37.94 0 30.06 149.28 0.59 0 31.56-149.28 39.78 0-51.69 216.69-40.25 0-29.81-147.47-0.78 0-31.91 147.47-41 0zm287.69 0 63.94 0 63.5 216.69-41.84 0-13.81-48.22-72.84 0-10.66 48.22-40.75 0zm24.34 53.41-17.69 79.5 55.06 0-20.31-79.5z" fill="#fff"/>
                    </svg>
                  </span>
                {:else if tool.api}
                  <span class="inline-block ml-auto" title="Backend API powered">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="#00ADD8"/>
                    </svg>
                  </span>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  {:else}
    <div class="text-center py-12 text-(--color-text-light)">
      <p>No tools available yet.</p>
    </div>
  {/if}
</div>
