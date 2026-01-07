<script lang="ts">
  interface Port {
    port: number;
    protocol: "TCP" | "UDP" | "TCP/UDP";
    service: string;
    description: string;
    category: string;
  }

  const ports: Port[] = [
    // Well-known ports (0-1023)
    { port: 20, protocol: "TCP", service: "FTP Data", description: "File Transfer Protocol data transfer", category: "File Transfer" },
    { port: 21, protocol: "TCP", service: "FTP Control", description: "File Transfer Protocol command control", category: "File Transfer" },
    { port: 22, protocol: "TCP", service: "SSH", description: "Secure Shell remote login and command execution", category: "Remote Access" },
    { port: 23, protocol: "TCP", service: "Telnet", description: "Unencrypted text communications (legacy)", category: "Remote Access" },
    { port: 25, protocol: "TCP", service: "SMTP", description: "Simple Mail Transfer Protocol for sending email", category: "Email" },
    { port: 53, protocol: "TCP/UDP", service: "DNS", description: "Domain Name System for resolving domain names", category: "Network" },
    { port: 67, protocol: "UDP", service: "DHCP Server", description: "Dynamic Host Configuration Protocol server", category: "Network" },
    { port: 68, protocol: "UDP", service: "DHCP Client", description: "Dynamic Host Configuration Protocol client", category: "Network" },
    { port: 69, protocol: "UDP", service: "TFTP", description: "Trivial File Transfer Protocol", category: "File Transfer" },
    { port: 80, protocol: "TCP", service: "HTTP", description: "Hypertext Transfer Protocol for web traffic", category: "Web" },
    { port: 88, protocol: "TCP/UDP", service: "Kerberos", description: "Network authentication protocol", category: "Authentication" },
    { port: 110, protocol: "TCP", service: "POP3", description: "Post Office Protocol v3 for retrieving email", category: "Email" },
    { port: 119, protocol: "TCP", service: "NNTP", description: "Network News Transfer Protocol", category: "Network" },
    { port: 123, protocol: "UDP", service: "NTP", description: "Network Time Protocol for time synchronization", category: "Network" },
    { port: 137, protocol: "UDP", service: "NetBIOS Name", description: "NetBIOS Name Service", category: "Windows" },
    { port: 138, protocol: "UDP", service: "NetBIOS Datagram", description: "NetBIOS Datagram Service", category: "Windows" },
    { port: 139, protocol: "TCP", service: "NetBIOS Session", description: "NetBIOS Session Service", category: "Windows" },
    { port: 143, protocol: "TCP", service: "IMAP", description: "Internet Message Access Protocol for email", category: "Email" },
    { port: 161, protocol: "UDP", service: "SNMP", description: "Simple Network Management Protocol", category: "Network" },
    { port: 162, protocol: "UDP", service: "SNMP Trap", description: "SNMP Trap messages", category: "Network" },
    { port: 179, protocol: "TCP", service: "BGP", description: "Border Gateway Protocol", category: "Network" },
    { port: 194, protocol: "TCP", service: "IRC", description: "Internet Relay Chat", category: "Messaging" },
    { port: 389, protocol: "TCP/UDP", service: "LDAP", description: "Lightweight Directory Access Protocol", category: "Directory" },
    { port: 443, protocol: "TCP", service: "HTTPS", description: "HTTP Secure (TLS/SSL encrypted)", category: "Web" },
    { port: 445, protocol: "TCP", service: "SMB", description: "Server Message Block / Microsoft-DS", category: "Windows" },
    { port: 464, protocol: "TCP/UDP", service: "Kerberos Change", description: "Kerberos Change/Set Password", category: "Authentication" },
    { port: 465, protocol: "TCP", service: "SMTPS", description: "SMTP over SSL (deprecated, use 587)", category: "Email" },
    { port: 500, protocol: "UDP", service: "IKE", description: "Internet Key Exchange for IPSec VPN", category: "VPN" },
    { port: 514, protocol: "UDP", service: "Syslog", description: "System logging protocol", category: "Network" },
    { port: 515, protocol: "TCP", service: "LPD", description: "Line Printer Daemon", category: "Printing" },
    { port: 520, protocol: "UDP", service: "RIP", description: "Routing Information Protocol", category: "Network" },
    { port: 543, protocol: "TCP", service: "Klogin", description: "Kerberos login", category: "Authentication" },
    { port: 544, protocol: "TCP", service: "Kshell", description: "Kerberos remote shell", category: "Authentication" },
    { port: 546, protocol: "UDP", service: "DHCPv6 Client", description: "DHCPv6 client", category: "Network" },
    { port: 547, protocol: "UDP", service: "DHCPv6 Server", description: "DHCPv6 server", category: "Network" },
    { port: 587, protocol: "TCP", service: "SMTP Submission", description: "Email message submission (recommended)", category: "Email" },
    { port: 631, protocol: "TCP/UDP", service: "IPP/CUPS", description: "Internet Printing Protocol / CUPS", category: "Printing" },
    { port: 636, protocol: "TCP", service: "LDAPS", description: "LDAP over SSL/TLS", category: "Directory" },
    { port: 873, protocol: "TCP", service: "rsync", description: "File synchronization protocol", category: "File Transfer" },
    { port: 989, protocol: "TCP", service: "FTPS Data", description: "FTP over TLS data", category: "File Transfer" },
    { port: 990, protocol: "TCP", service: "FTPS Control", description: "FTP over TLS control", category: "File Transfer" },
    { port: 993, protocol: "TCP", service: "IMAPS", description: "IMAP over SSL/TLS", category: "Email" },
    { port: 995, protocol: "TCP", service: "POP3S", description: "POP3 over SSL/TLS", category: "Email" },

    // Registered ports (1024-49151)
    { port: 1080, protocol: "TCP", service: "SOCKS", description: "SOCKS proxy protocol", category: "Proxy" },
    { port: 1194, protocol: "UDP", service: "OpenVPN", description: "OpenVPN tunnel", category: "VPN" },
    { port: 1433, protocol: "TCP", service: "MSSQL", description: "Microsoft SQL Server", category: "Database" },
    { port: 1434, protocol: "UDP", service: "MSSQL Browser", description: "Microsoft SQL Server Browser", category: "Database" },
    { port: 1521, protocol: "TCP", service: "Oracle DB", description: "Oracle Database listener", category: "Database" },
    { port: 1701, protocol: "UDP", service: "L2TP", description: "Layer 2 Tunneling Protocol", category: "VPN" },
    { port: 1723, protocol: "TCP", service: "PPTP", description: "Point-to-Point Tunneling Protocol", category: "VPN" },
    { port: 1812, protocol: "UDP", service: "RADIUS Auth", description: "RADIUS authentication", category: "Authentication" },
    { port: 1813, protocol: "UDP", service: "RADIUS Acct", description: "RADIUS accounting", category: "Authentication" },
    { port: 1883, protocol: "TCP", service: "MQTT", description: "Message Queuing Telemetry Transport", category: "Messaging" },
    { port: 2049, protocol: "TCP/UDP", service: "NFS", description: "Network File System", category: "File Transfer" },
    { port: 2082, protocol: "TCP", service: "cPanel", description: "cPanel default", category: "Web" },
    { port: 2083, protocol: "TCP", service: "cPanel SSL", description: "cPanel SSL", category: "Web" },
    { port: 2181, protocol: "TCP", service: "ZooKeeper", description: "Apache ZooKeeper client", category: "Distributed" },
    { port: 2375, protocol: "TCP", service: "Docker", description: "Docker REST API (unencrypted)", category: "Containers" },
    { port: 2376, protocol: "TCP", service: "Docker TLS", description: "Docker REST API (TLS)", category: "Containers" },
    { port: 2377, protocol: "TCP", service: "Docker Swarm", description: "Docker Swarm cluster management", category: "Containers" },
    { port: 3000, protocol: "TCP", service: "Dev Server", description: "Common development server (Node.js, Rails)", category: "Development" },
    { port: 3306, protocol: "TCP", service: "MySQL", description: "MySQL/MariaDB database", category: "Database" },
    { port: 3389, protocol: "TCP", service: "RDP", description: "Remote Desktop Protocol", category: "Remote Access" },
    { port: 4000, protocol: "TCP", service: "Dev Server", description: "Common development server (Phoenix)", category: "Development" },
    { port: 4200, protocol: "TCP", service: "Angular", description: "Angular development server", category: "Development" },
    { port: 4369, protocol: "TCP", service: "EPMD", description: "Erlang Port Mapper Daemon", category: "Distributed" },
    { port: 4443, protocol: "TCP", service: "Pharos", description: "Common HTTPS alternative port", category: "Web" },
    { port: 4505, protocol: "TCP", service: "Salt Pub", description: "SaltStack publish port", category: "DevOps" },
    { port: 4506, protocol: "TCP", service: "Salt Ret", description: "SaltStack return port", category: "DevOps" },
    { port: 5000, protocol: "TCP", service: "Dev Server", description: "Flask/Docker Registry default", category: "Development" },
    { port: 5001, protocol: "TCP", service: "Dev Server", description: "Common development alternative", category: "Development" },
    { port: 5060, protocol: "TCP/UDP", service: "SIP", description: "Session Initiation Protocol", category: "VoIP" },
    { port: 5061, protocol: "TCP", service: "SIP TLS", description: "SIP over TLS", category: "VoIP" },
    { port: 5173, protocol: "TCP", service: "Vite", description: "Vite development server", category: "Development" },
    { port: 5222, protocol: "TCP", service: "XMPP Client", description: "XMPP/Jabber client connection", category: "Messaging" },
    { port: 5269, protocol: "TCP", service: "XMPP Server", description: "XMPP/Jabber server-to-server", category: "Messaging" },
    { port: 5432, protocol: "TCP", service: "PostgreSQL", description: "PostgreSQL database", category: "Database" },
    { port: 5672, protocol: "TCP", service: "AMQP", description: "Advanced Message Queuing Protocol (RabbitMQ)", category: "Messaging" },
    { port: 5900, protocol: "TCP", service: "VNC", description: "Virtual Network Computing", category: "Remote Access" },
    { port: 5984, protocol: "TCP", service: "CouchDB", description: "Apache CouchDB", category: "Database" },
    { port: 6379, protocol: "TCP", service: "Redis", description: "Redis key-value store", category: "Database" },
    { port: 6443, protocol: "TCP", service: "Kubernetes API", description: "Kubernetes API server", category: "Containers" },
    { port: 6660, protocol: "TCP", service: "IRC", description: "IRC (alternate)", category: "Messaging" },
    { port: 6667, protocol: "TCP", service: "IRC", description: "IRC (common)", category: "Messaging" },
    { port: 6697, protocol: "TCP", service: "IRC TLS", description: "IRC over TLS", category: "Messaging" },
    { port: 7000, protocol: "TCP", service: "Cassandra Inter", description: "Cassandra inter-node", category: "Database" },
    { port: 7001, protocol: "TCP", service: "Cassandra SSL", description: "Cassandra SSL inter-node", category: "Database" },
    { port: 7199, protocol: "TCP", service: "Cassandra JMX", description: "Cassandra JMX monitoring", category: "Database" },
    { port: 8000, protocol: "TCP", service: "Dev Server", description: "Common HTTP alternative (Django)", category: "Development" },
    { port: 8008, protocol: "TCP", service: "HTTP Alt", description: "HTTP alternate", category: "Web" },
    { port: 8080, protocol: "TCP", service: "HTTP Proxy", description: "HTTP proxy / alternate HTTP", category: "Web" },
    { port: 8081, protocol: "TCP", service: "HTTP Alt", description: "HTTP alternate / admin panels", category: "Web" },
    { port: 8443, protocol: "TCP", service: "HTTPS Alt", description: "HTTPS alternate", category: "Web" },
    { port: 8761, protocol: "TCP", service: "Eureka", description: "Netflix Eureka service registry", category: "Distributed" },
    { port: 8883, protocol: "TCP", service: "MQTT TLS", description: "MQTT over TLS", category: "Messaging" },
    { port: 8888, protocol: "TCP", service: "HTTP Alt", description: "HTTP alternate / Jupyter", category: "Development" },
    { port: 9000, protocol: "TCP", service: "PHP-FPM", description: "PHP FastCGI Process Manager / SonarQube", category: "Development" },
    { port: 9042, protocol: "TCP", service: "Cassandra CQL", description: "Cassandra native transport", category: "Database" },
    { port: 9090, protocol: "TCP", service: "Prometheus", description: "Prometheus metrics server", category: "Monitoring" },
    { port: 9092, protocol: "TCP", service: "Kafka", description: "Apache Kafka broker", category: "Messaging" },
    { port: 9200, protocol: "TCP", service: "Elasticsearch", description: "Elasticsearch HTTP", category: "Database" },
    { port: 9300, protocol: "TCP", service: "Elasticsearch", description: "Elasticsearch transport", category: "Database" },
    { port: 9418, protocol: "TCP", service: "Git", description: "Git protocol", category: "Development" },
    { port: 9999, protocol: "TCP", service: "Admin", description: "Common admin/debug port", category: "Development" },
    { port: 10000, protocol: "TCP", service: "Webmin", description: "Webmin web-based admin", category: "Web" },
    { port: 10250, protocol: "TCP", service: "Kubelet", description: "Kubernetes Kubelet API", category: "Containers" },
    { port: 10255, protocol: "TCP", service: "Kubelet RO", description: "Kubernetes Kubelet read-only", category: "Containers" },
    { port: 11211, protocol: "TCP/UDP", service: "Memcached", description: "Memcached caching system", category: "Database" },
    { port: 15672, protocol: "TCP", service: "RabbitMQ Mgmt", description: "RabbitMQ management console", category: "Messaging" },
    { port: 27017, protocol: "TCP", service: "MongoDB", description: "MongoDB database", category: "Database" },
    { port: 27018, protocol: "TCP", service: "MongoDB Shard", description: "MongoDB shard server", category: "Database" },
    { port: 27019, protocol: "TCP", service: "MongoDB Config", description: "MongoDB config server", category: "Database" },
    { port: 28017, protocol: "TCP", service: "MongoDB Web", description: "MongoDB web interface (legacy)", category: "Database" },
    { port: 50000, protocol: "TCP", service: "Jenkins Agent", description: "Jenkins agent connection", category: "DevOps" },
  ];

  const allCategories = [...new Set(ports.map(p => p.category))].sort();

  let searchQuery = $state("");
  let selectedCategory = $state("All");
  let selectedProtocol = $state("All");
  let sortBy = $state<"port" | "service" | "category">("port");
  let sortAsc = $state(true);

  const filteredPorts = $derived(() => {
    let result = ports.filter(p => {
      const matchesSearch = searchQuery === "" || 
        p.port.toString().includes(searchQuery) ||
        p.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      const matchesProtocol = selectedProtocol === "All" || p.protocol.includes(selectedProtocol);
      
      return matchesSearch && matchesCategory && matchesProtocol;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "port") {
        cmp = a.port - b.port;
      } else if (sortBy === "service") {
        cmp = a.service.localeCompare(b.service);
      } else {
        cmp = a.category.localeCompare(b.category);
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  });

  function toggleSort(column: "port" | "service" | "category") {
    if (sortBy === column) {
      sortAsc = !sortAsc;
    } else {
      sortBy = column;
      sortAsc = true;
    }
  }

  function copyPort(port: number) {
    navigator.clipboard.writeText(port.toString());
  }

  function getProtocolColor(protocol: string): string {
    if (protocol === "TCP") return "text-blue-500";
    if (protocol === "UDP") return "text-green-500";
    return "text-purple-500";
  }

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      "Web": "bg-blue-500/20 text-blue-400",
      "Email": "bg-yellow-500/20 text-yellow-400",
      "Database": "bg-green-500/20 text-green-400",
      "Network": "bg-cyan-500/20 text-cyan-400",
      "Remote Access": "bg-red-500/20 text-red-400",
      "File Transfer": "bg-orange-500/20 text-orange-400",
      "VPN": "bg-purple-500/20 text-purple-400",
      "Messaging": "bg-pink-500/20 text-pink-400",
      "Development": "bg-indigo-500/20 text-indigo-400",
      "Containers": "bg-teal-500/20 text-teal-400",
      "Authentication": "bg-amber-500/20 text-amber-400",
      "Monitoring": "bg-lime-500/20 text-lime-400",
      "DevOps": "bg-emerald-500/20 text-emerald-400",
      "Distributed": "bg-violet-500/20 text-violet-400",
      "Directory": "bg-rose-500/20 text-rose-400",
      "Printing": "bg-slate-500/20 text-slate-400",
      "Windows": "bg-sky-500/20 text-sky-400",
      "VoIP": "bg-fuchsia-500/20 text-fuchsia-400",
      "Proxy": "bg-stone-500/20 text-stone-400",
    };
    return colors[category] || "bg-gray-500/20 text-gray-400";
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Reference for common network ports and their services. Click a port number to copy.
    </p>
  </header>

  <!-- Filters -->
  <div class="flex flex-wrap gap-3 mb-4 pb-4 border-b border-(--color-border)">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search port, service, or description..."
      class="flex-1 min-w-48 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
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

    <select
      bind:value={selectedProtocol}
      class="px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
    >
      <option value="All">All Protocols</option>
      <option value="TCP">TCP</option>
      <option value="UDP">UDP</option>
    </select>

    <span class="flex items-center text-sm text-(--color-text-muted)">
      {filteredPorts().length} ports
    </span>
  </div>

  <!-- Table -->
  <div class="flex-1 overflow-auto">
    <table class="w-full text-sm">
      <thead class="sticky top-0 bg-(--color-bg)">
        <tr class="border-b border-(--color-border)">
          <th 
            class="text-left py-2 px-3 font-medium cursor-pointer hover:text-(--color-accent) select-none"
            onclick={() => toggleSort("port")}
          >
            Port {sortBy === "port" ? (sortAsc ? "↑" : "↓") : ""}
          </th>
          <th class="text-left py-2 px-3 font-medium">Protocol</th>
          <th 
            class="text-left py-2 px-3 font-medium cursor-pointer hover:text-(--color-accent) select-none"
            onclick={() => toggleSort("service")}
          >
            Service {sortBy === "service" ? (sortAsc ? "↑" : "↓") : ""}
          </th>
          <th class="text-left py-2 px-3 font-medium">Description</th>
          <th 
            class="text-left py-2 px-3 font-medium cursor-pointer hover:text-(--color-accent) select-none"
            onclick={() => toggleSort("category")}
          >
            Category {sortBy === "category" ? (sortAsc ? "↑" : "↓") : ""}
          </th>
        </tr>
      </thead>
      <tbody>
        {#each filteredPorts() as port (port.port + port.protocol)}
          <tr class="border-b border-(--color-border) hover:bg-(--color-bg-alt)">
            <td class="py-2 px-3">
              <button
                onclick={() => copyPort(port.port)}
                class="font-mono font-bold hover:text-(--color-accent) transition-colors"
                title="Click to copy"
              >
                {port.port}
              </button>
            </td>
            <td class="py-2 px-3">
              <span class="font-mono text-xs {getProtocolColor(port.protocol)}">
                {port.protocol}
              </span>
            </td>
            <td class="py-2 px-3 font-medium">
              {port.service}
            </td>
            <td class="py-2 px-3 text-(--color-text-muted)">
              {port.description}
            </td>
            <td class="py-2 px-3">
              <span class="text-xs px-2 py-0.5 rounded {getCategoryColor(port.category)}">
                {port.category}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if filteredPorts().length === 0}
      <div class="text-center py-8 text-(--color-text-muted)">
        No ports found matching your criteria.
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="mt-4 pt-4 border-t border-(--color-border)">
    <div class="flex flex-wrap gap-4 text-xs text-(--color-text-muted)">
      <div class="flex items-center gap-2">
        <span class="font-mono text-blue-500">TCP</span>
        <span>Connection-oriented, reliable</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-mono text-green-500">UDP</span>
        <span>Connectionless, fast</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-mono text-purple-500">TCP/UDP</span>
        <span>Both protocols</span>
      </div>
    </div>
  </div>
</div>
