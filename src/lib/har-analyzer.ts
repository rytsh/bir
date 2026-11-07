export interface HarHeader { name: string; value: string; }
export interface HarRequest {
  id: number; url: string; method: string; host: string; path: string; status: number; statusText: string;
  mime: string; size: number; duration: number; start: number; offset: number;
  requestHeaders: HarHeader[]; responseHeaders: HarHeader[]; timings: Record<string, number>;
  content: string; encoding: string; body: string; httpVersion: string; serverIp: string;
}
export interface HarAnalysis { requests: HarRequest[]; span: number; bytes: number; pages: number; warnings: string[]; }

function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nonnegative(value: unknown): number { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0; }
function headers(value: unknown): HarHeader[] {
  return Array.isArray(value) ? value.slice(0, 500).map((item) => { const entry = record(item); return { name: text(entry.name), value: text(entry.value) }; }) : [];
}

export function analyzeHar(input: unknown): HarAnalysis {
  const log = record(record(input).log);
  if (!Array.isArray(log.entries)) throw new Error("Invalid HAR: expected a log.entries array. Export a HAR from your browser’s Network panel.");
  const requests: HarRequest[] = log.entries.map((value, id) => {
    const entry = record(value); const request = record(entry.request); const response = record(entry.response); const content = record(response.content); const timings = record(entry.timings);
    const url: string = text(request.url);
    if (!url) throw new Error(`Request ${id + 1} is missing a URL.`);
    let host: string = "(unknown)"; let path: string = url;
    try { const parsed: URL = new URL(url); host = parsed.host || `(${parsed.protocol})`; path = `${parsed.pathname}${parsed.search}`; } catch { /* Non-HTTP entries are retained as text. */ }
    const parsedDate: number = Date.parse(text(entry.startedDateTime));
    const duration: number = nonnegative(entry.time);
    const size: number = typeof response._transferSize === "number" && response._transferSize >= 0 ? nonnegative(response._transferSize) : typeof response.bodySize === "number" && response.bodySize >= 0 ? nonnegative(response.bodySize) : nonnegative(content.size);
    return { id, url, method: text(request.method) || "GET", host, path, status: nonnegative(response.status), statusText: text(response.statusText), mime: text(content.mimeType) || "unknown", size, duration, start: Number.isFinite(parsedDate) ? parsedDate : 0, offset: 0, requestHeaders: headers(request.headers), responseHeaders: headers(response.headers), timings: Object.fromEntries(["blocked", "dns", "connect", "ssl", "send", "wait", "receive"].map((key) => [key, nonnegative(timings[key])])), content: text(content.text).slice(0, 256_000), encoding: text(content.encoding), body: text(record(request.postData).text).slice(0, 128_000), httpVersion: text(response.httpVersion), serverIp: text(entry.serverIPAddress) };
  });
  let origin: number = Infinity;
  requests.forEach((request) => { if (request.start > 0) origin = Math.min(origin, request.start); });
  if (!Number.isFinite(origin)) origin = 0;
  let span: number = 0;
  requests.forEach((request) => { request.offset = request.start > 0 ? Math.max(0, request.start - origin) : 0; span = Math.max(span, request.offset + request.duration); });
  const warnings: string[] = [];
  if (requests.some((request) => request.start === 0)) warnings.push("Some requests have missing/invalid start times and are shown at the timeline origin.");
  if (requests.some((request) => request.content.length === 256_000 || request.body.length === 128_000)) warnings.push("Large request / response previews have been truncated to keep inspection responsive.");
  return { requests, span, bytes: requests.reduce((sum, request) => sum + request.size, 0), pages: Array.isArray(log.pages) ? log.pages.length : 0, warnings };
}

export function redactHarUrl(value: string): string {
  try {
    const url: URL = new URL(value); url.username = ""; url.password = ""; url.hash = "";
    // Reports omit all query values, not just known secret names. Paths can still contain secrets.
    const params: URLSearchParams = new URLSearchParams(); url.searchParams.forEach((_, key) => params.append(key, "[redacted]")); url.search = params.toString();
    return url.href;
  } catch { return "[unparseable URL omitted]"; }
}

export function harReport(requests: HarRequest[]): string {
  return JSON.stringify({ note: "Headers, bodies, fragments, credentials and query values are omitted. URL paths and hostnames are retained: review before sharing.", requests: requests.map((request) => ({ url: redactHarUrl(request.url), method: request.method, status: request.status, mime: request.mime, bytes: request.size, durationMs: request.duration, offsetMs: request.offset, timings: request.timings })) }, null, 2);
}
