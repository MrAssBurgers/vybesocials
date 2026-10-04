import type { PublishStoryMediaResult } from './publishStoryMedia';

/** One explicit draft retains its identity and media after an unknown save result. */
export function createStoryComposerDraft() {
  const requestId = `story-${crypto.randomUUID()}`;
  let prepared: Promise<PublishStoryMediaResult> | undefined;
  let submitted = false;
  let fingerprint: string | undefined;
  let result: unknown;
  let completed = false;
  return {
    requestId,
    get locked() { return submitted; },
    prepare(upload: () => Promise<PublishStoryMediaResult>) {
      // Preserve an upload still in progress, including after a UI timeout.
      if (!prepared) prepared = upload().catch(error => { prepared = undefined; throw error; });
      return prepared;
    },
    async publish<T>(payload: object, publish: () => Promise<T>): Promise<T> {
      const next = JSON.stringify(payload);
      if (fingerprint !== undefined && fingerprint !== next) {
        throw new Error('This story has already been submitted. Retry it unchanged, or start a new story.');
      }
      fingerprint = next;
      submitted = true;
      if (completed) return result as T;
      const saved = await publish();
      result = saved;
      completed = true;
      return saved;
    },
  };
}
