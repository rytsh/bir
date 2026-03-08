<img align="left" height="64" src="public/apple-touch-icon.png">

# Tools

A collection of open-source developer utilities that run directly in your browser.

> **[1.tools](https://1.tools)**

__-__ **80+ tools** across 10 categories -- encoding, generation, conversion, networking, and more  
__-__ **Privacy-first** -- most tools run entirely in-browser; your data never leaves your device  
__-__ **WASM-powered** -- heavy workloads (document conversion, media processing, AI models) run via WebAssembly  
__-__ **PWA support** -- installable as a standalone app with offline capabilities  
__-__ **Dark / Light theme** -- system preference detection with manual toggle

## Tool Categories

| Category | Notes |
|---|:---|
| AI | On-device models via WASM (SmolLM2, M2M-100) |
| Codecs | AES, Base64, JWT, PGP, Morse, and more |
| Converters | Includes WASM tools (Pandoc, FFmpeg, Cron) and API-backed currency exchange |
| Generators | UUID/ULID/Nano ID, hash, password, barcode/QR, TOTP |
| Graphics | Color picker, image compression/resize, EXIF viewer, CSS generators |
| Network | DNS, WHOIS, SSL checker, subnet calculator, WebRTC (API-backed) |
| Party | Dice, coin flipper, name picker, camera |
| Tester | Browser info, dead pixel, input/gamepad, screen resolution |
| Text | Diff, regex, Markdown preview, ASCII art, emoji picker |
| Timers | Chronometer, countdown, world clock |

## Tech Stack

__-__ **[Astro](https://astro.build)** -- static site framework with client-side navigation  
__-__ **[Svelte](https://svelte.dev)** -- reactive UI components  
__-__ **[Tailwind CSS](https://tailwindcss.com)** -- utility-first styling with CSS custom properties for theming  
__-__ **WebAssembly** -- Pandoc, FFmpeg, ImageMagick, Hugging Face Transformers, and more  
__-__ **[CodeMirror](https://codemirror.net)** -- code/text editor integration  
__-__ **Go** -- lightweight API backend for DNS, WHOIS, SSL, IP lookup, and WebRTC signaling

## Development

### Frontend

```sh
pnpm install
pnpm run dev
```

### API server

Some tools (DNS lookup, WHOIS, SSL checker, My IP, WebRTC) require the Go API backend:

```sh
cd api
go run cmd/bir/main.go
```

The API runs on `http://127.0.0.1:8080` by default. The frontend dev server is pre-configured to use this address.

## Deployment

__-__ **Frontend** -- triggered by git tags matching `v*`, built and deployed to GitHub Pages  
__-__ **API** -- triggered by git tags matching `api/v*`, containerized and deployed to Google Cloud Run
