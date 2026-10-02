export type Severity = "high" | "medium" | "low" | "info";

export interface CspFinding {
  severity: Severity;
  directive: string;
  message: string;
}

export interface DirectiveDef {
  name: string;
  kind: "source" | "flag" | "sandbox" | "token" | "uri";
  fetch?: boolean;
  description: string;
}

export type CspPolicy = Map<string, string[]>;

export const DIRECTIVES: DirectiveDef[] = [
  { name: "default-src", kind: "source", description: "Fallback for all fetch directives that are not set." },
  { name: "script-src", kind: "source", fetch: true, description: "Where JavaScript can be loaded and executed from." },
  { name: "script-src-elem", kind: "source", fetch: true, description: "<script> elements (overrides script-src)." },
  { name: "script-src-attr", kind: "source", fetch: true, description: "Inline event handlers like onclick." },
  { name: "style-src", kind: "source", fetch: true, description: "Stylesheets and inline styles." },
  { name: "style-src-elem", kind: "source", fetch: true, description: "<style> and <link rel=stylesheet>." },
  { name: "style-src-attr", kind: "source", fetch: true, description: "Inline style attributes." },
  { name: "img-src", kind: "source", fetch: true, description: "Images and favicons." },
  { name: "font-src", kind: "source", fetch: true, description: "Web fonts loaded with @font-face." },
  { name: "connect-src", kind: "source", fetch: true, description: "fetch, XHR, WebSocket, EventSource, sendBeacon." },
  { name: "media-src", kind: "source", fetch: true, description: "<audio>, <video>, and <track>." },
  { name: "object-src", kind: "source", fetch: true, description: "<object> and <embed> plugins. Should be 'none'." },
  { name: "frame-src", kind: "source", fetch: true, description: "Pages that can be embedded in <iframe>." },
  { name: "child-src", kind: "source", fetch: true, description: "Frames and workers (legacy fallback)." },
  { name: "worker-src", kind: "source", fetch: true, description: "Worker, SharedWorker, and ServiceWorker scripts." },
  { name: "manifest-src", kind: "source", fetch: true, description: "Web app manifests." },
  { name: "base-uri", kind: "source", description: "Allowed URLs for the <base> element." },
  { name: "form-action", kind: "source", description: "Where forms can be submitted." },
  { name: "frame-ancestors", kind: "source", description: "Who can embed this page (replaces X-Frame-Options)." },
  { name: "sandbox", kind: "sandbox", description: "Applies iframe-like sandbox restrictions to the page." },
  { name: "upgrade-insecure-requests", kind: "flag", description: "Rewrite http:// sub-resource URLs to https://." },
  { name: "block-all-mixed-content", kind: "flag", description: "Deprecated; use upgrade-insecure-requests." },
  { name: "require-trusted-types-for", kind: "token", description: "Enforce Trusted Types for DOM XSS sinks ('script')." },
  { name: "trusted-types", kind: "token", description: "Allowed Trusted Types policy names." },
  { name: "report-uri", kind: "uri", description: "Deprecated reporting endpoint (still widely supported)." },
  { name: "report-to", kind: "token", description: "Reporting API group name (Reporting-Endpoints header)." },
];

export const DIRECTIVE_MAP = new Map(DIRECTIVES.map((directive) => [directive.name, directive]));

export const KEYWORDS = [
  "'self'",
  "'none'",
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'wasm-unsafe-eval'",
  "'strict-dynamic'",
  "'unsafe-hashes'",
  "'report-sample'",
  "'inline-speculation-rules'",
];

export const SANDBOX_TOKENS = [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-storage-access-by-user-activation",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-top-navigation-to-custom-protocols",
];

/** Hosts that serve user-controlled content or JSONP endpoints and commonly bypass script-src allowlists. */
const BYPASS_HOSTS = [
  "*.googleapis.com",
  "ajax.googleapis.com",
  "www.google.com",
  "*.google.com",
  "cdn.jsdelivr.net",
  "*.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "raw.githubusercontent.com",
  "*.github.io",
  "*.githubusercontent.com",
  "*.cloudfront.net",
  "*.amazonaws.com",
  "*.herokuapp.com",
  "*.firebaseapp.com",
  "*.appspot.com",
  "*.azurewebsites.net",
  "accounts.google.com",
  "www.youtube.com",
  "*.youtube.com",
];

/** Extracts a policy from a raw header value, a full "Content-Security-Policy: ..." line, or a <meta> tag. */
export const extractPolicyText = (input: string): string => {
  const trimmed = input.trim();
  const meta = trimmed.match(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy(?:-report-only)?["']?[^>]*>/i);
  if (meta) {
    const content = meta[0].match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (content) return (content[2] ?? content[3] ?? "").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  }
  return trimmed.replace(/^content-security-policy(-report-only)?\s*:\s*/i, "");
};

export const parseCsp = (input: string): { policy: CspPolicy; duplicates: string[]; unknown: string[] } => {
  const policy: CspPolicy = new Map();
  const duplicates: string[] = [];
  const unknown: string[] = [];
  const text = extractPolicyText(input);
  for (const part of text.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens[0].toLowerCase();
    if (policy.has(name)) {
      duplicates.push(name);
      continue;
    }
    if (!DIRECTIVE_MAP.has(name)) unknown.push(name);
    policy.set(name, tokens.slice(1));
  }
  return { policy, duplicates, unknown };
};

export const serializeCsp = (policy: CspPolicy, multiline = false): string => {
  const parts: string[] = [];
  for (const [name, values] of policy) {
    parts.push(values.length ? `${name} ${values.join(" ")}` : name);
  }
  return multiline ? parts.join(";\n") + (parts.length ? ";" : "") : parts.join("; ");
};

const isNonce = (value: string): boolean => /^'nonce-[^']+'$/i.test(value);
const isHash = (value: string): boolean => /^'sha(256|384|512)-[A-Za-z0-9+/=_-]+'$/i.test(value);

/** Returns the effective source list for a fetch directive, applying default-src fallback rules. */
export const effectiveSources = (policy: CspPolicy, name: string): { values: string[] | undefined; from: string } => {
  const chain: Record<string, string[]> = {
    "script-src-elem": ["script-src-elem", "script-src", "default-src"],
    "script-src-attr": ["script-src-attr", "script-src", "default-src"],
    "style-src-elem": ["style-src-elem", "style-src", "default-src"],
    "style-src-attr": ["style-src-attr", "style-src", "default-src"],
    "frame-src": ["frame-src", "child-src", "default-src"],
    "worker-src": ["worker-src", "child-src", "script-src", "default-src"],
  };
  for (const candidate of chain[name] ?? [name, "default-src"]) {
    if (policy.has(candidate)) return { values: policy.get(candidate), from: candidate };
  }
  return { values: undefined, from: "" };
};

const validateSource = (directive: string, value: string): string | null => {
  const lower = value.toLowerCase();
  if (KEYWORDS.includes(lower)) return null;
  if (isNonce(value) || isHash(value)) return null;
  if (/^'[^']*'$/.test(value)) return `Unknown keyword ${value}`;
  if (["self", "none", "unsafe-inline", "unsafe-eval", "strict-dynamic"].includes(lower)) {
    return `"${value}" must be single-quoted: '${value}'`;
  }
  if (/^[a-z][a-z0-9+.-]*:$/i.test(value)) return null;
  if (value === "*") return null;
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\*\.)?[a-z0-9.-]+(?::(?:\d+|\*))?(?:\/[^\s;,]*)?$/i.test(value)) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/)?\*(?::(?:\d+|\*))?$/i.test(value)) return null;
  if (value.includes(",")) return `Commas are not valid separators in ${directive}; use spaces`;
  return `Invalid source expression "${value}"`;
};

export const analyzeCsp = (policy: CspPolicy, options: { duplicates?: string[]; unknown?: string[] } = {}): CspFinding[] => {
  const findings: CspFinding[] = [];
  const add = (severity: Severity, directive: string, message: string): void => {
    findings.push({ severity, directive, message });
  };

  for (const name of options.duplicates ?? []) {
    add("medium", name, `Duplicate directive "${name}" — browsers ignore every occurrence after the first.`);
  }
  for (const name of options.unknown ?? []) {
    add("low", name, `Unknown directive "${name}" (typo or not supported).`);
  }

  for (const [name, values] of policy) {
    const def = DIRECTIVE_MAP.get(name);
    if (!def) continue;
    if (def.kind === "flag" && values.length) add("low", name, `"${name}" takes no value; "${values.join(" ")}" is ignored.`);
    if (def.kind === "source") {
      if (values.length === 0) add("medium", name, `"${name}" is empty, which behaves like 'none'. Use 'none' explicitly.`);
      if (values.includes("'none'") && values.length > 1) {
        add("medium", name, `'none' is ignored when combined with other sources in ${name}.`);
      }
      for (const value of values) {
        const problem = validateSource(name, value);
        if (problem) add("medium", name, problem);
      }
    }
    if (def.kind === "sandbox") {
      for (const value of values) {
        if (!SANDBOX_TOKENS.includes(value)) add("low", name, `Unknown sandbox token "${value}".`);
      }
      if (values.includes("allow-scripts") && values.includes("allow-same-origin")) {
        add("medium", name, "allow-scripts + allow-same-origin lets the page remove its own sandbox.");
      }
    }
    if (name === "block-all-mixed-content") add("info", name, "Deprecated. Use upgrade-insecure-requests instead.");
    if (name === "report-uri" && !policy.has("report-to")) {
      add("info", name, "report-uri is deprecated; consider adding report-to with a Reporting-Endpoints header.");
    }
  }

  if (policy.size === 0) {
    add("high", "policy", "Policy is empty.");
    return findings;
  }

  const script = effectiveSources(policy, "script-src");
  const scriptValues = script.values;
  if (!scriptValues) {
    add("high", "script-src", "No script-src or default-src: scripts can load from anywhere.");
  } else {
    const hasNonceOrHash = scriptValues.some((value) => isNonce(value) || isHash(value));
    const strictDynamic = scriptValues.includes("'strict-dynamic'");
    if (scriptValues.includes("'unsafe-inline'")) {
      if (hasNonceOrHash) {
        add("info", script.from, "'unsafe-inline' is ignored by modern browsers because a nonce/hash is present (kept for old browsers — good).");
      } else {
        add("high", script.from, "'unsafe-inline' allows inline <script> and event handlers, defeating most XSS protection.");
      }
    }
    if (scriptValues.includes("'unsafe-eval'")) {
      add("medium", script.from, "'unsafe-eval' allows eval(), new Function(), and string setTimeout.");
    }
    const wildcard = scriptValues.filter((value) => value === "*" || /^(https?:|data:|blob:|http:\/\/\*|https:\/\/\*)$/i.test(value));
    if (wildcard.length && !strictDynamic) {
      add("high", script.from, `${wildcard.join(", ")} lets scripts load from any origin${wildcard.includes("data:") ? " (data: allows inline script via data URLs)" : ""}.`);
    }
    if (!strictDynamic) {
      const risky = scriptValues.filter((value) => {
        const host = value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
        return BYPASS_HOSTS.some((bypass) => host === bypass || (bypass.startsWith("*.") && host.endsWith(bypass.slice(1))));
      });
      if (risky.length) {
        add("high", script.from, `${risky.join(", ")} host user content or JSONP endpoints that can bypass the allowlist.`);
      }
      const hostSources = scriptValues.filter(
        (value) => !value.startsWith("'") && !/^[a-z]+:$/i.test(value) && value !== "*",
      );
      if (hostSources.length && !hasNonceOrHash) {
        add("medium", script.from, "Host allowlists are frequently bypassable. Prefer nonces or hashes with 'strict-dynamic'.");
      }
    }
    if (strictDynamic && !hasNonceOrHash) {
      add("high", script.from, "'strict-dynamic' requires a nonce or hash; without one no scripts can load.");
    }
    if (hasNonceOrHash && !strictDynamic) {
      add("low", script.from, "Consider adding 'strict-dynamic' so trusted scripts can load their dependencies.");
    }
    if (scriptValues.some((value) => value.startsWith("'nonce-"))) {
      const shortNonce = scriptValues.find((value) => isNonce(value) && value.length < 16 + 9);
      if (shortNonce) add("medium", script.from, `Nonce ${shortNonce} looks short; use at least 128 bits of randomness, regenerated per response.`);
    }
  }

  const object = effectiveSources(policy, "object-src");
  if (!object.values || !(object.values.length === 1 && object.values[0] === "'none'")) {
    add("high", "object-src", "object-src should be 'none' to block plugin-based script execution.");
  }

  if (!policy.has("base-uri")) {
    add("high", "base-uri", "Missing base-uri: injected <base> tags can redirect relative script URLs. Use 'none' or 'self'.");
  }

  if (!policy.has("frame-ancestors")) {
    add("medium", "frame-ancestors", "Missing frame-ancestors: page can be framed (clickjacking). Use 'none' or 'self'. Not supported in <meta>.");
  }

  if (!policy.has("form-action")) {
    add("low", "form-action", "Missing form-action: forms can submit to any URL (not covered by default-src).");
  }

  const style = effectiveSources(policy, "style-src");
  if (style.values?.includes("'unsafe-inline'")) {
    add("low", style.from, "'unsafe-inline' in style-src allows CSS injection (data exfiltration via selectors).");
  }

  const defaultSrc = policy.get("default-src");
  if (!defaultSrc) {
    add("low", "default-src", "No default-src fallback: unspecified fetch directives (img, connect, font, …) are unrestricted. Fine for a script-focused strict CSP.");
  } else if (defaultSrc.includes("*")) {
    add("medium", "default-src", "default-src * allows loading resources from any origin.");
  }

  if (!policy.has("upgrade-insecure-requests")) {
    add("info", "upgrade-insecure-requests", "Consider upgrade-insecure-requests on HTTPS sites to auto-upgrade http:// resources.");
  }

  if (!policy.has("report-uri") && !policy.has("report-to")) {
    add("info", "report-to", "No reporting configured; violations will not be collected.");
  }

  return findings;
};

export const scoreFindings = (findings: CspFinding[]): { score: number; grade: string } => {
  const weights: Record<Severity, number> = { high: 25, medium: 10, low: 3, info: 0 };
  const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + weights[finding.severity], 0));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade };
};

export const generateNonce = (bytes = 16): string => {
  const random = new Uint8Array(bytes);
  crypto.getRandomValues(random);
  let binary = "";
  for (const byte of random) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const hashInline = async (content: string, algorithm: "SHA-256" | "SHA-384" | "SHA-512"): Promise<string> => {
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(content));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `'${algorithm.replace("-", "").toLowerCase()}-${btoa(binary)}'`;
};

export interface CspPreset {
  id: string;
  label: string;
  description: string;
  policy: string;
}

export const CSP_PRESETS: CspPreset[] = [
  {
    id: "strict",
    label: "Strict (nonce)",
    description: "Recommended by Google: nonce + 'strict-dynamic'. Works with any script loader.",
    policy:
      "script-src 'nonce-{NONCE}' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests",
  },
  {
    id: "static",
    label: "Static site",
    description: "Lock everything to same origin. Good for static sites without inline scripts.",
    policy:
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
  },
  {
    id: "spa",
    label: "SPA + API",
    description: "Single-page app talking to an API and loading fonts from Google Fonts.",
    policy:
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.example.com wss://api.example.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
  },
  {
    id: "lockdown",
    label: "API / no content",
    description: "For JSON APIs and endpoints that never render HTML.",
    policy: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  },
];

export const serverSnippets = (policy: string, reportOnly: boolean): { label: string; code: string }[] => {
  const header = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const single = policy.replace(/'/g, "\\'");
  return [
    { label: "HTTP header", code: `${header}: ${policy}` },
    {
      label: "HTML <meta>",
      code: reportOnly
        ? "<!-- Report-Only is not supported in <meta>; use the HTTP header. -->"
        : `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, "&quot;")}">`,
    },
    { label: "Nginx", code: `add_header ${header} "${policy.replace(/"/g, '\\"')}" always;` },
    { label: "Apache", code: `Header always set ${header} "${policy.replace(/"/g, '\\"')}"` },
    { label: "Caddy", code: `header ${header} "${policy.replace(/"/g, '\\"')}"` },
    {
      label: "Express (Node)",
      code: `app.use((req, res, next) => {\n  res.setHeader('${header}', '${single}');\n  next();\n});`,
    },
    {
      label: "Netlify _headers",
      code: `/*\n  ${header}: ${policy}`,
    },
    {
      label: "Vercel vercel.json",
      code: JSON.stringify({ headers: [{ source: "/(.*)", headers: [{ key: header, value: policy }] }] }, null, 2),
    },
    {
      label: "Cloudflare Worker",
      code: `const response = await fetch(request);\nconst headers = new Headers(response.headers);\nheaders.set('${header}', '${single}');\nreturn new Response(response.body, { ...response, headers });`,
    },
  ];
};
