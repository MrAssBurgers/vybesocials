import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth } from './_shared/admin.js';
export function isoDateOnly(d = new Date()) {
    return d.toISOString().slice(0, 10);
}
export function weekStartIso(d = new Date()) {
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
    return monday.toISOString().slice(0, 10);
}
function pickTemplates(templates, type, limit) {
    return templates
        .filter((t) => t.type === type)
        .sort(() => Math.random() - 0.5)
        .slice(0, limit);
}
/** Rotate daily/weekly challenges from templates (Admin SDK — bypasses client write rules). */
export async function rotateChallengesCore() {
    const today = isoDateOnly();
    const weekStart = weekStartIso();
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();
    const allSnap = await db.collection('challenges').get();
    for (const doc of allSnap.docs) {
        const ch = doc.data();
        const type = String(ch.type || '');
        if (type !== 'daily' && type !== 'weekly')
            continue;
        const activeDate = ch.active_date ? String(ch.active_date).slice(0, 10) : null;
        const activeWeek = ch.active_week_start ? String(ch.active_week_start).slice(0, 10) : null;
        if (type === 'daily' && activeDate && activeDate < today) {
            await doc.ref.delete();
            continue;
        }
        if (type === 'weekly' && activeWeek && activeWeek < weekStart) {
            await doc.ref.delete();
            continue;
        }
        const endsAt = ch.ends_at ? Date.parse(String(ch.ends_at)) : NaN;
        if (!Number.isNaN(endsAt) && endsAt < nowMs) {
            await doc.ref.delete();
            continue;
        }
        const staleDaily = type === 'daily' &&
            activeDate &&
            Date.parse(`${activeDate}T00:00:00Z`) < nowMs - 7 * 86400000 &&
            ch.is_active === false;
        const staleWeekly = type === 'weekly' &&
            activeWeek &&
            Date.parse(`${activeWeek}T00:00:00Z`) < nowMs - 28 * 86400000 &&
            ch.is_active === false;
        if (staleDaily || staleWeekly) {
            await doc.ref.delete();
        }
    }
    const activeSnap = await db.collection('challenges').where('is_active', '==', true).get();
    const active = activeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const dailyCount = active.filter((c) => c.type === 'daily' && String(c.active_date || '').slice(0, 10) === today).length;
    const weeklyCount = active.filter((c) => c.type === 'weekly' && String(c.active_week_start || '').slice(0, 10) === weekStart).length;
    const templatesSnap = await db.collection('challenge_templates').where('is_active', '==', true).get();
    const templates = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    let dailyCreated = 0;
    let weeklyCreated = 0;
    if (dailyCount < 6) {
        for (const tpl of pickTemplates(templates, 'daily', 6 - dailyCount)) {
            const tplId = String(tpl.id || Math.random().toString(36).slice(2, 8));
            const id = `daily_${today}_${tplId}`;
            await db.collection('challenges').doc(id).set({
                id,
                title: tpl.title,
                description: tpl.description ?? null,
                type: 'daily',
                requirement_type: tpl.requirement_type,
                requirement_count: tpl.requirement_count ?? 1,
                reward_badge_id: tpl.reward_badge_id ?? null,
                reward_xp: tpl.reward_xp ?? 25,
                is_active: true,
                active_date: today,
                active_week_start: null,
                template_id: tpl.id,
                created_at: nowIso,
                updated_at: nowIso,
            });
            dailyCreated++;
        }
    }
    if (weeklyCount < 6) {
        for (const tpl of pickTemplates(templates, 'weekly', 6 - weeklyCount)) {
            const tplId = String(tpl.id || Math.random().toString(36).slice(2, 8));
            const id = `weekly_${weekStart}_${tplId}`;
            await db.collection('challenges').doc(id).set({
                id,
                title: tpl.title,
                description: tpl.description ?? null,
                type: 'weekly',
                requirement_type: tpl.requirement_type,
                requirement_count: tpl.requirement_count ?? 1,
                reward_badge_id: tpl.reward_badge_id ?? null,
                reward_xp: tpl.reward_xp ?? 75,
                is_active: true,
                active_date: null,
                active_week_start: weekStart,
                template_id: tpl.id,
                created_at: nowIso,
                updated_at: nowIso,
            });
            weeklyCreated++;
        }
    }
    return {
        ok: true,
        dailyCreated,
        weeklyCreated,
        dailyCount: dailyCount + dailyCreated,
        weeklyCount: weeklyCount + weeklyCreated,
        templateCount: templates.length,
    };
}
/** Callable — client self-heal when today's challenges are missing. */
export const rotateChallenges = onCall({ region: 'us-central1' }, async (request) => {
    requireAuth(request);
    return rotateChallengesCore();
});
/** Scheduled — ensure challenges exist even if no user opens the app. */
export const scheduledRotateChallenges = onSchedule({ schedule: '0 5 * * *', region: 'us-central1', timeZone: 'UTC' }, async () => {
    await rotateChallengesCore();
});
//# sourceMappingURL=challenges.js.map