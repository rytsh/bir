<script lang="ts">
  import type { Snippet } from "svelte";
  import { fitComparisonSize } from "../../../lib/image-diff.ts";

  interface Props {
    width: number;
    height: number;
    zoom: number;
    previewHeight: number;
    children: Snippet;
  }

  let { width, height, zoom, previewHeight, children }: Props = $props();
  let viewportWidth = $state<number>(0);
  let viewportHeight = $state<number>(0);
  const size = $derived(fitComparisonSize(width, height, viewportWidth, viewportHeight, zoom));
</script>

<div class="comparison-viewport wb-scroll wb-checker" style:height={previewHeight ? `${previewHeight}px` : "min(55dvh, 480px)"}
  bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
  <div class="comparison-surface" style:width={`max(100%, ${size.width}px)`} style:height={`max(100%, ${size.height}px)`}>
    <div class="comparison-stage" style:width={`${size.width}px`} style:height={`${size.height}px`}>
      {@render children()}
    </div>
  </div>
</div>

<style>
  .comparison-viewport { width: 100%; min-width: 0; }
  .comparison-surface { display: grid; place-items: center; }
  .comparison-stage { position: relative; flex: none; }
  .comparison-stage:focus-within { outline: 2px solid var(--color-accent); outline-offset: -2px; }
</style>
