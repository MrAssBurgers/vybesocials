import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
          // Core React - loaded first
          if (id.includes('react-dom') || id.includes('react/')) {
            return 'vendor-react-core';
          }
          // React Router - needed for navigation
          if (id.includes('react-router')) {
            return 'vendor-router';
          }
          // Radix UI components - split into smaller chunks
          if (id.includes('@radix-ui')) {
            return 'vendor-ui';
          }
          // React Query
          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }
          // Framer Motion - can be deferred
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Supabase client
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
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
    // Target modern browsers only - no legacy polyfills needed
    target: ['es2022', 'chrome100', 'safari15', 'firefox100', 'edge100'],
    chunkSizeWarningLimit: 1000,
    // Reduce source map size in production
    sourcemap: false,
    // Enable CSS code splitting for better loading
    cssCodeSplit: true,
    // Reduce CSS size
    cssMinify: 'esbuild',
  },
  esbuild: {
    // Prevent legacy class transforms and polyfills
    target: 'es2022',
    // Drop console in production for smaller bundles
    drop: ['debugger'],
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
    // Exclude heavy deps from pre-bundling to reduce initial load
    exclude: ['framer-motion'],
  },
}));
