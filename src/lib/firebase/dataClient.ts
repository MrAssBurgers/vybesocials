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
import type { QueryConstraint } from 'firebase/firestore';
import {
  isPreviewFounderUser,
  isPreviewSandbox,
  LEGACY_FOUNDER_AUTH_ID,
} from '@/lib/previewSandbox';

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
  private matchFilters: Record<string, unknown> = {};

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

  lt(field: string, value: unknown) {
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
    }
    return this;
  }

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
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    return this.executeInsert(rows);
  }

  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    return this.executeUpsert(rows, opts?.onConflict);
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload;
    return this.executeUpdate();
  }

  delete() {
    this.deleteMode = true;
    return this.executeDelete();
  }

  private buildConstraints(): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];
    for (const f of this.filters) {
      if (f.op === 'in' && Array.isArray(f.value)) {
        if (f.value.length <= 10) {
          constraints.push(where(f.field, 'in', f.value));
        }
      } else if (f.op === 'not-in' && Array.isArray(f.value)) {
        // Firestore not-in limited; skip complex cases
      } else if (f.op === '==' || f.op === '!=' || f.op === '>' || f.op === '<') {
        constraints.push(where(f.field, f.op, f.value));
      }
    }
    for (const o of this.orders) {
      constraints.push(orderBy(o.field, o.ascending ? 'asc' : 'desc'));
    }
    if (this.limitN) constraints.push(firestoreLimit(this.limitN));
    return constraints;
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
    let result = rows;
    for (const f of this.filters) {
      if (f.op === 'not-in' && Array.isArray(f.value)) {
        result = result.filter((r) => !f.value.includes(r[f.field]));
      }
      if (f.op === 'in' && Array.isArray(f.value) && f.value.length > 10) {
        result = result.filter((r) => f.value.includes(r[f.field]));
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
      if (this.countOnly) {
        const rows = await getDocuments(this.table, this.buildConstraints());
        const filtered = this.applyClientFilters(rows as Record<string, unknown>[]);
        return { data: null, error: null, count: filtered.length };
      }

      let rows = await getDocuments(this.table, this.buildConstraints());
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

export interface QueryResult<T = unknown> {
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

async function ensurePreviewFounderAccess(userId: string): Promise<void> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!isPreviewSandbox() || !isPreviewFounderUser(user)) return;

  const now = new Date().toISOString();
  await setDocument('profiles', userId, {
    id: userId,
    user_id: userId,
    username: 'Bakrix',
    display_name: 'Bakrix',
    avatar_url: null,
    bio: '',
    onboarding_completed: true,
    is_verified: true,
    created_at: now,
  });

  for (const table of ['user_roles', 'user_roles_auth'] as const) {
    await setDocument(`${table}`, `${userId}_owner`, {
      id: `${userId}_owner`,
      user_id: userId,
      role: 'owner',
      created_at: now,
    });
  }
}

async function rpcEnsureProfile(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const existing = await getDocument('profiles', user.id);
  if (existing) {
    await ensurePreviewFounderAccess(user.id);
    return existing.id as string;
  }

  const username =
    (isPreviewSandbox() && isPreviewFounderUser(user))
      ? 'Bakrix'
      : (user.user_metadata?.username as string) ||
        (user.user_metadata?.display_name as string) ||
        `user_${user.id.slice(0, 8)}`;

  await setDocument('profiles', user.id, {
    id: user.id,
    user_id: user.id,
    username,
    display_name: user.user_metadata?.display_name || username,
    avatar_url: null,
    bio: '',
    onboarding_completed: isPreviewSandbox() && isPreviewFounderUser(user),
    created_at: new Date().toISOString(),
  });

  await ensurePreviewFounderAccess(user.id);
  return user.id;
}

async function rpcGetMyHighestRole(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;
  if (isPreviewSandbox() && isPreviewFounderUser(user)) return 'owner';
  if (user.id === LEGACY_FOUNDER_AUTH_ID) return 'owner';

  const [profileRoles, authRoles] = await Promise.all([
    getDocuments<{ role?: string }>('user_roles', [where('user_id', '==', user.id)]),
    getDocuments<{ role?: string }>('user_roles_auth', [where('user_id', '==', user.id)]),
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
  if (isPreviewSandbox() && isPreviewFounderUser(user)) return true;
  if (user.id === LEGACY_FOUNDER_AUTH_ID) return true;
  const role = await rpcGetMyHighestRole();
  return role === 'owner';
}

async function rpcIsUsernameAvailable(username: string): Promise<boolean> {
  const rows = await getDocuments('profiles', [where('username', '==', username)]);
  return rows.length === 0;
}

async function rpcCreateDmConversation(otherProfileId: string): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;

  const memberIds = [user.id, otherProfileId].sort();
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

async function rpcGetPublicUserCount(): Promise<number> {
  const rows = await getDocuments('profiles');
  return rows.length;
}

const CLIENT_RPC: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  ensure_profile: async () => rpcEnsureProfile(),
  sync_signup_username: async () => {
    await rpcEnsureProfile();
    return null;
  },
  claim_profile_by_email: async () => rpcEnsureProfile(),
  is_username_available: async (p) => rpcIsUsernameAvailable(String(p.username || p._username || '')),
  create_dm_conversation: async (p) => rpcCreateDmConversation(String(p.other_profile_id || '')),
  get_public_user_count: async () => rpcGetPublicUserCount(),
  get_profile_by_id: async (p) => {
    const id = String(p.target_id || '');
    return id ? await getDocument('profiles', id) : null;
  },
  get_my_highest_role: async () => rpcGetMyHighestRole(),
  is_owner: async (p) => rpcIsOwner(p),
};

export function createDataClient() {
  return {
    from(table: string) {
      return new QueryBuilder(table);
    },

    async rpc(name: string, params: Record<string, unknown> = {}) {
      const clientFn = CLIENT_RPC[name];
      if (clientFn) {
        try {
          const data = await clientFn(params);
          return { data, error: null };
        } catch (err) {
          return { data: null, error: toQueryError(err) };
        }
      }

      // Delegate unknown RPCs to Cloud Functions (same name).
      return invokeFunction(name, params);
    },

    auth: firebaseAuth,
    storage: firebaseStorage,
    functions: {
      invoke: invokeFunction,
    },

    channel(name: string) {
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
