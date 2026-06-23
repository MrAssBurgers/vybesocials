/** Snap-style heat zone colors by intensity 0–100. */
export function heatmapColor(intensity: number): string {
  if (intensity >= 80) return '#ef4444';
  if (intensity >= 60) return '#f97316';
  if (intensity >= 40) return '#eab308';
  if (intensity >= 20) return '#22c55e';
  return '#3b82f6';
}

export function heatmapOpacity(intensity: number): number {
  return Math.min(0.55, 0.15 + intensity / 200);
}
