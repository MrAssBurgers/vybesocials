/** Supabase PostgREST-style `.or()` / `.ilike()` compat for Firestore client queries. */

export type OrPredicate =
  | { kind: 'ilike'; field: string; needle: string }
  | { kind: 'eq'; field: string; value: string }
  | { kind: 'in'; field: string; values: string[] }
  | { kind: 'is'; field: string; value: 'null' | 'not.null' }
  | { kind: 'gt' | 'lt' | 'gte' | 'lte'; field: string; value: string }
  | { kind: 'and'; preds: OrPredicate[] };

export function splitTopLevelComma(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseSimpleOrPart(part: string): OrPredicate | null {
  let m = part.match(/^(\w+)\.ilike\.%(.+)%$/i);
  if (m) return { kind: 'ilike', field: m[1]!, needle: m[2]!.toLowerCase() };

  m = part.match(/^(\w+)\.ilike\.(.+)$/i);
  if (m) {
    return {
      kind: 'ilike',
      field: m[1]!,
      needle: m[2]!.replace(/%/g, '').toLowerCase(),
    };
  }

  m = part.match(/^(\w+)\.eq\.(.+)$/i);
  if (m) return { kind: 'eq', field: m[1]!, value: m[2]! };

  m = part.match(/^(\w+)\.in\.\((.+)\)$/i);
  if (m) {
    return {
      kind: 'in',
      field: m[1]!,
      values: m[2]!.split(',').map((v) => v.trim()).filter(Boolean),
    };
  }

  m = part.match(/^(\w+)\.is\.null$/i);
  if (m) return { kind: 'is', field: m[1]!, value: 'null' };

  m = part.match(/^(\w+)\.is\.not\.null$/i);
  if (m) return { kind: 'is', field: m[1]!, value: 'not.null' };

  m = part.match(/^(\w+)\.gt\.(.+)$/i);
  if (m) return { kind: 'gt', field: m[1]!, value: m[2]! };

  m = part.match(/^(\w+)\.lt\.(.+)$/i);
  if (m) return { kind: 'lt', field: m[1]!, value: m[2]! };

  m = part.match(/^(\w+)\.gte\.(.+)$/i);
  if (m) return { kind: 'gte', field: m[1]!, value: m[2]! };

  m = part.match(/^(\w+)\.lte\.(.+)$/i);
  if (m) return { kind: 'lte', field: m[1]!, value: m[2]! };

  return null;
}

export function parseOrExpression(expr: string): OrPredicate[] {
  const preds: OrPredicate[] = [];
  for (const part of splitTopLevelComma(expr)) {
    const andMatch = part.match(/^and\((.+)\)$/i);
    if (andMatch) {
      const inner = splitTopLevelComma(andMatch[1]!);
      const predsInner = inner.map((p) => parseSimpleOrPart(p)).filter(Boolean) as OrPredicate[];
      if (predsInner.length) preds.push({ kind: 'and', preds: predsInner });
      continue;
    }
    const simple = parseSimpleOrPart(part);
    if (simple) preds.push(simple);
  }
  return preds;
}

export function matchesOrPredicate(row: Record<string, unknown>, pred: OrPredicate): boolean {
  switch (pred.kind) {
    case 'ilike':
      return String(row[pred.field] ?? '').toLowerCase().includes(pred.needle);
    case 'eq':
      return String(row[pred.field] ?? '') === pred.value;
    case 'in':
      return pred.values.includes(String(row[pred.field] ?? ''));
    case 'is':
      if (pred.value === 'null') return row[pred.field] == null || row[pred.field] === '';
      return row[pred.field] != null && row[pred.field] !== '';
    case 'gt':
      return row[pred.field] != null && String(row[pred.field]) > pred.value;
    case 'lt':
      return row[pred.field] != null && String(row[pred.field]) < pred.value;
    case 'gte':
      return row[pred.field] != null && String(row[pred.field]) >= pred.value;
    case 'lte':
      return row[pred.field] != null && String(row[pred.field]) <= pred.value;
    case 'and':
      return pred.preds.every((p) => matchesOrPredicate(row, p));
    default:
      return false;
  }
}

export function applyIlikeFilters(
  rows: Record<string, unknown>[],
  filters: Array<{ field: string; needle: string }>,
): Record<string, unknown>[] {
  if (!filters.length) return rows;
  return rows.filter((row) =>
    filters.every((f) => String(row[f.field] ?? '').toLowerCase().includes(f.needle)),
  );
}

export function applyOrPredicates(
  rows: Record<string, unknown>[],
  preds: OrPredicate[],
): Record<string, unknown>[] {
  if (!preds.length) return rows;
  return rows.filter((row) => preds.some((p) => matchesOrPredicate(row, p)));
}

export function coerceNotInValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const inner = value.replace(/^\(|\)$/g, '');
    if (!inner) return [];
    return inner.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

/** Client-side fetch cap when Firestore can't express text/OR filters. */
export const CLIENT_FILTER_FETCH_CAP = 800;
