<script lang="ts">
  interface Props {
    accept?: string;
    multiple?: boolean;
    label?: string;
    sublabel?: string;
    icon?: string;
    onfiles: (files: File[]) => void;
    disabled?: boolean;
  }

  let {
    accept = ".pdf,application/pdf",
    multiple = false,
    label = "Drop a PDF file here or click to browse",
    sublabel = "Supports .pdf files",
    icon = "📄",
    onfiles,
    disabled = false,
  }: Props = $props();

  let dragOver = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    if (disabled) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    onfiles(multiple ? files : [files[0]]);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    if (files.length === 0) return;
    onfiles(multiple ? files : [files[0]]);
    target.value = "";
  }

  function handleClick() {
    if (!disabled) inputEl?.click();
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="border-2 border-dashed flex flex-col items-center justify-center p-6 min-h-[240px] transition-colors {dragOver
    ? 'border-(--color-accent) bg-(--color-accent)/5'
    : 'border-(--color-border)'} {disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  onclick={handleClick}
  onkeydown={handleKey}
  role="button"
  tabindex="0"
  aria-disabled={disabled}
>
  <div class="text-4xl mb-2">{icon}</div>
  <p class="text-sm text-(--color-text) text-center">{label}</p>
  <p class="text-xs text-(--color-text-muted) mt-1 text-center">{sublabel}</p>
  <span
    class="mt-3 inline-block px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors pointer-events-none"
  >
    Browse Files
  </span>
  <input
    bind:this={inputEl}
    type="file"
    {accept}
    {multiple}
    {disabled}
    class="hidden"
    onchange={handleChange}
  />
</div>
