export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
  line: number;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelay?: number;
  line: number;
}

export interface RobotsIssue {
  line: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
  host?: string;
  issues: RobotsIssue[];
}

export interface MatchResult {
  allowed: boolean;
  group: RobotsGroup | null;
  rule: RobotsRule | null;
  matchedAgent: string;
}

const KNOWN_DIRECTIVES = new Set([
  "user-agent", "allow", "disallow", "sitemap", "crawl-delay", "host", "clean-param", "noindex", "request-rate", "visit-time",
]);

const DIRECTIVE_TYPOS: Record<string, string> = {
  "useragent": "user-agent",
  "user agent": "user-agent",
  "user-agents": "user-agent",
  "dissallow": "disallow",
  "disalow": "disallow",
  "dis-allow": "disallow",
  "diallow": "disallow",
  "allows": "allow",
  "site-map": "sitemap",
  "sitemaps": "sitemap",
  "crawldelay": "crawl-delay",
};

/** Google's limit: content after 500 KiB is ignored. */
export const MAX_ROBOTS_BYTES = 500 * 1024;

export const parseRobots = (text: string): ParsedRobots => {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const issues: RobotsIssue[] = [];
  let host: string | undefined;
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_ROBOTS_BYTES) {
    issues.push({ line: 0, severity: "warning", message: `File is ${Math.round(bytes / 1024)} KiB; Google ignores content after 500 KiB.` });
  }
  if (text.charCodeAt(0) === 0xfeff) {
    issues.push({ line: 1, severity: "info", message: "File starts with a UTF-8 BOM (ignored by Google, but may confuse other crawlers)." });
  }

  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const withoutComment = raw.replace(/#.*$/, "").trim();
    if (!withoutComment) return;

    const colon = withoutComment.indexOf(":");
    if (colon === -1) {
      issues.push({ line: lineNumber, severity: "error", message: `Missing ":" — expected "Directive: value".` });
      return;
    }
    let directive = withoutComment.slice(0, colon).trim().toLowerCase();
    const value = withoutComment.slice(colon + 1).trim();

    if (DIRECTIVE_TYPOS[directive]) {
      issues.push({ line: lineNumber, severity: "warning", message: `"${directive}" looks like a typo for "${DIRECTIVE_TYPOS[directive]}" (Google accepts some typos, other crawlers may not).` });
      directive = DIRECTIVE_TYPOS[directive];
    } else if (!KNOWN_DIRECTIVES.has(directive)) {
      issues.push({ line: lineNumber, severity: "warning", message: `Unknown directive "${directive}" is ignored.` });
      return;
    }

    switch (directive) {
      case "user-agent": {
        if (!value) {
          issues.push({ line: lineNumber, severity: "error", message: "Empty User-agent value." });
          return;
        }
        if (!lastWasAgent || !current) {
          current = { userAgents: [], rules: [], line: lineNumber };
          groups.push(current);
        }
        current.userAgents.push(value);
        lastWasAgent = true;
        if (/[^A-Za-z0-9_*-]/.test(value) && value !== "*") {
          issues.push({ line: lineNumber, severity: "info", message: `User-agent "${value}" contains characters other than letters, digits, "-" and "_"; Google only matches the product token (e.g. "Googlebot").` });
        }
        return;
      }
      case "allow":
      case "disallow": {
        lastWasAgent = false;
        if (!current) {
          issues.push({ line: lineNumber, severity: "error", message: `${directive === "allow" ? "Allow" : "Disallow"} before any User-agent line is ignored.` });
          return;
        }
        if (value && !value.startsWith("/") && !value.startsWith("*")) {
          issues.push({ line: lineNumber, severity: "warning", message: `Path "${value}" should start with "/" (or "*").` });
        }
        if (/^https?:\/\//i.test(value)) {
          issues.push({ line: lineNumber, severity: "error", message: "Rules must be paths, not full URLs." });
        }
        if (value.includes("$") && !value.endsWith("$")) {
          issues.push({ line: lineNumber, severity: "warning", message: `"$" is only special at the end of a path; here it is matched literally.` });
        }
        current.rules.push({ type: directive, path: value, line: lineNumber });
        return;
      }
      case "crawl-delay": {
        lastWasAgent = false;
        const delay = Number(value);
        if (!current) {
          issues.push({ line: lineNumber, severity: "warning", message: "Crawl-delay outside a group is ignored." });
        } else if (!Number.isFinite(delay) || delay < 0) {
          issues.push({ line: lineNumber, severity: "error", message: `Invalid Crawl-delay "${value}".` });
        } else {
          current.crawlDelay = delay;
          issues.push({ line: lineNumber, severity: "info", message: "Crawl-delay is ignored by Google (supported by Bing, Yandex)." });
        }
        return;
      }
      case "sitemap": {
        if (!/^https?:\/\/\S+$/i.test(value)) {
          issues.push({ line: lineNumber, severity: "error", message: `Sitemap must be an absolute URL, got "${value}".` });
        } else {
          sitemaps.push(value);
        }
        return;
      }
      case "host":
        host = value;
        issues.push({ line: lineNumber, severity: "info", message: "Host is a Yandex-only directive (deprecated)." });
        return;
      case "noindex":
        lastWasAgent = false;
        issues.push({ line: lineNumber, severity: "warning", message: "Noindex in robots.txt is not supported by Google since 2019. Use a meta robots tag or X-Robots-Tag header." });
        return;
      default:
        lastWasAgent = false;
        issues.push({ line: lineNumber, severity: "info", message: `"${directive}" is not supported by Google.` });
    }
  });

  for (const group of groups) {
    if (group.rules.length === 0 && group.crawlDelay === undefined) {
      issues.push({ line: group.line, severity: "info", message: `Group for ${group.userAgents.join(", ")} has no rules (everything is allowed for it).` });
    }
  }
  const agentCounts = new Map<string, number>();
  for (const group of groups) {
    for (const agent of group.userAgents) agentCounts.set(agent.toLowerCase(), (agentCounts.get(agent.toLowerCase()) ?? 0) + 1);
  }
  for (const [agent, count] of agentCounts) {
    if (count > 1) {
      issues.push({ line: 0, severity: "info", message: `User-agent "${agent}" appears in ${count} groups; Google merges them.` });
    }
  }
  const everything = groups.find((group) => group.userAgents.includes("*"));
  if (everything?.rules.some((rule) => rule.type === "disallow" && rule.path === "/") && !everything.rules.some((rule) => rule.type === "allow")) {
    issues.push({ line: everything.line, severity: "warning", message: "\"User-agent: * / Disallow: /\" blocks all crawlers from the entire site." });
  }
  if (sitemaps.length === 0 && groups.length > 0) {
    issues.push({ line: 0, severity: "info", message: "No Sitemap declared. Adding one helps crawlers discover pages." });
  }

  return { groups, sitemaps, host, issues };
};

const escapeRegex = (value: string): string => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Normalizes percent-encoding so /a%2fb and /a%2Fb compare equal; encodes non-ASCII characters. */
const normalizePath = (path: string): string =>
  path
    .replace(/%[0-9a-f]{2}/gi, (match) => match.toUpperCase())
    .replace(/[^\x21-\x7e]/g, (char) => encodeURIComponent(char));

/** RFC 9309 path matching with * wildcard and $ end anchor. */
export const pathMatches = (pattern: string, path: string): boolean => {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = normalizePath(anchored ? pattern.slice(0, -1) : pattern);
  const regex = new RegExp(`^${body.split("*").map(escapeRegex).join(".*")}${anchored ? "$" : ""}`);
  return regex.test(normalizePath(path));
};

const productToken = (userAgent: string): string => userAgent.split(/[/\s]/)[0].toLowerCase();

/** Finds the groups that apply to a crawler (most specific match, falling back to "*"), merged per RFC 9309. */
export const groupsForAgent = (robots: ParsedRobots, userAgent: string): { rules: RobotsRule[]; groups: RobotsGroup[]; matchedAgent: string } => {
  const token = productToken(userAgent);
  let bestLength = -1;
  let matched: RobotsGroup[] = [];
  let matchedAgent = "";
  for (const group of robots.groups) {
    for (const agent of group.userAgents) {
      const lower = agent.toLowerCase();
      if (lower === "*") continue;
      if (token.startsWith(lower) || lower === token) {
        if (lower.length > bestLength) {
          bestLength = lower.length;
          matched = [group];
          matchedAgent = agent;
        } else if (lower.length === bestLength && !matched.includes(group)) {
          matched.push(group);
        }
      }
    }
  }
  if (matched.length === 0) {
    matched = robots.groups.filter((group) => group.userAgents.includes("*"));
    matchedAgent = matched.length ? "*" : "";
  }
  return { rules: matched.flatMap((group) => group.rules), groups: matched, matchedAgent };
};

/** Longest-match wins; on equal length Allow wins (Google behavior). */
export const isAllowed = (robots: ParsedRobots, userAgent: string, url: string): MatchResult => {
  let path = url.trim();
  try {
    const parsed = new URL(path, "https://example.com");
    path = parsed.pathname + parsed.search;
  } catch {
    // treat as path
  }
  if (!path.startsWith("/")) path = "/" + path;
  if (path === "/robots.txt") {
    return { allowed: true, group: null, rule: null, matchedAgent: "" };
  }

  const { rules, groups, matchedAgent } = groupsForAgent(robots, userAgent);
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!pathMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (
      !best ||
      length > best.path.length ||
      (length === best.path.length && rule.type === "allow" && best.type === "disallow")
    ) {
      best = rule;
    }
  }
  const group = best ? groups.find((candidate) => candidate.rules.includes(best!)) ?? null : groups[0] ?? null;
  return { allowed: !best || best.type === "allow", group, rule: best, matchedAgent };
};

export interface BotDef {
  token: string;
  label: string;
  category: "search" | "ai" | "seo" | "social" | "other";
}

export const KNOWN_BOTS: BotDef[] = [
  { token: "Googlebot", label: "Google Search", category: "search" },
  { token: "Googlebot-Image", label: "Google Images", category: "search" },
  { token: "Bingbot", label: "Bing", category: "search" },
  { token: "DuckDuckBot", label: "DuckDuckGo", category: "search" },
  { token: "YandexBot", label: "Yandex", category: "search" },
  { token: "Baiduspider", label: "Baidu", category: "search" },
  { token: "Applebot", label: "Apple (Siri, Spotlight)", category: "search" },
  { token: "GPTBot", label: "OpenAI training", category: "ai" },
  { token: "OAI-SearchBot", label: "OpenAI ChatGPT search", category: "ai" },
  { token: "ChatGPT-User", label: "ChatGPT user browsing", category: "ai" },
  { token: "ClaudeBot", label: "Anthropic training", category: "ai" },
  { token: "Claude-SearchBot", label: "Anthropic Claude search", category: "ai" },
  { token: "Claude-User", label: "Claude user browsing", category: "ai" },
  { token: "Google-Extended", label: "Google Gemini training", category: "ai" },
  { token: "Applebot-Extended", label: "Apple AI training", category: "ai" },
  { token: "PerplexityBot", label: "Perplexity", category: "ai" },
  { token: "CCBot", label: "Common Crawl", category: "ai" },
  { token: "Bytespider", label: "ByteDance", category: "ai" },
  { token: "Meta-ExternalAgent", label: "Meta AI training", category: "ai" },
  { token: "Amazonbot", label: "Amazon", category: "ai" },
  { token: "cohere-ai", label: "Cohere", category: "ai" },
  { token: "AhrefsBot", label: "Ahrefs", category: "seo" },
  { token: "SemrushBot", label: "Semrush", category: "seo" },
  { token: "MJ12bot", label: "Majestic", category: "seo" },
  { token: "DotBot", label: "Moz", category: "seo" },
  { token: "facebookexternalhit", label: "Facebook link preview", category: "social" },
  { token: "Twitterbot", label: "X / Twitter link preview", category: "social" },
  { token: "LinkedInBot", label: "LinkedIn link preview", category: "social" },
  { token: "Slackbot", label: "Slack link preview", category: "social" },
  { token: "Discordbot", label: "Discord link preview", category: "social" },
];

export interface BuilderGroup {
  id: number;
  userAgents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
  crawlDelay: string;
  comment: string;
}

export const buildRobots = (groups: BuilderGroup[], sitemaps: string[], headerComment: string): string => {
  const parts: string[] = [];
  if (headerComment.trim()) parts.push(headerComment.trim().split("\n").map((line) => `# ${line}`).join("\n"));
  for (const group of groups) {
    if (!group.userAgents.length) continue;
    const lines: string[] = [];
    if (group.comment.trim()) lines.push(...group.comment.trim().split("\n").map((line) => `# ${line}`));
    lines.push(...group.userAgents.map((agent) => `User-agent: ${agent}`));
    const rules = group.rules.filter((rule) => rule.path.trim() || rule.type === "disallow");
    if (rules.length === 0) lines.push("Disallow:");
    lines.push(...rules.map((rule) => `${rule.type === "allow" ? "Allow" : "Disallow"}: ${rule.path.trim()}`));
    if (group.crawlDelay.trim()) lines.push(`Crawl-delay: ${group.crawlDelay.trim()}`);
    parts.push(lines.join("\n"));
  }
  const cleanSitemaps = sitemaps.map((sitemap) => sitemap.trim()).filter(Boolean);
  if (cleanSitemaps.length) parts.push(cleanSitemaps.map((sitemap) => `Sitemap: ${sitemap}`).join("\n"));
  return parts.join("\n\n") + "\n";
};
