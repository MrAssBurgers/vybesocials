import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { dnaRow, normalizeDnaChange, dnaTargetAfter, dnaTargetCollection, dnaTargetDto } from './dnaActionSchema.js';
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const version = (snap) => snap.updateTime ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : null;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaults = { mode: 'suggest', cadence_minutes: 360, last_run_at: null, trigger_on_post: true, trigger_on_follow: true, trigger_on_session: true, max_intensity: 'balanced', learning_paused: false, personalization_opted_out: false };
function settingsDto(value, uid) {
    const out = { user_id: uid, ...defaults };
    for (const key of Object.keys(defaults))
        if (value?.[key] !== undefined)
            out[key] = value[key];
    return out;
}
function settingsPatch(value) {
    if (!dnaRow(value) || !Object.keys(value).length || Object.entries(value).some(([key, val]) => {
        if (key === 'mode')
            return !['off', 'suggest', 'autonomous'].includes(String(val));
        if (key === 'max_intensity')
            return !['gentle', 'balanced', 'bold'].includes(String(val));
        if (key === 'cadence_minutes')
            return !Number.isSafeInteger(val) || Number(val) < 30 || Number(val) > 1440 || Number(val) % 30 !== 0;
        return !['trigger_on_post', 'trigger_on_follow', 'trigger_on_session', 'learning_paused', 'personalization_opted_out'].includes(key) || typeof val !== 'boolean';
    }))
        throw new HttpsError('invalid-argument', 'Unsupported Auto-Pilot settings.');
    return value;
}
function generationOf(state) {
    if (state?.resetting)
        throw new HttpsError('failed-precondition', 'Adaptation data is being cleared. Retry after it finishes.');
    return state?.generation ?? 'initial';
}
async function identity(store, tx, uid, profileId) {
    const owner = await resolveIdentity(store, tx, uid);
    if (!owner || owner.uid !== uid || (profileId !== undefined && owner.profileId !== profileId))
        throw new HttpsError('failed-precondition', 'Your profile changed. Refresh Auto-Pilot.');
    return owner;
}
async function quota(store, tx, uid) {
    const ref = store.doc(`_dna_action_limits/${uid}`), old = (await tx.get(ref)).data() || {}, now = Date.now();
    const fresh = typeof old.start === 'number' && old.start + 60_000 > now, count = fresh ? Number(old.count) || 0 : 0;
    if (count >= 60)
        throw new HttpsError('resource-exhausted', 'Auto-Pilot is busy. Wait a minute and retry.');
    return () => tx.set(ref, { start: fresh ? old.start : now, count: count + 1 });
}
async function target(store, tx, uid, collection) {
    const [direct, matches] = await Promise.all([tx.get(store.doc(`${collection}/${uid}`)), tx.get(store.collection(collection).where('user_id', '==', uid).limit(2))]);
    if (matches.size > 1 || (direct.exists && (direct.data()?.user_id !== uid || (!matches.empty && matches.docs[0].id !== uid))))
        throw new HttpsError('failed-precondition', 'Your saved settings are ambiguous. Review them before applying Auto-Pilot.');
    return matches.docs[0] || direct;
}
function actionDto(action, actionId, plan, generation) {
    const trusted = plan?.version === 1 && plan.owner_uid === action.user_id && plan.generation === generation && plan.action_id === actionId && plan.action_hash === hash({ type: action.action_type, summary: action.summary, created_at: action.created_at });
    const change = trusted ? normalizeDnaChange(plan.change) : null;
    const phase = change && ['suggested', 'applied', 'reverted'].includes(String(plan?.phase)) ? String(plan.phase) : 'informational';
    return { id: actionId, user_id: action.user_id, action_type: action.action_type, summary: action.summary ?? action.reason,
        created_at: action.created_at, phase, applied: phase === 'applied', reverted: phase === 'reverted',
        change, before: change ? dnaTargetDto(change, plan.before) : null,
        after: change ? dnaTargetDto(change, plan.after) : null, generation: trusted ? generation : null };
}
/** Draft snapshots and protected plans are saved with the public history row in one transaction. */
export async function saveExecutableDnaActions(store, uid, generation, actions, expectedProfileId) {
    const refs = actions.map(() => store.collection('dna_agent_actions').doc());
    return store.runTransaction(async (tx) => {
        const owner = await identity(store, tx, uid, expectedProfileId);
        const [state, settings] = await Promise.all([tx.get(store.doc(`_dna_adaptation_state/${uid}`)), tx.get(store.doc(`dna_agent_settings/${uid}`))]);
        const policy = settings.data();
        if (generationOf(state.data()) !== generation || policy?.mode === 'off' || policy?.learning_paused === true || policy?.personalization_opted_out === true)
            throw new HttpsError('failed-precondition', 'Your Auto-Pilot preferences changed. This run was discarded.');
        const changes = actions.map(action => normalizeDnaChange(action.change));
        const snaps = await Promise.all(changes.map(change => change ? target(store, tx, uid, dnaTargetCollection(change)) : null));
        const saved = actions.map((action, index) => {
            const { change: ignored, ...content } = action;
            void ignored;
            const value = { ...content, id: refs[index].id, user_id: uid };
            const change = changes[index], snap = snaps[index];
            let plan;
            if (change && snap) {
                const before = snap.exists ? snap.data() : null;
                if (JSON.stringify(before).length > 48_000)
                    throw new HttpsError('failed-precondition', 'Your settings are too large for a safe Auto-Pilot undo.');
                let after;
                try {
                    after = dnaTargetAfter(change, before, uid);
                }
                catch (error) {
                    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Settings could not be verified.');
                }
                if (JSON.stringify(before) !== JSON.stringify(after))
                    plan = { version: 1, owner_uid: uid, profile_id: owner.profileId, generation, action_id: refs[index].id,
                        action_hash: hash({ type: value.action_type, summary: value.summary, created_at: value.created_at }),
                        change, before, after, target_path: snap.ref.path, before_version: version(snap), phase: 'suggested' };
                if (plan)
                    tx.create(store.doc(`_dna_action_plans/${refs[index].id}`), plan);
            }
            tx.create(refs[index], value);
            return actionDto(value, refs[index].id, plan, generation);
        });
        tx.set(store.doc(`dna_agent_settings/${uid}`), { user_id: uid, last_run_at: new Date().toISOString() }, { merge: true });
        return saved;
    });
}
export async function manageDnaActions(store, uid, raw) {
    if (!dnaRow(raw) || raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen Auto-Pilot.');
    const op = raw.operation;
    const allowed = op === 'state' ? [] : op === 'settings' ? ['patch', 'settingsVersion', 'requestId'] : ['actionId', 'applyPending', 'generation', 'requestId'];
    if (!validAudienceId(raw.expectedProfileId) || !['state', 'settings', 'change'].includes(String(op))
        || Object.keys(raw).some(k => !['expectedOwnerUid', 'expectedProfileId', 'operation', ...allowed].includes(k))
        || (op !== 'state' && !id(raw.requestId)))
        throw new HttpsError('invalid-argument', 'Invalid Auto-Pilot request.');
    const patch = op === 'settings' ? settingsPatch(raw.patch) : null;
    if (op === 'settings' && !(raw.settingsVersion === null || typeof raw.settingsVersion === 'string'))
        throw new HttpsError('invalid-argument', 'Refresh your Auto-Pilot settings.');
    if (op === 'change' && (!id(raw.actionId) || typeof raw.applyPending !== 'boolean' || typeof raw.generation !== 'string'))
        throw new HttpsError('invalid-argument', 'Invalid Auto-Pilot action.');
    return store.runTransaction(async (tx) => {
        const owner = await identity(store, tx, uid, raw.expectedProfileId);
        const stateRef = store.doc(`_dna_adaptation_state/${uid}`), settingsRef = store.doc(`dna_agent_settings/${uid}`);
        const [state, settings] = await Promise.all([tx.get(stateRef), tx.get(settingsRef)]);
        const generation = generationOf(state.data()), applyQuota = await quota(store, tx, uid);
        const binding = { success: true, ownerUid: uid, profileId: owner.profileId, generation };
        if (op === 'state') {
            const history = await tx.get(store.collection('dna_agent_actions').where('user_id', '==', uid).orderBy('created_at', 'desc').limit(30));
            const plans = await Promise.all(history.docs.map(doc => tx.get(store.doc(`_dna_action_plans/${doc.id}`))));
            const actions = history.docs.map((doc, index) => actionDto(doc.data(), doc.id, plans[index].data()?.profile_id === owner.profileId ? plans[index].data() : undefined, generation));
            applyQuota();
            return { ...binding, settings: settingsDto(settings.data(), uid), settingsVersion: version(settings), actions };
        }
        const receiptRef = store.doc(`_dna_action_receipts/${hash([uid, raw.requestId])}`);
        const receipt = await tx.get(receiptRef), requestHash = hash(raw);
        if (receipt.exists && (receipt.data()?.request_hash !== requestHash || receipt.data()?.generation !== generation))
            throw new HttpsError('failed-precondition', 'This Auto-Pilot request is no longer current. Refresh and retry.');
        if (op === 'settings') {
            if (receipt.exists) {
                applyQuota();
                return { ...binding, requestId: raw.requestId, settings: settingsDto(settings.data(), uid), settingsVersion: version(settings) };
            }
            if (raw.settingsVersion !== version(settings))
                throw new HttpsError('failed-precondition', 'Auto-Pilot settings changed elsewhere. Refresh before trying again.');
            const next = { ...settings.data(), ...patch, user_id: uid };
            tx.set(settingsRef, next);
            applyQuota();
            tx.create(receiptRef, { owner_uid: uid, request_hash: requestHash, generation });
            return { ...binding, requestId: raw.requestId, settings: settingsDto(next, uid), settingsVersion: null };
        }
        if (raw.generation !== generation)
            throw new HttpsError('failed-precondition', 'This suggestion predates your adaptation reset. Run Auto-Pilot again.');
        const actionRef = store.doc(`dna_agent_actions/${raw.actionId}`), planRef = store.doc(`_dna_action_plans/${raw.actionId}`);
        const [action, planSnap] = await Promise.all([tx.get(actionRef), tx.get(planRef)]);
        const plan = planSnap.data();
        if (!action.exists || action.data()?.user_id !== uid)
            throw new HttpsError('permission-denied', 'This Auto-Pilot action is unavailable.');
        const dto = actionDto(action.data(), action.id, plan, generation), change = normalizeDnaChange(dto.change);
        if (!plan || !change || plan.profile_id !== owner.profileId || !String(plan.target_path).startsWith(`${dnaTargetCollection(change)}/`))
            throw new HttpsError('failed-precondition', 'This older suggestion has no verified change to apply or undo. Run Auto-Pilot again.');
        const targetSnap = await target(store, tx, uid, dnaTargetCollection(change));
        if (targetSnap.ref.path !== plan.target_path)
            throw new HttpsError('failed-precondition', 'Your saved settings changed. Run Auto-Pilot again.');
        const desired = raw.applyPending ? 'applied' : 'reverted';
        const current = plan.phase;
        if (receipt.exists || current === desired) {
            if (current !== desired)
                throw new HttpsError('failed-precondition', 'This action has already moved to another state. Refresh Auto-Pilot.');
            // The plan and target are written by the same atomic commit. Compare the
            // document updateTime, not a serverTimestamp transform (which can differ).
            const stillCurrent = targetSnap.exists ? version(targetSnap) === version(planSnap) : plan.before === null && desired === 'reverted';
            if (!stillCurrent)
                throw new HttpsError('failed-precondition', 'Your settings changed after this action. Your newer choices were preserved.');
            if (!receipt.exists)
                tx.create(receiptRef, { owner_uid: uid, request_hash: requestHash, generation, action_id: action.id, phase: desired });
            applyQuota();
            return { ...binding, requestId: raw.requestId, actionId: action.id, applied: desired === 'applied', phase: desired, action: dto, target: dnaTargetDto(change, targetSnap.data() || null) };
        }
        if ((raw.applyPending && current !== 'suggested') || (!raw.applyPending && current !== 'applied'))
            throw new HttpsError('failed-precondition', 'This action can no longer be changed. Run Auto-Pilot again.');
        const policy = settings.data();
        if (raw.applyPending && (policy?.mode === 'off' || policy?.learning_paused === true || policy?.personalization_opted_out === true))
            throw new HttpsError('failed-precondition', 'Auto-Pilot is paused. Review its settings before applying a suggestion.');
        const expectedVersion = raw.applyPending ? plan.before_version : version(planSnap);
        if (version(targetSnap) !== expectedVersion)
            throw new HttpsError('failed-precondition', 'Your settings changed since this suggestion. Your newer choices were preserved.');
        const next = (raw.applyPending ? plan.after : plan.before);
        if (next === null)
            tx.delete(targetSnap.ref);
        else
            tx.set(targetSnap.ref, next);
        tx.update(planRef, { phase: desired });
        tx.update(actionRef, { applied: desired === 'applied', reverted: desired === 'reverted', status: desired });
        tx.create(receiptRef, { owner_uid: uid, request_hash: requestHash, generation, action_id: action.id, phase: desired });
        applyQuota();
        return { ...binding, requestId: raw.requestId, actionId: action.id, applied: desired === 'applied', phase: desired,
            action: { ...dto, phase: desired, applied: desired === 'applied', reverted: desired === 'reverted' }, target: dnaTargetDto(change, next) };
    });
}
//# sourceMappingURL=dnaActionAuthority.js.map