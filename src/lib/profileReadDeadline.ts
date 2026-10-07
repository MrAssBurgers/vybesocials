export const PROFILE_READ_TIMEOUT_MS = 15_000;

/** Retire a read even though the Firestore SDK cannot cancel its transport.
 * Every continuation must use current() before applying or dispatching work. */
export async function withProfileReadDeadline<T>(
  operation: (current: () => void) => Promise<T>,
  guard: () => void,
  signal: AbortSignal,
): Promise<T> {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const expired = () => Object.assign(
    new Error('Your profile is taking too long to load. Please retry.'),
    { code: 'deadline-exceeded' },
  );
  const current = () => {
    guard();
    if (!active) throw expired();
  };
  try {
    current();
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { active = false; reject(expired()); }, PROFILE_READ_TIMEOUT_MS);
      abort = () => {
        active = false;
        reject(new DOMException('Profile view interrupted.', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
    });
    const result = await Promise.race([operation(current), stopped]);
    current();
    return result;
  } finally {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}
