/**
 * Daily brief generation + smart ping dispatcher.
 * Scheduled functions that pre-generate AI briefs at 6am/12pm/6pm UTC.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth, messaging } from './_shared/admin.js';
import { chatCompletion } from './_shared/geminiAi.js';
function slot(d = new Date()) {
    const h = d.getUTCHours();
    if (h < 11)
        return 'morning';
    if (h < 17)
        return 'midday';
    return 'evening';
}
async function generateBrief(uid, currentSlot) {
    const prefsSnap = await db.collection('ai_brief_preferences').doc(uid).get();
    const prefs = prefsSnap.exists ? prefsSnap.data() : {};
    const dnaSnap = await db.collection('vybe_dna').doc(uid).get();
    const dna = dnaSnap.exists ? dnaSnap.data() : {};
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'You are a concise daily brief writer for VYBE. Output 3 bullet points: today\'s vybe, one suggestion, one challenge.' },
            { role: 'user', content: `User DNA: ${JSON.stringify(dna).slice(0, 800)}\nPrefs: ${JSON.stringify(prefs).slice(0, 400)}\nSlot: ${currentSlot}` },
        ],
        temperature: 0.7,
    });
    await db.collection('daily_brief_cache').doc(`${uid}_${currentSlot}`).set({
        user_id: uid, slot: currentSlot, content, generated_at: new Date().toISOString(),
    });
    return content;
}
export const briefTopicDetail = onCall({ secrets: ['GEMINI_API_KEY'] }, async (request) => {
    const uid = requireAuth(request);
    const { topic } = (request.data || {});
    if (!topic)
        throw new HttpsError('invalid-argument', 'topic required');
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'Expand a brief topic into 2-3 sentences. Concise, friendly.' },
            { role: 'user', content: `Topic: ${topic}\nUser: ${uid}` },
        ],
        temperature: 0.6,
    });
    return { ok: true, content };
});
/** Prewarm briefs for active users — runs every 6 hours. */
export const prewarmDailyBriefs = onSchedule({ schedule: 'every 6 hours', secrets: ['GEMINI_API_KEY'] }, async () => {
    const currentSlot = slot();
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const active = await db.collection('profiles').where('last_active_at', '>=', since).limit(500).get();
    let done = 0;
    for (const doc of active.docs) {
        try {
            const existing = await db.collection('daily_brief_cache').doc(`${doc.id}_${currentSlot}`).get();
            if (existing.exists) {
                const age = Date.now() - new Date(existing.data().generated_at).getTime();
                if (age < 6 * 3600_000)
                    continue;
            }
            await generateBrief(doc.id, currentSlot);
            done++;
        }
        catch (e) {
            console.warn('brief failed', doc.id, e);
        }
    }
    console.log(`prewarmed ${done}/${active.size} briefs (${currentSlot})`);
});
/** Send ping notifications to users with new briefs — runs every hour. */
export const smartBriefPings = onSchedule({ schedule: 'every 60 minutes' }, async () => {
    const currentSlot = slot();
    const briefs = await db.collection('daily_brief_cache').where('slot', '==', currentSlot)
        .where('pinged', '!=', true).limit(200).get();
    for (const doc of briefs.docs) {
        const data = doc.data();
        const tokens = await db.collection('push_tokens').where('user_id', '==', data.user_id).get();
        if (!tokens.empty) {
            try {
                await messaging.sendEachForMulticast({
                    tokens: tokens.docs.map((d) => d.data().token).filter(Boolean),
                    notification: { title: 'Your daily brief is ready', body: 'Tap to see your vybe' },
                    data: { type: 'daily_brief', slot: currentSlot },
                });
                await doc.ref.update({ pinged: true });
            }
            catch (e) {
                console.warn('push failed', e);
            }
        }
    }
});
export const smartPingDispatcher = smartBriefPings;
//# sourceMappingURL=briefs.js.map