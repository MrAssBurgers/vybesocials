/** Normalize email for Supabase auth (trim + lowercase). */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}
