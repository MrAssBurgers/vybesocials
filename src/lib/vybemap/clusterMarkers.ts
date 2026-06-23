/** Simple grid clustering for map markers at low zoom. */

export interface ClusterablePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export interface MarkerCluster<T extends ClusterablePoint> {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  points: T[];
}

function cellKey(lat: number, lng: number, cellDeg: number): string {
  return `${Math.floor(lat / cellDeg)}:${Math.floor(lng / cellDeg)}`;
}

/** Group points into grid cells; cell size scales with zoom (lower zoom = larger cells). */
export function clusterPoints<T extends ClusterablePoint>(
  points: T[],
  zoom: number,
): Array<T | MarkerCluster<T>> {
  if (zoom >= 13 || points.length <= 8) return points;

  const cellDeg = zoom < 9 ? 0.35 : zoom < 11 ? 0.12 : 0.04;
  const buckets = new Map<string, T[]>();

  for (const p of points) {
    const key = cellKey(p.latitude, p.longitude, cellDeg);
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }

  const out: Array<T | MarkerCluster<T>> = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const lat = group.reduce((s, p) => s + p.latitude, 0) / group.length;
    const lng = group.reduce((s, p) => s + p.longitude, 0) / group.length;
    out.push({
      id: `cluster-${key}`,
      latitude: lat,
      longitude: lng,
      count: group.length,
      points: group,
    });
  }
  return out;
}
