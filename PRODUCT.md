# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and technically inclined users who need focused utilities without installing a desktop application or sending working data to a third party.

## Product Purpose

1.tools is a searchable collection of browser-based utilities for development, data conversion, networking, media, testing, and everyday technical tasks.

## Operating Context

Tools are opened as independent pages from a shared category sidebar. They must remain useful on desktop and mobile, support light and dark themes, and explain browser capability limitations where relevant.

## Capabilities and Constraints

- The site is statically built with Astro and deployed to GitHub Pages.
- Interactive tools use Svelte and execute in the browser.
- New tools should be local-first: user data stays in the browser unless a feature explicitly requires and identifies an external API.
- Browser-only hardware APIs must expose secure-context and browser-support requirements.

## Product Principles

- Complete a focused task without requiring an account.
- Prefer local processing and explicit data boundaries.
- Show actionable errors and relevant empty, loading, and unsupported states.
- Favor practical depth over duplicate single-purpose utilities.
