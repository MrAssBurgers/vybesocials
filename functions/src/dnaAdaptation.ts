import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { normalizeDnaChange } from './_shared/dnaActionSchema.js';
import { manageDnaActions, saveExecutableDnaActions } from './_shared/dnaActionAuthority.js';

const collections = ['dna_auto_theme', 'dna_agent_actions', 'dna_content_preferences', '_dna_action_plans', '_dna_action_receipts'] as const;
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const initialGeneration = 'initial';
const suggestionTypes = ['feed_tune', 'layout_change', 'apply_theme', 'navigate', 'generate_theme'];

export function parseDnaSuggestions(content: string, mode: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { return []; }
  const actions = Array.isArray(parsed) ? parsed : row(parsed) && Array.isArray(parsed.actions) ? parsed.actions : [];
  return actions.filter(action => row(action) && suggestionTypes.includes(String(action.type))
    && typeof action.reason === 'string' && action.reason.trim().length > 0 && action.reason.length <= 500)
    .slice(0, 3).map(action => {
      const change = normalizeDnaChange({ type: action.type, ...(action.preset !== undefined ? { preset: action.preset } : {}), ...(action.patch !== undefined ? { patch: action.patch } : {}) });
      return { action_type: action.type as string, summary: (action.reason as string).trim(),
        before: null, after: null, applied: false, reverted: false, mode, status: 'suggested', created_at: new Date().toISOString(), ...(change ? { change } : {}) };
    });
}

/** Server-only reset generation prevents work started before a reset from restoring erased history. */
export async function readDnaAdaptationGeneration(store: Firestore, uid: string): Promise<string> {
  const state = (await store.collection('_dna_adaptation_state').doc(uid).get()).data();
  if (state?.resetting) throw new HttpsError('failed-precondition', 'Adaptation data is being cleared. Retry after it finishes.');
  return state?.generation ?? initialGeneration;
}

export async function saveDnaActions(store: Firestore, uid: string, generation: string, actions: Record<string, unknown>[], expectedProfileId?: string) {
  if (!Array.isArray(actions) || actions.length > 3 || actions.some(action => !row(action)
    || Object.keys(action).some(key => !['action_type', 'summary', 'before', 'after', 'applied', 'reverted', 'mode', 'status', 'created_at', 'change'].includes(key))
    || (action.change !== undefined && (!normalizeDnaChange(action.change) || normalizeDnaChange(action.change)?.type !== action.action_type))
    || !suggestionTypes.includes(String(action.action_type)) || typeof action.summary !== 'string' || !action.summary.trim() || action.summary.length > 500
    || action.before !== null || action.after !== null || action.applied !== false || action.reverted !== false || action.status !== 'suggested'
    || !['suggest', 'autonomous'].includes(String(action.mode)) || typeof action.created_at !== 'string' || !Number.isFinite(Date.parse(action.created_at)))) {
    throw new HttpsError('invalid-argument', 'Auto-Pilot suggestions were invalid. No actions were saved.');
  }
  if (actions.some(action => action.change !== undefined) || expectedProfileId) return saveExecutableDnaActions(store, uid, generation, actions, expectedProfileId);
  const saved = actions.map(action => ({ ...action, id: store.collection('dna_agent_actions').doc().id, user_id: uid }));
  await store.runTransaction(async tx => {
    const [state, settings] = await Promise.all([
      tx.get(store.collection('_dna_adaptation_state').doc(uid)),
      tx.get(store.collection('dna_agent_settings').doc(uid)),
    ]);
    const policy = settings.data();
    if (state.data()?.resetting || (state.data()?.generation ?? initialGeneration) !== generation
      || policy?.mode === 'off' || policy?.learning_paused === true || policy?.personalization_opted_out === true) {
      throw new HttpsError('failed-precondition', 'Your Auto-Pilot preferences changed. This run was discarded.');
    }
    for (const action of saved) tx.create(store.collection('dna_agent_actions').doc(action.id), action);
  });
  return saved;
}

export async function runDnaActionChange(store: Firestore, uid: string, input: unknown) {
  if (row(input) && input.operation !== undefined) return manageDnaActions(store, uid, input);
  if (!row(input) || Object.keys(input).some(key => !['expectedOwnerUid', 'actionId', 'applyPending'].includes(key))
    || typeof input.actionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.actionId)
    || typeof input.applyPending !== 'boolean' || typeof input.expectedOwnerUid !== 'string') {
    throw new HttpsError('invalid-argument', 'A valid Auto-Pilot action is required.');
  }
  if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Please try again.');
  const action = await store.collection('dna_agent_actions').doc(input.actionId).get();
  if (!action.exists || action.data()?.user_id !== uid) throw new HttpsError('permission-denied', 'This Auto-Pilot action is unavailable.');
  // Legacy rows contain suggestions/status labels, not a verified executable
  // change or undo snapshot. Updating only that label would falsely claim that
  // feed/theme/layout state changed. Keep the row intact until authority exists.
  throw new HttpsError('failed-precondition', 'Applying and undoing Auto-Pilot changes is temporarily unavailable. Your settings have not changed.');
}

export async function runClearDnaAdaptationData(store: Firestore, uid: string, input: unknown) {
  if (!row(input) || Object.keys(input).some(key => !['expectedOwnerUid', 'requestId'].includes(key))
    || typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)
    || typeof input.expectedOwnerUid !== 'string') throw new HttpsError('invalid-argument', 'A valid reset request is required.');
  if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Please try again.');
  const requestId = input.requestId;
  const stateRef = store.collection('_dna_adaptation_state').doc(uid);
  const receiptRef = store.collection('_dna_adaptation_resets').doc(createHash('sha256').update(JSON.stringify([uid, requestId])).digest('hex'));
  const prior = await store.runTransaction(async tx => {
    const [state, receipt] = await Promise.all([tx.get(stateRef), tx.get(receiptRef)]);
    if (receipt.exists) return receipt.data()!;
    if (state.data()?.resetting) {
      // A different tab/device can resume the same incomplete deletion without
      // starting a second reset or needing the first tab's session storage.
      if (state.data()?.request_id !== requestId) return { success: false, ownerUid: uid, requestId, pendingRequestId: state.data()!.request_id };
      return null;
    }
    const now = Date.now();
    const old = state.data();
    const windowStart = typeof old?.window_start === 'number' && old.window_start > now - 3600000 ? old.window_start : now;
    const count = windowStart === old?.window_start && Number.isSafeInteger(old?.reset_count) ? old!.reset_count : 0;
    if (count >= 10) throw new HttpsError('resource-exhausted', 'Too many adaptation resets. Please try again later.');
    tx.set(stateRef, { version: 1, owner_uid: uid, generation: randomUUID(), resetting: true, request_id: requestId,
      deleted: 0, started_at: new Date().toISOString(), window_start: windowStart, reset_count: count + 1 });
    return null;
  });
  if (prior) return prior;

  // Each page and its progress commit together. A timeout/error leaves a resumable
  // reset; there is no success receipt until every owned collection is empty.
  for (;;) {
    const receipt = await store.runTransaction(async tx => {
      const [state, completed] = await Promise.all([tx.get(stateRef), tx.get(receiptRef)]);
      if (completed.exists) return completed.data()!;
      const current = state.data();
      if (!current?.resetting || current.request_id !== requestId || current.owner_uid !== uid) {
        throw new HttpsError('aborted', 'The adaptation reset changed. Retry the original request.');
      }
      const pages = await Promise.all(collections.map(name => tx.get(store.collection(name).where(name.startsWith('_dna_') ? 'owner_uid' : 'user_id', '==', uid).limit(80))));
      const documents = pages.flatMap(page => page.docs);
      if (documents.length) {
        for (const document of documents) tx.delete(document.ref);
        tx.update(stateRef, { deleted: current.deleted + documents.length });
        return null;
      }
      const result = { success: true, ownerUid: uid, requestId, deleted: current.deleted };
      tx.create(receiptRef, result);
      tx.update(stateRef, { resetting: false, completed_at: new Date().toISOString() });
      return result;
    });
    if (receipt) return receipt;
  }
}

export const clearDnaAdaptationData = onCall({ timeoutSeconds: 300 }, async request => {
  const uid = requireAuth(request);
  return runClearDnaAdaptationData(db, uid, request.data);
});
