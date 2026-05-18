import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
// @ts-ignore - no types shipped
import { despiaLocalPlugin } from "@despia/local/vite";

function previewSupabaseClientShimPlugin() {
  const sourceModuleUrl = "/src/integrations/supabase/client.ts";
  const runtimeModuleUrl = "/src/integrations/supabase/runtime-client.ts";
  const runtimeModulePath = path.resolve(__dirname, `.${runtimeModuleUrl}`);

  return {
    name: "preview-supabase-client-shim",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (
        source === "@/integrations/supabase/client" ||
        source === "@/integrations/supabase/client.ts" ||
        source === sourceModuleUrl
      ) {
        return runtimeModulePath;
      }

      return null;
    },
    configureServer(server: any) {
      server.middlewares.use((req: any, _res: any, next: () => void) => {
        if (typeof req.url === "string" && req.url.startsWith(sourceModuleUrl)) {
          req.url = req.url.replace(sourceModuleUrl, runtimeModuleUrl);
        }

        next();
      });
    },
  };
}

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
    plugins: [previewSupabaseClientShimPlugin(), react(), mode === "development" && componentTagger(), despiaLocalPlugin({ outDir: "dist", entryHtml: "index.html" })].filter(Boolean),
    resolve: {
      dedupe: ['react', 'react-dom'],
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
            'vendor-ui': [
              '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip', '@radix-ui/react-popover', '@radix-ui/react-select',
              '@radix-ui/react-switch', '@radix-ui/react-checkbox', '@radix-ui/react-avatar',
              '@radix-ui/react-scroll-area', '@radix-ui/react-separator', '@radix-ui/react-label',
              '@radix-ui/react-slot', '@radix-ui/react-toast', '@radix-ui/react-accordion',
              '@radix-ui/react-collapsible', '@radix-ui/react-toggle', '@radix-ui/react-toggle-group',
              '@radix-ui/react-radio-group', '@radix-ui/react-slider', '@radix-ui/react-progress',
              '@radix-ui/react-hover-card', '@radix-ui/react-alert-dialog', '@radix-ui/react-context-menu',
              '@radix-ui/react-menubar', '@radix-ui/react-navigation-menu', '@radix-ui/react-aspect-ratio',
            ],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-motion': ['framer-motion'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
            'vendor-date': ['date-fns'],
            'vendor-recharts': ['recharts'],
            'vendor-revenuecat': ['@revenuecat/purchases-js'],
            'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
            'vendor-styling': ['class-variance-authority', 'clsx', 'tailwind-merge'],
          },
        },
      },
      minify: 'esbuild',
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
    },
    optimizeDeps: {
      include: [
        'react', 'react-dom', 'react-router-dom',
        '@tanstack/react-query', '@tanstack/react-query-persist-client',
        'framer-motion',
        '@supabase/supabase-js',
        'lucide-react',
        'clsx', 'tailwind-merge', 'class-variance-authority',
        'date-fns',
        'i18next', 'react-i18next', 'i18next-browser-languagedetector',
        'zod', 'react-hook-form', '@hookform/resolvers/zod',
      ],
    },
  };
});
