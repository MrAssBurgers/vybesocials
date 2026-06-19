import {
  collectionRef,
  documentRef,
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  deleteDocument,
  batchSet,
  query,
  where,
  orderBy,
  firestoreLimit,
} from './firestoreDb';
import { firebaseAuth } from './authService';
import { firebaseStorage } from './storageService';
import { invokeFunction } from './functionsService';
import { createRealtimeChannel, getActiveChannels, removeChannelByTopic } from './realtimeService';
import type { VybeAuthError } from './types';
import type { UserProfile } from './types';
import type { QueryConstraint } from 'firebase/firestore';
import {
  isPreviewFounderUser,
  isFounderAuthId,
} from '@/lib/previewSandbox';
import { isFeedRpc, normalizeRpcFeedRows, runFeedRpc } from './feedRpc';
import { isSocialRpc, runSocialRpc } from './socialRpc';
import { isNotYetPortedPayload } from './functionsService';
import { getProfileByAuthUid, resolveProfileIdFromAuthUid } from './profileResolve';
import { rpcEarnVybeTokens } from './tokenRpc';
import { isGeneratedUsername, normalizeUsername } from '@/lib/username';

type FilterOp = '==' | '!=' | '>' | '<' | 'in' | 'not-in';

interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
}

interface JoinSpec {
  alias: string;
  table: string;
  foreignKey: string;
  fields: string[];
}

interface SelectOptions {
  count?: 'exact';
  head?: boolean;
}

class QueryBuilder {
  private table: string;
  private filters: Filter[] = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private limitN?: number;
  private selectFields = '*';
  private joins: JoinSpec[] = [];
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private countOnly = false;
  private updatePayload: Record<string, unknown> | null = null;
  private deleteMode = false;
  private insertRows: Record<string, unknown>[] | null = null;
  private upsertRows: Record<string, unknown>[] | null = null;
  private upsertConflictKey?: string;
  private matchFilters: Record<string, unknown> = {};
  private ilikeFilters: Array<{ field: string; needle: string }> = [];
  private orFilters: Array<{ field: string; needle: string }> = [];

  constructor(table: string) {
    this.table = table;
  }

  select(fields = '*', options?: SelectOptions) {
    this.selectFields = fields;
    if (options?.count === 'exact' && options?.head) {
      this.countOnly = true;
    }
    this.parseJoins(fields);
    return this;
  }

  private parseJoins(fields: string) {
    const joinRegex = /(\w+):(\w+)!(\w+)\s*\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = joinRegex.exec(fields)) !== null) {
      this.joins.push({
        alias: m[1]!,
        table: m[2]!,
        foreignKey: m[3]!,
        fields: m[4]!.split(',').map((f) => f.trim()),
      });
    }
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: '==', value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ field, op: '!=', value });
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push({ field, op: '>', value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, op: '>', value });
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push({ field, op: '<', value });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ field, op: '<', value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ field, op: 'in', value: values });
    return this;
  }

  not(field: string, op: string, value: unknown) {
    if (op === 'in') {
      this.filters.push({ field, op: 'not-in', value });
    } else {
      this.filters.push({ field, op: '!=', value });
    }
    return this;
  }

  // Legacy Supabase operators — client-side fallbacks when Firestore can't express them.
  or(expr: string) {
    for (const part of expr.split(',')) {
      const m = part.trim().match(/^(\w+)\.ilike\.%(.+)%$/);
      if (m) this.orFilters.push({ field: m[1]!, needle: m[2]!.toLowerCase() });
    }
    return this;
  }
  filter(field: string, _op: string, value: unknown) {
    this.filters.push({ field, op: '==', value });
    return this;
  }
  like(_field: string, pattern: string) {
    return this.ilike(_field, pattern);
  }
  ilike(field: string, pattern: string) {
    const needle = pattern.replace(/^%+/, '').replace(/%+$/, '').toLowerCase();
    if (needle) this.ilikeFilters.push({ field, needle });
    return this;
  }
  is(field: string, value: unknown) {
    this.filters.push({ field, op: '==', value });
    return this;
  }
  contains(_field: string, _value: unknown) { return this; }
  containedBy(_field: string, _value: unknown) { return this; }
  overlaps(_field: string, _value: unknown) { return this; }
  range(_from: number, _to: number) { return this; }
  textSearch(_field: string, _query: string) { return this; }

  order(field: string, opts?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  match(filters: Record<string, unknown>) {
    this.matchFilters = { ...this.matchFilters, ...filters };
    for (const [k, v] of Object.entries(filters)) this.filters.push({ field: k, op: '==', value: v });
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.upsertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertConflictKey = opts?.onConflict;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload;
    // Chainable: execution deferred to .then() so .eq()/.in() etc. apply.
    return this;
  }

  delete() {
    this.deleteMode = true;
    // Chainable: execution deferred to .then().
    return this;
  }

  private buildConstraints(): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];
    const inequalityFields = new Set<string>();
    const clientOnlyFilters: Filter[] = [];

    for (const f of this.filters) {
      if (f.op === 'in' && Array.isArray(f.value) && f.value.length > 10) {
        clientOnlyFilters.push(f);
        continue;
      }
      if (f.op === 'not-in' && Array.isArray(f.value)) {
        clientOnlyFilters.push(f);
        continue;
      }

      const isInequality = f.op === '!=' || f.op === '>' || f.op === '<';
      if (isInequality) {
        if (inequalityFields.size === 0 || inequalityFields.has(f.field)) {
          inequalityFields.add(f.field);
        } else {
          // Firestore allows only one field with inequality filters per query.
          clientOnlyFilters.push(f);
          continue;
        }
      }

      if (f.op === 'in' && Array.isArray(f.value)) {
        if (f.value.length <= 10) {
          constraints.push(where(f.field, 'in', f.value));
        } else {
          clientOnlyFilters.push(f);
        }
      } else if (f.op === '==' || f.op === '!=' || f.op === '>' || f.op === '<') {
        constraints.push(where(f.field, f.op, f.value));
      }
    }

    // Stash overflow filters for client-side filtering in fetchRows/execute.
    if (clientOnlyFilters.length) {
      (this as { _clientOnlyFilters?: Filter[] })._clientOnlyFilters = clientOnlyFilters;
    }

    for (const o of this.orders) {
      constraints.push(orderBy(o.field, o.ascending ? 'asc' : 'desc'));
    }
    if (this.limitN) constraints.push(firestoreLimit(this.limitN));
    return constraints;
  }

  private getClientOnlyFilters(): Filter[] {
    return (this as { _clientOnlyFilters?: Filter[] })._clientOnlyFilters || [];
  }

  private applyClientOnlyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    const extra = this.getClientOnlyFilters();
    if (!extra.length) return rows;

    return rows.filter((row) =>
      extra.every((f) => {
        const val = row[f.field];
        const target = f.value;
        switch (f.op) {
          case '!=':
            return val !== target;
          case '>':
            return val != null && val > target;
          case '<':
            return val != null && val < target;
          case 'not-in':
            return !Array.isArray(target) || !target.includes(val);
          case 'in':
            return Array.isArray(target) && target.includes(val);
          default:
            return true;
        }
      }),
    );
  }

  private getLargeInFilters(): Filter[] {
    return this.filters.filter(
      (f) => f.op === 'in' && Array.isArray(f.value) && f.value.length > 10,
    );
  }

  private async fetchRows(): Promise<Record<string, unknown>[]> {
    const largeIn = this.getLargeInFilters();
    if (!largeIn.length) {
      return getDocuments(this.table, this.buildConstraints()) as Promise<Record<string, unknown>[]>;
    }

    const primary = largeIn[0]!;
    const values = [...new Set((primary.value as unknown[]).filter(Boolean))];
    const otherConstraints = this.buildConstraints();
    const chunks: unknown[][] = [];
    for (let i = 0; i < values.length; i += 10) {
      chunks.push(values.slice(i, i + 10));
    }

    const merged = new Map<string, Record<string, unknown>>();
    await Promise.all(
      chunks.map(async (chunk) => {
        const rows = await getDocuments(this.table, [
          ...otherConstraints,
          where(primary.field, 'in', chunk),
        ]);
        for (const row of rows as Record<string, unknown>[]) {
          if (row.id) merged.set(String(row.id), row);
        }
      }),
    );

    return [...merged.values()];
  }

  private async resolveJoins(rows: Record<string, unknown>[]) {
    if (!this.joins.length) return rows;
    const enriched = [...rows];

    for (const join of this.joins) {
      const fkValues = [...new Set(
        enriched.map((r) => r[join.foreignKey] as string).filter(Boolean),
      )];

      const relatedMap = new Map<string, Record<string, unknown>>();
      await Promise.all(
        fkValues.map(async (id) => {
          const doc = await getDocument(join.table, id);
          if (doc) relatedMap.set(id, doc);
        }),
      );

      for (const row of enriched) {
        const fk = row[join.foreignKey] as string;
        const related = fk ? relatedMap.get(fk) : null;
        if (related) {
          const picked: Record<string, unknown> = { id: related.id };
          for (const field of join.fields) {
            if (field in related) picked[field] = related[field];
          }
          row[join.alias] = picked;
        }
      }
    }

    return enriched;
  }

  private applyClientFilters(rows: Record<string, unknown>[]) {
    let result = this.applyClientOnlyFilters(rows);
    for (const f of this.filters) {
      const v = f.value as any;
      if (f.op === 'not-in' && Array.isArray(v)) {
        result = result.filter((r) => !v.includes(r[f.field]));
      }
      if (f.op === 'in' && Array.isArray(v) && v.length > 10) {
        result = result.filter((r) => v.includes(r[f.field]));
      }
    }
    return result;
  }

  async then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      return onfulfilled ? onfulfilled(result) : (result as TResult1);
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  private async execute(): Promise<QueryResult> {
    try {
      if (this.insertRows) return await this.executeInsert(this.insertRows);
      if (this.upsertRows) return await this.executeUpsert(this.upsertRows, this.upsertConflictKey);
      if (this.updatePayload !== null) return await this.executeUpdate();
      if (this.deleteMode) return await this.executeDelete();

      if (this.countOnly) {
        const rows = await this.fetchRows();
        const filtered = this.applyClientFilters(rows);
        return { data: null, error: null, count: filtered.length };
      }

      let rows = await this.fetchRows();
      rows = this.applyClientFilters(rows as Record<string, unknown>[]) as typeof rows;
      const data = await this.resolveJoins(rows as Record<string, unknown>[]);

      if (this.singleMode === 'single') {
        if (data.length !== 1) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
        }
        return { data: data[0], error: null };
      }
      if (this.singleMode === 'maybe') {
        return { data: data[0] ?? null, error: null };
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: toQueryError(err) };
    }
  }

  private async executeInsert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    try {
      const list = Array.isArray(rows) ? rows : [rows];
      const created = await Promise.all(
        list.map(async (row) => {
          const id = (row.id as string) || documentRef(this.table, 'x').id;
          const payload = {
            ...row,
            id,
            created_at: row.created_at || new Date().toISOString(),
          };
          await setDocument(this.table, id, payload);
          return payload;
        }),
      );
      return { data: list.length === 1 ? created[0] : created, error: null };
    } catch (err) {
      return { data: null, error: toQueryError(err) };
    }
  }

  private async executeUpsert(rows: Record<string, unknown> | Record<string, unknown>[], conflictKey?: string) {
    try {
      const list = Array.isArray(rows) ? rows : [rows];
      await batchSet(
        this.table,
        list.map((row) => ({
          id: conflictKey && row[conflictKey] ? String(row[conflictKey]) : (row.id as string | undefined),
          data: row,
        })),
      );
      return { data: list.length === 1 ? list[0] : list, error: null };
    } catch (err) {
      return { data: null, error: toQueryError(err) };
    }
  }

  private async executeUpdate() {
    try {
      const constraints = this.buildConstraints();
      const rows = await getDocuments(this.table, constraints);
      const payload = this.updatePayload || {};
      await Promise.all(
        rows.map((row) => updateDocument(this.table, row.id as string, payload)),
      );
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: toQueryError(err) };
    }
  }

  private async executeDelete() {
    try {
      const allFilters = { ...this.matchFilters };
      for (const f of this.filters) {
        if (f.op === '==') allFilters[f.field] = f.value;
      }

      if (Object.keys(allFilters).length > 0 && allFilters.id) {
        await deleteDocument(this.table, String(allFilters.id));
        return { data: null, error: null };
      }

      const rows = await getDocuments(this.table, this.buildConstraints());
      await Promise.all(rows.map((r) => deleteDocument(this.table, r.id as string)));
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: toQueryError(err) };
    }
  }
}

export interface QueryResult<T = any> {
  data: T;
  error: VybeAuthError | null;
  count?: number | null;
}

function toQueryError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: (err as { message: string }).message };
  }
  return { message: 'Database error' };
}

async function ensureFounderOwnerRoles(profileId: string): Promise<void> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user || !isPreviewFounderUser(user)) return;

  const now = new Date().toISOString();
  for (const table of ['user_roles', 'user_roles_auth'] as const) {
    const existing = await getDocuments<{ role?: string }>(table, [where('user_id', '==', profileId)]);
    if (existing.some((r) => r.role === 'owner')) continue;
    await setDocument(table, `${profileId}_owner`, {
      id: `${profileId}_owner`,
      user_id: profileId,
      role: 'owner',
      created_at: now,
    });
  }
}

async function rpcClaimProfileByEmailLocal(authUid: string, email: string): Promise<string | null> {
  const index = await getDocument<{ profile_id?: string }>('user_auth_index', authUid);
  if (index?.profile_id) {
    const prof = await getDocument<UserProfile>('profiles', index.profile_id);
    if (prof?.id) return prof.id;
  }

  const byUserId = await getDocuments<UserProfile>('profiles', [
    where('user_id', '==', authUid),
    firestoreLimit(1),
  ]);
  if (byUserId[0]?.id) return byUserId[0].id;

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail) {
    const byEmail = await getDocuments<UserProfile>('profiles', [
      where('email', '==', normalizedEmail),
      firestoreLimit(5),
    ]);
    if (byEmail[0]?.id) return byEmail[0].id;

    for (const username of ['mrassburgers', 'bakrix']) {
      if (normalizedEmail !== 'barron.bakic@gmail.com') break;
      const byUsername = await getDocuments<UserProfile>('profiles', [
        where('username', '==', username),
        firestoreLimit(1),
      ]);
      if (byUsername[0]?.id) return byUsername[0].id;
    }
  }

  return null;
}

async function rpcClaimProfileByEmail(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const { data, error } = await invokeFunction<{ profileId?: string | null; claimed?: boolean }>(
    'claimProfileByEmail',
  );
  if (!error && data?.profileId) return data.profileId;

  if (error) {
    console.warn('[rpc] claimProfileByEmail failed:', error.message);
  }

  return rpcClaimProfileByEmailLocal(user.id, user.email || '');
}

async function rpcEnsureProfile(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const claimedId = await rpcClaimProfileByEmail();
  if (claimedId) {
    const claimed = await getDocument<UserProfile>('profiles', claimedId);
    if (claimed?.id) {
      await setDocument('user_auth_index', user.id, {
        profile_id: claimed.id,
        username: claimed.username || null,
        email: user.email || claimed.email || null,
        updated_at: new Date().toISOString(),
      }, true);
      if (claimed.user_id !== user.id) {
        await setDocument('profiles', claimed.id, {
          user_id: user.id,
          email: user.email || claimed.email || null,
          updated_at: new Date().toISOString(),
        }, true);
      }
      await ensureFounderOwnerRoles(claimed.id);
      return claimed.id;
    }
  }

  const existing = await getProfileByAuthUid(user.id);
  if (existing?.id) {
    await ensureFounderOwnerRoles(existing.id);
    return existing.id;
  }

  const username =
    (user.user_metadata?.username as string) ||
    (user.user_metadata?.display_name as string) ||
    `user_${user.id.slice(0, 8)}`;

  await setDocument('profiles', user.id, {
    id: user.id,
    user_id: user.id,
    username,
    display_name: user.user_metadata?.display_name || username,
    avatar_url: null,
    bio: '',
    onboarding_completed: false,
    email: user.email || null,
    created_at: new Date().toISOString(),
  });

  await setDocument('user_auth_index', user.id, {
    profile_id: user.id,
    username,
    email: user.email || null,
    updated_at: new Date().toISOString(),
  }, true);

  await ensureFounderOwnerRoles(user.id);
  return user.id;
}

async function rpcGetMyHighestRole(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;
  if (isFounderAuthId(user.id)) return 'owner';

  const profileId = (await resolveProfileIdFromAuthUid(user.id)) || user.id;

  const roleLookupIds = [...new Set([profileId, user.id])];
  const [profileRoles, authRoles] = await Promise.all([
    getDocuments<{ role?: string }>('user_roles', [where('user_id', '==', profileId)]),
    getDocuments<{ role?: string }>('user_roles_auth', [
      where('user_id', 'in', roleLookupIds.slice(0, 10)),
    ]),
  ]);
  const roles = [...profileRoles, ...authRoles].map((r) => r.role).filter(Boolean) as string[];
  if (roles.includes('owner') || roles.includes('owner_wife')) return 'owner';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('moderator')) return 'moderator';
  return null;
}

async function rpcIsOwner(params: Record<string, unknown>): Promise<boolean> {
  const { data: { user } } = await firebaseAuth.getUser();
  const targetId = String(params._user_id || params.user_id || user?.id || '');
  if (!targetId || !user) return false;
  if (targetId !== user.id) return false;
  if (isFounderAuthId(user.id)) return true;
  const role = await rpcGetMyHighestRole();
  return role === 'owner';
}

async function rpcIsUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  const rows = await getDocuments<UserProfile>('profiles', [where('username', '==', normalized)]);
  if (!rows.length) return true;
  if (excludeUserId && rows.every((r) => r.id === excludeUserId || r.user_id === excludeUserId)) return true;
  return false;
}

interface Settings2FARow {
  user_id: string;
  email_2fa_enabled: boolean;
  login_approvals_enabled: boolean;
  backup_codes_hashed?: string[];
  created_at: string;
  updated_at: string;
}

async function rpcEnsure2faSettings(): Promise<Settings2FARow | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const docId = user.id;
  const existing = await getDocument<Settings2FARow>('user_2fa_settings', docId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const row: Settings2FARow = {
    user_id: docId,
    email_2fa_enabled: false,
    login_approvals_enabled: false,
    backup_codes_hashed: [],
    created_at: now,
    updated_at: now,
  };
  await setDocument('user_2fa_settings', docId, row);
  return row;
}

async function rpcUpdate2faSettings(params: Record<string, unknown>): Promise<Settings2FARow | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const current = await rpcEnsure2faSettings();
  if (!current) return null;

  const now = new Date().toISOString();
  const next: Settings2FARow = {
    ...current,
    email_2fa_enabled: params.p_email_2fa !== undefined ? !!params.p_email_2fa : current.email_2fa_enabled,
    login_approvals_enabled: params.p_login_approvals !== undefined ? !!params.p_login_approvals : current.login_approvals_enabled,
    updated_at: now,
  };
  await setDocument('user_2fa_settings', user.id, next, true);
  return next;
}

function isoDateOnly(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function weekStartIso(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

async function rpcRotateChallenges(): Promise<void> {
  const today = isoDateOnly();
  const weekStart = weekStartIso();

  const allChallenges = await getDocuments<Record<string, unknown>>('challenges');
  const nowMs = Date.now();

  for (const ch of allChallenges) {
    const type = String(ch.type || '');
    const id = String(ch.id || '');
    if (!id || (type !== 'daily' && type !== 'weekly')) continue;

    const activeDate = ch.active_date ? String(ch.active_date).slice(0, 10) : null;
    const activeWeek = ch.active_week_start ? String(ch.active_week_start).slice(0, 10) : null;

    if (type === 'daily' && activeDate && activeDate < today) {
      await deleteDocument('challenges', id);
      continue;
    }
    if (type === 'weekly' && activeWeek && activeWeek < weekStart) {
      await deleteDocument('challenges', id);
      continue;
    }

    const endsAt = ch.ends_at ? Date.parse(String(ch.ends_at)) : NaN;
    if (!Number.isNaN(endsAt) && endsAt < nowMs && (type === 'daily' || type === 'weekly')) {
      await deleteDocument('challenges', id);
      continue;
    }

    const staleDaily =
      type === 'daily' && activeDate &&
      (Date.parse(`${activeDate}T00:00:00Z`) < nowMs - 7 * 86400000) &&
      ch.is_active === false;
    const staleWeekly =
      type === 'weekly' && activeWeek &&
      (Date.parse(`${activeWeek}T00:00:00Z`) < nowMs - 28 * 86400000) &&
      ch.is_active === false;

    if (staleDaily || staleWeekly) {
      await deleteDocument('challenges', id);
    }
  }

  const refreshed = await getDocuments<Record<string, unknown>>('challenges', [
    where('is_active', '==', true),
  ]);

  const dailyCount = refreshed.filter(
    (c) => c.type === 'daily' && String(c.active_date || '').slice(0, 10) === today,
  ).length;
  const weeklyCount = refreshed.filter(
    (c) => c.type === 'weekly' && String(c.active_week_start || '').slice(0, 10) === weekStart,
  ).length;

  const templates = await getDocuments<Record<string, unknown>>('challenge_templates', [
    where('is_active', '==', true),
  ]);

  const pickTemplates = (type: string, limit: number) =>
    templates
      .filter((t) => t.type === type)
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

  if (dailyCount < 6) {
    for (const tpl of pickTemplates('daily', 6 - dailyCount)) {
      const id = `daily_${today}_${String(tpl.id || Math.random().toString(36).slice(2, 8))}`;
      await setDocument('challenges', id, {
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, true);
    }
  }

  if (weeklyCount < 6) {
    for (const tpl of pickTemplates('weekly', 6 - weeklyCount)) {
      const id = `weekly_${weekStart}_${String(tpl.id || Math.random().toString(36).slice(2, 8))}`;
      await setDocument('challenges', id, {
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, true);
    }
  }
}

async function rpcCreateDmConversation(otherProfileId: string): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const myProfileId = (await resolveProfileIdFromAuthUid(user.id)) || user.id;
  const memberIds = [myProfileId, otherProfileId].sort();
  const chatId = memberIds.join('_');

  const existing = await getDocument('conversations', chatId);
  if (existing) return chatId;

  await setDocument('conversations', chatId, {
    id: chatId,
    is_group: false,
    member_ids: memberIds,
    name: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  for (const memberId of memberIds) {
    await setDocument('conversation_members', `${chatId}_${memberId}`, {
      id: `${chatId}_${memberId}`,
      conversation_id: chatId,
      user_id: memberId,
      role: 'member',
      is_muted: false,
      is_pinned: false,
      last_read_at: null,
      created_at: new Date().toISOString(),
    });
  }

  return chatId;
}

async function authUserIdForProfileLookup(profileOrAuthId: string): Promise<string> {
  const profile = await getDocument<UserProfile>('profiles', profileOrAuthId);
  if (profile?.user_id) return profile.user_id;
  return profileOrAuthId;
}

async function rpcGetUserBadgesByProfile(params: Record<string, unknown>) {
  const profileId = String(params.p_profile_id || '');
  if (!profileId) return [];

  const authUserId = await authUserIdForProfileLookup(profileId);
  const lookupIds = [...new Set([authUserId, profileId])];
  const seen = new Set<string>();
  const userBadges: Record<string, unknown>[] = [];

  for (const id of lookupIds) {
    const rows = await getDocuments<Record<string, unknown>>('user_badges', [
      where('user_id', '==', id),
    ]);
    for (const row of rows) {
      const rid = String(row.id || '');
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      userBadges.push(row);
    }
  }

  const now = Date.now();
  const results: Record<string, unknown>[] = [];

  for (const ub of userBadges) {
    const expiresAt = ub.expires_at ? new Date(String(ub.expires_at)).getTime() : null;
    if (expiresAt !== null && expiresAt <= now) continue;

    const badge = await getDocument<Record<string, unknown>>('badges', String(ub.badge_id || ''));
    if (!badge) continue;

    results.push({
      id: ub.id,
      user_id: ub.user_id,
      badge_id: ub.badge_id,
      is_pinned: ub.is_pinned ?? false,
      pin_order: ub.pin_order ?? null,
      is_primary: ub.is_primary ?? false,
      show_effect: ub.show_effect ?? true,
      earned_at: ub.earned_at,
      expires_at: ub.expires_at ?? null,
      badge_name: badge.name,
      badge_description: badge.description ?? null,
      badge_icon: badge.icon,
      badge_category: badge.category,
      badge_priority: badge.priority ?? 0,
      badge_gradient_from: badge.gradient_from ?? null,
      badge_gradient_to: badge.gradient_to ?? null,
      badge_gradient_via: badge.gradient_via ?? null,
      badge_effect: badge.effect ?? null,
      badge_is_animated: badge.is_animated ?? false,
    });
  }

  results.sort(
    (a, b) => Number(a.badge_priority || 0) - Number(b.badge_priority || 0),
  );
  return results;
}

async function rpcGetUserPrimaryBadge(params: Record<string, unknown>) {
  const userId = String(params.p_user_id || '');
  if (!userId) return [];

  const badges = await rpcGetUserBadgesByProfile({ p_profile_id: userId });
  const primary = badges.find((b) => b.is_primary) || badges[0];
  if (!primary) return [];

  return [{
    badge_id: primary.badge_id,
    name: primary.badge_name,
    icon: primary.badge_icon,
    category: primary.badge_category,
    priority: primary.badge_priority,
    gradient_from: primary.badge_gradient_from,
    gradient_to: primary.badge_gradient_to,
    gradient_via: primary.badge_gradient_via,
    effect: primary.badge_effect,
    is_animated: primary.badge_is_animated,
  }];
}

async function rpcGetPublicUserCount(): Promise<number> {
  const rows = await getDocuments('profiles');
  return rows.length;
}

const CLIENT_RPC: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  ensure_profile: async () => rpcEnsureProfile(),
  sync_signup_username: async () => {
    const profileId = await rpcEnsureProfile();
    const { data: { user } } = await firebaseAuth.getUser();
    if (!user) return null;

    const profile = profileId ? await getDocument<UserProfile>('profiles', profileId) : null;
    const current = profile?.username ?? null;

    const meta = user.user_metadata || {};
    const desired = normalizeUsername(
      (meta.username as string) || (meta.display_name as string) || '',
    );

    if (!desired || isGeneratedUsername(desired)) {
      return current;
    }

    if (current && !isGeneratedUsername(current) && normalizeUsername(current) !== desired) {
      return current;
    }

    if (current && normalizeUsername(current) === desired) {
      return current;
    }

    const available = await rpcIsUsernameAvailable(desired);
    const takenByOther =
      !available &&
      normalizeUsername(current || '') !== desired;
    if (takenByOther) {
      return current;
    }

    await syncProfileUsername(user.id, desired);
    return desired;
  },
  claim_profile_by_email: async () => rpcClaimProfileByEmail(),
  is_username_available: async (p) => {
    const username = String(p.username || p._username || '');
    const exclude = p.exclude_user_id ? String(p.exclude_user_id) : undefined;
    return rpcIsUsernameAvailable(username, exclude);
  },
  ensure_2fa_settings: async () => rpcEnsure2faSettings(),
  update_2fa_settings: async (p) => rpcUpdate2faSettings(p),
  rotate_challenges: async () => {
    await rpcRotateChallenges();
    return null;
  },
  create_dm_conversation: async (p) => rpcCreateDmConversation(String(p.other_profile_id || '')),
  get_user_badges_by_profile: rpcGetUserBadgesByProfile,
  get_user_primary_badge: rpcGetUserPrimaryBadge,
  get_public_user_count: async () => rpcGetPublicUserCount(),
  get_profile_by_id: async (p) => {
    const id = String(p.target_id || '');
    return id ? await getDocument('profiles', id) : null;
  },
  get_my_highest_role: async () => rpcGetMyHighestRole(),
  is_owner: async (p) => rpcIsOwner(p),
  sync_my_challenge_progress: async () => ({ ok: true }),
  force_sync_my_challenges: async () => ({ ok: true }),
  get_login_streak_status: async (p) => runSocialRpc('get_login_streak_status', p),
  update_login_streak: async (p) => runSocialRpc('update_login_streak', p),
  restore_login_streak: async (p) => runSocialRpc('restore_login_streak', p),
  earn_vybe_tokens: async (p) => rpcEarnVybeTokens(p),
};

export function createDataClient() {
  return {
    from(table: string) {
      return new QueryBuilder(table);
    },

    rpc(name: string, params: Record<string, unknown> = {}) {
      const clientFn = CLIENT_RPC[name];
      if (clientFn) {
        const promise = (async () => {
          try {
            const data = await clientFn(params);
            return { data, error: null } as any;
          } catch (err) {
            return { data: null, error: toQueryError(err) } as any;
          }
        })();
        const enriched = promise as Promise<any> & {
          single: () => Promise<any>;
          maybeSingle: () => Promise<any>;
        };
        enriched.single = () => promise;
        enriched.maybeSingle = () => promise;
        return enriched;
      }

      // Feed RPCs: Cloud Function → Firestore client fallback → empty array (preview-safe).
      if (isFeedRpc(name)) {
        const promise = (async () => {
          try {
            const remote = await invokeFunction(name, params);
            if (!remote.error && !isNotYetPortedPayload(remote.data)) {
              const rows = normalizeRpcFeedRows(remote.data);
              if (rows) return { data: rows, error: null } as any;
            }
          } catch (err) {
            console.warn(`[Feed RPC] ${name} cloud call failed:`, err);
          }
          try {
            const rows = await runFeedRpc(name, params);
            return { data: rows, error: null } as any;
          } catch (err) {
            console.warn(`[Feed RPC] ${name} client fallback failed:`, err);
            return { data: [], error: null } as any;
          }
        })();
        const enriched = promise as Promise<any> & {
          single: () => Promise<any>;
          maybeSingle: () => Promise<any>;
        };
        enriched.single = () => promise;
        enriched.maybeSingle = () => promise;
        return enriched;
      }

      // Social RPCs: Firestore client only (cloud stubs caused CORS noise on vybehub.app).
      if (isSocialRpc(name)) {
        const promise = (async () => {
          try {
            const data = await runSocialRpc(name, params);
            return { data, error: null } as any;
          } catch (err) {
            console.warn(`[Social RPC] ${name} client fallback failed:`, err);
            return { data: null, error: null } as any;
          }
        })();
        const enriched = promise as Promise<any> & {
          single: () => Promise<any>;
          maybeSingle: () => Promise<any>;
        };
        enriched.single = () => promise;
        enriched.maybeSingle = () => promise;
        return enriched;
      }

      // Delegate unknown RPCs to Cloud Functions — fail-soft on stub/missing.
      const promise = (async () => {
        try {
          const remote = await invokeFunction(name, params);
          if (remote.error || isNotYetPortedPayload(remote.data)) {
            console.warn(`[RPC] ${name} unavailable:`, remote.error?.message || 'not_yet_ported');
            return { data: null, error: null } as any;
          }
          return { data: remote.data, error: null } as any;
        } catch (err) {
          console.warn(`[RPC] ${name} failed:`, err);
          return { data: null, error: null } as any;
        }
      })();
      const enriched = promise as Promise<any> & {
        single: () => Promise<any>;
        maybeSingle: () => Promise<any>;
      };
      enriched.single = () => promise;
      enriched.maybeSingle = () => promise;
      return enriched;
    },

    auth: firebaseAuth,
    storage: firebaseStorage,
    functions: {
      invoke: invokeFunction,
    },

    channel(name: string, _opts?: { config?: any }) {
      return createRealtimeChannel(name);
    },

    getChannels() {
      return getActiveChannels();
    },

    removeChannel(channel: { topic: string; unsubscribe: () => void }) {
      removeChannelByTopic(channel.topic);
      channel.unsubscribe();
    },

    realtime: {
      setAuth(_token: string) {
        // Firestore uses Firebase Auth automatically — no separate realtime auth.
      },
    },
  };
}

export type DataClient = ReturnType<typeof createDataClient>;
