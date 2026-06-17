import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { componentTagger } from 'lovable-tagger';
// @ts-expect-error despia-local ships without TypeScript declarations
import { despiaLocalPlugin } from '@despia/local/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const offlineMode = env.VITE_OFFLINE_MODE || 'pwa';
  const useDespiaLocal = offlineMode === 'despia-local';

  const firebaseEnvKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MEASUREMENT_ID',
    'VITE_FIREBASE_FUNCTIONS_REGION',
    'VITE_FIREBASE_VAPID_KEY',
    'VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY',
    'VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN',
    'VITE_MAINTENANCE_MODE',
    'VITE_MAINTENANCE_MESSAGE',
  ] as const;

  const firebaseDefine = Object.fromEntries(
    firebaseEnvKeys.map((key) => [key, JSON.stringify(env[key] ?? '')]),
  );

  return {
    server: {
      host: '127.0.0.1',
      port: 8080,
      strictPort: false,
      open: false,
    },
    define: {
      ...firebaseDefine,
      'import.meta.env.VITE_OFFLINE_MODE': JSON.stringify(offlineMode),
    },
    plugins: [
      react(),
      useDespiaLocal && despiaLocalPlugin({ outDir: 'dist', entryHtml: 'index.html' }),
      mode === 'development' && componentTagger(),
    ].filter(Boolean),
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Stable entry filename — Lovable publish was serving stale index-*.js hashes.
          entryFileNames: 'assets/app.js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
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
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
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
        'firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions',
        'lucide-react',
        'clsx', 'tailwind-merge', 'class-variance-authority',
        'date-fns',
        'i18next', 'react-i18next', 'i18next-browser-languagedetector',
        'zod', 'react-hook-form', '@hookform/resolvers/zod',
      ],
    },
  };
});
