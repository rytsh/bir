// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://1.tools",
  integrations: [svelte(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});