import "./lib/idleCallbackPolyfill";
import "./lib/bootstrapAuthStorage";

import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "./index.css";
import "./styles/repaint-guard.css";
import "./styles/smooth-ui.css";
import "./styles/liquid-buttons.css";
import "./styles/soft-surfaces.css";
import "./earlyThemeBoot";
import App from "./App.tsx";
import { isOneSignalBypassHost } from "./lib/lovablePreview";
import { initializeNativePlugins, isNativePlatform } from "./lib/capacitor";
import { initializeAdMob } from "./lib/admob";
import { isDespiaRuntime } from "./lib/despiaBridge";
import { initDespiaOAuthDeepLinkHandler } from "./lib/despiaOAuth";
import { syncNativeTrackingConsent } from "./lib/att";
import { installAttResumeRecovery } from "./lib/attResumeRecovery";
import {
  cleanupPreviewServiceWorkers,
  isLocalDevHost,
  isPreviewServiceWorkerDisabled,
  registerVybeServiceWorker,
} from "./lib/serviceWorker";
import { warmupAnimations, preloadFramerMotion } from "./lib/animationWarmup";
import { installFlickerGuardCheck } from "./lib/flickerGuardCheck";
import { installDespiaRealtimeTransport } from "./lib/installDespiaRealtimeTransport";
import { initSentry } from "./lib/sentry";
import { ensureNativeSplashHandoffAttr, initNativePerfMode, isNativePerfMode } from "./lib/nativePerfMode";
import { repairLegacyAuthStorage, clearObsoleteAuthStorage } from "./lib/legacyAuthStorage";
import { installAuthSessionKeepAlive } from "./lib/authSessionKeepAlive";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installDespiaRewardedAdBridge } from "./lib/despiaRewardedAds";
import { NFC_ENABLED } from "./lib/nfcFeature";
import { isFirebaseConfigured } from "./lib/firebase/config";
import { initFirebaseAppCheck } from "./lib/firebase/appCheck";
import { isMaintenanceMode } from "./lib/maintenanceMode";
import { MaintenanceScreen } from "./components/system/MaintenanceScreen";
import { FirebaseConfigScreen } from "./components/system/FirebaseConfigScreen";
import { BootRecoveryScreen } from "./components/system/BootRecoveryScreen";
import { markBootComplete, showBootRecovery } from "./lib/bootGuard";
import { logStartupPhase } from "./lib/startupTiming";
import { stampRuntimeOsOnDocument, getRuntimeOs } from "./lib/despiaBridge";
import { installExternalLinkGuard } from "./lib/externalLinkGuard";
import { onPageLoaded } from "./lib/onPageLoaded";

// Mark eval BEFORE any native patches — Despia Android previously threw on
// location.assign and never reached this flag (splash stuck forever).
try {
  window.__VYBE_MAIN_EVAL__ = true;
  try {
    if (typeof window.__vybeStopFakeSplash === "function") {
      window.__vybeStopFakeSplash();
    }
  } catch {
    /* ignore */
  }
} catch {
  /* ignore */
}
try {
  stampRuntimeOsOnDocument();
  ensureNativeSplashHandoffAttr();
} catch {
  /* ignore */
}
try {
  installExternalLinkGuard();
} catch {
  /* ignore — never abort boot for link-guard patch failures */
}
logStartupPhase("App started", { os: getRuntimeOs() });

/**
 * Despia/push sometimes lands `/?login-approval=…` as pathname `/%3Flogin-approval=…`
 * (literal encoded "?"). React Router then 404s and can drop the session UX.
 */
function normalizeEncodedQueryPathname(): void {
  try {
    const { pathname, search, hash } = window.location;
    if (!pathname.includes("%3F") && !pathname.includes("%3f")) return;
    const decodedPath = decodeURIComponent(pathname);
    // e.g. pathname "/%3Flogin-approval=abc" → "/?login-approval=abc"
    if (decodedPath.startsWith("/?")) {
      const fixed = decodedPath + (search && search !== "?" ? search.replace(/^\?/, "&") : "") + hash;
      window.history.replaceState(null, "", fixed);
      return;
    }
    const idx = decodedPath.indexOf("?");
    if (idx >= 0) {
      const fixed = decodedPath.slice(0, idx) + decodedPath.slice(idx) + search + hash;
      window.history.replaceState(null, "", fixed.startsWith("/") ? fixed : "/" + fixed);
    }
  } catch {
    /* ignore */
  }
}
normalizeEncodedQueryPathname();

function runSafeBootStep(label: string, callback: () => void) {
  try {
    callback();
  } catch (error) {
    console.error(`[VYBE] ${label} failed during boot:`, error);
  }
}

function isPreviewOneSignalDomainError(message: unknown) {
  if (typeof message !== "string") return false;
  if (message.includes("Can only be used on: https://vybehub.app")) return true;
  if (isOneSignalBypassHost() && message.toLowerCase().includes("onesignal")) return true;
  return false;
}

function runPreRenderInit() {
  const deferHeavy = (fn: () => void) => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) idle(fn, { timeout: 2000 });
    else setTimeout(fn, 1);
  };

  deferHeavy(() => initSentry());

  if (isFirebaseConfigured()) {
    deferHeavy(() => {
      runSafeBootStep("App Check init", () => {
        initFirebaseAppCheck();
      });
    });
  }

  initNativePerfMode();
  repairLegacyAuthStorage();
  clearObsoleteAuthStorage();
  installAuthSessionKeepAlive();
  // NFC disabled product-wide — skip Despia onNFCEvent dispatcher until re-enabled.
  if (NFC_ENABLED) {
    void import("./lib/despiaNFCv2").then(({ installDespiaNfcDispatcher }) => {
      installDespiaNfcDispatcher();
    });
  }
  installDespiaRewardedAdBridge();
  installDespiaRealtimeTransport();

  runSafeBootStep("legacy storage cleanup", () => {
    localStorage.removeItem("vybe.bioauth.enabled");
  });

  const scheduleAnimationWarmup = () => {
    // Store shells already import the motion primitives needed by the active
    // screen. Downloading/warming the full animation chunk during cold start
    // competes with auth and feed hydration on both iOS and Android.
    if (isNativePlatform || isNativePerfMode()) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) {
      idle(() => {
        warmupAnimations();
        preloadFramerMotion();
      }, { timeout: 3000 });
      return;
    }
    setTimeout(() => {
      warmupAnimations();
      preloadFramerMotion();
    }, 400);
  };
  scheduleAnimationWarmup();

  installFlickerGuardCheck();

  const noisyPatterns = [
    "[WM] No SW registration for postMessage",
    "Op failed (no retry)",
    "[RPC] compute_vybe_dna unavailable",
    "[Feed RPC]",
    "[Firestore] permission-denied",
    "[Firestore] missing index",
    "[AppCheck] VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY not set",
    "Automatic fallback to software WebGL",
    "Unrecognized feature: 'web-share'",
  ];
  const isNoisy = (args: unknown[]) => {
    const first = args[0];
    if (typeof first !== 'string') return false;
    return noisyPatterns.some((p) => first.includes(p));
  };

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (isNoisy(args)) return;
    originalConsoleError.apply(console, args);
  };
  const originalConsoleWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (isNoisy(args)) return;
    originalConsoleWarn.apply(console, args);
  };

  syncNativeTrackingConsent();
  installAttResumeRecovery();
  initDespiaOAuthDeepLinkHandler();

  if (isNativePlatform) {
    initializeNativePlugins()
      .then(() => {
        console.log("[VYBE] Native platform initialized");
        initializeAdMob();
      })
      .catch((error) => {
        console.error("[VYBE] Native platform init failed:", error);
      });
  }

  if (isDespiaRuntime()) {
    void initializeAdMob();
  }

  if ("serviceWorker" in navigator) {
    const shouldIgnorePreviewPushErrors = isPreviewServiceWorkerDisabled();

    window.addEventListener("error", (event) => {
      if (shouldIgnorePreviewPushErrors && isPreviewOneSignalDomainError(event.message)) {
        console.warn("[VYBE] Ignored preview-only OneSignal error");
        event.preventDefault();
      }
    });

    window.addEventListener("unhandledrejection", (event) => {
      const rejectionMessage = event.reason instanceof Error ? event.reason.message : event.reason;
      if (shouldIgnorePreviewPushErrors && isPreviewOneSignalDomainError(rejectionMessage)) {
        console.warn("[VYBE] Ignored preview-only OneSignal rejection");
        event.preventDefault();
      }
    });

    onPageLoaded(async () => {
      try {
        if (import.meta.env.DEV && isLocalDevHost()) {
          await cleanupPreviewServiceWorkers();
          console.info("[VYBE] Service worker disabled for local dev");
          return;
        }
        if (isPreviewServiceWorkerDisabled()) {
          await cleanupPreviewServiceWorkers();
          console.info("[VYBE] Service worker disabled for preview host");
          return;
        }
        await registerVybeServiceWorker();
      } catch (error) {
        console.error("[VYBE] Service worker registration failed:", error);
      }
    });
  }
}

function renderVybeApp() {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Missing #root mount node");
  }

  const root = createRoot(rootEl);

  if (isMaintenanceMode()) {
    root.render(
      <ErrorBoundary scope="maintenance">
        <MaintenanceScreen />
      </ErrorBoundary>,
    );
  } else if (!isFirebaseConfigured()) {
    root.render(
      <ErrorBoundary scope="config">
        <FirebaseConfigScreen />
      </ErrorBoundary>,
    );
  } else {
    root.render(
      <StrictMode>
        <ErrorBoundary scope="root">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  }
}

try {
  // First paint first — never await Firebase / push / analytics / SW before React mounts.
  logStartupPhase(
    isFirebaseConfigured() ? "Firebase initialized" : "Firebase not configured",
  );
  renderVybeApp();
  logStartupPhase("React root rendered");

  // Heavy native bridges / SW / Sentry after the first frame.
  queueMicrotask(() => {
    runPreRenderInit();
    logStartupPhase("Background boot init scheduled");
  });

  // Fonts: fail-open (never block UI). Log when ready for Xcode profiling.
  try {
    if (document.fonts?.ready) {
      void document.fonts.ready.then(
        () => logStartupPhase("Fonts loaded"),
        () => logStartupPhase("Fonts loaded", { failed: true }),
      );
    } else {
      logStartupPhase("Fonts loaded", { api: "unavailable" });
    }
  } catch {
    logStartupPhase("Fonts loaded", { failed: true });
  }

  // Maintenance/config screens have no splash — mark boot ready immediately.
  if (isMaintenanceMode() || !isFirebaseConfigured()) {
    try {
      markBootComplete();
    } catch {
      /* ignore */
    }
  }
} catch (error) {
  console.error("[VYBE] Fatal boot error:", error);
  showBootRecovery("react_boot_error");
  try {
    const rootEl = document.getElementById("root");
    if (rootEl) {
      createRoot(rootEl).render(<BootRecoveryScreen error={error} />);
      markBootComplete();
    }
  } catch (fallbackError) {
    console.error("[VYBE] Boot recovery render failed:", fallbackError);
  }
}
