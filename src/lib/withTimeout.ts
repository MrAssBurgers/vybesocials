/** Reject if `promise` does not settle within `ms`. */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

/** `fetch` with an AbortController timeout. */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    window.clearTimeout(timer)
  );
}
