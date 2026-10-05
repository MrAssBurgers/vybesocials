import { DNA_THEME_PRESETS } from './dnaThemePresets.js';
import { normalizeSharedThemeTokens } from './sharedThemeSchema.js';
export const dnaRow = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
export const DNA_LAYOUT_VALUES = {
    fontScale: ['small', 'medium', 'large', 'xlarge'], contrastLevel: ['low', 'medium', 'high'],
    buttonStyle: ['glass', 'solid', 'outline'], motionIntensity: ['low', 'medium', 'high'],
};
export const DNA_PRESETS = ['classic', 'midnight', 'neon', 'soft', 'cyberpunk', 'minimal'];
export function normalizeDnaChange(value) {
    if (!dnaRow(value))
        return null;
    if (value.type === 'apply_theme')
        return Object.keys(value).every(k => ['type', 'preset'].includes(k)) && typeof value.preset === 'string' && DNA_PRESETS.includes(value.preset)
            ? { type: 'apply_theme', preset: value.preset } : null;
    if (!['feed_tune', 'layout_change'].includes(String(value.type)) || !dnaRow(value.patch)
        || Object.keys(value).some(k => !['type', 'patch'].includes(k)) || !Object.keys(value.patch).length)
        return null;
    if (value.type === 'layout_change') {
        if (Object.entries(value.patch).some(([key, val]) => typeof val !== 'string' || !DNA_LAYOUT_VALUES[key]?.includes(val)))
            return null;
        return { type: 'layout_change', patch: value.patch };
    }
    const patch = {};
    for (const [key, val] of Object.entries(value.patch)) {
        if (!['boost_topics', 'reduce_topics'].includes(key) || !Array.isArray(val) || val.length > 10
            || val.some(topic => typeof topic !== 'string' || !topic.trim() || topic.length > 40 || Array.from(topic).some(c => c.charCodeAt(0) < 32)))
            return null;
        patch[key] = [...new Set(val.map(t => t.trim().toLowerCase()))];
    }
    if (patch.boost_topics?.some(t => patch.reduce_topics?.includes(t)))
        return null;
    return { type: 'feed_tune', patch };
}
export function dnaTargetCollection(change) {
    return change.type === 'apply_theme' ? 'user_themes' : change.type === 'layout_change' ? 'user_ui_settings' : 'dna_content_preferences';
}
export function dnaTargetAfter(change, before, uid) {
    if (before && before.user_id !== uid)
        throw new Error('Settings ownership could not be verified.');
    const result = { ...(before || {}), user_id: uid };
    if (change.type === 'apply_theme') {
        if (before?.theme_tokens !== undefined)
            normalizeSharedThemeTokens(before.theme_tokens);
        Object.assign(result, { theme_tokens: normalizeSharedThemeTokens(DNA_THEME_PRESETS[change.preset]), theme_name: change.preset,
            base_preset: change.preset, is_active: true });
    }
    else if (change.type === 'layout_change') {
        if (before?.ui_config !== undefined && !dnaRow(before.ui_config))
            throw new Error('Your layout settings need review before changing them.');
        Object.assign(result, { ui_config: { ...(dnaRow(before?.ui_config) ? before.ui_config : {}), ...change.patch } });
    }
    else {
        Object.assign(result, change.patch);
        // Both arrays are consumed directly by feed ranking. Never store malformed or contradictory settings.
        for (const field of ['boost_topics', 'reduce_topics']) {
            const value = result[field];
            if (value !== undefined && (!Array.isArray(value) || value.length > 10 || value.some(t => typeof t !== 'string' || t.length > 40)))
                throw new Error('Your feed settings need review before changing them.');
        }
        const boosts = result.boost_topics, reduced = result.reduce_topics;
        if (boosts?.some(t => reduced?.some(r => r.toLowerCase() === t.toLowerCase())))
            throw new Error('A topic cannot be both boosted and reduced.');
    }
    return result;
}
export function dnaTargetDto(change, value) {
    if (change.type === 'apply_theme')
        return value?.is_active === true && value.theme_tokens
            ? { kind: 'theme', tokens: normalizeSharedThemeTokens(value.theme_tokens), preset: typeof value.base_preset === 'string' ? value.base_preset.slice(0, 80) : 'custom' }
            : { kind: 'theme', tokens: null, preset: null };
    if (change.type === 'layout_change')
        return { kind: 'layout', config: dnaRow(value?.ui_config) ? value.ui_config : {}, safeMode: value?.safe_mode === true, configVersion: Number.isSafeInteger(value?.config_version) ? value.config_version : 1 };
    return { kind: 'feed', preferences: value ? { boost_topics: value.boost_topics || [], reduce_topics: value.reduce_topics || [] } : null };
}
//# sourceMappingURL=dnaActionSchema.js.map