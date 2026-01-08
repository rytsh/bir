<script lang="ts">
  let url = $state("");
  let isLoading = $state(false);
  let error = $state("");
  let result = $state<{
    url: string;
    corsEnabled: boolean;
    headers: Record<string, string>;
    allowOrigin: string | null;
    allowMethods: string | null;
    allowHeaders: string | null;
    allowCredentials: string | null;
    exposeHeaders: string | null;
    maxAge: string | null;
    statusCode: number;
    statusText: string;
  } | null>(null);
  let copied = $state<string | null>(null);

  const corsHeaders = [
    { key: "access-control-allow-origin", label: "Allow-Origin", description: "Origins allowed to access the resource" },
    { key: "access-control-allow-methods", label: "Allow-Methods", description: "HTTP methods allowed for CORS requests" },
    { key: "access-control-allow-headers", label: "Allow-Headers", description: "Request headers allowed in CORS requests" },
    { key: "access-control-allow-credentials", label: "Allow-Credentials", description: "Whether credentials can be included" },
    { key: "access-control-expose-headers", label: "Expose-Headers", description: "Headers exposed to the browser" },
    { key: "access-control-max-age", label: "Max-Age", description: "Preflight cache duration in seconds" },
  ];

  const presets = [
    { label: "JSONPlaceholder", url: "https://jsonplaceholder.typicode.com/posts/1" },
    { label: "httpbin", url: "https://httpbin.org/get" },
    { label: "GitHub API", url: "https://api.github.com" },
  ];

  function normalizeUrl(input: string): string {
    let normalized = input.trim();
    if (!normalized) return "";
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = "https://" + normalized;
    }
    return normalized;
  }

  async function checkCors() {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      error = "Please enter a URL";
      return;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      error = "Invalid URL format";
      return;
    }

    isLoading = true;
    error = "";
    result = null;

    try {
      // Perform a fetch request to check CORS
      // We use no-cors mode first to see if the request succeeds
      // Then we try cors mode to get the actual CORS headers
      const response = await fetch(normalizedUrl, {
        method: "GET",
        mode: "cors",
      });

      // Extract all headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      result = {
        url: normalizedUrl,
        corsEnabled: true,
        headers,
        allowOrigin: headers["access-control-allow-origin"] || null,
        allowMethods: headers["access-control-allow-methods"] || null,
        allowHeaders: headers["access-control-allow-headers"] || null,
        allowCredentials: headers["access-control-allow-credentials"] || null,
        exposeHeaders: headers["access-control-expose-headers"] || null,
        maxAge: headers["access-control-max-age"] || null,
        statusCode: response.status,
        statusText: response.statusText,
      };
    } catch (err) {
      // If fetch fails with cors mode, CORS is likely not enabled
      result = {
        url: normalizedUrl,
        corsEnabled: false,
        headers: {},
        allowOrigin: null,
        allowMethods: null,
        allowHeaders: null,
        allowCredentials: null,
        exposeHeaders: null,
        maxAge: null,
        statusCode: 0,
        statusText: "CORS Error",
      };
      error = "CORS request blocked. The server does not allow cross-origin requests from this origin, or the URL is unreachable.";
    } finally {
      isLoading = false;
    }
  }

  function applyPreset(preset: { url: string }) {
    url = preset.url;
    checkCors();
  }

  function handleClear() {
    url = "";
    result = null;
    error = "";
  }

  function handleCopy(key: string, value: string) {
    navigator.clipboard.writeText(value);
    copied = key;
    setTimeout(() => {
      copied = null;
    }, 2000);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      checkCors();
    }
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Check if a URL has CORS (Cross-Origin Resource Sharing) enabled and view its CORS headers.
    </p>
  </header>

  <!-- Input Section -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        URL to Check
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
        bind:value={url}
        onkeydown={handleKeydown}
        placeholder="https://api.example.com/endpoint"
        class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
      />
      <button
        onclick={checkCors}
        disabled={isLoading}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {isLoading ? "Checking..." : "Check CORS"}
      </button>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-2">
      <span class="text-xs text-(--color-text-muted) self-center">Try:</span>
      {#each presets as preset}
        <button
          onclick={() => applyPreset(preset)}
          class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {error}
    </div>
  {/if}

  <!-- Results -->
  {#if result}
    <div class="flex-1 flex flex-col gap-4">
      <!-- Status -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center gap-3 mb-3">
          <div
            class="w-4 h-4 rounded-full {result.corsEnabled ? 'bg-green-500' : 'bg-red-500'}"
          ></div>
          <span class="text-lg font-medium text-(--color-text)">
            {result.corsEnabled ? "CORS Enabled" : "CORS Blocked"}
          </span>
        </div>
        <div class="text-sm text-(--color-text-muted)">
          <span class="font-mono">{result.url}</span>
        </div>
        {#if result.statusCode > 0}
          <div class="mt-2 text-sm">
            <span class="text-(--color-text-muted)">Status: </span>
            <span class="font-mono text-(--color-text)">{result.statusCode} {result.statusText}</span>
          </div>
        {/if}
      </div>

      <!-- CORS Headers -->
      {#if result.corsEnabled}
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
            CORS Headers
          </h2>
          <div class="space-y-3">
            {#each corsHeaders as header}
              {@const value = result.headers[header.key]}
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <div class="flex justify-between items-start gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm font-medium text-(--color-text)">{header.label}</span>
                      {#if value}
                        <span class="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Present</span>
                      {:else}
                        <span class="text-xs px-1.5 py-0.5 bg-(--color-bg-alt) text-(--color-text-muted) rounded">Not set</span>
                      {/if}
                    </div>
                    <div class="text-xs text-(--color-text-muted) mb-1">{header.description}</div>
                    {#if value}
                      <div class="font-mono text-sm text-(--color-text) break-all">{value}</div>
                    {:else}
                      <div class="font-mono text-sm text-(--color-text-muted) italic">-</div>
                    {/if}
                  </div>
                  {#if value}
                    <button
                      onclick={() => handleCopy(header.key, value)}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                    >
                      {copied === header.key ? "Copied!" : "Copy"}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- All Response Headers -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
            All Response Headers
          </h2>
          <div class="p-3 bg-(--color-bg) border border-(--color-border) font-mono text-xs overflow-auto max-h-[200px]">
            {#each Object.entries(result.headers) as [key, value]}
              <div class="py-1">
                <span class="text-(--color-primary)">{key}:</span>
                <span class="text-(--color-text) ml-2">{value}</span>
              </div>
            {/each}
            {#if Object.keys(result.headers).length === 0}
              <span class="text-(--color-text-muted) italic">No headers available</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else if !error}
    <div class="flex-1 flex items-center justify-center p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-sm text-(--color-text-muted)">Enter a URL to check its CORS configuration</span>
    </div>
  {/if}

  <!-- Info Section -->
  <div
    class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)"
  >
    <strong class="text-(--color-text)">About CORS:</strong>
    Cross-Origin Resource Sharing (CORS) is a security mechanism that allows servers to specify which origins
    can access their resources. The <code class="text-(--color-primary)">Access-Control-Allow-Origin</code> header
    determines which domains can make cross-origin requests.
  </div>
</div>
