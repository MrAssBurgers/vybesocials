/** Auth types compatible with prior Supabase session shape used across the app. */

export interface VybeUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  email_confirmed_at?: string | null;
  identities?: Array<{ provider: string; id?: string; identity_id?: string; [k: string]: any }>;
}

export interface VybeSession {
  user: VybeUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface VybeAuthError {
  message: string;
  name?: string;
  status?: number;
  code?: string;
  details?: any;
  context?: any;
}

export interface QueryResult<T = any> {
  data: T;
  error: VybeAuthError | null;
  count?: number | null;
}

/** VybeAuthError compatibility extras. */
export type VybeAuthErrorWithDetails = VybeAuthError & { details?: any };

export interface StorageUploadResult {
  data: { path: string } | null;
  error: VybeAuthError | null;
}

export interface StorageUrlResult {
  data: { publicUrl: string; signedUrl?: string };
}

export interface FunctionInvokeResult<T = any> {
  data: T | null;
  error: VybeAuthError | null;
}

/** Profile document stored in Firestore `users` collection. */
export interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string;
  created_at?: string;
  interests?: string[] | null;
  onboarding_completed?: boolean | null;
  is_private?: boolean | null;
  is_verified?: boolean | null;
  badge_settings?: Record<string, boolean> | null;
  updated_at?: string;
}

export interface PostDocument {
  id: string;
  author_id: string;
  type: string;
  media_url: string;
  thumbnail_url?: string | null;
  caption?: string;
  tags?: string[];
  created_at: string;
  is_pinned?: boolean;
  view_count?: number;
  is_ai_generated?: boolean;
  ai_confidence?: number;
  ai_override?: boolean | null;
}

export interface ChatDocument {
  id: string;
  is_group: boolean;
  name?: string | null;
  avatar_url?: string | null;
  member_ids: string[];
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
}

export interface MessageDocument {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  message_type?: string;
  view_mode?: string;
  expires_at?: string | null;
  is_deleted?: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  reply_to_id?: string | null;
  created_at: string;
}
