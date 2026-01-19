<script lang="ts">
  // State
  let domain = $state("");
  let loading = $state(false);
  let error = $state("");
  let copiedField = $state<string | null>(null);
  let showRaw = $state(false);

  interface WhoisResponse {
    domain: string;
    registrar?: string;
    createdDate?: string;
    updatedDate?: string;
    expiryDate?: string;
    nameservers?: string[];
    status?: string[];
    domainAge?: string;
    raw?: string;
    error?: string;
  }

  let result = $state<WhoisResponse | null>(null);

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.1.tools";

  const presets = [
    { label: "Google", value: "google.com" },
    { label: "GitHub", value: "github.com" },
    { label: "Wikipedia", value: "wikipedia.org" },
  ];

  async function lookupWhois() {
    if (!domain.trim()) {
      error = "Please enter a domain";
      return;
    }

    loading = true;
    error = "";
    result = null;
    showRaw = false;

    try {
      const url = `${API_URL}/whois?domain=${encodeURIComponent(domain.trim())}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data: WhoisResponse = await response.json();

      if (data.error && !data.raw) {
        error = data.error;
      } else {
        result = data;
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
          error = "Unable to connect to server. Please check if the API is running.";
        } else {
          error = err.message;
        }
      } else {
        error = "An unexpected error occurred";
      }
    } finally {
      loading = false;
    }
  }

  function handleCopy(field: string, value: string) {
    navigator.clipboard.writeText(value);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  }

  function handleClear() {
    domain = "";
    result = null;
    error = "";
    showRaw = false;
  }

  function applyPreset(value: string) {
    domain = value;
    lookupWhois();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      lookupWhois();
    }
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function getExpiryStatus(expiryDate: string | undefined): { color: string; label: string } | null {
    if (!expiryDate) return null;
    try {
      const expiry = new Date(expiryDate);
      if (isNaN(expiry.getTime())) return null;
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry < 0) {
        return { color: "bg-red-500", label: "Expired" };
      }
      if (daysUntilExpiry <= 30) {
        return { color: "bg-yellow-500", label: "Expiring Soon" };
      }
      return { color: "bg-green-500", label: "Active" };
    } catch {
      return null;
    }
  }

  function getStatusColor(status: string): string {
    const s = status.toLowerCase();
    if (s.includes("ok") || s.includes("active")) return "text-green-400";
    if (s.includes("prohibited") || s.includes("lock")) return "text-blue-400";
    if (s.includes("pending")) return "text-yellow-400";
    return "text-(--color-text-muted)";
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Look up WHOIS information for a domain including registrar, registration dates, and nameservers.
    </p>
  </header>

  <!-- Input Section -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        Domain to Lookup
      </h2>
      <button
        onclick={handleClear}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Clear
      </button>
    </div>

    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      <input
        type="text"
        bind:value={domain}
        onkeydown={handleKeydown}
        placeholder="example.com"
        class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
      />
      <button
        onclick={lookupWhois}
        disabled={loading}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {loading ? "Looking up..." : "Lookup WHOIS"}
      </button>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-2">
      <span class="text-xs text-(--color-text-muted) self-center">Try:</span>
      {#each presets as preset}
        <button
          onclick={() => applyPreset(preset.value)}
          class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Results -->
  {#if result}
    {@const expiryStatus = getExpiryStatus(result.expiryDate)}
    <div class="flex-1 flex flex-col gap-4 overflow-auto">
      <!-- Header -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <span class="text-lg font-medium text-(--color-text)">{result.domain}</span>
          {#if expiryStatus}
            <span class="text-xs px-2 py-0.5 rounded {expiryStatus.color} text-white">
              {expiryStatus.label}
            </span>
          {/if}
        </div>
        {#if result.domainAge}
          <div class="text-sm text-(--color-text-muted)">
            Domain age: <span class="text-(--color-text)">{result.domainAge}</span>
          </div>
        {/if}
      </div>

      <!-- Registration Info -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
          Registration Information
        </h2>
        <div class="space-y-3">
          <!-- Registrar -->
          {#if result.registrar}
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Registrar</span>
              <span class="text-sm text-(--color-text)">{result.registrar}</span>
            </div>
          {/if}

          <!-- Dates -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Created</span>
              <span class="font-mono text-sm text-(--color-text)">{formatDate(result.createdDate)}</span>
            </div>
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Updated</span>
              <span class="font-mono text-sm text-(--color-text)">{formatDate(result.updatedDate)}</span>
            </div>
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Expires</span>
              <span class="font-mono text-sm text-(--color-text)">{formatDate(result.expiryDate)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Nameservers -->
      {#if result.nameservers && result.nameservers.length > 0}
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
            Nameservers
          </h2>
          <div class="space-y-2">
            {#each result.nameservers as ns, i}
              <div class="flex items-center justify-between gap-2 p-3 bg-(--color-bg) border border-(--color-border)">
                <span class="font-mono text-sm text-(--color-text)">{ns}</span>
                <button
                  onclick={() => handleCopy(`ns-${i}`, ns)}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                >
                  {copiedField === `ns-${i}` ? "Copied!" : "Copy"}
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Status -->
      {#if result.status && result.status.length > 0}
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
            Domain Status
          </h2>
          <div class="flex flex-wrap gap-2">
            {#each result.status as status}
              <span class="px-2 py-1 text-xs font-mono bg-(--color-bg) border border-(--color-border) {getStatusColor(status)}">
                {status}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Raw WHOIS -->
      {#if result.raw}
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
              Raw WHOIS Response
            </h2>
            <button
              onclick={() => showRaw = !showRaw}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {showRaw ? "Hide" : "Show"}
            </button>
          </div>
          {#if showRaw}
            <div class="relative">
              <button
                onclick={() => handleCopy("raw", result?.raw || "")}
                class="absolute top-2 right-2 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedField === "raw" ? "Copied!" : "Copy"}
              </button>
              <pre class="p-3 bg-(--color-bg) border border-(--color-border) text-xs text-(--color-text) overflow-auto max-h-[400px] whitespace-pre-wrap">{result.raw}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else if !error}
    <div class="flex-1 flex items-center justify-center p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-sm text-(--color-text-muted)">Enter a domain to look up its WHOIS information</span>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About WHOIS:</strong>
    WHOIS is a protocol for querying databases that store registration information about domain names.
    It shows who owns a domain, when it was registered, when it expires, and which nameservers it uses.
    Some registrars offer privacy protection that hides personal information.
  </div>
</div>
