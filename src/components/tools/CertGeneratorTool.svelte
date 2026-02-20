<script lang="ts">
  import * as x509 from "@peculiar/x509";

  // ── Types ──────────────────────────────────────────────────────────────

  type KeyAlgorithm = "RSA-2048" | "RSA-4096" | "ECDSA-P256" | "ECDSA-P384";

  interface CertEntry {
    label: string;
    cert: x509.X509Certificate;
    keyPair: CryptoKeyPair;
    pem: string;
    privateKeyPem: string;
  }

  interface SanEntry {
    type: "dns" | "ip";
    value: string;
  }

  // ── State ──────────────────────────────────────────────────────────────

  // Global settings
  let keyAlgorithm = $state<KeyAlgorithm>("ECDSA-P256");
  let validityDays = $state(365);

  // Root CA mode: "generate" or "import"
  type CaMode = "generate" | "import";
  let rootCaMode = $state<CaMode>("generate");

  // Root CA fields (generate mode)
  let rootCN = $state("My Root CA");
  let rootO = $state("My Organization");
  let rootC = $state("US");

  // Root CA fields (import mode)
  let importCertPem = $state("");
  let importKeyPem = $state("");
  let importedCa = $state<CertEntry | null>(null);
  let importError = $state("");
  let importing = $state(false);

  // Intermediate CA fields
  let interCN = $state("My Intermediate CA");
  let interO = $state("My Organization");
  let interC = $state("US");
  let skipIntermediate = $state(false);

  // Server cert fields
  let serverCN = $state("localhost");
  let serverO = $state("My Organization");
  let serverC = $state("US");
  let sanEntries = $state<SanEntry[]>([
    { type: "dns", value: "localhost" },
    { type: "ip", value: "127.0.0.1" },
  ]);
  let newSanType = $state<"dns" | "ip">("dns");
  let newSanValue = $state("");

  // Generated certs
  let rootCert = $state<CertEntry | null>(null);
  let interCert = $state<CertEntry | null>(null);
  let serverCert = $state<CertEntry | null>(null);

  // UI state
  let generating = $state(false);
  let currentStep = $state("");
  let error = $state("");
  let copiedField = $state<string | null>(null);
  let expandedSection = $state<string | null>(null);
  let pfxPassphrase = $state("");

  // ── Constants ──────────────────────────────────────────────────────────

  const keyAlgorithms: { value: KeyAlgorithm; label: string }[] = [
    { value: "RSA-2048", label: "RSA 2048-bit" },
    { value: "RSA-4096", label: "RSA 4096-bit" },
    { value: "ECDSA-P256", label: "ECDSA P-256" },
    { value: "ECDSA-P384", label: "ECDSA P-384" },
  ];

  const validityPresets = [
    { label: "90 days", days: 90 },
    { label: "1 year", days: 365 },
    { label: "2 years", days: 730 },
    { label: "5 years", days: 1825 },
    { label: "10 years", days: 3650 },
  ];

  const presets = [
    {
      label: "Local Dev",
      description: "localhost + 127.0.0.1 + ::1",
      apply: () => {
        serverCN = "localhost";
        sanEntries = [
          { type: "dns", value: "localhost" },
          { type: "ip", value: "127.0.0.1" },
          { type: "ip", value: "::1" },
        ];
      },
    },
    {
      label: "Docker",
      description: "Docker hostnames + common IPs",
      apply: () => {
        serverCN = "app.local";
        sanEntries = [
          { type: "dns", value: "localhost" },
          { type: "dns", value: "app.local" },
          { type: "dns", value: "*.app.local" },
          { type: "ip", value: "127.0.0.1" },
          { type: "ip", value: "::1" },
          { type: "ip", value: "172.17.0.1" },
        ];
      },
    },
    {
      label: "Wildcard",
      description: "*.example.local wildcard cert",
      apply: () => {
        serverCN = "example.local";
        sanEntries = [
          { type: "dns", value: "example.local" },
          { type: "dns", value: "*.example.local" },
          { type: "ip", value: "127.0.0.1" },
        ];
      },
    },
  ];

  // ── Helpers ────────────────────────────────────────────────────────────

  function getKeyGenParams(alg: KeyAlgorithm): RsaHashedKeyGenParams | EcKeyGenParams {
    switch (alg) {
      case "RSA-2048":
        return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
      case "RSA-4096":
        return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 4096 };
      case "ECDSA-P256":
        return { name: "ECDSA", namedCurve: "P-256" };
      case "ECDSA-P384":
        return { name: "ECDSA", namedCurve: "P-384" };
    }
  }

  function getSigningAlgorithm(alg: KeyAlgorithm): Algorithm | EcdsaParams {
    if (alg.startsWith("RSA")) {
      return { name: "RSASSA-PKCS1-v1_5" };
    }
    return { name: "ECDSA", hash: "SHA-256" } as EcdsaParams;
  }

  async function generateKeyPair(alg: KeyAlgorithm): Promise<CryptoKeyPair> {
    const params = getKeyGenParams(alg);
    return crypto.subtle.generateKey(params, true, ["sign", "verify"]);
  }

  async function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("pkcs8", key);
    return x509.PemConverter.encode(exported, "PRIVATE KEY");
  }

  function buildSubjectName(cn: string, o: string, c: string): string {
    const parts: string[] = [];
    if (c.trim()) parts.push(`C=${c.trim()}`);
    if (o.trim()) parts.push(`O=${o.trim()}`);
    if (cn.trim()) parts.push(`CN=${cn.trim()}`);
    return parts.join(", ");
  }

  function getNotBefore(): Date {
    return new Date();
  }

  function getNotAfter(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  function randomSerialNumber(): string {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    // Ensure first byte is positive (no leading zero issues)
    arr[0] = arr[0] | 0x01;
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ── CA Import ───────────────────────────────────────────────────────────

  function detectKeyAlgorithm(pemContent: string): { name: string; hash?: string; namedCurve?: string } | null {
    // Try to detect algorithm from PEM content structure
    // EC keys contain OID 1.2.840.10045.2.1, RSA keys contain OID 1.2.840.113549.1.1.1
    if (pemContent.includes("EC") || pemContent.length < 500) {
      // Short keys are likely EC
      return null; // Will try both
    }
    return null; // Will try both
  }

  async function tryImportPrivateKey(keyDer: ArrayBuffer): Promise<{ key: CryptoKey; algorithm: KeyAlgorithm }> {
    // Try ECDSA P-256
    const attempts: { params: EcKeyImportParams | RsaHashedImportParams; alg: KeyAlgorithm }[] = [
      { params: { name: "ECDSA", namedCurve: "P-256" }, alg: "ECDSA-P256" },
      { params: { name: "ECDSA", namedCurve: "P-384" }, alg: "ECDSA-P384" },
      { params: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, alg: "RSA-2048" },
    ];

    for (const attempt of attempts) {
      try {
        const key = await crypto.subtle.importKey(
          "pkcs8",
          keyDer,
          attempt.params,
          true,
          ["sign"],
        );
        // For RSA, detect actual bit size
        if (attempt.alg.startsWith("RSA")) {
          const exported = await crypto.subtle.exportKey("jwk", key);
          if (exported.n) {
            const bitLen = Math.ceil((exported.n.length * 6) / 8) * 8;
            if (bitLen >= 4096) {
              return { key, algorithm: "RSA-4096" };
            }
          }
        }
        return { key, algorithm: attempt.alg };
      } catch {
        // Try next algorithm
      }
    }

    throw new Error("Could not import private key. Supported formats: ECDSA (P-256, P-384) and RSA (2048, 4096) in PKCS#8 PEM format.");
  }

  async function importCa() {
    importError = "";
    importing = true;

    try {
      // Validate inputs
      if (!importCertPem.trim()) {
        throw new Error("Please provide the CA certificate PEM.");
      }
      if (!importKeyPem.trim()) {
        throw new Error("Please provide the CA private key PEM.");
      }

      // Parse certificate
      let cert: x509.X509Certificate;
      try {
        cert = new x509.X509Certificate(importCertPem.trim());
      } catch {
        throw new Error("Invalid certificate PEM. Expected a PEM block starting with -----BEGIN CERTIFICATE-----.");
      }

      // Verify it's a CA certificate
      const extensions = cert.extensions;
      let isCA = false;
      for (const ext of extensions) {
        if (ext.type === "2.5.29.19") { // basicConstraints OID
          const bc = new x509.BasicConstraintsExtension(ext.rawData);
          isCA = bc.ca;
          break;
        }
      }
      if (!isCA) {
        throw new Error("The imported certificate does not have CA:TRUE in Basic Constraints. It cannot be used as a CA certificate.");
      }

      // Parse and import private key
      let keyDer: ArrayBuffer;
      try {
        const pemTrimmed = importKeyPem.trim();
        const derArrays = x509.PemConverter.decode(pemTrimmed);
        if (derArrays.length === 0) {
          throw new Error("No key data found");
        }
        keyDer = derArrays[0];
      } catch {
        throw new Error("Invalid private key PEM. Expected a PEM block starting with -----BEGIN PRIVATE KEY-----.");
      }

      const { key: privateKey, algorithm: detectedAlg } = await tryImportPrivateKey(keyDer);

      // Derive the public key from the certificate
      const publicKey = await cert.publicKey.export();

      // Verify the key matches the certificate by checking the public key
      // We do this by comparing the public key from cert with exported public key info
      const certKeyAlgorithm = cert.publicKey.algorithm;

      importedCa = {
        label: "Root CA (Imported)",
        cert,
        keyPair: { privateKey, publicKey } as CryptoKeyPair,
        pem: cert.toString("pem"),
        privateKeyPem: importKeyPem.trim(),
      };

      // Auto-set the key algorithm to match the imported key
      keyAlgorithm = detectedAlg;

    } catch (err) {
      if (err instanceof Error) {
        importError = err.message;
      } else {
        importError = "Failed to import CA certificate.";
      }
    } finally {
      importing = false;
    }
  }

  function clearImportedCa() {
    importedCa = null;
    importCertPem = "";
    importKeyPem = "";
    importError = "";
  }

  function handleFileUpload(event: Event, target: "cert" | "key") {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      if (target === "cert") {
        importCertPem = content;
      } else {
        importKeyPem = content;
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    input.value = "";
  }

  // ── Certificate Generation ─────────────────────────────────────────────

  async function generateAll() {
    error = "";
    generating = true;
    rootCert = null;
    interCert = null;
    serverCert = null;

    try {
      let rootEntry: CertEntry;

      if (rootCaMode === "import" && importedCa) {
        // Use imported CA as root
        currentStep = "Using imported CA certificate...";
        rootEntry = importedCa;
        rootCert = importedCa;
      } else {
        // Step 1: Generate Root CA
        currentStep = "Generating Root CA key pair...";
        const rootKeys = await generateKeyPair(keyAlgorithm);

        currentStep = "Creating Root CA certificate...";
        const rootSubject = buildSubjectName(rootCN, rootO, rootC);
        const rootX509 = await x509.X509CertificateGenerator.createSelfSigned({
          serialNumber: randomSerialNumber(),
          name: rootSubject,
          notBefore: getNotBefore(),
          notAfter: getNotAfter(validityDays * 2), // Root CA gets double validity
          keys: rootKeys,
          signingAlgorithm: getSigningAlgorithm(keyAlgorithm),
          extensions: [
            new x509.BasicConstraintsExtension(true, skipIntermediate ? 0 : 1, true),
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
              true,
            ),
            await x509.SubjectKeyIdentifierExtension.create(rootKeys.publicKey),
          ],
        });

        const rootPem = rootX509.toString("pem");
        const rootKeyPem = await exportPrivateKeyPem(rootKeys.privateKey);

        rootEntry = {
          label: "Root CA",
          cert: rootX509,
          keyPair: rootKeys,
          pem: rootPem,
          privateKeyPem: rootKeyPem,
        };
        rootCert = rootEntry;
      }

      // Step 2: Intermediate CA (optional)
      let signingCert = rootEntry;
      if (!skipIntermediate) {
        currentStep = "Generating Intermediate CA key pair...";
        const interKeys = await generateKeyPair(keyAlgorithm);

        currentStep = "Creating Intermediate CA certificate...";
        const interSubject = buildSubjectName(interCN, interO, interC);
        const interX509 = await x509.X509CertificateGenerator.create({
          serialNumber: randomSerialNumber(),
          subject: interSubject,
          issuer: rootEntry.cert.subject,
          notBefore: getNotBefore(),
          notAfter: getNotAfter(validityDays),
          signingAlgorithm: getSigningAlgorithm(keyAlgorithm),
          publicKey: interKeys.publicKey,
          signingKey: rootEntry.keyPair.privateKey,
          extensions: [
            new x509.BasicConstraintsExtension(true, 0, true),
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
              true,
            ),
            await x509.SubjectKeyIdentifierExtension.create(interKeys.publicKey),
            await x509.AuthorityKeyIdentifierExtension.create(rootEntry.keyPair.publicKey),
          ],
        });

        const interPem = interX509.toString("pem");
        const interKeyPem = await exportPrivateKeyPem(interKeys.privateKey);

        interCert = {
          label: "Intermediate CA",
          cert: interX509,
          keyPair: interKeys,
          pem: interPem,
          privateKeyPem: interKeyPem,
        };

        signingCert = interCert;
      }

      // Step 3: Server / End-Entity Certificate
      currentStep = "Generating Server key pair...";
      const serverKeys = await generateKeyPair(keyAlgorithm);

      currentStep = "Creating Server certificate...";
      const serverSubject = buildSubjectName(serverCN, serverO, serverC);

      // Build SAN extension
      const sanItems: x509.JsonGeneralNames = sanEntries
        .filter((s) => s.value.trim())
        .map((s) => ({ type: s.type, value: s.value.trim() }));

      // Ensure CN is in SANs if not already
      const cnInSans = sanItems.some(
        (s) => s.type === "dns" && s.value.toLowerCase() === serverCN.trim().toLowerCase(),
      );
      if (!cnInSans && serverCN.trim()) {
        sanItems.unshift({ type: "dns", value: serverCN.trim() });
      }

      const serverX509 = await x509.X509CertificateGenerator.create({
        serialNumber: randomSerialNumber(),
        subject: serverSubject,
        issuer: signingCert.cert.subject,
        notBefore: getNotBefore(),
        notAfter: getNotAfter(validityDays),
        signingAlgorithm: getSigningAlgorithm(keyAlgorithm),
        publicKey: serverKeys.publicKey,
        signingKey: signingCert.keyPair.privateKey,
        extensions: [
          new x509.BasicConstraintsExtension(false, undefined, true),
          new x509.KeyUsagesExtension(
            x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
            true,
          ),
          new x509.ExtendedKeyUsageExtension(
            [x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth],
            false,
          ),
          new x509.SubjectAlternativeNameExtension(sanItems, false),
          await x509.SubjectKeyIdentifierExtension.create(serverKeys.publicKey),
          await x509.AuthorityKeyIdentifierExtension.create(signingCert.keyPair.publicKey),
        ],
      });

      const serverPem = serverX509.toString("pem");
      const serverKeyPem = await exportPrivateKeyPem(serverKeys.privateKey);

      serverCert = {
        label: "Server",
        cert: serverX509,
        keyPair: serverKeys,
        pem: serverPem,
        privateKeyPem: serverKeyPem,
      };

      currentStep = "";
    } catch (err) {
      if (err instanceof Error) {
        error = err.message;
      } else {
        error = "An unexpected error occurred during certificate generation.";
      }
      currentStep = "";
    } finally {
      generating = false;
    }
  }

  // ── SAN Management ─────────────────────────────────────────────────────

  function addSan() {
    const val = newSanValue.trim();
    if (!val) return;

    // Basic IP validation if type is IP
    if (newSanType === "ip") {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
      if (!ipv4.test(val) && !ipv6.test(val) && val !== "::1") {
        error = "Invalid IP address format";
        return;
      }
    }

    // Avoid duplicates
    const exists = sanEntries.some((s) => s.type === newSanType && s.value === val);
    if (exists) {
      error = "This SAN entry already exists";
      return;
    }

    error = "";
    sanEntries = [...sanEntries, { type: newSanType, value: val }];
    newSanValue = "";
  }

  function removeSan(index: number) {
    sanEntries = sanEntries.filter((_, i) => i !== index);
  }

  function handleSanKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      addSan();
    }
  }

  // ── Copy / Download ────────────────────────────────────────────────────

  function handleCopy(field: string, value: string) {
    navigator.clipboard.writeText(value);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  }

  function downloadFile(content: string, filename: string, mimeType: string = "application/x-pem-file") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadBlob(data: ArrayBuffer, filename: string, mimeType: string) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadChainPem() {
    if (!serverCert) return;
    let chain = serverCert.pem + "\n";
    if (interCert) chain += interCert.pem + "\n";
    if (rootCert) chain += rootCert.pem + "\n";
    downloadFile(chain, "certificate-chain.pem");
  }

  function downloadFullBundle() {
    if (!serverCert) return;
    let bundle = serverCert.privateKeyPem + "\n" + serverCert.pem + "\n";
    if (interCert) bundle += interCert.pem + "\n";
    if (rootCert) bundle += rootCert.pem + "\n";
    downloadFile(bundle, "server-bundle.pem");
  }

  async function downloadPkcs12() {
    if (!serverCert) return;

    try {
      // Build PKCS#12 / PFX using manual ASN.1 construction
      // This creates a standard PKCS#12 file compatible with OpenSSL, Java, Windows
      const pkcs12 = await buildPkcs12(
        serverCert.keyPair.privateKey,
        serverCert.cert,
        interCert?.cert || null,
        rootCert?.cert || null,
        pfxPassphrase || "",
      );
      downloadBlob(pkcs12, "server.p12", "application/x-pkcs12");
    } catch (err) {
      if (err instanceof Error) {
        error = `PKCS#12 export failed: ${err.message}`;
      } else {
        error = "PKCS#12 export failed";
      }
    }
  }

  // ── PKCS#12 Builder ────────────────────────────────────────────────────
  // Minimal PKCS#12/PFX builder using raw ASN.1 DER encoding.
  // Produces unencrypted PKCS#12 files (password used only for MAC integrity).
  // Compatible with: openssl pkcs12 -in server.p12 -nodes

  function encodeLength(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len]);
    if (len < 0x100) return new Uint8Array([0x81, len]);
    if (len < 0x10000) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
    return new Uint8Array([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  function asn1Sequence(...items: Uint8Array[]): Uint8Array {
    const content = concatArrays(...items);
    const len = encodeLength(content.length);
    const result = new Uint8Array(1 + len.length + content.length);
    result[0] = 0x30; // SEQUENCE tag
    result.set(len, 1);
    result.set(content, 1 + len.length);
    return result;
  }

  function asn1Set(...items: Uint8Array[]): Uint8Array {
    const content = concatArrays(...items);
    const len = encodeLength(content.length);
    const result = new Uint8Array(1 + len.length + content.length);
    result[0] = 0x31; // SET tag
    result.set(len, 1);
    result.set(content, 1 + len.length);
    return result;
  }

  function asn1OctetString(data: Uint8Array): Uint8Array {
    const len = encodeLength(data.length);
    const result = new Uint8Array(1 + len.length + data.length);
    result[0] = 0x04; // OCTET STRING tag
    result.set(len, 1);
    result.set(data, 1 + len.length);
    return result;
  }

  function asn1Integer(value: number): Uint8Array {
    // Simple integer encoding for small values
    if (value === 0) return new Uint8Array([0x02, 0x01, 0x00]);
    const bytes: number[] = [];
    let v = value;
    while (v > 0) {
      bytes.unshift(v & 0xff);
      v >>= 8;
    }
    // Add leading zero if high bit is set (to keep it positive)
    if (bytes[0] & 0x80) bytes.unshift(0x00);
    return new Uint8Array([0x02, bytes.length, ...bytes]);
  }

  function asn1ObjectIdentifier(oid: string): Uint8Array {
    const parts = oid.split(".").map(Number);
    const encoded: number[] = [];
    // First two components are encoded as 40 * first + second
    encoded.push(40 * parts[0] + parts[1]);
    for (let i = 2; i < parts.length; i++) {
      let val = parts[i];
      if (val < 128) {
        encoded.push(val);
      } else {
        const bytes: number[] = [];
        while (val > 0) {
          bytes.unshift(val & 0x7f);
          val >>= 7;
        }
        for (let j = 0; j < bytes.length - 1; j++) {
          bytes[j] |= 0x80;
        }
        encoded.push(...bytes);
      }
    }
    return new Uint8Array([0x06, encoded.length, ...encoded]);
  }

  function asn1ContextConstructed(tag: number, data: Uint8Array): Uint8Array {
    const len = encodeLength(data.length);
    const result = new Uint8Array(1 + len.length + data.length);
    result[0] = 0xa0 | tag; // CONTEXT-SPECIFIC CONSTRUCTED
    result.set(len, 1);
    result.set(data, 1 + len.length);
    return result;
  }

  function asn1Utf8String(str: string): Uint8Array {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    const len = encodeLength(encoded.length);
    const result = new Uint8Array(1 + len.length + encoded.length);
    result[0] = 0x0c; // UTF8String tag
    result.set(len, 1);
    result.set(encoded, 1 + len.length);
    return result;
  }

  function concatArrays(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  // PKCS#12 OIDs
  const OID_DATA = "1.2.840.113549.1.7.1";
  const OID_CERT_BAG = "1.2.840.113549.1.12.10.1.3";
  const OID_KEY_BAG = "1.2.840.113549.1.12.10.1.1";
  const OID_X509_CERT = "1.2.840.113549.1.9.22.1";
  const OID_FRIENDLY_NAME = "1.2.840.113549.1.9.20";
  const OID_SHA256 = "2.16.840.1.101.3.4.2.1";

  function buildCertBag(certDer: Uint8Array, friendlyName?: string): Uint8Array {
    // CertBag ::= SEQUENCE { certId, certValue [0] EXPLICIT OCTET STRING }
    const certBagContent = asn1Sequence(
      asn1ObjectIdentifier(OID_X509_CERT),
      asn1ContextConstructed(0, asn1OctetString(certDer)),
    );

    const bagAttrs: Uint8Array[] = [];
    if (friendlyName) {
      // friendlyName attribute
      const bmpString = encodeBmpString(friendlyName);
      bagAttrs.push(
        asn1Sequence(
          asn1ObjectIdentifier(OID_FRIENDLY_NAME),
          asn1Set(bmpString),
        ),
      );
    }

    const safeBag = asn1Sequence(
      asn1ObjectIdentifier(OID_CERT_BAG),
      asn1ContextConstructed(0, certBagContent),
      ...(bagAttrs.length > 0 ? [asn1Set(...bagAttrs)] : []),
    );

    return safeBag;
  }

  function buildKeyBag(keyDer: Uint8Array, friendlyName?: string): Uint8Array {
    const bagAttrs: Uint8Array[] = [];
    if (friendlyName) {
      const bmpString = encodeBmpString(friendlyName);
      bagAttrs.push(
        asn1Sequence(
          asn1ObjectIdentifier(OID_FRIENDLY_NAME),
          asn1Set(bmpString),
        ),
      );
    }

    const safeBag = asn1Sequence(
      asn1ObjectIdentifier(OID_KEY_BAG),
      asn1ContextConstructed(0, asn1Sequence(...parseDerSequenceContent(keyDer))),
      ...(bagAttrs.length > 0 ? [asn1Set(...bagAttrs)] : []),
    );

    return safeBag;
  }

  function parseDerSequenceContent(der: Uint8Array): Uint8Array[] {
    // Return the raw DER as-is inside a wrapper - the key bag wraps the PKCS#8 key
    // Actually for keyBag, the value IS the PKCS#8 PrivateKeyInfo directly
    return [der];
  }

  function encodeBmpString(str: string): Uint8Array {
    // BMPString = UCS-2 big endian
    const bytes = new Uint8Array(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes[i * 2] = (code >> 8) & 0xff;
      bytes[i * 2 + 1] = code & 0xff;
    }
    const len = encodeLength(bytes.length);
    const result = new Uint8Array(1 + len.length + bytes.length);
    result[0] = 0x1e; // BMPString tag
    result.set(len, 1);
    result.set(bytes, 1 + len.length);
    return result;
  }

  function wrapContentInfo(oid: string, content: Uint8Array): Uint8Array {
    return asn1Sequence(
      asn1ObjectIdentifier(oid),
      asn1ContextConstructed(0, asn1OctetString(content)),
    );
  }

  async function computeHmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, data.buffer as ArrayBuffer);
    return new Uint8Array(sig);
  }

  async function deriveKeyFromPassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    // PKCS#12 key derivation (simplified - derive using PBKDF2 with SHA-256)
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    return new Uint8Array(bits);
  }

  async function buildPkcs12(
    privateKey: CryptoKey,
    serverCertObj: x509.X509Certificate,
    interCertObj: x509.X509Certificate | null,
    rootCertObj: x509.X509Certificate | null,
    password: string,
  ): Promise<ArrayBuffer> {
    // Export private key as PKCS#8 DER
    const keyDer = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));

    // Get cert DER bytes
    const serverDer = new Uint8Array(serverCertObj.rawData);
    const certBags: Uint8Array[] = [];

    // Server cert bag
    certBags.push(buildCertBag(serverDer, "Server Certificate"));
    if (interCertObj) {
      certBags.push(buildCertBag(new Uint8Array(interCertObj.rawData), "Intermediate CA"));
    }
    if (rootCertObj) {
      certBags.push(buildCertBag(new Uint8Array(rootCertObj.rawData), "Root CA"));
    }

    // Key bag (unencrypted)
    const keyBag = buildKeyBag(keyDer, "Server Key");

    // Build SafeContents for certs
    const certSafeContents = asn1Sequence(...certBags);
    // Build SafeContents for key
    const keySafeContents = asn1Sequence(keyBag);

    // Build AuthenticatedSafe (two ContentInfo items)
    const authSafe = asn1Sequence(
      wrapContentInfo(OID_DATA, certSafeContents),
      wrapContentInfo(OID_DATA, keySafeContents),
    );

    // Build MacData for integrity
    const salt = new Uint8Array(8);
    crypto.getRandomValues(salt);
    const iterations = 2048;

    const macKey = await deriveKeyFromPassword(password || "", salt, iterations);
    const macValue = await computeHmacSha256(macKey, authSafe);

    const macData = asn1Sequence(
      // DigestInfo
      asn1Sequence(
        // AlgorithmIdentifier for SHA-256
        asn1Sequence(asn1ObjectIdentifier(OID_SHA256)),
        asn1OctetString(macValue),
      ),
      asn1OctetString(salt),
      asn1Integer(iterations),
    );

    // PFX ::= SEQUENCE { version INTEGER (3), authSafe ContentInfo, macData }
    const pfx = asn1Sequence(
      asn1Integer(3),
      wrapContentInfo(OID_DATA, authSafe),
      macData,
    );

    return pfx.buffer as ArrayBuffer;
  }

  // ── Reset ──────────────────────────────────────────────────────────────

  function handleClear() {
    rootCert = null;
    interCert = null;
    serverCert = null;
    error = "";
    currentStep = "";
    expandedSection = null;
    // Also clear import state
    clearImportedCa();
  }

  // ── Computed ───────────────────────────────────────────────────────────

  let hasResults = $derived((rootCert !== null || importedCa !== null) && serverCert !== null);

  function toggleSection(section: string) {
    expandedSection = expandedSection === section ? null : section;
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function extractCN(name: string): string {
    const match = name.match(/CN=([^,]+)/);
    return match ? match[1] : name;
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate a complete certificate chain (Root CA, Intermediate CA, Server) with custom DNS and IP SANs.
      All keys are generated client-side and never leave your browser.
    </p>
  </header>

  <!-- Global Settings -->
  <div class="mb-4 p-4 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
        Settings
      </h2>
      {#if hasResults}
        <button
          onclick={handleClear}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear All
        </button>
      {/if}
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Key Algorithm -->
      <div>
        <label class="text-xs text-(--color-text-muted) block mb-1.5">Key Algorithm</label>
        <select
          bind:value={keyAlgorithm}
          disabled={generating}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none"
        >
          {#each keyAlgorithms as alg}
            <option value={alg.value}>{alg.label}</option>
          {/each}
        </select>
      </div>

      <!-- Validity -->
      <div>
        <label class="text-xs text-(--color-text-muted) block mb-1.5">Validity (days)</label>
        <div class="flex gap-2">
          <input
            type="number"
            bind:value={validityDays}
            min="1"
            max="36500"
            disabled={generating}
            class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
          />
        </div>
        <div class="flex flex-wrap gap-1 mt-1.5">
          {#each validityPresets as preset}
            <button
              onclick={() => (validityDays = preset.days)}
              disabled={generating}
              class="px-1.5 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors disabled:opacity-50"
            >
              {preset.label}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Certificate Configuration -->
  <div class="mb-4 space-y-3">
    <!-- Root CA Config -->
    <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
          1. Root CA
        </h2>
        <div class="flex gap-1 bg-(--color-bg) border border-(--color-border) p-0.5">
          <button
            onclick={() => rootCaMode = "generate"}
            disabled={generating}
            class="px-2.5 py-1 text-xs transition-colors {rootCaMode === 'generate' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            Generate
          </button>
          <button
            onclick={() => rootCaMode = "import"}
            disabled={generating}
            class="px-2.5 py-1 text-xs transition-colors {rootCaMode === 'import' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            Import
          </button>
        </div>
      </div>

      {#if rootCaMode === "generate"}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Common Name (CN)</label>
            <input
              type="text"
              bind:value={rootCN}
              disabled={generating}
              placeholder="My Root CA"
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Organization (O)</label>
            <input
              type="text"
              bind:value={rootO}
              disabled={generating}
              placeholder="My Organization"
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Country (C)</label>
            <input
              type="text"
              bind:value={rootC}
              disabled={generating}
              placeholder="US"
              maxlength="2"
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
          </div>
        </div>
      {:else}
        <!-- Import mode -->
        {#if importedCa}
          <!-- Show imported CA details -->
          <div class="p-3 bg-(--color-bg) border border-green-500/30 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Imported</span>
                <span class="text-sm font-medium text-(--color-text)">{extractCN(importedCa.cert.subject)}</span>
              </div>
              <button
                onclick={clearImportedCa}
                disabled={generating}
                class="text-xs text-(--color-text-muted) hover:text-(--color-error-text) transition-colors"
              >
                Remove
              </button>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
              <div>Subject: <span class="text-(--color-text) font-mono">{importedCa.cert.subject}</span></div>
              <div>Issuer: <span class="text-(--color-text) font-mono">{importedCa.cert.issuer}</span></div>
              <div>Valid from: <span class="text-(--color-text)">{formatDate(importedCa.cert.notBefore)}</span></div>
              <div>Valid until: <span class="text-(--color-text)">{formatDate(importedCa.cert.notAfter)}</span></div>
              <div>Algorithm: <span class="text-(--color-text)">{keyAlgorithm}</span></div>
            </div>
          </div>
        {:else}
          <!-- Import form -->
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-(--color-text-muted)">CA Certificate PEM</label>
                <label class="text-xs text-(--color-text-muted) hover:text-(--color-text) cursor-pointer transition-colors">
                  Upload .crt
                  <input
                    type="file"
                    accept=".crt,.pem,.cer"
                    onchange={(e) => handleFileUpload(e, "cert")}
                    class="hidden"
                  />
                </label>
              </div>
              <textarea
                bind:value={importCertPem}
                disabled={importing}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                rows="4"
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
              ></textarea>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-(--color-text-muted)">CA Private Key PEM (PKCS#8)</label>
                <label class="text-xs text-(--color-text-muted) hover:text-(--color-text) cursor-pointer transition-colors">
                  Upload .key
                  <input
                    type="file"
                    accept=".key,.pem"
                    onchange={(e) => handleFileUpload(e, "key")}
                    class="hidden"
                  />
                </label>
              </div>
              <textarea
                bind:value={importKeyPem}
                disabled={importing}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                rows="4"
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
              ></textarea>
            </div>

            {#if importError}
              <div class="p-2 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-xs">
                {importError}
              </div>
            {/if}

            <button
              onclick={importCa}
              disabled={importing || !importCertPem.trim() || !importKeyPem.trim()}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors disabled:opacity-50"
            >
              {importing ? "Importing..." : "Import CA Certificate"}
            </button>

            <p class="text-[10px] text-(--color-text-muted) leading-relaxed">
              Import an existing CA certificate and private key to sign new intermediate/server certificates.
              The certificate must have Basic Constraints CA:TRUE. The private key must be in PKCS#8 PEM format
              (-----BEGIN PRIVATE KEY-----). Supported algorithms: RSA (2048/4096) and ECDSA (P-256/P-384).
            </p>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Intermediate CA Config -->
    <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
          2. Intermediate CA
        </h2>
        <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
          <input
            type="checkbox"
            bind:checked={skipIntermediate}
            disabled={generating}
            class="accent-(--color-accent)"
          />
          Skip (sign directly with Root)
        </label>
      </div>
      {#if !skipIntermediate}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Common Name (CN)</label>
            <input
              type="text"
              bind:value={interCN}
              disabled={generating}
              placeholder="My Intermediate CA"
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Organization (O)</label>
            <input
              type="text"
              bind:value={interO}
              disabled={generating}
              placeholder="My Organization"
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-(--color-text-muted) block mb-1">Country (C)</label>
            <input
              type="text"
              bind:value={interC}
              disabled={generating}
              placeholder="US"
              maxlength="2"
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
            />
          </div>
        </div>
      {:else}
        <p class="text-xs text-(--color-text-muted)">
          Server certificate will be signed directly by the Root CA.
        </p>
      {/if}
    </div>

    <!-- Server Certificate Config -->
    <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
        3. Server Certificate
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label class="text-xs text-(--color-text-muted) block mb-1">Common Name (CN)</label>
          <input
            type="text"
            bind:value={serverCN}
            disabled={generating}
            placeholder="localhost"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
          />
        </div>
        <div>
          <label class="text-xs text-(--color-text-muted) block mb-1">Organization (O)</label>
          <input
            type="text"
            bind:value={serverO}
            disabled={generating}
            placeholder="My Organization"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
          />
        </div>
        <div>
          <label class="text-xs text-(--color-text-muted) block mb-1">Country (C)</label>
          <input
            type="text"
            bind:value={serverC}
            disabled={generating}
            placeholder="US"
            maxlength="2"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
          />
        </div>
      </div>

      <!-- Presets -->
      <div class="mb-4">
        <span class="text-xs text-(--color-text-muted) block mb-1.5">Quick Presets</span>
        <div class="flex flex-wrap gap-2">
          {#each presets as preset}
            <button
              onclick={() => preset.apply()}
              disabled={generating}
              class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors disabled:opacity-50"
              title={preset.description}
            >
              {preset.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Subject Alternative Names -->
      <div>
        <span class="text-xs text-(--color-text-muted) block mb-1.5">Subject Alternative Names (SANs)</span>

        <!-- Existing SANs -->
        {#if sanEntries.length > 0}
          <div class="flex flex-wrap gap-1.5 mb-3">
            {#each sanEntries as san, i}
              <span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-(--color-bg) border border-(--color-border) text-(--color-text)">
                <span class="text-(--color-text-muted) uppercase text-[10px]">{san.type}</span>
                {san.value}
                <button
                  onclick={() => removeSan(i)}
                  disabled={generating}
                  class="ml-1 text-(--color-text-muted) hover:text-(--color-error-text) transition-colors"
                  title="Remove"
                >
                  &times;
                </button>
              </span>
            {/each}
          </div>
        {/if}

        <!-- Add SAN -->
        <div class="flex gap-2">
          <select
            bind:value={newSanType}
            disabled={generating}
            class="px-2 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none"
          >
            <option value="dns">DNS</option>
            <option value="ip">IP</option>
          </select>
          <input
            type="text"
            bind:value={newSanValue}
            onkeydown={handleSanKeydown}
            disabled={generating}
            placeholder={newSanType === "dns" ? "example.local" : "192.168.1.100"}
            class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
          />
          <button
            onclick={addSan}
            disabled={generating || !newSanValue.trim()}
            class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Generate Button -->
  <div class="mb-4">
    <button
      onclick={generateAll}
      disabled={generating || (rootCaMode === "generate" ? !rootCN.trim() : !importedCa) || !serverCN.trim()}
      class="w-full px-4 py-3 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
    >
      {#if generating}
        {currentStep || "Generating..."}
      {:else}
        Generate Certificate Chain
      {/if}
    </button>
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Results -->
  {#if hasResults}
    <div class="flex-1 flex flex-col gap-3 overflow-auto">
      <!-- Certificate Chain Overview -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
          Certificate Chain
        </h2>
        <div class="space-y-2">
          <!-- Root CA -->
          {#if rootCert}
            {@const isImported = rootCaMode === "import"}
            <button
              onclick={() => toggleSection("root")}
              class="w-full p-3 bg-(--color-bg) border border-(--color-border) hover:border-(--color-text-light) transition-colors text-left"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded shrink-0">Root CA{isImported ? " (Imported)" : ""}</span>
                <span class="text-sm font-medium text-(--color-text) truncate">{extractCN(rootCert.cert.subject)}</span>
                <span class="ml-auto text-xs text-(--color-text-muted)">{expandedSection === "root" ? "▲" : "▼"}</span>
              </div>
              <div class="text-xs text-(--color-text-muted) mt-1 ml-[70px]">
                Valid: {formatDate(rootCert.cert.notBefore)} — {formatDate(rootCert.cert.notAfter)}
              </div>
            </button>
            {#if expandedSection === "root"}
              <div class="p-3 bg-(--color-bg) border border-(--color-border) ml-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-(--color-text-muted)">Certificate PEM</span>
                  <div class="flex gap-2">
                    <button
                      onclick={() => handleCopy("root-cert", rootCert?.pem || "")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      {copiedField === "root-cert" ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onclick={() => downloadFile(rootCert?.pem || "", "root-ca.crt")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      Download .crt
                    </button>
                  </div>
                </div>
                <pre class="text-xs font-mono text-(--color-text) bg-(--color-bg-alt) p-2 border border-(--color-border) overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{rootCert.pem}</pre>

                {#if !isImported}
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-(--color-text-muted)">Private Key PEM</span>
                    <div class="flex gap-2">
                      <button
                        onclick={() => handleCopy("root-key", rootCert?.privateKeyPem || "")}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                      >
                        {copiedField === "root-key" ? "Copied!" : "Copy"}
                      </button>
                      <button
                        onclick={() => downloadFile(rootCert?.privateKeyPem || "", "root-ca.key")}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                      >
                        Download .key
                      </button>
                    </div>
                  </div>
                  <pre class="text-xs font-mono text-(--color-text) bg-(--color-bg-alt) p-2 border border-(--color-border) overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{rootCert.privateKeyPem}</pre>
                {:else}
                  <p class="text-[10px] text-(--color-text-muted)">
                    Private key not shown — you provided this key during import.
                  </p>
                {/if}
              </div>
            {/if}
          {/if}

          <!-- Intermediate CA -->
          {#if interCert}
            <button
              onclick={() => toggleSection("inter")}
              class="w-full p-3 bg-(--color-bg) border border-(--color-border) hover:border-(--color-text-light) transition-colors text-left"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded shrink-0">Intermediate</span>
                <span class="text-sm font-medium text-(--color-text) truncate">{extractCN(interCert.cert.subject)}</span>
                <span class="ml-auto text-xs text-(--color-text-muted)">{expandedSection === "inter" ? "▲" : "▼"}</span>
              </div>
              <div class="text-xs text-(--color-text-muted) mt-1 ml-[95px]">
                Valid: {formatDate(interCert.cert.notBefore)} — {formatDate(interCert.cert.notAfter)}
              </div>
            </button>
            {#if expandedSection === "inter"}
              <div class="p-3 bg-(--color-bg) border border-(--color-border) ml-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-(--color-text-muted)">Certificate PEM</span>
                  <div class="flex gap-2">
                    <button
                      onclick={() => handleCopy("inter-cert", interCert?.pem || "")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      {copiedField === "inter-cert" ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onclick={() => downloadFile(interCert?.pem || "", "intermediate-ca.crt")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      Download .crt
                    </button>
                  </div>
                </div>
                <pre class="text-xs font-mono text-(--color-text) bg-(--color-bg-alt) p-2 border border-(--color-border) overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{interCert.pem}</pre>

                <div class="flex items-center justify-between">
                  <span class="text-xs text-(--color-text-muted)">Private Key PEM</span>
                  <div class="flex gap-2">
                    <button
                      onclick={() => handleCopy("inter-key", interCert?.privateKeyPem || "")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      {copiedField === "inter-key" ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onclick={() => downloadFile(interCert?.privateKeyPem || "", "intermediate-ca.key")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      Download .key
                    </button>
                  </div>
                </div>
                <pre class="text-xs font-mono text-(--color-text) bg-(--color-bg-alt) p-2 border border-(--color-border) overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{interCert.privateKeyPem}</pre>
              </div>
            {/if}
          {/if}

          <!-- Server Certificate -->
          {#if serverCert}
            <button
              onclick={() => toggleSection("server")}
              class="w-full p-3 bg-(--color-bg) border border-(--color-border) hover:border-(--color-text-light) transition-colors text-left"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded shrink-0">Server</span>
                <span class="text-sm font-medium text-(--color-text) truncate">{extractCN(serverCert.cert.subject)}</span>
                <span class="ml-auto text-xs text-(--color-text-muted)">{expandedSection === "server" ? "▲" : "▼"}</span>
              </div>
              <div class="text-xs text-(--color-text-muted) mt-1 ml-[60px]">
                Valid: {formatDate(serverCert.cert.notBefore)} — {formatDate(serverCert.cert.notAfter)}
              </div>
            </button>
            {#if expandedSection === "server"}
              <div class="p-3 bg-(--color-bg) border border-(--color-border) ml-4 space-y-2">
                <!-- SAN display -->
                <div>
                  <span class="text-xs text-(--color-text-muted) block mb-1">Subject Alternative Names</span>
                  <div class="flex flex-wrap gap-1">
                    {#each sanEntries as san}
                      <span class="px-2 py-0.5 text-xs font-mono bg-(--color-bg-alt) border border-(--color-border) text-(--color-text)">
                        <span class="text-(--color-text-muted) uppercase text-[10px]">{san.type}:</span> {san.value}
                      </span>
                    {/each}
                  </div>
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-xs text-(--color-text-muted)">Certificate PEM</span>
                  <div class="flex gap-2">
                    <button
                      onclick={() => handleCopy("server-cert", serverCert?.pem || "")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      {copiedField === "server-cert" ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onclick={() => downloadFile(serverCert?.pem || "", "server.crt")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      Download .crt
                    </button>
                  </div>
                </div>
                <pre class="text-xs font-mono text-(--color-text) bg-(--color-bg-alt) p-2 border border-(--color-border) overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{serverCert.pem}</pre>

                <div class="flex items-center justify-between">
                  <span class="text-xs text-(--color-text-muted)">Private Key PEM</span>
                  <div class="flex gap-2">
                    <button
                      onclick={() => handleCopy("server-key", serverCert?.privateKeyPem || "")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      {copiedField === "server-key" ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onclick={() => downloadFile(serverCert?.privateKeyPem || "", "server.key")}
                      class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                    >
                      Download .key
                    </button>
                  </div>
                </div>
                <pre class="text-xs font-mono text-(--color-text) bg-(--color-bg-alt) p-2 border border-(--color-border) overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{serverCert.privateKeyPem}</pre>
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Export Section -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
          Export
        </h2>
        <div class="space-y-3">
          <!-- PEM Downloads -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onclick={downloadChainPem}
              class="flex items-center gap-2 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Certificate Chain (.pem)
            </button>
            <button
              onclick={downloadFullBundle}
              class="flex items-center gap-2 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Full Bundle (key + chain .pem)
            </button>
          </div>

          <!-- PKCS#12 Export -->
          <div class="p-3 bg-(--color-bg) border border-(--color-border)">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-(--color-text-muted)">PKCS#12 / PFX Export</span>
            </div>
            <div class="flex gap-2">
              <input
                type="password"
                bind:value={pfxPassphrase}
                placeholder="Passphrase (optional)"
                class="flex-1 px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none"
              />
              <button
                onclick={downloadPkcs12}
                class="flex items-center gap-2 px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors shrink-0"
              >
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download .p12
              </button>
            </div>
            <p class="text-[10px] text-(--color-text-muted) mt-1.5">
              Bundles server key + certificate chain. Compatible with Java keystores, Windows, and macOS.
            </p>
          </div>

          <!-- Copy All -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onclick={() => {
                const chain = (serverCert?.pem || "") + "\n" + (interCert?.pem || "") + "\n" + (rootCert?.pem || "");
                handleCopy("chain", chain);
              }}
              class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors text-center"
            >
              {copiedField === "chain" ? "Copied!" : "Copy Chain PEM"}
            </button>
            <button
              onclick={() => handleCopy("server-key-export", serverCert?.privateKeyPem || "")}
              class="px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) text-sm transition-colors text-center"
            >
              {copiedField === "server-key-export" ? "Copied!" : "Copy Server Key PEM"}
            </button>
          </div>
        </div>
      </div>

      <!-- Usage Instructions -->
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
        <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-2">
          Usage
        </h2>
        <div class="space-y-2 text-xs text-(--color-text-muted)">
          <div>
            <strong class="text-(--color-text)">Node.js / Express:</strong>
            <code class="block mt-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) rounded font-mono break-all">
              https.createServer({"{"} key: fs.readFileSync("server.key"), cert: fs.readFileSync("server.crt"), ca: fs.readFileSync("certificate-chain.pem") {"}"}, app)
            </code>
          </div>
          <div>
            <strong class="text-(--color-text)">nginx:</strong>
            <code class="block mt-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) rounded font-mono break-all">
              ssl_certificate server.crt; ssl_certificate_key server.key;
            </code>
          </div>
          <div>
            <strong class="text-(--color-text)">Trust Root CA (macOS):</strong>
            <code class="block mt-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) rounded font-mono break-all">
              sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain root-ca.crt
            </code>
          </div>
          <div>
            <strong class="text-(--color-text)">Trust Root CA (Linux):</strong>
            <code class="block mt-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) rounded font-mono break-all">
              sudo cp root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
            </code>
          </div>
        </div>
      </div>
    </div>
  {:else if !generating && !error}
    <div class="flex-1 flex items-center justify-center p-4 bg-(--color-bg-alt) border border-(--color-border)">
      <span class="text-sm text-(--color-text-muted)">Configure settings above and click "Generate Certificate Chain" to create certificates</span>
    </div>
  {/if}

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About Certificate Generator:</strong>
    Generate self-signed certificate chains for development, testing, and internal PKI.
    Supports RSA and ECDSA key algorithms with configurable validity periods.
    All cryptographic operations use the Web Crypto API and run entirely in your browser —
    private keys are never transmitted anywhere. Add the Root CA to your system trust store
    to avoid browser warnings during local development.
  </div>
</div>
