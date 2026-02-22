<script lang="ts">
  // Input state
  let ipInput = $state("");
  let cidrInput = $state("24");
  let error = $state("");

  // Results
  let results = $state<{
    networkAddress: string;
    broadcastAddress: string;
    firstHost: string;
    lastHost: string;
    subnetMask: string;
    wildcardMask: string;
    totalHosts: number;
    usableHosts: number;
    ipClass: string;
    ipType: string;
    binaryNetmask: string;
    cidr: number;
  } | null>(null);

  // Copy state
  let copiedField = $state<string | null>(null);

  // Parse IP address to array of octets
  const parseIp = (ip: string): number[] | null => {
    const parts = ip.trim().split(".");
    if (parts.length !== 4) return null;

    const octets: number[] = [];
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255 || part !== String(num)) {
        return null;
      }
      octets.push(num);
    }
    return octets;
  };

  // Convert octets to binary string (with dots)
  const octetsToBinary = (octets: number[]): string => {
    return octets.map((o) => o.toString(2).padStart(8, "0")).join(".");
  };

  // Get effective octets (default to 0.0.0.0 when empty/invalid)
  const getEffectiveOctets = (): number[] => {
    const octets = parseIp(ipInput);
    return octets ? [...octets] : [0, 0, 0, 0];
  };

  // Binary IP display (derived from input, always available)
  let binaryIp = $derived.by(() => {
    return octetsToBinary(getEffectiveOctets());
  });

  // Get all 32 bits as an array for the interactive editor
  let ipBits = $derived.by(() => {
    const octets = getEffectiveOctets();
    const bits: number[] = [];
    for (const octet of octets) {
      for (let i = 7; i >= 0; i--) {
        bits.push((octet >> i) & 1);
      }
    }
    return bits;
  });

  // Toggle a specific bit and update ipInput
  const toggleBit = (bitIndex: number) => {
    const octets = getEffectiveOctets();
    const octetIndex = Math.floor(bitIndex / 8);
    const bitPosition = 7 - (bitIndex % 8);
    octets[octetIndex] ^= 1 << bitPosition;
    ipInput = octetsToIp(octets);
  };

  // Get binary representation with network/host bit highlighting
  let binaryParts = $derived.by(() => {
    const octets = getEffectiveOctets();
    const cidr = parseInt(cidrInput, 10);
    if (isNaN(cidr) || cidr < 0 || cidr > 32) return null;

    // Get full binary string without dots
    const fullBinary = octets.map((o) => o.toString(2).padStart(8, "0")).join("");

    // Split into network and host portions
    const networkBits = fullBinary.slice(0, cidr);
    const hostBits = fullBinary.slice(cidr);

    return {
      networkBits,
      hostBits,
    };
  });

  // Convert octets to 32-bit integer
  const octetsToInt = (octets: number[]): number => {
    return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  };

  // Convert 32-bit integer to octets
  const intToOctets = (num: number): number[] => {
    return [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255,
    ];
  };

  // Convert octets to IP string
  const octetsToIp = (octets: number[]): string => {
    return octets.join(".");
  };

  // Calculate subnet mask from CIDR
  const cidrToMask = (cidr: number): number[] => {
    const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
    return intToOctets(mask);
  };

  // Calculate wildcard mask
  const maskToWildcard = (maskOctets: number[]): number[] => {
    return maskOctets.map((o) => 255 - o);
  };

  // Determine IP class
  const getIpClass = (firstOctet: number): string => {
    if (firstOctet < 128) return "A";
    if (firstOctet < 192) return "B";
    if (firstOctet < 224) return "C";
    if (firstOctet < 240) return "D (Multicast)";
    return "E (Reserved)";
  };

  // Determine if IP is private/public/special
  const getIpType = (octets: number[]): string => {
    const [a, b, c] = octets;

    // Loopback
    if (a === 127) return "Loopback";

    // Private ranges
    if (a === 10) return "Private (Class A)";
    if (a === 172 && b >= 16 && b <= 31) return "Private (Class B)";
    if (a === 192 && b === 168) return "Private (Class C)";

    // Link-local
    if (a === 169 && b === 254) return "Link-Local (APIPA)";

    // Multicast
    if (a >= 224 && a <= 239) return "Multicast";

    // Reserved
    if (a >= 240) return "Reserved";

    // Special
    if (a === 0) return "Current Network";
    if (a === 255 && b === 255 && c === 255) return "Broadcast";

    return "Public";
  };

  // Calculate subnet details
  const calculate = () => {
    error = "";
    results = null;

    if (!ipInput.trim()) {
      return;
    }

    const octets = parseIp(ipInput);
    if (!octets) {
      error = "Invalid IP address format. Use dotted decimal (e.g., 192.168.1.0)";
      return;
    }

    const cidr = parseInt(cidrInput, 10);
    if (isNaN(cidr) || cidr < 0 || cidr > 32) {
      error = "CIDR must be between 0 and 32";
      return;
    }

    const ipInt = octetsToInt(octets);
    const maskOctets = cidrToMask(cidr);
    const maskInt = octetsToInt(maskOctets);
    const wildcardOctets = maskToWildcard(maskOctets);

    // Network address (IP AND mask)
    const networkInt = (ipInt & maskInt) >>> 0;
    const networkOctets = intToOctets(networkInt);

    // Broadcast address (network OR wildcard)
    const wildcardInt = octetsToInt(wildcardOctets);
    const broadcastInt = (networkInt | wildcardInt) >>> 0;
    const broadcastOctets = intToOctets(broadcastInt);

    // First and last usable hosts
    const totalHosts = Math.pow(2, 32 - cidr);
    let usableHosts = totalHosts - 2;
    let firstHostOctets: number[];
    let lastHostOctets: number[];

    if (cidr === 32) {
      // /32 - single host
      firstHostOctets = networkOctets;
      lastHostOctets = networkOctets;
      usableHosts = 1;
    } else if (cidr === 31) {
      // /31 - point-to-point link (RFC 3021)
      firstHostOctets = networkOctets;
      lastHostOctets = broadcastOctets;
      usableHosts = 2;
    } else {
      // Normal subnets
      firstHostOctets = intToOctets(networkInt + 1);
      lastHostOctets = intToOctets(broadcastInt - 1);
      if (usableHosts < 0) usableHosts = 0;
    }

    results = {
      networkAddress: octetsToIp(networkOctets),
      broadcastAddress: octetsToIp(broadcastOctets),
      firstHost: octetsToIp(firstHostOctets),
      lastHost: octetsToIp(lastHostOctets),
      subnetMask: octetsToIp(maskOctets),
      wildcardMask: octetsToIp(wildcardOctets),
      totalHosts,
      usableHosts,
      ipClass: getIpClass(octets[0]),
      ipType: getIpType(octets),
      binaryNetmask: octetsToBinary(maskOctets),
      cidr,
    };
  };

  // React to input changes
  $effect(() => {
    ipInput;
    cidrInput;
    calculate();
  });

  // Copy handler
  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  };

  // Clear handler
  const handleClear = () => {
    ipInput = "";
    cidrInput = "24";
    results = null;
    error = "";
  };

  // Example presets
  const presets = [
    { label: "Class A Private", ip: "10.0.0.0", cidr: "8" },
    { label: "Class B Private", ip: "172.16.0.0", cidr: "12" },
    { label: "Class C Private", ip: "192.168.1.0", cidr: "24" },
    { label: "Small Office", ip: "192.168.1.0", cidr: "28" },
    { label: "Point-to-Point", ip: "10.0.0.0", cidr: "31" },
    { label: "Single Host", ip: "192.168.1.100", cidr: "32" },
  ];

  const applyPreset = (preset: { ip: string; cidr: string }) => {
    ipInput = preset.ip;
    cidrInput = preset.cidr;
  };

  // Result fields for display
  const getResultFields = () => {
    if (!results) return [];
    return [
      { label: "Network Address", value: results.networkAddress, key: "network" },
      { label: "Broadcast Address", value: results.broadcastAddress, key: "broadcast" },
      { label: "First Usable Host", value: results.firstHost, key: "first" },
      { label: "Last Usable Host", value: results.lastHost, key: "last" },
      { label: "Subnet Mask", value: results.subnetMask, key: "mask" },
      { label: "Wildcard Mask", value: results.wildcardMask, key: "wildcard" },
      { label: "CIDR Notation", value: `/${results.cidr}`, key: "cidr" },
      { label: "Total Addresses", value: results.totalHosts.toLocaleString(), key: "total" },
      { label: "Usable Hosts", value: results.usableHosts.toLocaleString(), key: "usable" },
      { label: "IP Class", value: results.ipClass, key: "class" },
      { label: "IP Type", value: results.ipType, key: "type" },
      { label: "Binary Netmask", value: results.binaryNetmask, key: "binary" },
    ];
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Calculate subnet details from IP address and CIDR notation.
    </p>
  </header>

  <!-- Input Section -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        Input
      </h2>
      <button
        onclick={handleClear}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Clear
      </button>
    </div>

    <div class="flex flex-col sm:flex-row gap-4 mb-4">
      <div class="flex-1">
        <label for="ip-input" class="block text-sm text-(--color-text-muted) mb-2">
          IP Address
        </label>
        <input
          id="ip-input"
          type="text"
          bind:value={ipInput}
          placeholder="e.g., 192.168.1.0"
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none"
        />
        <!-- Interactive binary bit editor (always visible) -->
        <div class="mt-2 p-2 bg-(--color-bg) border border-(--color-border)">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-(--color-text-muted)">Binary (click bits to toggle)</span>
            <button
              onclick={() => handleCopy("binary-ip", binaryIp)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copiedField === "binary-ip" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div class="font-mono text-xs flex flex-wrap items-center gap-px">
            {#each ipBits as bit, i}
              {#if i > 0 && i % 8 === 0}
                <span class="w-1.5 shrink-0"></span>
              {/if}
              {@const isNetwork = i < parseInt(cidrInput, 10)}
              <button
                type="button"
                onclick={() => toggleBit(i)}
                class="w-5 h-5 inline-flex items-center justify-center rounded-[2px] transition-all cursor-pointer border
                  {bit === 1
                    ? isNetwork
                      ? 'bg-(--color-text) border-(--color-text) text-(--color-bg)'
                      : 'bg-(--color-text-muted) border-(--color-text-muted) text-(--color-bg)'
                    : isNetwork
                      ? 'bg-transparent border-(--color-text-light) text-(--color-text) hover:bg-(--color-text)/5'
                      : 'bg-transparent border-(--color-border) text-(--color-text-muted) hover:bg-(--color-text)/5'
                  }"
                title="Bit {i} — Click to toggle"
              >
                {bit}
              </button>
            {/each}
          </div>
          {#if binaryParts}
            <div class="flex gap-4 mt-1 text-xs">
              <span class="text-(--color-text)">Network: {binaryParts.networkBits.length} bits</span>
              <span class="text-(--color-text-muted)">Host: {binaryParts.hostBits.length} bits</span>
            </div>
          {/if}
        </div>
      </div>
      <div class="w-full sm:w-32">
        <label for="cidr-input" class="block text-sm text-(--color-text-muted) mb-2">
          CIDR (/{cidrInput})
        </label>
        <input
          id="cidr-input"
          type="range"
          min="0"
          max="32"
          bind:value={cidrInput}
          class="w-full h-[42px] accent-(--color-primary)"
        />
      </div>
      <div class="w-full sm:w-20">
        <label for="cidr-number" class="block text-sm text-(--color-text-muted) mb-2">
          Prefix
        </label>
        <input
          id="cidr-number"
          type="number"
          min="0"
          max="32"
          bind:value={cidrInput}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none text-center"
        />
      </div>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-2">
      <span class="text-xs text-(--color-text-muted) self-center">Presets:</span>
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
  {#if results}
    <div class="flex-1 p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
        Subnet Details
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each getResultFields() as field}
          <div class="flex justify-between items-start gap-2 py-2 px-3 bg-(--color-bg) border border-(--color-border)">
            <div class="flex-1 min-w-0">
              <span class="text-xs text-(--color-text-muted) block">{field.label}</span>
              <span class="text-sm text-(--color-text) font-mono break-all">{field.value}</span>
            </div>
            <button
              onclick={() => handleCopy(field.key, field.value)}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
            >
              {copiedField === field.key ? "Copied!" : "Copy"}
            </button>
          </div>
        {/each}
      </div>

      <!-- Visual representation -->
      <div class="mt-4 p-3 bg-(--color-bg) border border-(--color-border)">
        <span class="text-xs text-(--color-text-muted) block mb-2">CIDR Notation</span>
        <span class="text-lg text-(--color-text) font-mono">
          {results.networkAddress}/{results.cidr}
        </span>
      </div>

      <!-- IP Range visualization -->
      <div class="mt-4 p-3 bg-(--color-bg) border border-(--color-border)">
        <span class="text-xs text-(--color-text-muted) block mb-2">IP Range</span>
        <div class="flex items-center gap-2 flex-wrap font-mono text-sm">
          <span class="text-(--color-text)">{results.firstHost}</span>
          <span class="text-(--color-text-muted)">-</span>
          <span class="text-(--color-text)">{results.lastHost}</span>
          <span class="text-(--color-text-muted)">({results.usableHosts.toLocaleString()} hosts)</span>
        </div>
      </div>
    </div>
  {:else if !error}
    <div class="flex-1 flex items-center justify-center p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-sm text-(--color-text-muted)">Enter an IP address to calculate subnet details</span>
    </div>
  {/if}

  <!-- Info Section -->
  <div
    class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)"
  >
    <strong class="text-(--color-text)">About Subnetting:</strong>
    Subnetting divides a network into smaller segments. The CIDR notation (e.g., /24) indicates
    how many bits are used for the network portion. A /24 network has 256 total addresses
    (254 usable hosts), while a /32 represents a single host.
  </div>
</div>
