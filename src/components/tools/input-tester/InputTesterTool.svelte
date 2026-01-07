<script lang="ts">
  import KeyCodeTool from "./KeyCodeTool.svelte";
  import GamepadTool from "./GamepadTool.svelte";

  type Tab = "keyboard" | "gamepad";
  let activeTab = $state<Tab>("keyboard");
</script>

<div class="h-full flex flex-col">
  <!-- Tab Navigation -->
  <div class="mb-4 border-b border-(--color-border)">
    <div class="flex gap-1">
      <button
        onclick={() => activeTab = "keyboard"}
        class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'keyboard' ? 'text-(--color-accent) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        ⌨️ Keyboard
      </button>
      <button
        onclick={() => activeTab = "gamepad"}
        class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'gamepad' ? 'text-(--color-accent) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        🎮 Gamepad
      </button>
    </div>
  </div>

  <!-- Tab Content -->
  <div class="flex-1 min-h-0">
    {#if activeTab === "keyboard"}
      <KeyCodeTool />
    {:else}
      <GamepadTool />
    {/if}
  </div>
</div>
