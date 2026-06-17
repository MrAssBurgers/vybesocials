/** Phase 1 Vybe Check statuses (Firestore `vybe_checks`). */
export type VybeCheckStatus =
  | 'pending_check'
  | 'approved'
  | 'limited'
  | 'needs_review'
  | 'rejected'
  | 'appealed'
  | 'removed';

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

export interface ExtractedFrame {
  blob: Blob;
  timestampSec: number;
}
