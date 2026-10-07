const POST_READ_TIMEOUT_MS = 15_000;

/** Bound the whole read, including count admission and summary pagination.
 * SDK transport may finish later; its continuations must use current(). */
export async function withPostReadDeadline<T>(operation: (current: () => void) => Promise<T>, guard: () => void, signal: AbortSignal): Promise<T> {
  const deadline = Date.now() + POST_READ_TIMEOUT_MS;
  let active = true, timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
  const expired = () => Object.assign(new Error('Posts are taking too long to load. Please retry.'), { code: 'deadline-exceeded' });
  const current = () => {
    guard();
    if (signal.aborted) throw new DOMException('Post view interrupted.', 'AbortError');
    if (!active || Date.now() >= deadline) throw expired();
  };
  try {
    current();
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { active = false; reject(expired()); }, POST_READ_TIMEOUT_MS);
      abort = () => { active = false; reject(new DOMException('Post view interrupted.', 'AbortError')); };
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
