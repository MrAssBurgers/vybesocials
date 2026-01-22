/**
 * AUTH-ONLY MODE (TEMPORARY)
 *
 * Emergency switch to prove authentication works by bypassing:
 * - profile fetching/creation
 * - global data rehydration/bootstrap
 * - startup loading gates
 *
 * Set to `false` to restore the normal app flow.
 */
export const AUTH_ONLY_MODE = true;
