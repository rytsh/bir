# Local workbenches

Mode: Operate. Extend the established utility system; no visual redesign.

## Direction contract

THESIS: Seven focused browser-local workspaces. File inputs lead directly to useful work, not a marketing hero.

OWN-WORLD: Preserve Inter, the existing light/dark CSS variables, square borders, compact controls, neutral surfaces, and semantic diff colors. Do not change navigation or incumbent tools.

STORY: Choose local files, inspect them, adjust explicit settings, export a real result. Explain format, browser, memory, and privacy boundaries beside their controls.

FIRST VIEWPORT: A short purpose line, actionable toolbar, file drop area or source editor, then the workspace. Loaded image tools prioritize the canvas; analyzers prioritize navigable file/request rows and details. Mobile controls wrap and tables scroll locally.

FORM: Brief-pinned incumbent utility composition, code-led, no random seed needed. Image Diff's signature is a keyboard-accessible draggable comparison divider with a multi-image filmstrip and grid.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Finish evidence

- Extension documentation: `docs/workbenches.md` covers all seven implemented routes, workflows, limits, shortcuts, privacy, and browser boundaries. Per the scoped extension brief, no `DESIGN.md`, global design system, theme-doc/config change, or drift repair was created; the earlier generic FINISH reference to DESIGN.md does not apply to this handoff.
- Incumbent comparison: `src/styles/global.css` supplies existing Inter/mono typography and light/dark `--color-*` variables; `src/styles/workbench.css` reuses square borders, compact neutral controls, focus states, and semantic additions/deletions already used by `TextDiffTool.svelte`. Existing layout wrappers remain the shared shell. No external design assets shipped.
- Final implementation handoff reports production build/browser checks passing; verification commands are `pnpm build`, `pnpm test:workbenches` (25 tests), and `pnpm test:seo` (2 tests). New Svelte files have zero diagnostics; repo-wide checker errors are unrelated and preexisting.
- Recorder evidence: synthetic canvas source, real MediaRecorder, and real local FFmpeg GIF/MP4 conversions passed. Actual OS chooser/audio capture and cross-browser support were not verified.
- Visual evidence: 21 desktop/mobile/dark captures in `.impeccable/review/`. Independent review found mobile min-content overflow, selected-hover contrast, and Space handling; fixes landed and the reviewer scored all three resolved in a limited verdict pass (ship). Image Diff and HAR now fit the 390 px viewport with locally scrolling tables/filmstrips. No broader re-review or cross-browser approval is claimed.
- Follow-up request: removed application-imposed Image Diff file-size, image-count, and source-resolution upload limits; browser capacity remains the practical boundary. Pixel-diff processing retains its documented 4 MP working preview. Updated build and 26 workbench tests pass; other tools retain their existing bounds.
- Preview-sizing follow-up: automatic screen-relative height plus 240/400/600/800 px choices, aspect-preserving width-and-height fit, 50–300% local zoom, and reset across all five Image Diff modes. Production build and 27 tests pass; targeted desktop/dark/mobile browser checks pass with a 600 × 6000 screenshot. Scoped independent review returned ship with no material findings. Existing theme variables, navigation, and other tools remain unchanged; `docs/workbenches.md` reflects the new controls and evidence.
- All-images row/divider follow-up: sixth mode keeps uploads in one locally scrolling row; Show divider and H hide only the slider line/handle without disabling reveal interaction. Reset restores it. Production build, 27 unit tests, and targeted five-image browser checks passed, including native row keyboard scrolling, hidden-slider pointer/keyboard interaction, and mobile last-image access. Four light/dark/mobile captures in `.impeccable/review/image-diff-row/` received scoped independent ship review with no material findings. Documentation preserves the incumbent theme and explains the new controls.
- HAR limit removal: no application-imposed file-size or request-count cap. A 33 MiB / 20,001-request HAR passed production-browser import, count retention, pagination, sorting, filtering, and details checks with no page errors. Build and 28 unit tests pass. Existing preview truncation, pagination, privacy behavior, and theme are unchanged; docs distinguish these from upload limits.
