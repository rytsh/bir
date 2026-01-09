// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import { viteStaticCopy } from "vite-plugin-static-copy";
import AstroPWA from "@vite-pwa/astro";

// https://astro.build/config
export default defineConfig({
  site: "https://1.tools",
  integrations: [
    svelte(),
    sitemap(),
    AstroPWA({
      manifest: {
        name: "1 Tools - Utility Tools",
        short_name: "1 Tools",
        description: "A collection of utility tools for text processing, converters, encoders/decoders, generators, timers, network tools, graphics, and more",
        theme_color: "#1a1a1a",
        background_color: "#1a1a1a",
        display: "standalone",
        icons: [
          {
            src: "/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: "node_modules/cron-js-wasm/wasm/module.wasm",
            dest: "wasm",
            rename: "cron.wasm",
          },
        ],
      }),
    ],
  },
});