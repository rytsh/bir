export const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="224" height="104" rx="28" fill="url(#g)"/>
  <text x="120" y="70" text-anchor="middle" font-family="Inter, Arial" font-size="36" font-weight="800" fill="white">SVG</text>
</svg>`;

export const SVG_PRESETS = [
  {
    label: "Arrow",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
  <path d="M28 62h128" fill="none" stroke="#f97316" stroke-width="18" stroke-linecap="round"/>
  <path d="M146 28l62 34-62 34" fill="none" stroke="#f97316" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  },
  {
    label: "Circle",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
  <ellipse cx="120" cy="80" rx="88" ry="52" fill="none" stroke="#ef4444" stroke-width="14" stroke-linecap="round" stroke-dasharray="8 12"/>
</svg>`,
  },
  {
    label: "Highlight",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 90">
  <path d="M22 54c38-20 74-30 120-28 38 2 67 11 96 24" fill="none" stroke="#facc15" stroke-width="22" stroke-linecap="round" opacity="0.82"/>
</svg>`,
  },
  {
    label: "Pointer",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <path d="M34 18l100 92-52 10-22 46z" fill="#ffffff" stroke="#111827" stroke-width="10" stroke-linejoin="round"/>
</svg>`,
  },
  {
    label: "Color Bars",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#111827"/>
  <rect x="0" y="0" width="45.8" height="120" fill="#f8fafc"/>
  <rect x="45.8" y="0" width="45.8" height="120" fill="#facc15"/>
  <rect x="91.6" y="0" width="45.8" height="120" fill="#22d3ee"/>
  <rect x="137.4" y="0" width="45.8" height="120" fill="#22c55e"/>
  <rect x="183.2" y="0" width="45.8" height="120" fill="#f472b6"/>
  <rect x="229" y="0" width="45.8" height="120" fill="#ef4444"/>
  <rect x="274.8" y="0" width="45.2" height="120" fill="#2563eb"/>
  <rect x="0" y="120" width="53.3" height="30" fill="#1e3a8a"/>
  <rect x="53.3" y="120" width="53.3" height="30" fill="#111827"/>
  <rect x="106.6" y="120" width="53.3" height="30" fill="#7c3aed"/>
  <rect x="159.9" y="120" width="53.3" height="30" fill="#111827"/>
  <rect x="213.2" y="120" width="53.3" height="30" fill="#06b6d4"/>
  <rect x="266.5" y="120" width="53.5" height="30" fill="#111827"/>
  <rect x="0" y="150" width="80" height="30" fill="#020617"/>
  <rect x="80" y="150" width="80" height="30" fill="#334155"/>
  <rect x="160" y="150" width="80" height="30" fill="#94a3b8"/>
  <rect x="240" y="150" width="80" height="30" fill="#020617"/>
  <text x="160" y="171" text-anchor="middle" font-family="Inter, Arial" font-size="14" font-weight="800" fill="#f8fafc">TEST</text>
</svg>`,
  },
];
