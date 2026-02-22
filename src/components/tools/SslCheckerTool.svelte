<script lang="ts">
  // State
  let domain = $state("");
  let port = $state("443");
  let loading = $state(false);
  let error = $state("");
  let copiedField = $state<string | null>(null);
  let mode = $state<"server" | "browser">("server");

  interface BrowserCheckResult {
    domain: string;
    port: number;
    reachable: boolean;
    responseTimeMs: number;
    httpStatus?: number;
    httpStatusText?: string;
    errorMessage?: string;
    checkedAt: string;
    opaque: boolean;
  }

  let browserResult = $state<BrowserCheckResult | null>(null);

  interface CertificateInfo {
    subject: string;
    commonName: string;
    issuer: string;
    issuerOrg: string;
    notBefore: string;
    notAfter: string;
    serialNumber: string;
    signatureAlgorithm: string;
    publicKeyAlgorithm: string;
    sans: string[];
    dnsNames: string[];
    ipAddresses: string[];
    emailAddresses: string[];
    isCA: boolean;
    version: number;
    pem?: string;
  }

  interface ChainCertificate {
    subject: string;
    issuer: string;
    notBefore: string;
    notAfter: string;
    isCA: boolean;
    pem?: string;
  }

  interface SSLResponse {
    domain: string;
    port: number;
    certificate?: CertificateInfo;
    chain?: ChainCertificate[];
    protocol: string;
    cipherSuite: string;
    valid: boolean;
    daysUntilExpiry: number;
    expired: boolean;
    error?: string;
  }

  let result = $state<SSLResponse | null>(null);

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.1.tools";

  const presets = [
    { label: "Google", value: "google.com" },
    { label: "GitHub", value: "github.com" },
    { label: "Cloudflare", value: "cloudflare.com" },
  ];

  async function checkSSL() {
    if (!domain.trim()) {
      error = "Please enter a domain";
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      error = "Invalid port number (1-65535)";
      return;
    }

    loading = true;
    error = "";
    result = null;

    try {
      const url = `${API_URL}/ssl?domain=${encodeURIComponent(domain.trim())}&port=${portNum}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data: SSLResponse = await response.json();

      if (data.error && !data.certificate) {
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

  async function checkSSLBrowser() {
    if (!domain.trim()) {
      error = "Please enter a domain";
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      error = "Invalid port number (1-65535)";
      return;
    }

    loading = true;
    error = "";
    browserResult = null;

    const targetUrl = portNum === 443
      ? `https://${domain.trim()}`
      : `https://${domain.trim()}:${portNum}`;

    const startTime = performance.now();

    try {
      // Try cors first to get status info; fall back to no-cors
      let response: Response | null = null;
      let opaque = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        response = await fetch(targetUrl, {
          method: "HEAD",
          mode: "cors",
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch {
        // CORS blocked -- retry with no-cors (opaque response)
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          response = await fetch(targetUrl, {
            method: "HEAD",
            mode: "no-cors",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          opaque = true;
        } catch (noCorsErr) {
          const elapsed = Math.round(performance.now() - startTime);
          const msg = noCorsErr instanceof DOMException && noCorsErr.name === "AbortError"
            ? "Request timed out after 15 seconds"
            : "Could not reach the server. The domain may be unreachable, DNS may have failed, or the connection was refused.";
          browserResult = {
            domain: domain.trim(),
            port: portNum,
            reachable: false,
            responseTimeMs: elapsed,
            errorMessage: msg,
            checkedAt: new Date().toISOString(),
            opaque: false,
          };
          return;
        }
      }

      const elapsed = Math.round(performance.now() - startTime);

      browserResult = {
        domain: domain.trim(),
        port: portNum,
        reachable: true,
        responseTimeMs: elapsed,
        httpStatus: opaque ? undefined : response?.status,
        httpStatusText: opaque ? undefined : response?.statusText,
        checkedAt: new Date().toISOString(),
        opaque,
      };
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      browserResult = {
        domain: domain.trim(),
        port: portNum,
        reachable: false,
        responseTimeMs: elapsed,
        errorMessage: err instanceof Error ? err.message : "An unexpected error occurred",
        checkedAt: new Date().toISOString(),
        opaque: false,
      };
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
    port = "443";
    result = null;
    browserResult = null;
    error = "";
  }

  function runCheck() {
    if (mode === "browser") {
      checkSSLBrowser();
    } else {
      checkSSL();
    }
  }

  function applyPreset(value: string) {
    domain = value;
    runCheck();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      runCheck();
    }
  }

  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return dateStr;
    }
  }

  function getExpiryStatus(daysUntilExpiry: number, expired: boolean): { color: string; label: string } {
    if (expired) {
      return { color: "bg-red-500", label: "Expired" };
    }
    if (daysUntilExpiry <= 7) {
      return { color: "bg-red-500", label: "Expiring Soon" };
    }
    if (daysUntilExpiry <= 30) {
      return { color: "bg-yellow-500", label: "Expires Soon" };
    }
    return { color: "bg-green-500", label: "Valid" };
  }

  function extractCN(subject: string): string {
    const match = subject.match(/CN=([^,]+)/);
    return match ? match[1] : subject;
  }

  function downloadPEM(pem: string, filename: string) {
    const blob = new Blob([pem], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadAllCertificates() {
    if (!result?.chain) return;
    
    // Concatenate all PEM certificates
    const allPEMs = result.chain
      .map((cert) => cert.pem || "")
      .filter((pem) => pem)
      .join("\n");
    
    if (allPEMs) {
      const filename = `${result.domain.replace(/[^a-zA-Z0-9.-]/g, "_")}-chain.pem`;
      downloadPEM(allPEMs, filename);
    }
  }

  function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9.-]/g, "_").substring(0, 50);
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Check SSL/TLS certificates, view certificate details, chain, and expiry information.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-4 flex gap-0 border border-(--color-border) w-fit">
    <button
      onclick={() => { mode = "server"; result = null; browserResult = null; error = ""; }}
      class="px-4 py-2 text-sm font-medium transition-colors {mode === 'server' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-bg-alt) text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Server Check
    </button>
    <button
      onclick={() => { mode = "browser"; result = null; browserResult = null; error = ""; }}
      class="px-4 py-2 text-sm font-medium transition-colors {mode === 'browser' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'bg-(--color-bg-alt) text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Browser Check
    </button>
  </div>

  {#if mode === "browser"}
    <div class="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 text-sm text-(--color-text-muted)">
      <strong class="text-amber-400">Browser Mode:</strong> Checks if the domain is reachable over HTTPS directly from your browser. Useful when the backend API cannot reach the target. Certificate details are not available in this mode — see guidance below on how to view them in your browser.
    </div>
  {/if}

  <!-- Input Section -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        Domain to Check
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
      <input
        type="text"
        bind:value={port}
        onkeydown={handleKeydown}
        placeholder="443"
        class="w-20 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none text-center"
      />
      <button
        onclick={runCheck}
        disabled={loading}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {loading ? "Checking..." : "Check SSL"}
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
  {#if mode === "server" && result}
    {@const expiryStatus = getExpiryStatus(result.daysUntilExpiry, result.expired)}
    <div class="flex-1 flex flex-col gap-4 overflow-auto">
      <!-- Status Header -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-4 h-4 rounded-full {result.valid ? 'bg-green-500' : 'bg-red-500'}"></div>
          <span class="text-lg font-medium text-(--color-text)">
            {result.domain}:{result.port}
          </span>
          <span class="text-xs px-2 py-0.5 rounded {expiryStatus.color} text-white">
            {expiryStatus.label}
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span class="text-(--color-text-muted) block text-xs">Protocol</span>
            <span class="font-mono text-(--color-text)">{result.protocol}</span>
          </div>
          <div>
            <span class="text-(--color-text-muted) block text-xs">Days Until Expiry</span>
            <span class="font-mono text-(--color-text) {result.expired ? 'text-red-400' : ''}">{result.daysUntilExpiry}</span>
          </div>
          <div class="col-span-2">
            <span class="text-(--color-text-muted) block text-xs">Cipher Suite</span>
            <span class="font-mono text-(--color-text) text-xs break-all">{result.cipherSuite}</span>
          </div>
        </div>
      </div>

      {#if result.certificate}
        <!-- Certificate Details -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
              Certificate Details
            </h2>
            {#if result.certificate.pem}
              <button
                onclick={() => downloadPEM(result?.certificate?.pem || "", `${sanitizeFilename(result?.certificate?.commonName || result?.domain || "cert")}.pem`)}
                class="flex items-center gap-1 px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                title="Download certificate in PEM format"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PEM
              </button>
            {/if}
          </div>
          <div class="space-y-3">
            <!-- Subject -->
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Subject (Common Name)</span>
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-sm text-(--color-text) break-all">{result.certificate.commonName || extractCN(result.certificate.subject)}</span>
                <button
                  onclick={() => handleCopy("cn", result?.certificate?.commonName || "")}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                >
                  {copiedField === "cn" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <!-- Issuer -->
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Issuer</span>
              <span class="font-mono text-sm text-(--color-text) break-all">{result.certificate.issuerOrg || extractCN(result.certificate.issuer)}</span>
            </div>

            <!-- Validity Period -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-1">Valid From</span>
                <span class="font-mono text-sm text-(--color-text)">{formatDate(result.certificate.notBefore)}</span>
              </div>
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-1">Valid Until</span>
                <span class="font-mono text-sm text-(--color-text) {result.expired ? 'text-red-400' : ''}">{formatDate(result.certificate.notAfter)}</span>
              </div>
            </div>

            <!-- Algorithms -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-1">Signature Algorithm</span>
                <span class="font-mono text-sm text-(--color-text)">{result.certificate.signatureAlgorithm}</span>
              </div>
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-1">Public Key Algorithm</span>
                <span class="font-mono text-sm text-(--color-text)">{result.certificate.publicKeyAlgorithm}</span>
              </div>
            </div>

            <!-- Serial Number -->
            <div class="p-3 bg-(--color-bg) border border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) block mb-1">Serial Number</span>
              <span class="font-mono text-xs text-(--color-text) break-all">{result.certificate.serialNumber}</span>
            </div>

            <!-- SANs -->
            {#if result.certificate.dnsNames && result.certificate.dnsNames.length > 0}
              <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                <span class="text-xs text-(--color-text-muted) block mb-2">Subject Alternative Names (DNS)</span>
                <div class="flex flex-wrap gap-1">
                  {#each result.certificate.dnsNames as san}
                    <span class="px-2 py-0.5 text-xs font-mono bg-(--color-bg-alt) border border-(--color-border) text-(--color-text)">{san}</span>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Certificate Chain -->
        {#if result.chain && result.chain.length > 0}
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
                Certificate Chain ({result.chain.length} certificate{result.chain.length > 1 ? "s" : ""})
              </h2>
              <button
                onclick={downloadAllCertificates}
                class="flex items-center gap-1 px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                title="Download full certificate chain in PEM format"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Chain
              </button>
            </div>
            <div class="space-y-2">
              {#each result.chain as cert, i}
                <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <span class="text-xs px-1.5 py-0.5 bg-(--color-bg-alt) text-(--color-text-muted) rounded shrink-0">{i + 1}</span>
                      <span class="text-sm font-medium text-(--color-text) truncate">{extractCN(cert.subject)}</span>
                      {#if cert.isCA}
                        <span class="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded shrink-0">CA</span>
                      {/if}
                    </div>
                    {#if cert.pem}
                      <button
                        onclick={() => downloadPEM(cert.pem || "", `${sanitizeFilename(extractCN(cert.subject))}.pem`)}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
                        title="Download this certificate"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    {/if}
                  </div>
                  <div class="text-xs text-(--color-text-muted) mt-1 ml-7">
                    Issued by: {extractCN(cert.issuer)}
                  </div>
                </div>
              {/each}
            </div>
            <p class="mt-3 text-xs text-(--color-text-muted)">
              Download PEM files to add to <code class="px-1 py-0.5 bg-(--color-bg) rounded">/etc/ssl/certs/</code> or your trust store.
            </p>
          </div>
        {/if}
      {/if}
    </div>
  {:else if mode === "browser" && browserResult}
    {@const targetUrl = `https://${browserResult.domain}${browserResult.port !== 443 ? `:${browserResult.port}` : ""}`}
    <div class="flex-1 flex flex-col gap-4 overflow-auto">
      <!-- Reachability Status -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-4 h-4 rounded-full {browserResult.reachable ? 'bg-green-500' : 'bg-red-500'}"></div>
          <span class="text-lg font-medium text-(--color-text)">
            {browserResult.domain}{browserResult.port !== 443 ? `:${browserResult.port}` : ""}
          </span>
          <span class="text-xs px-2 py-0.5 rounded {browserResult.reachable ? 'bg-green-500' : 'bg-red-500'} text-white">
            {browserResult.reachable ? "Reachable" : "Unreachable"}
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span class="text-(--color-text-muted) block text-xs">Response Time</span>
            <span class="font-mono text-(--color-text)">{browserResult.responseTimeMs} ms</span>
          </div>
          {#if browserResult.httpStatus}
            <div>
              <span class="text-(--color-text-muted) block text-xs">HTTP Status</span>
              <span class="font-mono text-(--color-text)">{browserResult.httpStatus} {browserResult.httpStatusText || ""}</span>
            </div>
          {/if}
          <div>
            <span class="text-(--color-text-muted) block text-xs">Checked At</span>
            <span class="font-mono text-(--color-text)">{formatDate(browserResult.checkedAt)}</span>
          </div>
          {#if browserResult.opaque}
            <div>
              <span class="text-(--color-text-muted) block text-xs">Response Type</span>
              <span class="font-mono text-(--color-text)">Opaque (CORS)</span>
            </div>
          {/if}
        </div>
      </div>

      {#if browserResult.reachable}
        <!-- Success details + quick actions -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
              TLS Connection Successful
            </h2>
          </div>
          <p class="text-sm text-(--color-text-muted) mb-4">
            Your browser successfully established a secure HTTPS connection to <code class="px-1 py-0.5 bg-(--color-bg) rounded font-mono">{browserResult.domain}</code>. The SSL/TLS certificate is valid and trusted by your browser.
          </p>

          <!-- Quick actions -->
          <div class="flex flex-col sm:flex-row gap-3">
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open in Browser to View Certificate
            </a>
            <button
              onclick={() => handleCopy("cli", `openssl s_client -connect ${browserResult?.domain}:${browserResult?.port} -servername ${browserResult?.domain} < /dev/null 2>/dev/null | openssl x509 -outform PEM`)}
              class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) text-sm hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              {copiedField === "cli" ? "Copied!" : "Copy openssl Command"}
            </button>
          </div>

          {#if browserResult.opaque}
            <p class="text-xs text-(--color-text-muted) mt-3">
              The server did not include CORS headers, so detailed HTTP status information is not available. However, the TLS handshake and TCP connection were successful.
            </p>
          {/if}
        </div>
      {:else}
        <!-- Failure details -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
              Connection Failed
            </h2>
          </div>
          {#if browserResult.errorMessage}
            <p class="text-sm text-(--color-text-muted) mb-3">{browserResult.errorMessage}</p>
          {/if}
          <div class="text-xs text-(--color-text-muted) space-y-1 mb-4">
            <p>Possible reasons:</p>
            <ul class="list-disc list-inside ml-2 space-y-0.5">
              <li>The domain does not exist or DNS resolution failed</li>
              <li>The server is down or not accepting connections on port {browserResult.port}</li>
              <li>The SSL/TLS certificate is invalid, expired, or self-signed</li>
              <li>A firewall or network policy is blocking the connection</li>
              <li>The connection timed out</li>
            </ul>
          </div>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 px-4 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) text-sm hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Try Opening in Browser Anyway
          </a>
        </div>
      {/if}

      <!-- How to Download Certificate -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-2">
          How to Download the Certificate
        </h2>
        <p class="text-xs text-(--color-text-muted) mb-4">
          Browsers do not expose TLS certificate data to JavaScript — this is a security restriction, not a limitation of this tool. Use one of the methods below to view and export the full certificate.
        </p>

        <div class="space-y-3">
          <!-- CLI - most useful, shown first -->
          <div class="p-3 bg-(--color-bg) border border-(--color-border)">
            <h3 class="text-sm font-medium text-(--color-text) mb-2">Terminal (fastest way to download PEM)</h3>
            <div class="p-2 bg-(--color-bg-alt) border border-(--color-border) rounded mb-2">
              <div class="flex items-start justify-between gap-2">
                <code class="text-xs text-(--color-text) break-all font-mono leading-relaxed">openssl s_client -connect {browserResult.domain}:{browserResult.port} -servername {browserResult.domain} &lt; /dev/null 2&gt;/dev/null | openssl x509 -outform PEM &gt; {browserResult.domain}.pem</code>
                <button
                  onclick={() => handleCopy("cli-full", `openssl s_client -connect ${browserResult?.domain}:${browserResult?.port} -servername ${browserResult?.domain} < /dev/null 2>/dev/null | openssl x509 -outform PEM > ${browserResult?.domain}.pem`)}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0 mt-0.5"
                >
                  {copiedField === "cli-full" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <p class="text-xs text-(--color-text-muted)">Downloads the leaf certificate. Add <code class="px-1 py-0.5 bg-(--color-bg-alt) rounded">-showcerts</code> to get the full chain.</p>
          </div>

          <!-- Chrome -->
          <div class="p-3 bg-(--color-bg) border border-(--color-border)">
            <h3 class="text-sm font-medium text-(--color-text) mb-2">Chrome / Edge</h3>
            <ol class="text-xs text-(--color-text-muted) list-decimal list-inside space-y-1 ml-1">
              <li>Open <a href={targetUrl} target="_blank" rel="noopener noreferrer" class="text-(--color-accent) hover:underline">{targetUrl}</a> in a new tab</li>
              <li>Click the <strong>padlock icon</strong> (or "Not secure") in the address bar</li>
              <li>Click <strong>"Connection is secure"</strong> then <strong>"Certificate is valid"</strong></li>
              <li>Go to <strong>"Details"</strong> tab and click <strong>"Export"</strong> to save the PEM file</li>
            </ol>
          </div>

          <!-- Firefox -->
          <div class="p-3 bg-(--color-bg) border border-(--color-border)">
            <h3 class="text-sm font-medium text-(--color-text) mb-2">Firefox</h3>
            <ol class="text-xs text-(--color-text-muted) list-decimal list-inside space-y-1 ml-1">
              <li>Open <a href={targetUrl} target="_blank" rel="noopener noreferrer" class="text-(--color-accent) hover:underline">{targetUrl}</a> in a new tab</li>
              <li>Click the <strong>padlock icon</strong> and then <strong>"Connection secure" &gt; "More information"</strong></li>
              <li>Click <strong>"View Certificate"</strong> — opens a dedicated certificate viewer tab</li>
              <li>Scroll to <strong>"Miscellaneous"</strong> to find <strong>"Download"</strong> links for PEM (leaf, intermediate, root)</li>
            </ol>
          </div>

          <!-- Safari -->
          <div class="p-3 bg-(--color-bg) border border-(--color-border)">
            <h3 class="text-sm font-medium text-(--color-text) mb-2">Safari</h3>
            <ol class="text-xs text-(--color-text-muted) list-decimal list-inside space-y-1 ml-1">
              <li>Open <a href={targetUrl} target="_blank" rel="noopener noreferrer" class="text-(--color-accent) hover:underline">{targetUrl}</a> in a new tab</li>
              <li>Click the <strong>padlock icon</strong> and then <strong>"Show Certificate"</strong></li>
              <li>Expand <strong>"Details"</strong> to view all certificate fields</li>
              <li>Drag the certificate icon to your desktop to export it</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  {:else if !error}
    <div class="flex-1 flex items-center justify-center p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-sm text-(--color-text-muted)">
        {mode === "browser"
          ? "Enter a domain to check its reachability from your browser"
          : "Enter a domain to check its SSL/TLS certificate"}
      </span>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About SSL/TLS Certificates:</strong>
    SSL/TLS certificates secure communication between browsers and servers.
    <strong>Server Check</strong> uses a backend API to retrieve full certificate details including chain, validity, and PEM downloads.
    <strong>Browser Check</strong> tests reachability directly from your browser — useful when the backend cannot reach the target (e.g., internal or restricted domains).
  </div>
</div>
