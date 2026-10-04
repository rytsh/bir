<script lang="ts">
  import "@abraham/reflection";
  import * as x509 from "@peculiar/x509";

  type ItemKind = "certificate" | "csr" | "publicKey";
  type ValidityStatus = "valid" | "expired" | "notYetValid";

  interface Field {
    label: string;
    value: string;
    mono?: boolean;
  }

  interface ExtensionInfo {
    name: string;
    oid: string;
    critical: boolean;
    values: string[];
  }

  interface ChainLink {
    issuerIndex: number;
    signatureValid: boolean;
  }

  interface DecodedItem {
    kind: ItemKind;
    title: string;
    fields: Field[];
    extensions: ExtensionInfo[];
    validity?: { notBefore: Date; notAfter: Date; status: ValidityStatus; daysLeft: number };
    selfSigned?: boolean;
    signatureValid?: boolean;
    chain?: ChainLink;
    pem: string;
    text: string;
  }

  const SAMPLE_PEM = `-----BEGIN CERTIFICATE-----
MIICJDCCAcmgAwIBAgIUbR8+C+ma2uag1nGShPRd17oFJuwwCgYIKoZIzj0EAwIw
PTELMAkGA1UEBhMCVVMxGDAWBgNVBAoMDzEudG9vbHMgRXhhbXBsZTEUMBIGA1UE
AwwLZXhhbXBsZS5jb20wHhcNMjYxMDAyMDYyNzMyWhcNMzYwOTI5MDYyNzMyWjA9
MQswCQYDVQQGEwJVUzEYMBYGA1UECgwPMS50b29scyBFeGFtcGxlMRQwEgYDVQQD
DAtleGFtcGxlLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABMqznFVCDrdd
2dwmzZ5NO88t8DcYrLXtZdf2uY1IoV0NABltV4ktcX2HETwKdcquf3VvVwtcAz5w
vFrm/zBu8WujgaYwgaMwHQYDVR0OBBYEFLHsw+XxLni7kScOehcZqM5fKJgZMB8G
A1UdIwQYMBaAFLHsw+XxLni7kScOehcZqM5fKJgZMA8GA1UdEwEB/wQFMAMBAf8w
KwYDVR0RBCQwIoILZXhhbXBsZS5jb22CDSouZXhhbXBsZS5jb22HBH8AAAEwDgYD
VR0PAQH/BAQDAgeAMBMGA1UdJQQMMAoGCCsGAQUFBwMBMAoGCCqGSM49BAMCA0kA
MEYCIQDLfenHmpF42lAhB9tkXVKJ47ISCGZOs/vLLNYiRAhENQIhANhVR/emgQDr
LjguNo5Vr2ysEGUMGrs8OAGumFfrOQer
-----END CERTIFICATE-----`;

  const KEY_USAGE_NAMES: [x509.KeyUsageFlags, string][] = [
    [x509.KeyUsageFlags.digitalSignature, "Digital Signature"],
    [x509.KeyUsageFlags.nonRepudiation, "Non Repudiation"],
    [x509.KeyUsageFlags.keyEncipherment, "Key Encipherment"],
    [x509.KeyUsageFlags.dataEncipherment, "Data Encipherment"],
    [x509.KeyUsageFlags.keyAgreement, "Key Agreement"],
    [x509.KeyUsageFlags.keyCertSign, "Certificate Sign"],
    [x509.KeyUsageFlags.cRLSign, "CRL Sign"],
    [x509.KeyUsageFlags.encipherOnly, "Encipher Only"],
    [x509.KeyUsageFlags.decipherOnly, "Decipher Only"],
  ];

  const OID_NAMES: Record<string, string> = {
    "1.3.6.1.5.5.7.3.1": "TLS Web Server Authentication",
    "1.3.6.1.5.5.7.3.2": "TLS Web Client Authentication",
    "1.3.6.1.5.5.7.3.3": "Code Signing",
    "1.3.6.1.5.5.7.3.4": "Email Protection",
    "1.3.6.1.5.5.7.3.8": "Time Stamping",
    "1.3.6.1.5.5.7.3.9": "OCSP Signing",
    "2.5.29.37.0": "Any Extended Key Usage",
    "2.23.140.1.2.1": "Domain Validated (DV)",
    "2.23.140.1.2.2": "Organization Validated (OV)",
    "2.23.140.1.2.3": "Individual Validated (IV)",
    "2.23.140.1.1": "Extended Validation (EV)",
    "2.5.29.32.0": "Any Policy",
    "2.5.29.14": "Subject Key Identifier",
    "2.5.29.15": "Key Usage",
    "2.5.29.17": "Subject Alternative Name",
    "2.5.29.18": "Issuer Alternative Name",
    "2.5.29.19": "Basic Constraints",
    "2.5.29.31": "CRL Distribution Points",
    "2.5.29.32": "Certificate Policies",
    "2.5.29.35": "Authority Key Identifier",
    "2.5.29.37": "Extended Key Usage",
    "1.3.6.1.5.5.7.1.1": "Authority Information Access",
    "1.3.6.1.4.1.11129.2.4.2": "Signed Certificate Timestamps (CT)",
    "1.3.6.1.5.5.7.48.1.5": "OCSP No Check",
    "1.3.6.1.5.5.7.1.24": "TLS Feature (OCSP Must-Staple)",
  };

  const GENERAL_NAME_LABELS: Record<string, string> = {
    dns: "DNS",
    ip: "IP",
    email: "Email",
    url: "URI",
    dn: "DirName",
    upn: "UPN",
    guid: "GUID",
    id: "RegisteredID",
  };

  let input = $state("");
  let items = $state<DecodedItem[]>([]);
  let error = $state("");
  let isDecoding = $state(false);
  let isDragging = $state(false);
  let copiedKey = $state("");
  let expandedText = $state<Record<number, boolean>>({});
  let fileInput: HTMLInputElement | undefined = $state();
  let decodeToken = 0;

  const toHex = (buffer: ArrayBuffer | Uint8Array, separator = ":"): string =>
    Array.from(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), (b) =>
      b.toString(16).padStart(2, "0").toUpperCase(),
    ).join(separator);

  const formatHexString = (hex: string): string =>
    (hex.match(/.{1,2}/g) ?? []).join(":").toUpperCase();

  const oidName = (oid: string): string => OID_NAMES[oid] ? `${OID_NAMES[oid]} (${oid})` : oid;

  const formatDate = (date: Date): string =>
    `${date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")}`;

  const describeKey = (key: x509.PublicKey): string => {
    const algorithm = key.algorithm as Algorithm & {
      modulusLength?: number;
      namedCurve?: string;
      publicExponent?: Uint8Array;
    };
    if (algorithm.modulusLength) {
      const exponent = algorithm.publicExponent
        ? parseInt(toHex(algorithm.publicExponent, ""), 16)
        : undefined;
      return `RSA ${algorithm.modulusLength} bit${exponent ? ` (e=${exponent})` : ""}`;
    }
    if (algorithm.namedCurve) return `${algorithm.name} ${algorithm.namedCurve}`;
    return algorithm.name;
  };

  const describeSignature = (algorithm: Algorithm & { hash?: Algorithm }): string => {
    const name = algorithm.name === "RSASSA-PKCS1-v1_5" ? "RSA PKCS#1 v1.5" : algorithm.name;
    return algorithm.hash ? `${name} with ${algorithm.hash.name}` : name;
  };

  const generalNamesToStrings = (names: readonly x509.GeneralName[]): string[] =>
    names.map((name) => `${GENERAL_NAME_LABELS[name.type] ?? name.type}: ${name.value}`);

  const describeExtension = (extension: x509.Extension): ExtensionInfo => {
    const info: ExtensionInfo = {
      name: OID_NAMES[extension.type] ?? "Unknown Extension",
      oid: extension.type,
      critical: extension.critical,
      values: [],
    };

    if (extension instanceof x509.SubjectAlternativeNameExtension) {
      info.values = generalNamesToStrings(extension.names.items);
    } else if (extension instanceof x509.KeyUsagesExtension) {
      info.values = KEY_USAGE_NAMES.filter(([flag]) => (extension.usages & flag) === flag).map(
        ([, name]) => name,
      );
    } else if (extension instanceof x509.ExtendedKeyUsageExtension) {
      info.values = extension.usages.map((usage) => oidName(String(usage)));
    } else if (extension instanceof x509.BasicConstraintsExtension) {
      info.values = [
        `CA: ${extension.ca ? "TRUE" : "FALSE"}`,
        ...(extension.pathLength !== undefined ? [`Path Length: ${extension.pathLength}`] : []),
      ];
    } else if (extension instanceof x509.SubjectKeyIdentifierExtension) {
      info.values = [formatHexString(extension.keyId)];
    } else if (extension instanceof x509.AuthorityKeyIdentifierExtension) {
      info.values = extension.keyId ? [`Key ID: ${formatHexString(extension.keyId)}`] : [];
      if (extension.certId) info.values.push(`Serial: ${formatHexString(extension.certId.serialNumber)}`);
    } else if (extension instanceof x509.AuthorityInfoAccessExtension) {
      info.values = [
        ...extension.ocsp.map((name) => `OCSP: ${name.value}`),
        ...extension.caIssuers.map((name) => `CA Issuers: ${name.value}`),
        ...extension.caRepository.map((name) => `CA Repository: ${name.value}`),
        ...extension.timeStamping.map((name) => `Time Stamping: ${name.value}`),
      ];
    } else if (extension instanceof x509.CRLDistributionPointsExtension) {
      info.values = extension.distributionPoints.flatMap((point) =>
        (point.distributionPoint?.fullName ?? []).map((name) =>
          name.uniformResourceIdentifier ? `URI: ${name.uniformResourceIdentifier}` : JSON.stringify(name),
        ),
      );
    } else if (extension instanceof x509.CertificatePolicyExtension) {
      info.values = extension.policies.map(oidName);
    } else if (extension instanceof x509.IssuerAlternativeNameExtension) {
      info.values = generalNamesToStrings(extension.names.items);
    } else {
      const bytes = new Uint8Array(extension.value);
      const preview = toHex(bytes.slice(0, 48));
      info.values = [bytes.length > 48 ? `${preview}… (${bytes.length} bytes)` : preview];
    }

    return info;
  };

  const getValidity = (cert: x509.X509Certificate): DecodedItem["validity"] => {
    const now = Date.now();
    const status: ValidityStatus =
      now < cert.notBefore.getTime() ? "notYetValid" : now > cert.notAfter.getTime() ? "expired" : "valid";
    const daysLeft = Math.floor((cert.notAfter.getTime() - now) / 86_400_000);
    return { notBefore: cert.notBefore, notAfter: cert.notAfter, status, daysLeft };
  };

  const decodeCertificate = async (cert: x509.X509Certificate): Promise<DecodedItem> => {
    const [sha1, sha256, spki] = await Promise.all([
      cert.getThumbprint("SHA-1"),
      cert.getThumbprint("SHA-256"),
      cert.publicKey.getThumbprint("SHA-256"),
    ]);
    const selfSigned = await cert.isSelfSigned().catch(() => false);
    const commonName = cert.subjectName.getField("CN")[0];

    return {
      kind: "certificate",
      title: commonName || cert.subject || "Certificate",
      fields: [
        { label: "Subject", value: cert.subject },
        { label: "Issuer", value: cert.issuer },
        { label: "Serial Number", value: formatHexString(cert.serialNumber), mono: true },
        { label: "Not Before", value: formatDate(cert.notBefore) },
        { label: "Not After", value: formatDate(cert.notAfter) },
        { label: "Public Key", value: describeKey(cert.publicKey) },
        { label: "Signature Algorithm", value: describeSignature(cert.signatureAlgorithm) },
        { label: "SHA-256 Fingerprint", value: toHex(sha256), mono: true },
        { label: "SHA-1 Fingerprint", value: toHex(sha1), mono: true },
        { label: "SPKI SHA-256 (pin)", value: btoa(String.fromCharCode(...new Uint8Array(spki))), mono: true },
      ],
      extensions: cert.extensions.map(describeExtension),
      validity: getValidity(cert),
      selfSigned,
      pem: cert.toString("pem"),
      text: cert.toString("text"),
    };
  };

  const decodeCsr = async (csr: x509.Pkcs10CertificateRequest): Promise<DecodedItem> => {
    const signatureValid = await csr.verify().catch(() => false);
    const commonName = csr.subjectName.getField("CN")[0];
    return {
      kind: "csr",
      title: commonName || csr.subject || "Certificate Request",
      fields: [
        { label: "Subject", value: csr.subject || "(empty)" },
        { label: "Public Key", value: describeKey(csr.publicKey) },
        { label: "Signature Algorithm", value: describeSignature(csr.signatureAlgorithm) },
      ],
      extensions: csr.extensions.map(describeExtension),
      signatureValid,
      pem: csr.toString("pem"),
      text: csr.toString("text"),
    };
  };

  const decodePublicKey = async (key: x509.PublicKey): Promise<DecodedItem> => {
    const [sha256, keyId] = await Promise.all([key.getThumbprint("SHA-256"), key.getKeyIdentifier()]);
    return {
      kind: "publicKey",
      title: describeKey(key),
      fields: [
        { label: "Algorithm", value: describeKey(key) },
        { label: "SHA-256 Fingerprint", value: toHex(sha256), mono: true },
        { label: "SPKI SHA-256 (pin)", value: btoa(String.fromCharCode(...new Uint8Array(sha256))), mono: true },
        { label: "Key Identifier (SHA-1)", value: toHex(keyId), mono: true },
      ],
      extensions: [],
      pem: key.toString("pem"),
      text: key.toString("text"),
    };
  };

  const parseDer = (raw: ArrayBuffer, hint?: string): x509.X509Certificate | x509.Pkcs10CertificateRequest | x509.PublicKey => {
    const tag = hint?.toUpperCase() ?? "";
    if (tag.includes("PRIVATE KEY")) {
      throw new Error("Private keys are not decoded here to keep them safe. Paste the certificate or public key instead.");
    }
    if (tag.includes("CERTIFICATE REQUEST")) return new x509.Pkcs10CertificateRequest(raw);
    if (tag === "PUBLIC KEY") return new x509.PublicKey(raw);
    if (tag.includes("CERTIFICATE")) return new x509.X509Certificate(raw);

    const parsers = [
      () => new x509.X509Certificate(raw),
      () => new x509.Pkcs10CertificateRequest(raw),
      () => new x509.PublicKey(raw),
    ];
    for (const parse of parsers) {
      try {
        return parse();
      } catch {
        // try next format
      }
    }
    throw new Error("Unrecognized data. Expected an X.509 certificate, CSR (PKCS#10), or public key.");
  };

  const base64ToBuffer = (value: string): ArrayBuffer => {
    const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
  };

  const parseInput = (text: string): (x509.X509Certificate | x509.Pkcs10CertificateRequest | x509.PublicKey)[] => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (trimmed.includes("-----BEGIN")) {
      const blocks = [...trimmed.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)];
      if (blocks.length === 0) throw new Error("Malformed PEM: missing matching END line.");
      return blocks.map(([, tag, body]) => {
        const base64Body = body
          .split(/\r?\n/)
          .filter((line) => line.trim() && !line.includes(":"))
          .join("");
        return parseDer(base64ToBuffer(base64Body), tag);
      });
    }

    if (/^[A-Za-z0-9+/=_\-\s]+$/.test(trimmed)) {
      return [parseDer(base64ToBuffer(trimmed))];
    }

    throw new Error("Input must be PEM text or Base64-encoded DER.");
  };

  const linkChain = async (
    parsed: (x509.X509Certificate | x509.Pkcs10CertificateRequest | x509.PublicKey)[],
    decoded: DecodedItem[],
  ): Promise<void> => {
    for (let i = 0; i < parsed.length; i++) {
      const cert = parsed[i];
      if (!(cert instanceof x509.X509Certificate) || decoded[i].selfSigned) continue;
      const issuerIndex = parsed.findIndex(
        (candidate, j) => j !== i && candidate instanceof x509.X509Certificate && candidate.subject === cert.issuer,
      );
      if (issuerIndex === -1) continue;
      const issuer = parsed[issuerIndex] as x509.X509Certificate;
      const signatureValid = await cert
        .verify({ publicKey: issuer.publicKey, signatureOnly: true })
        .catch(() => false);
      decoded[i].chain = { issuerIndex, signatureValid };
    }
  };

  const decode = async (text: string): Promise<void> => {
    const token = ++decodeToken;
    error = "";
    if (!text.trim()) {
      items = [];
      return;
    }

    isDecoding = true;
    try {
      const parsed = parseInput(text);
      const decoded = await Promise.all(
        parsed.map((entry) => {
          if (entry instanceof x509.X509Certificate) return decodeCertificate(entry);
          if (entry instanceof x509.Pkcs10CertificateRequest) return decodeCsr(entry);
          return decodePublicKey(entry);
        }),
      );
      await linkChain(parsed, decoded);
      if (token !== decodeToken) return;
      items = decoded;
      expandedText = {};
    } catch (e) {
      if (token !== decodeToken) return;
      items = [];
      error = e instanceof Error ? e.message : "Failed to decode input";
    } finally {
      if (token === decodeToken) isDecoding = false;
    }
  };

  $effect(() => {
    decode(input);
  });

  const loadFile = async (file: File): Promise<void> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const asText = new TextDecoder().decode(bytes);
    if (asText.includes("-----BEGIN")) {
      input = asText;
      return;
    }
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    input = btoa(binary);
  };

  const handleFileChange = (event: Event): void => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) loadFile(file);
    (event.target as HTMLInputElement).value = "";
  };

  const handleDrop = (event: DragEvent): void => {
    event.preventDefault();
    isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  };

  const handlePaste = async (): Promise<void> => {
    input = await navigator.clipboard.readText();
  };

  const handleCopy = (value: string, key: string): void => {
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const kindLabel = (kind: ItemKind): string =>
    kind === "certificate" ? "Certificate" : kind === "csr" ? "Certificate Request" : "Public Key";

  const validityLabel = (validity: NonNullable<DecodedItem["validity"]>): string => {
    if (validity.status === "expired") return `Expired ${Math.abs(validity.daysLeft)} days ago`;
    if (validity.status === "notYetValid") return "Not yet valid";
    return `Valid · ${validity.daysLeft} days left`;
  };

  const validityClass = (validity: NonNullable<DecodedItem["validity"]>): string => {
    if (validity.status !== "valid") return "bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)";
    if (validity.daysLeft < 30) return "bg-(--color-error-bg) text-(--color-error-text)";
    return "bg-(--color-diff-added-bg) text-(--color-diff-added-text)";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Decode PEM or DER encoded X.509 certificates, certificate chains, CSRs (PKCS#10), and public keys. Shows subject, issuer, validity, SANs, extensions, fingerprints, and verifies chain signatures. Everything runs in your browser.
    </p>
  </header>

  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <label for="x509-input" class="text-xs tracking-wider text-(--color-text-light) font-medium">
        PEM / Base64 DER Input
      </label>
      <div class="flex gap-3">
        <button
          onclick={() => (input = SAMPLE_PEM)}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Sample
        </button>
        <button
          onclick={() => fileInput?.click()}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Open File
        </button>
        <button
          onclick={handlePaste}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste
        </button>
        <button
          onclick={() => (input = "")}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
    <input
      bind:this={fileInput}
      type="file"
      accept=".pem,.crt,.cer,.der,.csr,.req,.pub,.key,.txt"
      class="hidden"
      onchange={handleFileChange}
    />
    <textarea
      id="x509-input"
      bind:value={input}
      ondragover={(event) => {
        event.preventDefault();
        isDragging = true;
      }}
      ondragleave={() => (isDragging = false)}
      ondrop={handleDrop}
      rows="8"
      spellcheck="false"
      placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n\nPaste one or more PEM blocks, or drop a .pem / .crt / .der / .csr file"}
      class="w-full px-3 py-2 bg-(--color-bg-alt) border text-(--color-text) outline-none font-mono text-xs resize-y {isDragging
        ? 'border-(--color-accent)'
        : 'border-(--color-border) focus:border-(--color-text-light)'}"
    ></textarea>
  </div>

  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  {#if isDecoding && items.length === 0}
    <p class="text-sm text-(--color-text-muted)">Decoding…</p>
  {/if}

  {#if items.length > 1}
    <p class="mb-3 text-xs text-(--color-text-muted)">
      Found {items.length} items.
    </p>
  {/if}

  <div class="space-y-4">
    {#each items as item, index (index)}
      <section class="border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-(--color-border)">
          <span class="text-xs font-medium tracking-wider text-(--color-text-light)">
            #{index + 1} · {kindLabel(item.kind)}
          </span>
          <h2 class="text-sm font-semibold text-(--color-text) break-all flex-1 min-w-0">{item.title}</h2>
          {#if item.validity}
            <span class="px-2 py-0.5 text-xs font-medium {validityClass(item.validity)}">
              {validityLabel(item.validity)}
            </span>
          {/if}
          {#if item.selfSigned}
            <span class="px-2 py-0.5 text-xs font-medium bg-(--color-border) text-(--color-text-muted)">Self-signed</span>
          {/if}
          {#if item.signatureValid !== undefined}
            <span
              class="px-2 py-0.5 text-xs font-medium {item.signatureValid
                ? 'bg-(--color-diff-added-bg) text-(--color-diff-added-text)'
                : 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)'}"
            >
              {item.signatureValid ? "Signature valid" : "Signature invalid"}
            </span>
          {/if}
          {#if item.chain}
            <span
              class="px-2 py-0.5 text-xs font-medium {item.chain.signatureValid
                ? 'bg-(--color-diff-added-bg) text-(--color-diff-added-text)'
                : 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)'}"
              title="Signature checked against the public key of item #{item.chain.issuerIndex + 1}"
            >
              {item.chain.signatureValid ? "Signed by" : "NOT signed by"} #{item.chain.issuerIndex + 1}
            </span>
          {/if}
        </div>

        <dl class="divide-y divide-(--color-border)">
          {#each item.fields as field (field.label)}
            <div class="grid grid-cols-1 sm:grid-cols-[12rem_1fr_auto] gap-1 sm:gap-3 px-4 py-2 items-start">
              <dt class="text-xs text-(--color-text-light) pt-0.5">{field.label}</dt>
              <dd class="text-sm text-(--color-text) break-all {field.mono ? 'font-mono text-xs pt-0.5' : ''}">
                {field.value}
              </dd>
              <button
                onclick={() => handleCopy(field.value, `${index}-${field.label}`)}
                class="justify-self-start text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedKey === `${index}-${field.label}` ? "Copied!" : "Copy"}
              </button>
            </div>
          {/each}
        </dl>

        {#if item.extensions.length > 0}
          <div class="border-t border-(--color-border) px-4 py-3">
            <h3 class="text-xs font-medium tracking-wider text-(--color-text-light) mb-2">
              Extensions ({item.extensions.length})
            </h3>
            <div class="space-y-2">
              {#each item.extensions as extension, extensionIndex (extensionIndex)}
                <div class="border border-(--color-border) bg-(--color-bg) px-3 py-2">
                  <div class="flex flex-wrap items-baseline gap-2">
                    <span class="text-sm font-medium text-(--color-text)">{extension.name}</span>
                    <span class="text-xs font-mono text-(--color-text-light)">{extension.oid}</span>
                    {#if extension.critical}
                      <span class="text-xs font-medium text-(--color-error-text)">critical</span>
                    {/if}
                  </div>
                  {#if extension.values.length > 0}
                    <ul class="mt-1 space-y-0.5">
                      {#each extension.values as value, valueIndex (valueIndex)}
                        <li class="text-xs font-mono text-(--color-text-muted) break-all">{value}</li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="border-t border-(--color-border) px-4 py-2 flex flex-wrap gap-4">
          <button
            onclick={() => (expandedText[index] = !expandedText[index])}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {expandedText[index] ? "Hide" : "Show"} text dump
          </button>
          <button
            onclick={() => handleCopy(item.text, `${index}-text`)}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedKey === `${index}-text` ? "Copied!" : "Copy text"}
          </button>
          <button
            onclick={() => handleCopy(item.pem, `${index}-pem`)}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedKey === `${index}-pem` ? "Copied!" : "Copy PEM"}
          </button>
        </div>

        {#if expandedText[index]}
          <pre class="border-t border-(--color-border) px-4 py-3 text-xs font-mono text-(--color-text) bg-(--color-bg) overflow-x-auto whitespace-pre">{item.text}</pre>
        {/if}
      </section>
    {/each}
  </div>
</div>
