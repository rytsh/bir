<script lang="ts">
  interface FormatOption {
    value: string;
    label: string;
    description: string;
    details?: string;
  }

  interface FormatCategory {
    id: string;
    label: string;
    formats: FormatOption[];
  }

  interface Props {
    categories: FormatCategory[];
    value: string;
    onchange: (value: string) => void;
    placeholder?: string;
  }

  let { categories, value, onchange, placeholder = "Select format..." }: Props = $props();

  let isOpen = $state(false);
  let searchQuery = $state("");
  let highlightedIndex = $state(-1);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let inputRef = $state<HTMLInputElement | null>(null);

  // Flatten formats for keyboard navigation
  let allFormats = $derived(() => {
    return categories.flatMap((cat) => cat.formats);
  });

  // Filter formats based on search
  let filteredCategories = $derived(() => {
    if (!searchQuery.trim()) return categories;

    const query = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        formats: cat.formats.filter(
          (f) =>
            f.value.toLowerCase().includes(query) ||
            f.label.toLowerCase().includes(query) ||
            f.description.toLowerCase().includes(query) ||
            (f.details && f.details.toLowerCase().includes(query))
        ),
      }))
      .filter((cat) => cat.formats.length > 0);
  });

  // Flatten filtered formats for navigation
  let filteredFormats = $derived(() => {
    return filteredCategories().flatMap((cat) => cat.formats);
  });

  // Get selected format details
  let selectedFormat = $derived(() => {
    for (const cat of categories) {
      const format = cat.formats.find((f) => f.value === value);
      if (format) return format;
    }
    return null;
  });

  function handleToggle() {
    isOpen = !isOpen;
    if (isOpen) {
      searchQuery = "";
      highlightedIndex = -1;
      setTimeout(() => inputRef?.focus(), 0);
    }
  }

  function handleSelect(formatValue: string) {
    onchange(formatValue);
    isOpen = false;
    searchQuery = "";
    highlightedIndex = -1;
  }

  function handleKeydown(e: KeyboardEvent) {
    const formats = filteredFormats();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, formats.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < formats.length) {
          handleSelect(formats[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        isOpen = false;
        searchQuery = "";
        break;
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      isOpen = false;
      searchQuery = "";
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });

  // Scroll highlighted item into view
  $effect(() => {
    if (highlightedIndex >= 0 && isOpen) {
      const item = dropdownRef?.querySelector(`[data-index="${highlightedIndex}"]`);
      item?.scrollIntoView({ block: "nearest" });
    }
  });
</script>

<div class="relative" bind:this={dropdownRef}>
  <!-- Trigger Button -->
  <button
    type="button"
    onclick={handleToggle}
    class="w-full px-3 py-2 text-left text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:border-(--color-accent) focus:outline-none focus:border-(--color-accent) transition-colors flex items-center justify-between gap-2"
  >
    {#if selectedFormat()}
      <span class="flex items-center gap-2 min-w-0">
        <span class="font-medium">{selectedFormat()?.label}</span>
        <span class="text-(--color-text-muted) text-xs truncate hidden sm:inline">{selectedFormat()?.description}</span>
      </span>
    {:else}
      <span class="text-(--color-text-muted)">{placeholder}</span>
    {/if}
    <svg
      class="w-4 h-4 flex-shrink-0 text-(--color-text-muted) transition-transform {isOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Dropdown Panel -->
  {#if isOpen}
    <div class="absolute z-50 mt-1 w-full min-w-[280px] max-h-[320px] border border-(--color-border) bg-(--color-bg) shadow-lg flex flex-col">
      <!-- Search Input -->
      <div class="p-2 border-b border-(--color-border)">
        <input
          bind:this={inputRef}
          type="text"
          bind:value={searchQuery}
          onkeydown={handleKeydown}
          placeholder="Search formats..."
          class="w-full px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) placeholder:text-(--color-text-muted) focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Options List -->
      <div class="overflow-y-auto flex-1">
        {#each filteredCategories() as category}
          <div class="py-1">
            <!-- Category Header -->
            <div class="px-3 py-1.5 text-[10px] uppercase tracking-wider text-(--color-text-muted) font-medium bg-(--color-bg-alt) sticky top-0">
              {category.label}
            </div>

            <!-- Format Options -->
            {#each category.formats as format, i}
              {@const globalIndex = filteredFormats().indexOf(format)}
              <button
                type="button"
                data-index={globalIndex}
                onclick={() => handleSelect(format.value)}
                class="w-full px-3 py-2 text-left flex items-start gap-3 transition-colors
                  {value === format.value ? 'bg-(--color-accent)/10' : ''}
                  {highlightedIndex === globalIndex ? 'bg-(--color-bg-alt)' : 'hover:bg-(--color-bg-alt)'}"
              >
                <!-- Format Label -->
                <span class="font-medium text-sm text-(--color-text) w-12 flex-shrink-0 uppercase">
                  {format.label}
                </span>

                <!-- Description -->
                <span class="flex-1 min-w-0">
                  <span class="text-sm text-(--color-text)">{format.description}</span>
                  {#if format.details}
                    <span class="block text-xs text-(--color-text-muted) mt-0.5">{format.details}</span>
                  {/if}
                </span>

                <!-- Check Mark -->
                {#if value === format.value}
                  <svg class="w-4 h-4 text-(--color-accent) flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        {/each}

        {#if filteredCategories().length === 0}
          <div class="px-3 py-4 text-sm text-(--color-text-muted) text-center">
            No formats found
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
