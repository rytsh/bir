<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../styles/workbench.css";

  let { description, children }: { description: string; children: Snippet } = $props();
</script>

<div class="workbench">
  <p class="wb-description">{description}</p>
  {@render children()}
</div>
