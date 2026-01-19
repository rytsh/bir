<script lang="ts">
  // State
  let ip = $state<string | null>(null);
  let loading = $state(false);
  let error = $state("");
  let copiedField = $state<string | null>(null);

  // API URL from environment variable, defaults to api.1.tools
  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.1.tools";

  // Fetch IP address
  const fetchIp = async () => {
    loading = true;
    error = "";
    ip = null;

    try {
      const response = await fetch(`${API_URL}/ip`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.ip) {
        ip = data.ip;
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
          error =
            "Unable to connect to server. Please check if the API is running.";
        } else {
          error = err.message;
        }
      } else {
        error = "An unexpected error occurred";
      }
    } finally {
      loading = false;
    }
  };

  // Fetch on mount
  $effect(() => {
    fetchIp();
  });

  // Copy handler
  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  };

  // Determine IP type
  const getIpType = (
    ipAddress: string,
  ): { type: string; description: string } | null => {
    if (!ipAddress || ipAddress === "unknown") return null;

    // Check if IPv6
    if (ipAddress.includes(":")) {
      if (ipAddress === "::1") {
        return { type: "Loopback", description: "IPv6 loopback address" };
      }
      if (ipAddress.startsWith("fe80:")) {
        return { type: "Link-Local", description: "IPv6 link-local address" };
      }
      if (ipAddress.startsWith("fc") || ipAddress.startsWith("fd")) {
        return {
          type: "Private",
          description: "IPv6 unique local address (ULA)",
        };
      }
      return { type: "Public", description: "IPv6 global unicast address" };
    }

    // IPv4 analysis
    const parts = ipAddress.split(".").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return null;

    const [a, b] = parts;

    if (a === 127) {
      return {
        type: "Loopback",
        description: "Local loopback address (127.0.0.0/8)",
      };
    }
    if (a === 10) {
      return { type: "Private", description: "Private Class A (10.0.0.0/8)" };
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return {
        type: "Private",
        description: "Private Class B (172.16.0.0/12)",
      };
    }
    if (a === 192 && b === 168) {
      return {
        type: "Private",
        description: "Private Class C (192.168.0.0/16)",
      };
    }
    if (a === 169 && b === 254) {
      return {
        type: "Link-Local",
        description: "APIPA address (169.254.0.0/16)",
      };
    }

    return { type: "Public", description: "Public IP address" };
  };

  // Derived IP info
  let ipInfo = $derived(ip ? getIpType(ip) : null);
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Display your public IP address as seen by external servers.
    </p>
  </header>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col gap-2">
    <!-- IP Display Card -->
    <div class="py-2 px-4 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex justify-between items-center mb-2">
        <h2
          class="text-sm tracking-wider text-(--color-text-light) font-medium"
        >
          Your IP Address
        </h2>
        <button
          onclick={fetchIp}
          disabled={loading}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {#if loading}
        <div class="flex items-center justify-center py-8">
          <div class="flex items-center gap-3">
            <div
              class="w-5 h-5 border-2 border-(--color-primary) border-t-transparent rounded-full animate-spin"
            ></div>
            <span class="text-(--color-text-muted)">Fetching IP address...</span
            >
          </div>
        </div>
      {:else if error}
        <div
          class="p-4 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
        >
          <div class="flex items-start gap-2">
            <span class="shrink-0">Error:</span>
            <span>{error}</span>
          </div>
          <button
            onclick={fetchIp}
            class="mt-3 px-3 py-1 text-xs bg-(--color-bg) border border-(--color-border) hover:border-(--color-text-light) transition-colors"
          >
            Try Again
          </button>
        </div>
      {:else if ip}
        <div class="space-y-2">
          <!-- IP Address Display -->
          <div
            class="flex items-center justify-between gap-2 py-4 px-2 bg-(--color-bg) border border-(--color-border)"
          >
            <div class="flex-1 min-w-0">
              <span
                class="text-2xl sm:text-3xl font-mono text-(--color-text) break-all"
                >{ip}</span
              >
            </div>
            <button
              onclick={() => handleCopy("ip", ip || "")}
              class="text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
            >
              {copiedField === "ip" ? "Copied!" : "Copy"}
            </button>
          </div>

          <!-- IP Type Info -->
          {#if ipInfo}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div class="p-2 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-1"
                  >Type</span
                >
                <span class="text-sm font-medium text-(--color-text)"
                  >{ipInfo.type}</span
                >
              </div>
              <div class="p-2 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-1"
                  >Classification</span
                >
                <span class="text-sm text-(--color-text)"
                  >{ipInfo.description}</span
                >
              </div>
            </div>
          {/if}

          <!-- IP Version -->
          <div class="p-2 bg-(--color-bg) border border-(--color-border)">
            <span class="text-xs text-(--color-text-muted) block mb-1"
              >Version</span
            >
            <span class="text-sm font-mono text-(--color-text)">
              {ip.includes(":") ? "IPv6" : "IPv4"}
            </span>
          </div>
        </div>
      {:else}
        <div class="flex items-center justify-center py-8">
          <span class="text-(--color-text-muted)">No IP address available</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Info Section -->
  <div>
    <!-- API Configuration Info -->
    <div class="p-2 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex items-center justify-between">
        <span class="text-xs text-(--color-text-muted)">API Endpoint</span>
        <button
          onclick={() => handleCopy("api", `${API_URL}/ip`)}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copiedField === "api" ? "Copied!" : "Copy"}
        </button>
      </div>
      <span class="text-sm font-mono text-(--color-text)">{API_URL}/ip</span>
    </div>
    <div
      class="mt-2 p-2 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)"
    >
      <strong class="text-(--color-text)">About Your IP:</strong>
      Your public IP address is how external servers identify your connection on
      the internet. This is the address visible to websites and services you connect
      to. If you're behind a NAT router or VPN, this shows the external-facing address,
      not your local network IP.
    </div>
  </div>
</div>
