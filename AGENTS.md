# AGENTS.md - Coding Agent Instructions

This file provides guidance for AI coding agents working in this repository.

## Project Overview

A web-based collection of developer utility tools built with **Astro 5**, **Svelte 5**, and **Tailwind CSS 4**. Static site deployed to GitHub Pages.

## Build/Lint/Test Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Development server
pnpm build            # Production build
pnpm preview          # Preview production build
```

**Note:** No test framework configured. Consider Vitest if adding tests.

## Project Structure

```
src/
├── components/tools/    # Tool Svelte components (*Tool.svelte)
├── data/tools.ts        # Tool definitions and categories
├── layouts/Layout.astro # Main layout wrapper
├── pages/tools/         # Tool pages (kebab-case filenames)
└── styles/global.css    # CSS variables and global styles
```

## Code Style Guidelines

### Imports
Order: 1) Framework (`svelte`, `astro`), 2) External libraries, 3) Local modules. Use relative imports with explicit extensions.

### TypeScript
- Use `interface` for object shapes, string literal unions for constrained types
- Always type function parameters and state variables

### Svelte 5 (Runes) - NOT Svelte 4 stores

```svelte
<script lang="ts">
  let value = $state("");              // State - NOT writable()
  let isEmpty = $derived(value === ""); // Derived - NOT $:
  $effect(() => { processValue(); });   // Effects - NOT $:
</script>
```

### Naming Conventions

| Element                 | Convention  | Example                |
| ----------------------- | ----------- | ---------------------- |
| Svelte/Astro components | PascalCase  | `Base64Tool.svelte`    |
| Page files              | kebab-case  | `data-converter.astro` |
| Variables/functions     | camelCase   | `handleCopy`           |
| Types/interfaces        | PascalCase  | `Tool`, `Category`     |
| CSS variables           | `--color-*` | `--color-primary`      |

### Formatting
- 2 spaces indentation, double quotes, semicolons required, trailing commas in multi-line

### Tailwind CSS 4 Theming

```svelte
<div class="bg-(--color-bg) text-(--color-text)">
  <button class="bg-(--color-primary) hover:bg-(--color-primary-hover)">Click</button>
</div>
```

Theme variables defined in `src/styles/global.css` for `:root` and `:root.dark`.

## Adding a New Tool

1. Create component: `src/components/tools/[ToolName]Tool.svelte`
2. Create page: `src/pages/tools/[tool-name].astro`
3. Register in `src/data/tools.ts` under appropriate category

### Tool Page Pattern

```astro
---
import Layout from "../../layouts/Layout.astro";
import MyTool from "../../components/tools/MyTool.svelte";
---
<Layout title="My Tool" currentPath="/tools/my-tool">
  <MyTool client:load />
</Layout>
```

## Deployment

- **Trigger:** Git tags matching `v*`
- **Platform:** GitHub Pages (Node 24, pnpm 10)
- **Environment:** `PUBLIC_VERSION` set from tag

## Key Dependencies

- `astro` ^5.x, `svelte` ^5.x (runes), `tailwindcss` ^4.x
