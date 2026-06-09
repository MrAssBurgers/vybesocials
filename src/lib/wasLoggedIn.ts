const WAS_LOGGED_IN_KEY = 'vybe-was-logged-in';

export function getWasLoggedIn(): boolean {
  try {
    return localStorage.getItem(WAS_LOGGED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setWasLoggedIn(value: boolean): void {
  try {
    if (value) localStorage.setItem(WAS_LOGGED_IN_KEY, '1');
    else localStorage.removeItem(WAS_LOGGED_IN_KEY);
  } catch {
    /* noop */
  }
}
