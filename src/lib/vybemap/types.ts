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
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  check_in_count: number;
  story_count: number;
  metadata?: Record<string, unknown>;
}

export interface MapMeetup {
  id: string;
  host_id: string;
  title: string;
  description?: string | null;
  dest_latitude: number;
  dest_longitude: number;
  dest_label?: string | null;
  starts_at: string;
  status: string;
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

export interface MapPostPin {
  id: string;
  user_id: string;
  caption?: string | null;
  media_url?: string | null;
  latitude: number;
  longitude: number;
  profile?: { username: string | null; avatar_url: string | null };
}

export interface MapClipPin {
  id: string;
  user_id: string;
  media_url: string;
  thumbnail_url?: string | null;
  latitude: number;
  longitude: number;
}

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
  stories: true,
  posts: true,
  clips: true,
  events: true,
  trending: true,
  hotspots: true,
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
  groups: 'Groups',
  heatmap: 'Vybe Heat',
  meetups: 'Meetups',
};
