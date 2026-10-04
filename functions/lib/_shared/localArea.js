export function isLocalArea(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    return Object.keys(row).length === 2 && ['lat', 'lng'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key])
        && Math.abs(row[key] * 10 - Math.round(row[key] * 10)) < 1e-9)
        && Math.abs(row.lat) <= 90 && row.lng >= -180 && row.lng < 180;
}
export function sameLocalArea(a, b) {
    return a == null && b == null || isLocalArea(a) && isLocalArea(b) && a.lat === b.lat && a.lng === b.lng;
}
export function nearbyLocalArea(a, b) {
    const radians = Math.PI / 180;
    const haversine = Math.sin((b.lat - a.lat) * radians / 2) ** 2
        + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine)))) <= 40.2336;
}
//# sourceMappingURL=localArea.js.map