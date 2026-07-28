/** Phase 1 Vybe Check — Firestore status values. */
export type VybeCheckStatus =
  | 'pending_check'
  | 'approved'
  | 'limited'
  | 'needs_review'
  | 'rejected'
  | 'appealed'
  | 'removed';

export interface VybeCheckFrameInput {
  base64: string;
  mime_type?: string;
  timestamp_sec?: number;
}

export interface VybeCheckTextInput {
  caption?: string;
  hashtags?: string[];
  transcript?: string;
  ocr_text?: string;
  comments?: string[];
}

export interface VybeCheckRequest {
  content_type: 'video' | 'image' | 'post' | 'text' | 'short' | 'story';
  content_id?: string;
  storage_path?: string;
  frames?: VybeCheckFrameInput[];
  text?: VybeCheckTextInput;
}

export interface VybeCheckRecord {
  user_id: string;
  content_type: string;
  /** null when the check is text-only / pre-publish (Firestore rejects undefined). */
  content_id?: string | null;
  storage_path?: string | null;
  status: VybeCheckStatus;
  score: number;
  categories: string[];
  message: string;
  frame_count: number;
  frames_scanned: number;
  safe_search?: {
    worst_adult?: string;
    worst_violence?: string;
    worst_racy?: string;
    blocked_frame?: number | null;
  } | null;
  moderation?: {
    flagged: boolean;
    score: number;
    categories: string[];
  } | null;
  gemini_review?: {
    score: number;
    analysis: string;
  } | null;
  transcript?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VybeCheckResult {
  check_id: string;
  status: VybeCheckStatus;
  score: number;
  categories: string[];
  message: string;
  allowed: boolean;
  requires_review: boolean;
  limited: boolean;
  transcript?: string;
}
