# Local workbenches

Seven browser-local utilities extend the existing 1.tools interface. Open a route below, choose local files or paste input, adjust settings, then download the result. Workspaces are kept in tab memory, not saved as projects; download anything you need before leaving or reloading.

## Routes and workflows

### Archive Manager — `/converter/archive`

- Open ZIP, USTAR TAR, TAR.GZ/TGZ, or a single-file GZIP. Opening another archive replaces the workspace.
- Add files or a folder, filter paths, select/remove files, rename paths, preview text, and download individual files. Folder picking depends on browser support for `webkitdirectory`.
- Export all or selected files as ZIP, TAR, or TAR.GZ. ZIP/GZIP compression offers store, balanced, and maximum settings; TAR is uncompressed.
- Limits: 128 MiB archive input, 256 MiB expanded/workspace data, 5,000 files. TAR output, including headers, is also capped at 256 MiB. Text previews show only the first 64 KiB; files with a NUL in the first 4 KiB are treated as binary.
- No encrypted ZIP, RAR, or 7z support. TAR accepts regular files and folders only, not links, PAX, or GNU extended entries. Empty directory entries and original permissions/timestamps are not preserved. Unsafe absolute/traversal paths and duplicate workspace paths are rejected; use ZIP when USTAR path limits prevent export.

### Image Diff — `/graphics/image-diff`

- Load a set of images, choose A/B from the filmstrip, and compare with a draggable divider, opacity overlay, pixel diff, A/B side-by-side view, all-images grid, or **All side by side**. The latter keeps every image in upload order in one row, sharing the available width with a 240 px minimum per image and local horizontal scrolling when needed. The row can be focused and scrolled with native arrow keys.
- **Show divider** hides/shows only the slider line and handle, without changing the reveal position or disabling drag/arrow-key interaction. `H` toggles it outside editing fields while in Slider mode. Reset view restores the visible divider.
- Switch divider orientation, zoom, swap A/B, or cycle B without replacing the set. Preview height defaults to a screen-relative maximum of 480 px, with 240/400/600/800 px choices across all comparison modes. Fit scales to both available width and height without stretching; 50–300% zoom scrolls within the preview instead of extending the page. Reset view (`R`) restores automatic height and fit. The divider is also a focusable range control.
- Pixel diff reports changed-pixel percentage and mean RGB error, with adjustable tolerance and PNG export. Visible RGB is compared on white, with alpha differences also considered for changed-pixel detection.
- No application-imposed file-size, image-count, or source-resolution limits. Available browser memory and image-decoder capabilities determine what can be opened; large sets may slow down or exhaust the tab. Animated files are used as still comparisons, not frame-by-frame animation diffs.
- B is centered and proportionally fitted inside A's frame when dimensions differ. Pixel diff uses that alignment and downsamples A's frame to about 4 MP when needed; results are not necessarily original-resolution pixel comparisons.

### Sprite Sheet Studio — `/graphics/sprite-sheet`

- **Pack sprites:** choose uniform grid or compact shelf rows, set columns/width and padding, optionally round the atlas to powers of two, and reorder/remove sources. Export a ZIP containing `sprites.png`, `sprites.json`, and `sprites.css`.
- **Slice sheet:** set regular cell dimensions, outer margin, and spacing. Export complete cells in row-major order as PNGs plus `frames.json` in a ZIP; partial edge cells are omitted.
- Preview playback at 1–60 FPS, step frames, and toggle pixelated rendering. Packing preserves source dimensions and transparency; it does not trim or rotate sprites. JSON includes frame rectangles and duration, not a guarantee of engine-specific import compatibility.
- Limits: 256 packed images, 32 MiB per source file, 32 megapixels combined sources; atlas maximum 8,192 pixels per side and 32 megapixels. Slicing supports up to 1,024 frames and regular grids only. Image formats depend on browser decoders; transparent PNG is recommended.

### Screen Recorder — `/graphics/screen-recorder`

- Choose maximum height (480p–2160p), target FPS (15–60), and bitrate (1–8 Mbps), then approve a screen, window, or tab in the browser chooser. Optionally request microphone and shared audio; supported audio tracks are mixed locally.
- Pause/resume, stop, preview, and download the browser's original WebM or MP4. Recording ends at approximately 10 minutes or 128 MiB; the size check runs when chunks arrive, so it is not an exact byte ceiling.
- Convert a selected clip locally to animated GIF (up to 30 seconds, no audio) or H.264 MP4 (up to 60 seconds, AAC audio when present). Set width (320–1280 px), FPS (5–30), and MP4 CRF (23/30/36). Cancellation keeps the original recording.
- Requires a secure context (HTTPS or a trusted localhost), `getDisplayMedia`, `MediaRecorder`, and canvas `captureStream`. Use a current desktop browser such as Chrome, Edge, or Firefox; support is capability-detected, not guaranteed by browser name. Most mobile browsers cannot capture screens. Available sources, codecs, shared audio, and microphone permissions vary by browser and OS.
- Keep the tool visible, preferably in a separate window: background tabs may throttle canvas capture. Resolution is capped without upscaling, while FPS/bitrate are targets rather than guarantees.
- Conversion loads the same-origin FFmpeg engine (about 32 MB on first use). It is memory-intensive, and a converted file is not guaranteed smaller. Start with a short clip at 640 px / 10 FPS; keep the original as a fallback.

### Git Patch Viewer — `/text/git-patch`

- Paste `git diff` output, open `.patch`/`.diff`, or load the example. Browse/filter files, inspect hunk line numbers, switch unified/split views, hide context, and wrap long lines.
- View rename/mode metadata and binary-change notices; download the source or selected-file patch. This is read-only: patches are never applied and code is never executed.
- Limits: 4 MiB file input (pasted text is capped at 4 × 1,024 × 1,024 string characters), 100,000 lines. Supports Git/plain unified diffs, including quoted paths; combined merge diffs are rejected. Export a unified diff against one parent instead. Binary payloads remain in downloads but cannot be visually compared.

### URL Inspector — `/network/url-inspector`

- Inspect URL parts using the browser's URL parser, optionally resolving a relative path against a base URL. Edit path, fragment, and ordered query rows, including duplicate keys and empty values, then explicitly apply changes.
- Copy the normalized URL, export JSON, remove known tracking parameters, or inspect up to five additional percent-decoding layers. Query parsing uses form decoding (`+` becomes space); the nested inspector uses percent decoding only. Applying query edits uses form encoding, so spaces become `+`.
- Warnings identify embedded credentials, Punycode hostnames, non-HTTP schemes, HTTP, duplicate keys, and malformed percent escapes. Inspection never visits or executes the destination. Warnings and tracker removal are not a security verdict or complete sanitization.
- Tracker removal covers `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, `igshid`, `_ga`, and `_gl`. Copies and JSON exports retain the URL's credentials and remaining secrets. Clipboard access requires browser permission/support; manual copying remains available. No custom keyboard shortcuts are added.

### HAR Analyzer — `/network/har`

- Export HAR from DevTools → Network, then open it here or load the synthetic example. Inspect request counts, recorded bytes, timeline span, errors, domain totals, and a phased waterfall.
- Search method/URL/type, filter domain/status/MIME, sort by timeline/time/size/status, and inspect overview/timings, headers, and text-only bodies. Lists show 100 requests per page.
- No application-imposed file-size or request-count limits; practical capacity depends on browser memory. All requests are analyzed and accessible through pagination. Detail previews still show the first 500 headers per request/response group; request and encoded response previews are truncated at 128,000 and 256,000 string characters respectively (the UI labels these approximately as KB). Textual Base64 responses can be decoded; binary Base64 previews are disabled.
- Bytes use transfer size when available, then body size, then content size. Missing/negative timings become zero; invalid timestamps appear at the timeline origin. TLS is part of connect, not added twice. Overlapping request-time sums are not page load time, and cache/compression affect byte interpretation.
- Filtered JSON reports omit headers, bodies, URL credentials, and fragments, and replace query values with `[redacted]`. Hostnames, paths, and query key names remain and can still contain secrets: review before sharing.

## Keyboard use

Shortcuts below are ignored inside inputs, textareas, selects, and editable content, and when Alt/Ctrl/Meta is held. Standard Tab navigation and native field controls remain available.

| Tool | Shortcuts |
| --- | --- |
| Archive Manager | `E`: export all; `Esc`: clear selection/close preview |
| Image Diff | `←`/`→`: slider divider ±1% (Shift: ±10%); `1`–`6`: slider/overlay/pixel diff/A-B side-by-side/grid/all side-by-side; `H`: show/hide slider divider; `S`: swap; `N`: next B; `R`: reset height/zoom/divider/opacity |
| Sprite Sheet Studio | `Space`: play/pause; `←`/`→`: step and pause; `E`: export ZIP. Space on a focused button/link retains native activation. |
| Screen Recorder | `P`: pause/resume active capture; `S`: stop; `D`: download original after capture |
| Git Patch Viewer | `J`/`K`: next/previous filtered file; `V`: unified/split; `W`: wrap |
| HAR Analyzer | `/`: focus search; `Esc`: close details (outside editing fields) |

## Privacy and browser boundaries

Input processing and exports stay in the browser; these tools do not upload working data or persist it to browser storage. URL Inspector makes no destination requests, HAR requests are never replayed, and HAR HTML/scripts are displayed as text rather than executed. Recorder sharing starts only after browser permission and capture tracks are stopped during cleanup.

Local processing does not mean the whole site is network-free: the existing shared layout loads Google Fonts, normal application assets must load, and recorder conversion fetches same-origin FFmpeg assets. No external design assets were added for these workbenches. Downloaded files and explicit clipboard copies leave tab memory under the user's control; raw archives, patches, URLs, and recordings are not automatically redacted. Treat all imported files as potentially sensitive and review exports before sharing.

Non-recorder tools use modern browser File/Blob, image/canvas, URL, and download APIs. Format decoding, canvas capacity, folder selection, clipboard access, and available memory vary by browser/device. The numeric limits are safety checks, not a promise that a low-memory device can process the maximum. Controls wrap on small screens; wide tables and image workspaces scroll within their panels.

## Incumbent interface evidence

This is an extension, not a new design system. `src/styles/global.css` remains the visual authority: existing Inter sans typography, the mono stack for code, and `--color-*` light/dark variables. `src/styles/workbench.css` consumes those variables for compact square-bordered controls, neutral panels, visible focus, errors, and selected states. Its additions/deletions use the same semantic diff variables as the incumbent `TextDiffTool.svelte`. All seven route wrappers use `src/layouts/Layout.astro`; `ToolWorkbench.svelte` and `FileDropZone.svelte` add shared task scaffolding without a new visual identity.

## Verification

Run from the repository root:

```sh
pnpm build
pnpm test:workbenches
pnpm test:seo
```

Final implementation handoff evidence records a passing production build, 28 passing workbench tests, 2 passing SEO tests, and passing production-browser checks. The workbench suite covers archive round-trips/path validation, image comparison, viewport fitting and uncapped image loading, packing/slicing, patch parsing, URL decoding/tracker removal, HAR analysis/redaction with more than 20,000 requests, and byte formatting; it is not a screen/audio compatibility suite.

Recorder verification used a synthetic canvas source with real `MediaRecorder` and real local FFmpeg GIF/MP4 conversions. The actual OS source chooser, microphone/shared-audio capture, and cross-browser behavior were **not** verified. New Svelte files have zero diagnostics; the repository-wide checker still reports unrelated preexisting errors.

The 21 desktop/mobile/dark captures are in `.impeccable/review/` (local verification output, not committed). Independent finish review found mobile min-content overflow, selected-hover contrast, and Space-key handling issues. A follow-up verdict scored all three fixes resolved and returned **ship at that limited scope**. Browser checks also assert nested workspace widths, local table scrolling, and native Space activation on the sprite mode button. This is not a cross-browser or OS-capture compatibility certification.

The Image Diff sizing follow-up has separate desktop/dark/mobile captures in `.impeccable/review/image-diff-size/`. A 600 × 6000 synthetic screenshot was verified to fit the automatic preview, all five modes respect a selected 240 px height, enlarged views scroll locally, and Reset/keyboard divider controls still work. Its scoped independent finish review returned **ship**, with no material findings. No theme tokens or other tools changed for this follow-up.

The later single-row/divider follow-up has four captures in `.impeccable/review/image-diff-row/`. Browser checks verified five images remain in upload order in one row, local native keyboard scrolling, preview size/zoom, mobile access to the final image, and pointer/keyboard reveal while the divider is hidden. Build and 27 unit tests passed; its scoped independent review returned **ship**, with no material findings. These checks do not establish cross-browser or physical-touch-device compatibility.

HAR import limits were subsequently removed. A production-browser check imported a 33 MiB HAR containing 20,001 requests and verified retained request count, pagination, sorting, filtering, details, and removal of the old limit text with no browser errors. Detail-preview truncation and 100-row pagination remain presentation safeguards, not import limits.
