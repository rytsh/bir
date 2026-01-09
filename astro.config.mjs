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
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "pwa-*.png", "maskable-*.png"],
      manifest: {
        name: "1 Tools - Utility Tools",
        short_name: "1 Tools",
        description: "A collection of utility tools for text processing, converters, encoders/decoders, generators, timers, network tools, graphics, and more",
        theme_color: "#1a1a1a",
        background_color: "#1a1a1a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"],
        navigateFallback: null,
      },
      devOptions: {
        enabled: true,
        type: "module",
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