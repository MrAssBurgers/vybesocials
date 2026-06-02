/** Routes that use the auth Landing liquid shell (inline aurora, not app-shell mount). */
export const AUTH_LIQUID_PATHS = [
  '/login',
  '/signin',
  '/sign-in',
  '/signup',
  '/sign-up',
  '/auth',
] as const;

export function isAuthLiquidPath(pathname: string): boolean {
  return AUTH_LIQUID_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/** Routes where the portaled app-shell aurora is suppressed. */
export function isExcludedLiquidPath(pathname: string): boolean {
  return pathname === '/upload' || pathname.startsWith('/upload/') || isAuthLiquidPath(pathname);
}
