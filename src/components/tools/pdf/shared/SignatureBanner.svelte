<script lang="ts">
  import type { DetectedSignature } from "./pdf-signatures";

  interface Props {
    signatures: DetectedSignature[];
    integrityVerified?: boolean | null; // true=ok, false=mismatch, null=unknown/n/a
    showDestructiveWarning?: boolean;
  }

  let { signatures, integrityVerified = null, showDestructiveWarning = false }: Props = $props();

  let expanded = $state(false);
</script>

{#if signatures.length > 0}
  <div class="mb-4 border border-green-500 bg-(--color-bg-alt)">
    <div class="px-4 py-3 border-b border-(--color-border) flex items-center gap-2">
      <span class="text-green-500 text-lg">&#x2714;</span>
      <span class="text-sm font-medium text-green-500 flex-1">
        This document is signed
        ({signatures.length} signature{signatures.length !== 1 ? "s" : ""})
      </span>
      {#if integrityVerified === true}
        <span class="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-500 border border-green-500/30">
          Integrity verified
        </span>
      {:else if integrityVerified === false}
        <span class="text-xs px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/30">
          Hash mismatch
        </span>
      {/if}
      <button
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? "Hide" : "Details"}
      </button>
    </div>

    {#if expanded}
      <div class="divide-y divide-(--color-border)">
        {#each signatures as sig}
          <div class="px-4 py-3">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span
                class="text-xs font-medium px-1.5 py-0.5 {sig.source === 'digital'
                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                  : 'bg-green-500/10 text-green-500 border border-green-500/30'}"
              >
                {sig.source === "digital" ? "Digital Signature" : "E-Signature"}
              </span>
              {#if sig.hasCryptoData}
                <span class="text-xs px-1.5 py-0.5 bg-purple-500/10 text-purple-500 border border-purple-500/30">
                  PKCS#7
                </span>
              {/if}
              {#if sig.tool}
                <span class="text-xs text-(--color-text-muted)">{sig.tool}</span>
              {/if}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
              {#if sig.signerName}
                <div><span class="text-(--color-text-light)">Signer:</span> {sig.signerName}</div>
              {/if}
              {#if sig.signerEmail}
                <div><span class="text-(--color-text-light)">Contact:</span> {sig.signerEmail}</div>
              {/if}
              {#if sig.signDate}
                <div>
                  <span class="text-(--color-text-light)">Date:</span>
                  {new Date(sig.signDate).toLocaleString()}
                </div>
              {/if}
              {#if sig.signReason}
                <div><span class="text-(--color-text-light)">Reason:</span> {sig.signReason}</div>
              {/if}
              {#if sig.location}
                <div><span class="text-(--color-text-light)">Location:</span> {sig.location}</div>
              {/if}
              {#if sig.fieldName}
                <div><span class="text-(--color-text-light)">Field:</span> {sig.fieldName}</div>
              {/if}
              {#if sig.filter}
                <div>
                  <span class="text-(--color-text-light)">Filter:</span>
                  {sig.filter}{sig.subFilter ? ` / ${sig.subFilter}` : ""}
                </div>
              {/if}
              {#if sig.storedHash}
                <div class="sm:col-span-2">
                  <span class="text-(--color-text-light)">Integrity Hash:</span>
                  <span class="font-mono text-[10px] break-all">{sig.storedHash}</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if showDestructiveWarning}
      <div class="px-4 py-2 bg-orange-500/10 border-t border-orange-500/30 text-xs text-orange-600 dark:text-orange-400">
        ⚠️ Modifying this PDF will invalidate the existing signature.
      </div>
    {/if}
  </div>
{/if}
