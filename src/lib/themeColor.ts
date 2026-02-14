/**
 * Get the user's primary theme color as a hex string (without #).
 * Falls back to 'a855f7' (purple) if unable to read CSS vars.
 */
export function getPrimaryHex(): string {
  try {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const primary = style.getPropertyValue('--primary').trim();

    if (primary) {
      const hslMatch = primary.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%?\s+(\d+(?:\.\d+)?)%?/);
      if (hslMatch) {
        const h = parseFloat(hslMatch[1]);
        const s = parseFloat(hslMatch[2]) / 100;
        const l = parseFloat(hslMatch[3]) / 100;

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;

        if (h >= 0 && h < 60) { r = c; g = x; }
        else if (h >= 60 && h < 120) { r = x; g = c; }
        else if (h >= 120 && h < 180) { g = c; b = x; }
        else if (h >= 180 && h < 240) { g = x; b = c; }
        else if (h >= 240 && h < 300) { r = x; b = c; }
        else { r = c; b = x; }

        const toHex = (n: number) => {
          const hex = Math.round((n + m) * 255).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        };

        return `${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
    }
  } catch {
    // fallback
  }
  return 'a855f7';
}
