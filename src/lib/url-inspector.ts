export interface DecodeLayer { value: string; error: string; }
export function decodeLayers(value: string, max: number = 5): DecodeLayer[] {
  const layers: DecodeLayer[] = [];
  let current: string = value;
  for (let index: number = 0; index < max; index++) {
    try {
      const decoded: string = decodeURIComponent(current);
      if (decoded === current) break;
      layers.push({ value: decoded, error: "" }); current = decoded;
    } catch { layers.push({ value: current, error: "Malformed percent encoding or invalid UTF-8. This layer cannot be decoded safely." }); break; }
  }
  return layers;
}

export function parseInspectedUrl(source: string, base: string = ""): URL {
  if (!source.trim()) throw new Error("Enter a URL to inspect.");
  try { return base.trim() ? new URL(source.trim(), base.trim()) : new URL(source.trim()); }
  catch { throw new Error("Invalid URL. Include a scheme such as https://, or provide a valid base URL for a relative path."); }
}

export function cleanTrackingParams(url: URL): URL {
  const result: URL = new URL(url.href);
  for (const key of [...result.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl)$/i.test(key)) result.searchParams.delete(key);
  }
  return result;
}
