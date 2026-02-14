import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Plugin to make CSS non-render-blocking by using media="print" trick
function asyncCssPlugin() {
  return {
    name: 'async-css',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      // Convert stylesheet links to async loading pattern
      return html.replace(
        /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
        '<link rel="stylesheet" href="$1" media="print" onload="this.media=\'all\'" crossorigin><noscript><link rel="stylesheet" href="$1" crossorigin></noscript>'
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger(), asyncCssPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize chunk splitting for faster loading
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React - small, loads first
          if (id.includes('react-dom') || id.includes('react/')) {
            return 'vendor-react';
          }
          if (id.includes('react-router-dom')) {
            return 'vendor-router';
          }
          // UI components - defer
          if (id.includes('@radix-ui')) {
            return 'vendor-ui';
          }
          // Query - defer
          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }
          // Motion - defer (large, often unused on initial paint)
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Supabase
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }
          // Daily.co call SDK - very large, rarely needed on load
          if (id.includes('@daily-co')) {
            return 'vendor-daily';
          }
          // date-fns
          if (id.includes('date-fns')) {
            return 'vendor-datefns';
          }
          // recharts
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }
          // i18n
          if (id.includes('i18next')) {
            return 'vendor-i18n';
          }
        },
      },
    },
    // Enable minification optimizations
    minify: 'esbuild',
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    // Enable CSS code splitting
    cssCodeSplit: true,
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'framer-motion'],
  },
}));
