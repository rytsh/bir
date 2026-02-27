<script lang="ts">
  type Flow =
    | "authorization-code"
    | "authorization-code-pkce"
    | "implicit"
    | "client-credentials"
    | "device-code"
    | "password";

  interface FlowTab {
    id: Flow;
    label: string;
    deprecated?: boolean;
  }

  interface FlowStep {
    from: string;
    to: string;
    label: string;
    description: string;
  }

  interface LiveResult {
    success: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
    error?: string;
    curl?: string;
  }

  interface CallbackResult {
    type: "code" | "token" | "error";
    params: Record<string, string>;
    flow: Flow;
  }

  const STORAGE_KEY = "oauth2-tool-state";

  const flows: FlowTab[] = [
    { id: "authorization-code", label: "Authorization Code" },
    { id: "authorization-code-pkce", label: "Auth Code + PKCE" },
    { id: "implicit", label: "Implicit", deprecated: true },
    { id: "client-credentials", label: "Client Credentials" },
    { id: "device-code", label: "Device Code" },
    { id: "password", label: "Password Grant", deprecated: true },
  ];

  const flowSteps: Record<Flow, FlowStep[]> = {
    "authorization-code": [
      { from: "Client", to: "Auth Server", label: "1. Authorization Request", description: "Redirect user to authorization endpoint with client_id, redirect_uri, scope, state, and response_type=code" },
      { from: "Auth Server", to: "User", label: "2. Login & Consent", description: "Authorization server presents login page and consent screen to the user" },
      { from: "User", to: "Auth Server", label: "3. Grant Access", description: "User authenticates and grants the requested permissions" },
      { from: "Auth Server", to: "Client", label: "4. Authorization Code", description: "Auth server redirects back to redirect_uri with authorization code and state parameter" },
      { from: "Client", to: "Auth Server", label: "5. Token Exchange", description: "Client exchanges authorization code for tokens by sending code, client_id, client_secret, and redirect_uri to token endpoint" },
      { from: "Auth Server", to: "Client", label: "6. Access Token", description: "Auth server validates code and returns access_token, refresh_token, token_type, and expires_in" },
    ],
    "authorization-code-pkce": [
      { from: "Client", to: "Client", label: "1. Generate PKCE", description: "Client generates a random code_verifier and computes code_challenge = BASE64URL(SHA256(code_verifier))" },
      { from: "Client", to: "Auth Server", label: "2. Authorization Request", description: "Redirect user with client_id, redirect_uri, scope, state, response_type=code, code_challenge, and code_challenge_method=S256" },
      { from: "Auth Server", to: "User", label: "3. Login & Consent", description: "Authorization server presents login page and consent screen" },
      { from: "User", to: "Auth Server", label: "4. Grant Access", description: "User authenticates and grants permissions" },
      { from: "Auth Server", to: "Client", label: "5. Authorization Code", description: "Auth server redirects back with authorization code and state" },
      { from: "Client", to: "Auth Server", label: "6. Token Exchange + Verifier", description: "Client sends code and code_verifier (instead of client_secret) to token endpoint" },
      { from: "Auth Server", to: "Client", label: "7. Access Token", description: "Auth server verifies SHA256(code_verifier) matches the original code_challenge, then returns tokens" },
    ],
    implicit: [
      { from: "Client", to: "Auth Server", label: "1. Authorization Request", description: "Redirect user with client_id, redirect_uri, scope, state, and response_type=token" },
      { from: "Auth Server", to: "User", label: "2. Login & Consent", description: "Authorization server presents login page and consent screen" },
      { from: "User", to: "Auth Server", label: "3. Grant Access", description: "User authenticates and grants permissions" },
      { from: "Auth Server", to: "Client", label: "4. Access Token in Fragment", description: "Auth server redirects back with access_token in URL fragment (#access_token=...&token_type=...&expires_in=...)" },
    ],
    "client-credentials": [
      { from: "Client", to: "Auth Server", label: "1. Token Request", description: "Client sends client_id and client_secret (via Basic auth header or body) with grant_type=client_credentials and scope to the token endpoint" },
      { from: "Auth Server", to: "Client", label: "2. Access Token", description: "Auth server validates credentials and returns access_token, token_type, and expires_in (no refresh token)" },
    ],
    "device-code": [
      { from: "Client", to: "Auth Server", label: "1. Device Authorization", description: "Client sends client_id and scope to device authorization endpoint" },
      { from: "Auth Server", to: "Client", label: "2. Device & User Codes", description: "Auth server returns device_code, user_code, verification_uri, and polling interval" },
      { from: "Client", to: "User", label: "3. Display Code", description: "Client displays user_code and verification_uri to the user" },
      { from: "User", to: "Auth Server", label: "4. User Authorizes", description: "User opens verification_uri in a browser and enters the user_code to authorize" },
      { from: "Client", to: "Auth Server", label: "5. Poll for Token", description: "Client polls token endpoint with device_code and grant_type=urn:ietf:params:oauth:grant-type:device_code" },
      { from: "Auth Server", to: "Client", label: "6. Access Token", description: "Once user authorizes, auth server returns access_token, refresh_token, token_type, and expires_in" },
    ],
    password: [
      { from: "User", to: "Client", label: "1. Provide Credentials", description: "User provides their username and password directly to the client application" },
      { from: "Client", to: "Auth Server", label: "2. Token Request", description: "Client sends username, password, client_id, client_secret, scope, and grant_type=password to the token endpoint" },
      { from: "Auth Server", to: "Client", label: "3. Access Token", description: "Auth server validates credentials and returns access_token, refresh_token, token_type, and expires_in" },
    ],
  };

  let activeFlow = $state<Flow>("authorization-code");

  // Shared inputs
  let authUrl = $state("https://auth.example.com/authorize");
  let tokenUrl = $state("https://auth.example.com/token");
  let deviceAuthUrl = $state("https://auth.example.com/device/authorize");
  let clientId = $state("my-client-id");
  let clientSecret = $state("my-client-secret");
  let redirectUri = $state("");
  let scope = $state("openid profile email");
  let stateParam = $state("");

  // PKCE
  let codeVerifier = $state("");
  let codeChallenge = $state("");

  // Password Grant (ROPC)
  let username = $state("");
  let password = $state("");

  // Copy feedback
  let copiedKey = $state("");

  // Live testing state
  let isLoading = $state(false);
  let liveResult = $state<LiveResult | null>(null);
  let callbackResult = $state<CallbackResult | null>(null);

  // Device code polling
  let isPolling = $state(false);
  let pollingTimerId = $state<ReturnType<typeof setInterval> | null>(null);
  let deviceCodeValue = $state("");
  let pollingIntervalSec = $state(5);

  // --- Utility functions ---

  function generateRandomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = "";
    for (const byte of bytes) {
      str += String.fromCharCode(byte);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function generateState() {
    stateParam = generateRandomHex(16);
  }

  async function generatePkce() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    codeVerifier = base64UrlEncode(arr.buffer);
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
    codeChallenge = base64UrlEncode(digest);
  }

  function handleFlowSwitch(flow: Flow) {
    activeFlow = flow;
    copiedKey = "";
    liveResult = null;
    if (pollingTimerId) {
      clearInterval(pollingTimerId);
      pollingTimerId = null;
      isPolling = false;
    }
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      setTimeout(() => {
        if (copiedKey === key) copiedKey = "";
      }, 2000);
    } catch {
      // Clipboard API not available
    }
  }

  function prettyJson(str: string): string {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }

  // --- URL builders ---

  function buildAuthCodeUrl(): string {
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", clientId);
    params.set("redirect_uri", redirectUri);
    if (scope) params.set("scope", scope);
    if (stateParam) params.set("state", stateParam);
    return `${authUrl}?${params.toString()}`;
  }

  function buildAuthCodePkceUrl(): string {
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", clientId);
    params.set("redirect_uri", redirectUri);
    if (scope) params.set("scope", scope);
    if (stateParam) params.set("state", stateParam);
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `${authUrl}?${params.toString()}`;
  }

  function buildImplicitUrl(): string {
    const params = new URLSearchParams();
    params.set("response_type", "token");
    params.set("client_id", clientId);
    params.set("redirect_uri", redirectUri);
    if (scope) params.set("scope", scope);
    if (stateParam) params.set("state", stateParam);
    return `${authUrl}?${params.toString()}`;
  }

  function buildCallbackExample(withCode: boolean): string {
    if (withCode) {
      const params = new URLSearchParams();
      params.set("code", "SplxlOBeZQQYbYS6WxSbIA");
      if (stateParam) params.set("state", stateParam);
      return `${redirectUri}?${params.toString()}`;
    }
    const parts = [
      "access_token=ya29.a0AfH6SMBx...example",
      "token_type=Bearer",
      "expires_in=3600",
    ];
    if (stateParam) parts.push(`state=${stateParam}`);
    return `${redirectUri}#${parts.join("&")}`;
  }

  function buildTokenRequestBody(flow: Flow, code?: string): string {
    if (flow === "authorization-code") {
      const params = new URLSearchParams();
      params.set("grant_type", "authorization_code");
      params.set("code", code || "SplxlOBeZQQYbYS6WxSbIA");
      params.set("redirect_uri", redirectUri);
      params.set("client_id", clientId);
      params.set("client_secret", clientSecret);
      return params.toString();
    }
    if (flow === "authorization-code-pkce") {
      const params = new URLSearchParams();
      params.set("grant_type", "authorization_code");
      params.set("code", code || "SplxlOBeZQQYbYS6WxSbIA");
      params.set("redirect_uri", redirectUri);
      params.set("client_id", clientId);
      if (codeVerifier) params.set("code_verifier", codeVerifier);
      return params.toString();
    }
    if (flow === "client-credentials") {
      const params = new URLSearchParams();
      params.set("grant_type", "client_credentials");
      if (scope) params.set("scope", scope);
      return params.toString();
    }
    if (flow === "device-code") {
      const params = new URLSearchParams();
      params.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
      params.set("device_code", deviceCodeValue || "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNh...");
      params.set("client_id", clientId);
      return params.toString();
    }
    if (flow === "password") {
      const params = new URLSearchParams();
      params.set("grant_type", "password");
      params.set("username", username || "user@example.com");
      params.set("password", password || "********");
      params.set("client_id", clientId);
      if (clientSecret) params.set("client_secret", clientSecret);
      if (scope) params.set("scope", scope);
      return params.toString();
    }
    return "";
  }

  function buildDeviceAuthBody(): string {
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    if (scope) params.set("scope", scope);
    return params.toString();
  }

  function buildBasicAuthHeader(): string {
    return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  }

  function buildCurlCommand(url: string, body: string, useBasicAuth: boolean): string {
    let cmd = `curl -X POST '${url}' \\\n  -H 'Content-Type: application/x-www-form-urlencoded'`;
    if (useBasicAuth) {
      cmd += ` \\\n  -H 'Authorization: ${buildBasicAuthHeader()}'`;
    }
    cmd += ` \\\n  -d '${body}'`;
    return cmd;
  }

  // --- Example responses ---

  const tokenResponseExample = `{
  "access_token": "ya29.a0AfH6SMBx...example",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "1//0gdBpR...example",
  "scope": "openid profile email"
}`;

  const tokenResponseNoRefresh = `{
  "access_token": "ya29.a0AfH6SMBx...example",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email"
}`;

  const deviceAuthResponseExample = `{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNh...",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://auth.example.com/device",
  "verification_uri_complete": "https://auth.example.com/device?user_code=WDJB-MJHT",
  "expires_in": 1800,
  "interval": 5
}`;

  // --- Session storage for redirect flows ---

  function saveFlowState() {
    const state = {
      flow: activeFlow,
      authUrl,
      tokenUrl,
      clientId,
      clientSecret,
      redirectUri,
      scope,
      stateParam,
      codeVerifier,
      codeChallenge,
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage not available
    }
  }

  function restoreFlowState(): boolean {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      activeFlow = state.flow;
      authUrl = state.authUrl || authUrl;
      tokenUrl = state.tokenUrl || tokenUrl;
      clientId = state.clientId || clientId;
      clientSecret = state.clientSecret || clientSecret;
      redirectUri = state.redirectUri || redirectUri;
      scope = state.scope || scope;
      stateParam = state.stateParam || stateParam;
      codeVerifier = state.codeVerifier || codeVerifier;
      codeChallenge = state.codeChallenge || codeChallenge;
      sessionStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  // --- Live test actions ---

  async function performFetch(url: string, body: string, useBasicAuth: boolean): Promise<LiveResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (useBasicAuth) {
      headers["Authorization"] = buildBasicAuthHeader();
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
      });

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      const text = await response.text();

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
        body: text,
        curl: buildCurlCommand(url, body, useBasicAuth),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isCors = message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("CORS");
      return {
        success: false,
        error: isCors
          ? `Request blocked by browser CORS policy. The token endpoint at "${url}" does not include Access-Control-Allow-Origin headers for this origin (${window.location.origin}).\n\nUse the curl command below to test from the terminal instead.`
          : `Network error: ${message}`,
        curl: buildCurlCommand(url, body, useBasicAuth),
      };
    }
  }

  // Auth Code / PKCE: redirect to auth server
  function startAuthRedirect() {
    saveFlowState();
    const url = activeFlow === "authorization-code-pkce" ? buildAuthCodePkceUrl() : buildAuthCodeUrl();
    window.location.href = url;
  }

  // Implicit: redirect to auth server
  function startImplicitRedirect() {
    saveFlowState();
    window.location.href = buildImplicitUrl();
  }

  // Auth Code / PKCE: exchange code for token
  async function exchangeCode(code: string) {
    isLoading = true;
    liveResult = null;
    const body = buildTokenRequestBody(activeFlow, code);
    const useBasicAuth = activeFlow === "authorization-code";
    liveResult = await performFetch(tokenUrl, body, useBasicAuth);
    isLoading = false;
  }

  // Client Credentials: send token request
  async function testClientCredentials() {
    isLoading = true;
    liveResult = null;
    const body = buildTokenRequestBody("client-credentials");
    liveResult = await performFetch(tokenUrl, body, true);
    isLoading = false;
  }

  // Password Grant: send token request
  async function testPasswordGrant() {
    isLoading = true;
    liveResult = null;
    const body = buildTokenRequestBody("password");
    const useBasicAuth = !!clientSecret;
    liveResult = await performFetch(tokenUrl, body, useBasicAuth);
    isLoading = false;
  }

  // Device Code: request device code
  async function requestDeviceCode() {
    isLoading = true;
    liveResult = null;
    const body = buildDeviceAuthBody();
    const result = await performFetch(deviceAuthUrl, body, false);
    liveResult = result;
    isLoading = false;

    // Try to parse device_code and interval from response
    if (result.success && result.body) {
      try {
        const parsed = JSON.parse(result.body);
        if (parsed.device_code) deviceCodeValue = parsed.device_code;
        if (parsed.interval) pollingIntervalSec = parsed.interval;
      } catch {
        // response not JSON
      }
    }
  }

  // Device Code: start polling
  function startPolling() {
    if (!deviceCodeValue || !tokenUrl) return;
    isPolling = true;
    liveResult = null;

    const poll = async () => {
      const body = buildTokenRequestBody("device-code");
      const result = await performFetch(tokenUrl, body, false);

      // Check if still pending (authorization_pending error)
      if (result.body) {
        try {
          const parsed = JSON.parse(result.body);
          if (parsed.error === "authorization_pending" || parsed.error === "slow_down") {
            // Keep polling
            if (parsed.error === "slow_down") {
              pollingIntervalSec += 5;
            }
            return;
          }
        } catch {
          // not JSON, treat as final response
        }
      }

      // Got a final response (success or non-pending error)
      stopPolling();
      liveResult = result;
    };

    pollingTimerId = setInterval(poll, pollingIntervalSec * 1000);
    // Also fire immediately
    poll();
  }

  function stopPolling() {
    if (pollingTimerId) {
      clearInterval(pollingTimerId);
      pollingTimerId = null;
    }
    isPolling = false;
  }

  function clearResult() {
    liveResult = null;
    callbackResult = null;
  }

  // --- Initialization & callback detection ---

  function detectCallback() {
    const url = new URL(window.location.href);
    const search = url.searchParams;
    const hash = url.hash;

    // Check for authorization code callback: ?code=...
    if (search.has("code")) {
      const restored = restoreFlowState();
      const code = search.get("code")!;
      const returnedState = search.get("state") || "";
      const params: Record<string, string> = { code };
      if (returnedState) params.state = returnedState;

      callbackResult = {
        type: "code",
        params,
        flow: restored ? activeFlow : "authorization-code",
      };

      // Clean up URL
      window.history.replaceState({}, "", url.pathname);
      return;
    }

    // Check for error callback: ?error=...
    if (search.has("error")) {
      restoreFlowState();
      const params: Record<string, string> = {};
      for (const [key, value] of search.entries()) {
        params[key] = value;
      }

      callbackResult = {
        type: "error",
        params,
        flow: activeFlow,
      };

      window.history.replaceState({}, "", url.pathname);
      return;
    }

    // Check for implicit callback: #access_token=...
    if (hash && hash.includes("access_token=")) {
      restoreFlowState();
      const fragment = new URLSearchParams(hash.substring(1));
      const params: Record<string, string> = {};
      for (const [key, value] of fragment.entries()) {
        params[key] = value;
      }

      callbackResult = {
        type: "token",
        params,
        flow: "implicit",
      };
      activeFlow = "implicit";

      window.history.replaceState({}, "", url.pathname);
      return;
    }
  }

  // Run on mount
  $effect(() => {
    // Set redirect URI to current page URL
    if (!redirectUri) {
      redirectUri = window.location.origin + window.location.pathname;
    }

    // Detect callback from redirect flows
    detectCallback();

    // Generate initial state and PKCE if not restored from callback
    if (!stateParam) generateState();
    if (!codeVerifier) generatePkce();
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Explore and test OAuth 2.0 flows. Build authorization URLs, generate PKCE challenges, and test real flows against your auth server — all in the browser.
    </p>
  </header>

  <!-- Flow Tabs -->
  <div class="mb-4 flex border-b border-(--color-border) overflow-x-auto">
    {#each flows as flow}
      <button
        onclick={() => handleFlowSwitch(flow.id)}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors
          {activeFlow === flow.id
            ? 'text-(--color-text) border-b-2 border-(--color-accent)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        {flow.label}
        {#if flow.deprecated}
          <span class="ml-1 text-[10px] px-1.5 py-0.5 bg-(--color-error-bg) text-(--color-error-text) border border-(--color-error-border) font-medium align-top">deprecated</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Deprecated warnings -->
  {#if activeFlow === "implicit"}
    <div class="mb-4 p-3 border border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text) text-sm">
      The Implicit flow is deprecated by the OAuth 2.0 Security Best Current Practice (RFC 9700).
      Use Authorization Code with PKCE instead. This is included for educational purposes only.
    </div>
  {/if}
  {#if activeFlow === "password"}
    <div class="mb-4 p-3 border border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text) text-sm">
      The Resource Owner Password Credentials grant is deprecated (RFC 9700). It exposes user credentials directly to the client.
      Use Authorization Code with PKCE instead. This is included for testing and legacy system support.
    </div>
  {/if}

  <div class="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- Left: Flow Diagram -->
    <div class="flex flex-col gap-3">
      <h2 class="text-xs tracking-wider text-(--color-text-light) font-medium uppercase">Flow Steps</h2>
      <div class="flex flex-col gap-2">
        {#each flowSteps[activeFlow] as step, i}
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-(--color-accent) text-(--color-btn-text) shrink-0">
                {i + 1}
              </span>
              <div class="flex items-center gap-1.5 text-xs font-medium text-(--color-text)">
                <span class="px-1.5 py-0.5 bg-(--color-bg) border border-(--color-border)">{step.from}</span>
                <span class="text-(--color-text-muted)">&rarr;</span>
                <span class="px-1.5 py-0.5 bg-(--color-bg) border border-(--color-border)">{step.to}</span>
              </div>
            </div>
            <p class="text-xs font-medium text-(--color-text) mb-0.5">{step.label}</p>
            <p class="text-xs text-(--color-text-muted) leading-relaxed">{step.description}</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- Right: Request Builder + Test -->
    <div class="flex flex-col gap-3">
      <h2 class="text-xs tracking-wider text-(--color-text-light) font-medium uppercase">Request Builder</h2>

      <!-- Common Inputs -->
      <div class="border border-(--color-border) bg-(--color-bg-alt) p-3 flex flex-col gap-2.5">
        {#if activeFlow !== "client-credentials" && activeFlow !== "password"}
          <div>
            <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="auth-url">Authorization URL</label>
            <input
              id="auth-url"
              type="text"
              bind:value={authUrl}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        {/if}

        {#if activeFlow === "device-code"}
          <div>
            <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="device-auth-url">Device Authorization URL</label>
            <input
              id="device-auth-url"
              type="text"
              bind:value={deviceAuthUrl}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        {/if}

        {#if activeFlow !== "implicit"}
          <div>
            <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="token-url">Token URL</label>
            <input
              id="token-url"
              type="text"
              bind:value={tokenUrl}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        {/if}

        <div>
          <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="client-id">Client ID</label>
          <input
            id="client-id"
            type="text"
            bind:value={clientId}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
          />
        </div>

        {#if activeFlow === "authorization-code" || activeFlow === "client-credentials" || activeFlow === "password"}
          <div>
            <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="client-secret">Client Secret</label>
            <input
              id="client-secret"
              type="text"
              bind:value={clientSecret}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        {/if}

        {#if activeFlow !== "client-credentials" && activeFlow !== "device-code" && activeFlow !== "password"}
          <div>
            <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="redirect-uri">Redirect URI</label>
            <input
              id="redirect-uri"
              type="text"
              bind:value={redirectUri}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        {/if}

        <div>
          <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="scope">Scope</label>
          <input
            id="scope"
            type="text"
            bind:value={scope}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
          />
        </div>

        {#if activeFlow !== "client-credentials" && activeFlow !== "device-code" && activeFlow !== "password"}
          <div>
            <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="state">State</label>
            <div class="flex gap-2">
              <input
                id="state"
                type="text"
                bind:value={stateParam}
                class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
              />
              <button
                onclick={generateState}
                class="px-3 py-2 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) whitespace-nowrap"
              >
                Random
              </button>
            </div>
          </div>
        {/if}

        <!-- PKCE fields -->
        {#if activeFlow === "authorization-code-pkce"}
          <div class="border-t border-(--color-border) pt-2.5 mt-1">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs tracking-wider text-(--color-text-light) font-medium uppercase">PKCE Parameters</span>
              <button
                onclick={generatePkce}
                class="px-3 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)"
              >
                Regenerate
              </button>
            </div>
            <div class="flex flex-col gap-2">
              <div>
                <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="code-verifier">Code Verifier</label>
                <div class="flex gap-2">
                  <input
                    id="code-verifier"
                    type="text"
                    bind:value={codeVerifier}
                    readonly
                    class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
                  />
                  <button
                    onclick={() => copyToClipboard(codeVerifier, "verifier")}
                    class="px-3 py-2 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) whitespace-nowrap"
                  >
                    {copiedKey === "verifier" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="code-challenge">Code Challenge (S256)</label>
                <div class="flex gap-2">
                  <input
                    id="code-challenge"
                    type="text"
                    bind:value={codeChallenge}
                    readonly
                    class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
                  />
                  <button
                    onclick={() => copyToClipboard(codeChallenge, "challenge")}
                    class="px-3 py-2 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) whitespace-nowrap"
                  >
                    {copiedKey === "challenge" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Password Grant fields -->
        {#if activeFlow === "password"}
          <div class="border-t border-(--color-border) pt-2.5 mt-1">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium uppercase block mb-2">User Credentials</span>
            <div class="flex flex-col gap-2">
              <div>
                <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="ropc-username">Username</label>
                <input
                  id="ropc-username"
                  type="text"
                  bind:value={username}
                  placeholder="user@example.com"
                  class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <div>
                <label class="block text-xs text-(--color-text-light) font-medium mb-1" for="ropc-password">Password</label>
                <input
                  id="ropc-password"
                  type="password"
                  bind:value={password}
                  placeholder="password"
                  class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
                />
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Generated Output -->
      <h2 class="text-xs tracking-wider text-(--color-text-light) font-medium uppercase mt-1">Generated Requests & Responses</h2>

      <!-- Authorization Code flow output -->
      {#if activeFlow === "authorization-code"}
        <div class="flex flex-col gap-3">
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Authorization URL</span>
              <button onclick={() => copyToClipboard(buildAuthCodeUrl(), "auth-url-out")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "auth-url-out" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildAuthCodeUrl()}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Callback</span>
              <button onclick={() => copyToClipboard(buildCallbackExample(true), "callback-out")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "callback-out" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildCallbackExample(true)}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Token Request Body</span>
              <button onclick={() => copyToClipboard(buildTokenRequestBody("authorization-code"), "token-body")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "token-body" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildTokenRequestBody("authorization-code")}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Token Response</span>
              <button onclick={() => copyToClipboard(tokenResponseExample, "token-resp")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "token-resp" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{tokenResponseExample}</pre>
          </div>
        </div>
      {/if}

      <!-- Auth Code + PKCE flow output -->
      {#if activeFlow === "authorization-code-pkce"}
        <div class="flex flex-col gap-3">
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Authorization URL (with PKCE)</span>
              <button onclick={() => copyToClipboard(buildAuthCodePkceUrl(), "pkce-url-out")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "pkce-url-out" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildAuthCodePkceUrl()}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Callback</span>
              <button onclick={() => copyToClipboard(buildCallbackExample(true), "pkce-callback")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "pkce-callback" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildCallbackExample(true)}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Token Request Body</span>
              <button onclick={() => copyToClipboard(buildTokenRequestBody("authorization-code-pkce"), "pkce-token-body")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "pkce-token-body" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildTokenRequestBody("authorization-code-pkce")}</pre>
            <p class="mt-1.5 text-[10px] text-(--color-text-muted)">Note: No client_secret needed. The code_verifier proves possession of the original code_challenge.</p>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Token Response</span>
              <button onclick={() => copyToClipboard(tokenResponseExample, "pkce-token-resp")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "pkce-token-resp" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{tokenResponseExample}</pre>
          </div>
        </div>
      {/if}

      <!-- Implicit flow output -->
      {#if activeFlow === "implicit"}
        <div class="flex flex-col gap-3">
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Authorization URL</span>
              <button onclick={() => copyToClipboard(buildImplicitUrl(), "implicit-url-out")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "implicit-url-out" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildImplicitUrl()}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Callback (token in URL fragment)</span>
              <button onclick={() => copyToClipboard(buildCallbackExample(false), "implicit-callback")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "implicit-callback" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildCallbackExample(false)}</pre>
            <p class="mt-1.5 text-[10px] text-(--color-error-text)">Warning: The access token is exposed in the URL fragment. This is visible in browser history and referrer headers.</p>
          </div>
        </div>
      {/if}

      <!-- Client Credentials flow output -->
      {#if activeFlow === "client-credentials"}
        <div class="flex flex-col gap-3">
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Authorization Header</span>
              <button onclick={() => copyToClipboard(buildBasicAuthHeader(), "cc-auth-header")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "cc-auth-header" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildBasicAuthHeader()}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Token Request Body (POST to {tokenUrl})</span>
              <button onclick={() => copyToClipboard(buildTokenRequestBody("client-credentials"), "cc-token-body")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "cc-token-body" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildTokenRequestBody("client-credentials")}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Token Response (no refresh token)</span>
              <button onclick={() => copyToClipboard(tokenResponseNoRefresh, "cc-token-resp")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "cc-token-resp" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{tokenResponseNoRefresh}</pre>
          </div>
        </div>
      {/if}

      <!-- Device Code flow output -->
      {#if activeFlow === "device-code"}
        <div class="flex flex-col gap-3">
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Device Auth Request (POST to {deviceAuthUrl})</span>
              <button onclick={() => copyToClipboard(buildDeviceAuthBody(), "device-auth-body")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "device-auth-body" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildDeviceAuthBody()}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Device Auth Response</span>
              <button onclick={() => copyToClipboard(deviceAuthResponseExample, "device-auth-resp")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "device-auth-resp" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{deviceAuthResponseExample}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Polling Token Request (POST to {tokenUrl})</span>
              <button onclick={() => copyToClipboard(buildTokenRequestBody("device-code"), "device-poll-body")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "device-poll-body" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildTokenRequestBody("device-code")}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Token Response</span>
              <button onclick={() => copyToClipboard(tokenResponseExample, "device-token-resp")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "device-token-resp" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{tokenResponseExample}</pre>
          </div>
        </div>
      {/if}

      <!-- Password Grant flow output -->
      {#if activeFlow === "password"}
        <div class="flex flex-col gap-3">
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Token Request Body (POST to {tokenUrl})</span>
              <button onclick={() => copyToClipboard(buildTokenRequestBody("password"), "pw-token-body")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "pw-token-body" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{buildTokenRequestBody("password")}</pre>
          </div>
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-(--color-text)">Example Token Response</span>
              <button onclick={() => copyToClipboard(tokenResponseExample, "pw-token-resp")} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
                {copiedKey === "pw-token-resp" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre class="text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{tokenResponseExample}</pre>
          </div>
        </div>
      {/if}

      <!-- ============================================ -->
      <!-- TEST SECTION -->
      <!-- ============================================ -->
      <h2 class="text-xs tracking-wider text-(--color-text-light) font-medium uppercase mt-2">Test Flow</h2>

      <!-- Callback result (from redirect flows) -->
      {#if callbackResult}
        <div class="border-2 {callbackResult.type === 'error' ? 'border-(--color-error-border) bg-(--color-error-bg)' : 'border-green-500/30 bg-green-50 dark:bg-green-950/20'} p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium {callbackResult.type === 'error' ? 'text-(--color-error-text)' : 'text-green-700 dark:text-green-400'}">
              {#if callbackResult.type === "code"}
                Authorization Code Received
              {:else if callbackResult.type === "token"}
                Access Token Received (Implicit)
              {:else}
                Authorization Error
              {/if}
            </span>
            <button onclick={clearResult} class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)">
              Clear
            </button>
          </div>
          <pre class="text-xs font-mono whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto {callbackResult.type === 'error' ? 'text-(--color-error-text)' : 'text-(--color-text-muted)'}">{JSON.stringify(callbackResult.params, null, 2)}</pre>

          <!-- Exchange code button for auth code flows -->
          {#if callbackResult.type === "code" && (callbackResult.flow === "authorization-code" || callbackResult.flow === "authorization-code-pkce")}
            <button
              onclick={() => exchangeCode(callbackResult!.params.code)}
              disabled={isLoading}
              class="mt-2 px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-50"
            >
              {isLoading ? "Exchanging..." : "Exchange Code for Token"}
            </button>
          {/if}
        </div>
      {/if}

      <!-- Test action buttons -->
      <div class="flex flex-wrap gap-2">
        {#if activeFlow === "authorization-code" || activeFlow === "authorization-code-pkce"}
          <button
            onclick={startAuthRedirect}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)"
          >
            Start Auth Flow (Redirect)
          </button>
        {/if}

        {#if activeFlow === "implicit"}
          <button
            onclick={startImplicitRedirect}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)"
          >
            Start Implicit Flow (Redirect)
          </button>
        {/if}

        {#if activeFlow === "client-credentials"}
          <button
            onclick={testClientCredentials}
            disabled={isLoading}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Send Token Request"}
          </button>
        {/if}

        {#if activeFlow === "password"}
          <button
            onclick={testPasswordGrant}
            disabled={isLoading || !username || !password}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Send Token Request"}
          </button>
        {/if}

        {#if activeFlow === "device-code"}
          <button
            onclick={requestDeviceCode}
            disabled={isLoading}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-50"
          >
            {isLoading ? "Requesting..." : "Request Device Code"}
          </button>
          {#if deviceCodeValue}
            {#if isPolling}
              <button
                onclick={stopPolling}
                class="px-4 py-2 text-sm font-medium border border-(--color-error-border) text-(--color-error-text) hover:bg-(--color-error-bg)"
              >
                Stop Polling
              </button>
            {:else}
              <button
                onclick={startPolling}
                class="px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)"
              >
                Start Polling for Token
              </button>
            {/if}
          {/if}
        {/if}

        {#if liveResult || callbackResult}
          <button
            onclick={clearResult}
            class="px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt)"
          >
            Clear Results
          </button>
        {/if}
      </div>

      <!-- Polling indicator -->
      {#if isPolling}
        <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted) flex items-center gap-2">
          <span class="inline-block w-2 h-2 bg-(--color-accent) rounded-full animate-pulse"></span>
          Polling token endpoint every {pollingIntervalSec}s... Waiting for user to authorize.
        </div>
      {/if}

      <!-- Live Result -->
      {#if liveResult}
        <div class="border-2 {liveResult.success ? 'border-green-500/30 bg-green-50 dark:bg-green-950/20' : 'border-(--color-error-border) bg-(--color-error-bg)'} p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium {liveResult.success ? 'text-green-700 dark:text-green-400' : 'text-(--color-error-text)'}">
              {#if liveResult.error}
                Request Failed
              {:else}
                HTTP {liveResult.status} {liveResult.statusText}
              {/if}
            </span>
            <button
              onclick={() => copyToClipboard(liveResult?.body || liveResult?.error || "", "live-result")}
              class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)"
            >
              {copiedKey === "live-result" ? "Copied" : "Copy"}
            </button>
          </div>

          {#if liveResult.error}
            <pre class="text-xs font-mono text-(--color-error-text) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{liveResult.error}</pre>
          {/if}

          {#if liveResult.headers && Object.keys(liveResult.headers).length > 0}
            <div>
              <span class="text-[10px] font-medium text-(--color-text-light) uppercase tracking-wider">Response Headers</span>
              <pre class="mt-1 text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{Object.entries(liveResult.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
            </div>
          {/if}

          {#if liveResult.body}
            <div>
              <span class="text-[10px] font-medium text-(--color-text-light) uppercase tracking-wider">Response Body</span>
              <pre class="mt-1 text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{prettyJson(liveResult.body)}</pre>
            </div>
          {/if}

          {#if liveResult.curl}
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-medium text-(--color-text-light) uppercase tracking-wider">curl Command</span>
                <button
                  onclick={() => copyToClipboard(liveResult?.curl || "", "curl-cmd")}
                  class="px-2 py-0.5 text-[10px] font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg)"
                >
                  {copiedKey === "curl-cmd" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre class="mt-1 text-xs font-mono text-(--color-text-muted) whitespace-pre-wrap break-all bg-(--color-bg) p-2 border border-(--color-border) overflow-x-auto">{liveResult.curl}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
