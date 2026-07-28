import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { componentTagger } from 'lovable-tagger';
// @ts-expect-error despia-local ships without TypeScript declarations
import { despiaLocalPlugin } from '@despia/local/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Always emit despia/local.json (Native Offline). VITE_OFFLINE_MODE=pwa only
  // affects client SW strategy — never skip the Despia manifest or deployed_at stalls.
  const offlineMode = env.VITE_OFFLINE_MODE || 'despia-local';
  const useDespiaLocal = true;

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
    'VITE_FIREBASE_APP_CHECK_PROVIDER',
    'VITE_MAINTENANCE_MODE',
    'VITE_MAINTENANCE_MESSAGE',
    'VITE_MAPBOX_ACCESS_TOKEN',
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
          // Content-hashed primary entry forces Despia OTA to download each build.
          // postbuild-offline also creates /assets/app.js as a stable recovery alias.
          entryFileNames: 'assets/app-[hash].js',
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
            'vendor-mapbox': ['mapbox-gl'],
            'vendor-livekit': ['livekit-client'],
          },
        },
      },
      minify: 'esbuild',
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
    },
    optimizeDeps: {
      // The app has hundreds of lazy routes. Do not hold /src/main.tsx until
      // Vite finishes crawling the entire source tree; discovery can continue
      // in the background and add uncommon dependencies as routes open.
      holdUntilCrawlEnd: false,
      include: [
        'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom',
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
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
