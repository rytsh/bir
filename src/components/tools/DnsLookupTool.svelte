<script lang="ts">
  // State
  let activeTab = $state<"forward" | "reverse">("forward");
  let domain = $state("");
  let ip = $state("");
  let loading = $state(false);
  let error = $state("");
  let copiedField = $state<string | null>(null);

  interface MXRecord {
    host: string;
    priority: number;
  }

  interface DNSRecords {
    A?: string[];
    AAAA?: string[];
    MX?: MXRecord[];
    TXT?: string[];
    CNAME?: string[];
    NS?: string[];
  }

  interface DNSResponse {
    domain?: string;
    ip?: string;
    records?: DNSRecords;
    reverse?: string[];
    error?: string;
    errors?: Record<string, string>;
  }

  let result = $state<DNSResponse | null>(null);

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.1.tools";

  const recordTypes = [
    { key: "A", label: "A (IPv4)", description: "IPv4 addresses" },
    { key: "AAAA", label: "AAAA (IPv6)", description: "IPv6 addresses" },
    { key: "MX", label: "MX (Mail)", description: "Mail exchange servers" },
    { key: "TXT", label: "TXT", description: "Text records (SPF, DKIM, etc.)" },
    { key: "CNAME", label: "CNAME", description: "Canonical name aliases" },
    { key: "NS", label: "NS", description: "Nameservers" },
  ];

  const presets = [
    { label: "Google", value: "google.com" },
    { label: "GitHub", value: "github.com" },
    { label: "Cloudflare", value: "cloudflare.com" },
  ];

  const reversePresets = [
    { label: "Google DNS", value: "8.8.8.8" },
    { label: "Cloudflare DNS", value: "1.1.1.1" },
    { label: "Quad9", value: "9.9.9.9" },
  ];

  async function lookupDNS() {
    if (activeTab === "forward") {
      if (!domain.trim()) {
        error = "Please enter a domain";
        return;
      }
    } else {
      if (!ip.trim()) {
        error = "Please enter an IP address";
        return;
      }
    }

    loading = true;
    error = "";
    result = null;

    try {
      const url = activeTab === "forward"
        ? `${API_URL}/dns?domain=${encodeURIComponent(domain.trim())}`
        : `${API_URL}/dns?ip=${encodeURIComponent(ip.trim())}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data: DNSResponse = await response.json();

      if (data.error && !data.records && !data.reverse) {
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
    ip = "";
    result = null;
    error = "";
  }

  function applyPreset(value: string) {
    if (activeTab === "forward") {
      domain = value;
    } else {
      ip = value;
    }
    lookupDNS();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      lookupDNS();
    }
  }

  function switchTab(tab: "forward" | "reverse") {
    activeTab = tab;
    result = null;
    error = "";
  }

  function getRecordCount(records: DNSRecords | undefined, key: string): number {
    if (!records) return 0;
    const value = records[key as keyof DNSRecords];
    if (Array.isArray(value)) return value.length;
    return 0;
  }

  function formatMXRecord(mx: MXRecord): string {
    return `${mx.host} (priority: ${mx.priority})`;
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Look up DNS records for a domain or perform reverse DNS lookups for IP addresses.
    </p>
  </header>

  <!-- Tabs -->
  <div class="flex gap-0 mb-4 border-b border-(--color-border)">
    <button
      onclick={() => switchTab("forward")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'forward'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Forward Lookup
    </button>
    <button
      onclick={() => switchTab("reverse")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'reverse'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Reverse Lookup (PTR)
    </button>
  </div>

  <!-- Input Section -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        {activeTab === "forward" ? "Domain to Lookup" : "IP Address to Lookup"}
      </h2>
      <button
        onclick={handleClear}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Clear
      </button>
    </div>

    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      {#if activeTab === "forward"}
        <input
          type="text"
          bind:value={domain}
          onkeydown={handleKeydown}
          placeholder="example.com"
          class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
        />
      {:else}
        <input
          type="text"
          bind:value={ip}
          onkeydown={handleKeydown}
          placeholder="8.8.8.8"
          class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
        />
      {/if}
      <button
        onclick={lookupDNS}
        disabled={loading}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {loading ? "Looking up..." : "Lookup"}
      </button>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-2">
      <span class="text-xs text-(--color-text-muted) self-center">Try:</span>
      {#each (activeTab === "forward" ? presets : reversePresets) as preset}
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
    <div class="flex-1 flex flex-col gap-4 overflow-auto">
      <!-- Header -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <span class="text-lg font-medium text-(--color-text)">
            {activeTab === "forward" ? result.domain : result.ip}
          </span>
        </div>
      </div>

      {#if activeTab === "forward" && result.records}
        <!-- DNS Records -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
            DNS Records
          </h2>
          <div class="space-y-3">
            {#each recordTypes as recordType}
              {@const records = result.records?.[recordType.key as keyof DNSRecords]}
              {@const count = getRecordCount(result.records, recordType.key)}
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-(--color-text)">{recordType.label}</span>
                    {#if count > 0}
                      <span class="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">{count}</span>
                    {:else}
                      <span class="text-xs px-1.5 py-0.5 bg-(--color-bg-alt) text-(--color-text-muted) rounded">0</span>
                    {/if}
                  </div>
                  <span class="text-xs text-(--color-text-muted)">{recordType.description}</span>
                </div>
                {#if records && Array.isArray(records) && records.length > 0}
                  <div class="space-y-1">
                    {#each records as record, i}
                      {@const displayValue = recordType.key === "MX" ? formatMXRecord(record as MXRecord) : (record as string)}
                      <div class="flex items-center justify-between gap-2 py-1">
                        <span class="font-mono text-sm text-(--color-text) break-all">{displayValue}</span>
                        <button
                          onclick={() => handleCopy(`${recordType.key}-${i}`, recordType.key === "MX" ? (record as MXRecord).host : (record as string))}
                          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                        >
                          {copiedField === `${recordType.key}-${i}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <span class="font-mono text-sm text-(--color-text-muted) italic">No records found</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- Lookup Errors -->
        {#if result.errors && Object.keys(result.errors).length > 0}
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
              Lookup Errors
            </h2>
            <div class="space-y-1">
              {#each Object.entries(result.errors) as [type, errorMsg]}
                <div class="text-xs text-(--color-text-muted)">
                  <span class="font-medium">{type}:</span> {errorMsg}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else if activeTab === "reverse"}
        <!-- Reverse DNS Results -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
            PTR Records (Hostnames)
          </h2>
          {#if result.reverse && result.reverse.length > 0}
            <div class="space-y-2">
              {#each result.reverse as hostname, i}
                <div class="flex items-center justify-between gap-2 p-3 bg-(--color-bg) border border-(--color-border)">
                  <span class="font-mono text-sm text-(--color-text) break-all">{hostname}</span>
                  <button
                    onclick={() => handleCopy(`ptr-${i}`, hostname)}
                    class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                  >
                    {copiedField === `ptr-${i}` ? "Copied!" : "Copy"}
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="font-mono text-sm text-(--color-text-muted) italic">No PTR records found for this IP</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else if !error}
    <div class="flex-1 flex items-center justify-center p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-sm text-(--color-text-muted)">
        {activeTab === "forward"
          ? "Enter a domain to look up its DNS records"
          : "Enter an IP address to find its hostname"}
      </span>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About DNS Lookup:</strong>
    DNS (Domain Name System) translates domain names to IP addresses. This tool queries DNS servers
    for various record types including A (IPv4), AAAA (IPv6), MX (mail servers), TXT (text records),
    CNAME (aliases), and NS (nameservers). Reverse DNS (PTR) maps IP addresses back to hostnames.
  </div>
</div>
