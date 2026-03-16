<script lang="ts">
  interface StatusCode {
    code: number;
    phrase: string;
    description: string;
    category: string;
  }

  const statusCodes: StatusCode[] = [
    // 1xx Informational
    { code: 100, phrase: "Continue", description: "The server has received the request headers and the client should proceed to send the request body", category: "1xx Informational" },
    { code: 101, phrase: "Switching Protocols", description: "The server is switching protocols as requested by the client via the Upgrade header", category: "1xx Informational" },
    { code: 102, phrase: "Processing", description: "The server has received and is processing the request, but no response is available yet (WebDAV)", category: "1xx Informational" },
    { code: 103, phrase: "Early Hints", description: "Used to return some response headers before the final HTTP message, allowing preloading of resources", category: "1xx Informational" },

    // 2xx Success
    { code: 200, phrase: "OK", description: "The request has succeeded. The meaning depends on the HTTP method used", category: "2xx Success" },
    { code: 201, phrase: "Created", description: "The request has been fulfilled and a new resource has been created", category: "2xx Success" },
    { code: 202, phrase: "Accepted", description: "The request has been accepted for processing, but processing has not been completed", category: "2xx Success" },
    { code: 203, phrase: "Non-Authoritative Information", description: "The returned metadata is from a local or third-party copy, not the origin server", category: "2xx Success" },
    { code: 204, phrase: "No Content", description: "The server successfully processed the request but is not returning any content", category: "2xx Success" },
    { code: 205, phrase: "Reset Content", description: "The server successfully processed the request and asks the client to reset the document view", category: "2xx Success" },
    { code: 206, phrase: "Partial Content", description: "The server is delivering only part of the resource due to a range header sent by the client", category: "2xx Success" },
    { code: 207, phrase: "Multi-Status", description: "A Multi-Status response conveys information about multiple resources (WebDAV)", category: "2xx Success" },
    { code: 208, phrase: "Already Reported", description: "Members of a DAV binding have already been enumerated and are not included again (WebDAV)", category: "2xx Success" },
    { code: 226, phrase: "IM Used", description: "The server has fulfilled a GET request and the response is a representation of one or more instance-manipulations applied to the current instance", category: "2xx Success" },

    // 3xx Redirection
    { code: 300, phrase: "Multiple Choices", description: "The request has more than one possible response and the user or user agent should choose one", category: "3xx Redirection" },
    { code: 301, phrase: "Moved Permanently", description: "The URL of the requested resource has been changed permanently. The new URL is given in the response", category: "3xx Redirection" },
    { code: 302, phrase: "Found", description: "The URI of the requested resource has been changed temporarily. The client should use the same method for future requests", category: "3xx Redirection" },
    { code: 303, phrase: "See Other", description: "The response can be found under a different URI and should be retrieved using a GET method", category: "3xx Redirection" },
    { code: 304, phrase: "Not Modified", description: "The resource has not been modified since the version specified by the request headers (If-Modified-Since or If-None-Match)", category: "3xx Redirection" },
    { code: 305, phrase: "Use Proxy", description: "The requested resource must be accessed through the proxy given by the Location field (deprecated)", category: "3xx Redirection" },
    { code: 307, phrase: "Temporary Redirect", description: "The request should be repeated with another URI but future requests should still use the original URI. Method and body are not changed", category: "3xx Redirection" },
    { code: 308, phrase: "Permanent Redirect", description: "The request and all future requests should be repeated using another URI. Method and body are not changed", category: "3xx Redirection" },

    // 4xx Client Error
    { code: 400, phrase: "Bad Request", description: "The server cannot process the request due to something perceived as a client error (e.g., malformed syntax)", category: "4xx Client Error" },
    { code: 401, phrase: "Unauthorized", description: "The request requires user authentication. The response must include a WWW-Authenticate header", category: "4xx Client Error" },
    { code: 402, phrase: "Payment Required", description: "Reserved for future use. Originally intended for digital payment schemes", category: "4xx Client Error" },
    { code: 403, phrase: "Forbidden", description: "The server understood the request but refuses to authorize it. Authentication will not help", category: "4xx Client Error" },
    { code: 404, phrase: "Not Found", description: "The server cannot find the requested resource. The URL is not recognized", category: "4xx Client Error" },
    { code: 405, phrase: "Method Not Allowed", description: "The request method is known by the server but is not supported by the target resource", category: "4xx Client Error" },
    { code: 406, phrase: "Not Acceptable", description: "The server cannot produce a response matching the list of acceptable values defined in the request headers", category: "4xx Client Error" },
    { code: 407, phrase: "Proxy Authentication Required", description: "The client must first authenticate itself with the proxy", category: "4xx Client Error" },
    { code: 408, phrase: "Request Timeout", description: "The server timed out waiting for the request. The client may repeat the request without modifications", category: "4xx Client Error" },
    { code: 409, phrase: "Conflict", description: "The request could not be processed because of conflict in the current state of the resource", category: "4xx Client Error" },
    { code: 410, phrase: "Gone", description: "The resource requested is no longer available and will not be available again. Unlike 404, this is permanent", category: "4xx Client Error" },
    { code: 411, phrase: "Length Required", description: "The request did not specify the length of its content, which is required by the requested resource", category: "4xx Client Error" },
    { code: 412, phrase: "Precondition Failed", description: "The server does not meet one of the preconditions specified in the request headers", category: "4xx Client Error" },
    { code: 413, phrase: "Content Too Large", description: "The request entity is larger than limits defined by the server", category: "4xx Client Error" },
    { code: 414, phrase: "URI Too Long", description: "The URI provided was too long for the server to process", category: "4xx Client Error" },
    { code: 415, phrase: "Unsupported Media Type", description: "The media format of the requested data is not supported by the server", category: "4xx Client Error" },
    { code: 416, phrase: "Range Not Satisfiable", description: "The range specified by the Range header cannot be fulfilled", category: "4xx Client Error" },
    { code: 417, phrase: "Expectation Failed", description: "The expectation indicated by the Expect request header cannot be met by the server", category: "4xx Client Error" },
    { code: 418, phrase: "I'm a Teapot", description: "The server refuses to brew coffee because it is, permanently, a teapot (RFC 2324, April Fools)", category: "4xx Client Error" },
    { code: 421, phrase: "Misdirected Request", description: "The request was directed at a server that is not able to produce a response", category: "4xx Client Error" },
    { code: 422, phrase: "Unprocessable Content", description: "The request was well-formed but could not be followed due to semantic errors (WebDAV)", category: "4xx Client Error" },
    { code: 423, phrase: "Locked", description: "The resource that is being accessed is locked (WebDAV)", category: "4xx Client Error" },
    { code: 424, phrase: "Failed Dependency", description: "The request failed because it depended on another request that failed (WebDAV)", category: "4xx Client Error" },
    { code: 425, phrase: "Too Early", description: "The server is unwilling to process a request that might be replayed (TLS early data)", category: "4xx Client Error" },
    { code: 426, phrase: "Upgrade Required", description: "The server refuses to perform the request using the current protocol but might after the client upgrades", category: "4xx Client Error" },
    { code: 428, phrase: "Precondition Required", description: "The origin server requires the request to be conditional to prevent lost updates", category: "4xx Client Error" },
    { code: 429, phrase: "Too Many Requests", description: "The user has sent too many requests in a given amount of time (rate limiting)", category: "4xx Client Error" },
    { code: 431, phrase: "Request Header Fields Too Large", description: "The server is unwilling to process the request because its header fields are too large", category: "4xx Client Error" },
    { code: 451, phrase: "Unavailable For Legal Reasons", description: "The user agent requested a resource that cannot legally be provided (censorship, court order)", category: "4xx Client Error" },

    // 5xx Server Error
    { code: 500, phrase: "Internal Server Error", description: "The server has encountered a situation it doesn't know how to handle", category: "5xx Server Error" },
    { code: 501, phrase: "Not Implemented", description: "The request method is not supported by the server and cannot be handled", category: "5xx Server Error" },
    { code: 502, phrase: "Bad Gateway", description: "The server received an invalid response from the upstream server while acting as a gateway or proxy", category: "5xx Server Error" },
    { code: 503, phrase: "Service Unavailable", description: "The server is not ready to handle the request, often due to maintenance or overloading", category: "5xx Server Error" },
    { code: 504, phrase: "Gateway Timeout", description: "The server is acting as a gateway and did not get a response from the upstream server in time", category: "5xx Server Error" },
    { code: 505, phrase: "HTTP Version Not Supported", description: "The HTTP version used in the request is not supported by the server", category: "5xx Server Error" },
    { code: 506, phrase: "Variant Also Negotiates", description: "The server has an internal configuration error: transparent content negotiation results in a circular reference", category: "5xx Server Error" },
    { code: 507, phrase: "Insufficient Storage", description: "The server is unable to store the representation needed to complete the request (WebDAV)", category: "5xx Server Error" },
    { code: 508, phrase: "Loop Detected", description: "The server detected an infinite loop while processing the request (WebDAV)", category: "5xx Server Error" },
    { code: 510, phrase: "Not Extended", description: "Further extensions to the request are required for the server to fulfill it", category: "5xx Server Error" },
    { code: 511, phrase: "Network Authentication Required", description: "The client needs to authenticate to gain network access (e.g., captive portal)", category: "5xx Server Error" },
  ];

  const allCategories = [...new Set(statusCodes.map((s) => s.category))];

  let searchQuery = $state("");
  let selectedCategory = $state("All");
  let copiedCode = $state<number | null>(null);

  const filteredCodes = $derived.by(() => {
    return statusCodes.filter((s) => {
      const matchesSearch =
        searchQuery === "" ||
        s.code.toString().includes(searchQuery) ||
        s.phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === "All" || s.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  });

  const groupedCodes = $derived.by(() => {
    const groups: Record<string, StatusCode[]> = {};
    for (const code of filteredCodes) {
      if (!groups[code.category]) {
        groups[code.category] = [];
      }
      groups[code.category].push(code);
    }
    return groups;
  });

  function copyCode(code: number) {
    navigator.clipboard.writeText(code.toString());
    copiedCode = code;
    setTimeout(() => {
      copiedCode = null;
    }, 1500);
  }

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      "1xx Informational": "bg-blue-500/20 text-blue-400 border-blue-500/30",
      "2xx Success": "bg-green-500/20 text-green-400 border-green-500/30",
      "3xx Redirection": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      "4xx Client Error": "bg-orange-500/20 text-orange-400 border-orange-500/30",
      "5xx Server Error": "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return colors[category] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }

  function getCategoryBadgeColor(category: string): string {
    const colors: Record<string, string> = {
      "1xx Informational": "bg-blue-500/10 text-blue-500",
      "2xx Success": "bg-green-500/10 text-green-500",
      "3xx Redirection": "bg-yellow-500/10 text-yellow-500",
      "4xx Client Error": "bg-orange-500/10 text-orange-500",
      "5xx Server Error": "bg-red-500/10 text-red-500",
    };
    return colors[category] || "bg-gray-500/10 text-gray-500";
  }

  function getCodeColor(code: number): string {
    if (code < 200) return "text-blue-500";
    if (code < 300) return "text-green-500";
    if (code < 400) return "text-yellow-500";
    if (code < 500) return "text-orange-500";
    return "text-red-500";
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Complete reference of HTTP status codes with descriptions. Click a status code to copy.
    </p>
  </header>

  <!-- Filters -->
  <div class="flex flex-wrap gap-3 mb-4 pb-4 border-b border-(--color-border)">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search code, phrase, or description..."
      class="flex-1 min-w-48 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted) outline-none focus:border-(--color-text-light)"
    />

    <select
      bind:value={selectedCategory}
      class="px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
    >
      <option value="All">All Categories</option>
      {#each allCategories as category}
        <option value={category}>{category}</option>
      {/each}
    </select>

    <span class="flex items-center text-sm text-(--color-text-muted)">
      {filteredCodes.length} codes
    </span>
  </div>

  <!-- Status Codes -->
  <div class="flex-1 overflow-auto space-y-6">
    {#each Object.entries(groupedCodes) as [category, codes]}
      <div>
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-medium px-2 py-1 {getCategoryBadgeColor(category)}">
            {category}
          </span>
          <span class="text-xs text-(--color-text-muted)">
            {codes.length} {codes.length === 1 ? "code" : "codes"}
          </span>
        </div>

        <div class="grid gap-2">
          {#each codes as status (status.code)}
            <div class="flex items-start gap-3 px-3 py-2.5 bg-(--color-bg-alt) border border-(--color-border) hover:border-(--color-text-light) transition-colors">
              <button
                onclick={() => copyCode(status.code)}
                class="font-mono font-bold text-base shrink-0 w-12 text-left {getCodeColor(status.code)} hover:opacity-70 transition-opacity"
                title="Click to copy"
              >
                {copiedCode === status.code ? "OK" : status.code}
              </button>
              <div class="min-w-0">
                <span class="font-medium text-sm text-(--color-text)">
                  {status.phrase}
                </span>
                <p class="text-xs text-(--color-text-muted) mt-0.5 leading-relaxed">
                  {status.description}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    {#if filteredCodes.length === 0}
      <div class="text-center py-8 text-(--color-text-muted)">
        No status codes found matching your criteria.
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="mt-4 pt-4 border-t border-(--color-border)">
    <div class="flex flex-wrap gap-4 text-xs text-(--color-text-muted)">
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-blue-500 font-bold">1xx</span>
        <span>Informational</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-green-500 font-bold">2xx</span>
        <span>Success</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-yellow-500 font-bold">3xx</span>
        <span>Redirection</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-orange-500 font-bold">4xx</span>
        <span>Client Error</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-red-500 font-bold">5xx</span>
        <span>Server Error</span>
      </div>
    </div>
  </div>
</div>
