/** Bound both network and JSON decoding; abort alone cannot retire an ignored signal. */
export async function mapProviderJson(url: string, signal?: AbortSignal, timeoutMs = 6_000): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retire!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    retire = () => { controller.abort(); reject(new Error('Map request cancelled.')); };
    signal?.addEventListener('abort', retire, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error('The map service took too long. Please retry.')); }, timeoutMs);
  });
  try {
    if (signal?.aborted) { retire(); return await cancelled; }
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('The map service is unavailable. Please retry.');
        return response.json() as Promise<unknown>;
      })(),
      cancelled,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', retire);
  }
}
