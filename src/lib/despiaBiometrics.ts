// Backwards-compatible re-export. Real implementation now lives in
// `./biometrics.ts` and is platform-aware (Capacitor → Despia → web).
export {
  isDespia,
  isBiometricsAvailable,
  requestBioAuth,
  confirmWithBiometrics,
  getBioAuthPref,
  setBioAuthPref,
} from './biometrics';
export type { BioAuthResult } from './biometrics';
