/** Exact handle, lowercase, and a single capital letter. Firestore username equality is case-sensitive. */
export function profileUsernameCandidates(raw: string): string[] {
  const name = raw.trim().replace(/^@+/, '');
  if (!name || name.includes('/')) return [];
  const lower = name.toLowerCase();
  const titled = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [...new Set([name, lower, titled])];
}
