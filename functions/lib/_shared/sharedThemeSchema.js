export const THEME_VISIBILITIES = ['public', 'unlisted', 'friends', 'private'];
export function themeRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid theme object');
    return value;
}
export function themeText(value, max, required = false) {
    if (value == null && !required)
        return '';
    if (typeof value !== 'string' || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0))) || (required && !value.trim()))
        throw new Error('Invalid theme text');
    return value.trim();
}
export function themeHttpsUrl(value) {
    if (typeof value !== 'string' || value.length > 2048)
        throw new Error('Invalid theme image');
    if (!value)
        return '';
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
        throw new Error('Invalid theme image');
    return url.href;
}
function hsl(value) {
    if (typeof value !== 'string')
        throw new Error('Invalid theme color');
    const match = value.trim().match(/^(\d{1,3}(?:\.\d{1,6})?)\s+(\d{1,3}(?:\.\d{1,6})?)%\s+(\d{1,3}(?:\.\d{1,6})?)%(?:\s*\/\s*(0(?:\.\d{1,6})?|1(?:\.0{1,6})?))?$/);
    if (!match || +match[1] > 360 || +match[2] > 100 || +match[3] > 100)
        throw new Error('Invalid theme color');
    return `${+match[1]} ${+match[2]}% ${+match[3]}%${match[4] === undefined ? '' : ` / ${+match[4]}`}`;
}
const requiredColors = ['colorPrimary', 'colorSecondary', 'colorAccent', 'bgMain', 'bgCard', 'textPrimary', 'textSecondary'];
const optionalColors = ['bgGradientFrom', 'bgGradientTo', 'bgGradientMid', 'sidebarBg', 'navBg', 'inputBg', 'inputText', 'buttonText', 'glassBg', 'glassBorder', 'borderColor', 'neonPink', 'neonPurple', 'neonCyan', 'backgroundOverlay'];
const enums = {
    borderRadius: ['small', 'medium', 'large'], mode: ['light', 'dark'],
    animationSpeed: ['slow', 'normal', 'fast', 'instant'], animationStyle: ['smooth', 'bouncy', 'snappy', 'none'],
    backgroundEffect: ['none', 'particles', 'stars', 'bubbles', 'aurora', 'rain', 'snow', 'fireflies', 'geometric'],
};
export function normalizeSharedThemeTokens(value) {
    const row = themeRecord(value);
    const result = {};
    for (const key of requiredColors)
        result[key] = hsl(row[key]);
    for (const key of optionalColors)
        if (row[key] !== undefined)
            result[key] = hsl(row[key]);
    for (const [key, allowed] of Object.entries(enums)) {
        if (row[key] === undefined && key !== 'mode' && key !== 'borderRadius')
            continue;
        if (typeof row[key] !== 'string' || !allowed.includes(row[key]))
            throw new Error('Invalid theme setting');
        result[key] = row[key];
    }
    if (row.themeName !== undefined)
        result.themeName = themeText(row.themeName, 80);
    if (row.backgroundImage !== undefined)
        result.backgroundImage = themeHttpsUrl(row.backgroundImage);
    for (const [key, max] of [['backgroundBlur', 20], ['backgroundOpacity', 100]]) {
        if (row[key] === undefined)
            continue;
        if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0 || row[key] > max)
            throw new Error('Invalid theme effect');
        result[key] = row[key];
    }
    return result;
}
export function normalizeSharedThemeLayout(value) {
    if (value == null)
        return null;
    const row = themeRecord(value);
    const result = {};
    for (const key of ['widget_order', 'widget_hidden']) {
        if (row[key] === undefined)
            continue;
        if (!Array.isArray(row[key]) || row[key].length > 50)
            throw new Error('Invalid theme layout');
        const ids = row[key].map(id => {
            if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
                throw new Error('Invalid theme widget');
            return id;
        });
        result[key] = [...new Set(ids)];
    }
    if (row.background_url !== undefined)
        result.background_url = row.background_url === null ? null : themeHttpsUrl(row.background_url);
    for (const key of ['corner_style', 'motion_intensity', 'font_heading', 'font_body']) {
        if (row[key] === undefined)
            continue;
        const text = themeText(row[key], 80, true);
        if (!/^[a-zA-Z0-9 _-]+$/.test(text))
            throw new Error('Invalid theme layout setting');
        result[key] = text;
    }
    return result;
}
//# sourceMappingURL=sharedThemeSchema.js.map