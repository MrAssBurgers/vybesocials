export type MapLayer =
  | 'friends'
  | 'stories'
  | 'posts'
  | 'clips'
  | 'events'
  | 'trending'
  | 'hotspots'
  | 'groups'
  | 'heatmap'
  | 'meetups';

export interface MapGroupMap {
  id: string;
  name: string;
  emoji: string;
  color: string;
  owner_id: string;
  created_at: string;
  member_count?: number;
  revision: string;
  status: 'active' | 'legacy';
  legacy: boolean;
  membership: { role: 'owner' | 'member'; status: 'active' | 'left'; revision: string } | null;
}

export type SharingMode =
  | 'precise'
  | 'approximate'
  | 'friends'
  | 'best_friends'
  | 'group'
  | 'temporary'
  | 'scheduled'
  | 'ghost';

export type ActivityType =
  | 'stationary'
  | 'walking'
  | 'running'
  | 'driving'
  | 'cycling'
  | 'flying'
  | 'traveling';

export interface LiveFriend {
  /** Current checked grant and client access lease; never a persisted authority. */
  accessRevision?: string;
  accessUntil?: number;
  sampleExpiresAt?: number;
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label: string | null;
  city?: string | null;
  updated_at: string;
  expires_at: string | null;
  sharing_enabled: boolean;
  sharing_mode?: SharingMode;
  status?: string | null;
  speed?: number | null;
  heading?: number | null;
  battery_percent?: number | null;
  activity_type?: ActivityType | null;
  geohash?: string | null;
  approx_radius_m?: number;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio?: string | null;
  } | null;
  /** Interpolated display position */
  displayLat?: number;
  displayLng?: number;
}

export interface MapPlace {
  revision?: string;
  legacy?: boolean;
  id: string;
  name: string;
  category: string;
  description?: string | null;
  photo_url?: string | null;
  created_by?: string | null;
  latitude: number;
  longitude: number;
  city?: string | null;
  check_in_count: number;
  story_count: number;
  vibe_tags?: string[];
  metadata?: Record<string, unknown>;
  intel_summary?: MapPlaceIntelSummary;
}

export type LocationVerdict = 'safe' | 'caution' | 'avoid';

export type LocationLabelType =
  | 'trespassing'
  | 'private_property'
  | 'no_trespassing'
  | 'construction'
  | 'closed_area'
  | 'after_hours'
  | 'high_crime'
  | 'flood_zone'
  | 'wildfire_risk'
  | 'protected_wildlife'
  | 'military_restricted'
  | 'school_zone'
  | 'permit_required'
  | 'no_parking'
  | 'poorly_lit'
  | 'well_lit'
  | 'public_park'
  | 'business_district'
  | 'water_hazard';

export interface LocationLabel {
  type: LocationLabelType | string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  detail: string;
}

export interface MapPlaceIntelSummary {
  safety_score: number;
  verdict: LocationVerdict;
  labels: Pick<LocationLabel, 'type' | 'severity' | 'title'>[];
  researched_at: string;
}

export interface MapLocationIntel {
  cache_key: string;
  latitude: number;
  longitude: number;
  place_name?: string | null;
  safety_score: number;
  verdict: LocationVerdict;
  labels: LocationLabel[];
  summary: string;
  tips: string[];
  access_notes?: string | null;
  typical_hours?: string | null;
  parking_notes?: string | null;
  accessibility_notes?: string | null;
  sources_note?: string | null;
  researched_at: string;
  expires_at: string;
}

export interface MapPlacePost {
  id: string;
  place_id: string;
  user_id: string;
  content: string;
  media_url?: string | null;
  created_at: string;
  like_count?: number;
  comment_count?: number;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface FriendCheckIn {
  id: string;
  user_id: string;
  place_id?: string | null;
  place_name?: string | null;
  message?: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface MapPlacePostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface MapMeetup {
  revision?: string;
  legacy?: boolean;
  membership?: { status: 'going' | 'left'; revision: string } | null;
  id: string;
  host_id: string;
  title: string;
  description?: string | null;
  dest_latitude: number;
  dest_longitude: number;
  dest_label?: string | null;
  starts_at: string;
  status: string;
  member_count?: number;
  members?: { user_id: string; status: string; eta_minutes?: number | null }[];
}

export interface MapStoryPin {
  id: string;
  user_id: string;
  media_url: string;
  thumbnail_url?: string | null;
  latitude: number;
  longitude: number;
  expires_at: string;
  profile?: { username: string | null; avatar_url: string | null };
}

/** Checked source-backed pins; never copied raw pin documents. */
export type MapPostPin = import('./mapPinService').MapContentPin;
export type MapClipPin = import('./mapPinService').MapContentPin;

export interface HeatmapCell {
  geohash_prefix: string;
  cell_latitude: number;
  cell_longitude: number;
  intensity: number;
  pulse_level: number;
}

export interface MapEventPin {
  event_id: string;
  latitude: number;
  longitude: number;
  title?: string;
  start_time?: string;
}

export type TimeMachineMode = 'now' | '1h' | '6h' | 'yesterday' | 'week';

export const DEFAULT_LAYERS: Record<MapLayer, boolean> = {
  friends: true,
  stories: false,
  posts: false,
  clips: false,
  events: false,
  trending: false,
  hotspots: false,
  groups: false,
  heatmap: false,
  meetups: true,
};

export const LAYER_LABELS: Record<MapLayer, string> = {
  friends: 'Friends',
  stories: 'Stories',
  posts: 'Posts',
  clips: 'Clips',
  events: 'Events',
  trending: 'Trending',
  hotspots: 'Hotspots',
  groups: 'Squad Maps',
  heatmap: 'Vybe Heat',
  meetups: 'Meetups',
};
