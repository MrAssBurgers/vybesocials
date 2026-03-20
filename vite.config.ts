import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const projectId = env.VITE_SUPABASE_PROJECT_ID || "agtcyxjxgkdyoxwxkjth";
  const supabaseUrl = env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;
  const publishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(projectId),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(publishableKey),
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: [
        {
          find: /^@\/integrations\/supabase\/client$/,
          replacement: path.resolve(__dirname, "./src/integrations/supabase/runtime-client.ts"),
        },
        {
          find: path.resolve(__dirname, "./src/integrations/supabase/client.ts"),
          replacement: path.resolve(__dirname, "./src/integrations/supabase/runtime-client.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-motion': ['framer-motion'],
          },
        },
      },
      minify: 'esbuild',
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'framer-motion'],
    },
  };
});
