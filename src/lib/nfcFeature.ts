/**
 * Master switch for all NFC / Phone Tap surfaces in VYBE.
 *
 * Friend Link, referrals, wallet tag listen, and Despia `nfc://` bridges stay
 * OFF while this is false — QR (and existing non-NFC share) only.
 *
 * Flip to `true` only after Product re-enables NFC and the native shell has
 * NFC capability + a store rebuild.
 */
export const NFC_ENABLED = false;
