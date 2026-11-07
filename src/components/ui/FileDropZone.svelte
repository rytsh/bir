<script lang="ts">
  import { Upload } from "@lucide/svelte";

  interface Props {
    accept?: string;
    multiple?: boolean;
    title?: string;
    hint?: string;
    disabled?: boolean;
    compact?: boolean;
    onfiles: (files: File[]) => void;
  }

  let { accept = "", multiple = false, title = "Drop files here", hint = "Files stay on your device.", disabled = false, compact = false, onfiles }: Props = $props();
  let dragging = $state(false);
  let input = $state<HTMLInputElement>();

  function receive(files: FileList | null): void {
    dragging = false;
    if (!disabled && files?.length) onfiles(multiple ? Array.from(files) : [files[0]]);
  }

  function openPicker(event: MouseEvent): void {
    if (disabled || (event.target instanceof HTMLElement && event.target.closest("label, button, a, input"))) return;
    input?.click();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (The whole zone is a larger pointer target; the labelled button inside remains the keyboard path.) -->
<section class="wb-drop" class:dragging class:compact class:disabled aria-label={title} onclick={openPicker}
  ondragover={(event) => { event.preventDefault(); if (!disabled) dragging = true; }}
  ondragleave={(event) => { if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) dragging = false; }}
  ondrop={(event) => { event.preventDefault(); receive(event.dataTransfer?.files ?? null); }}>
  <Upload size={compact ? 20 : 26} strokeWidth={1.5} aria-hidden="true" />
  <div class="wb-drop-copy"><strong>{dragging ? "Release to add" : title}</strong><p>{hint}</p></div>
  <label class="wb-button" class:disabled>
    Choose {multiple ? "files" : "file"}
    <input bind:this={input} class="wb-file-input" type="file" {accept} {multiple} {disabled}
      onchange={(event) => { receive(event.currentTarget.files); event.currentTarget.value = ""; }} />
  </label>
</section>
