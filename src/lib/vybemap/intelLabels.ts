import type { LocationLabelType } from './types';

export interface LabelMeta {
  emoji: string;
  short: string;
  color: string;
  bg: string;
}

export const LABEL_META: Record<string, LabelMeta> = {
  trespassing: { emoji: '🚫', short: 'Trespassing', color: 'text-red-300', bg: 'bg-red-500/20 border-red-400/40' },
  private_property: { emoji: '🏠', short: 'Private property', color: 'text-red-300', bg: 'bg-red-500/20 border-red-400/40' },
  no_trespassing: { emoji: '⛔', short: 'No trespassing', color: 'text-red-300', bg: 'bg-red-500/20 border-red-400/40' },
  military_restricted: { emoji: '🪖', short: 'Restricted zone', color: 'text-red-300', bg: 'bg-red-500/20 border-red-400/40' },
  closed_area: { emoji: '🔒', short: 'Closed area', color: 'text-red-300', bg: 'bg-red-500/20 border-red-400/40' },
  construction: { emoji: '🚧', short: 'Construction', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  after_hours: { emoji: '🌙', short: 'After hours', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  high_crime: { emoji: '👮', short: 'Higher crime area', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  flood_zone: { emoji: '🌊', short: 'Flood risk', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  wildfire_risk: { emoji: '🔥', short: 'Wildfire risk', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  protected_wildlife: { emoji: '🦌', short: 'Protected wildlife', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-400/30' },
  school_zone: { emoji: '🏫', short: 'School zone', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-400/30' },
  permit_required: { emoji: '📋', short: 'Permit required', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  no_parking: { emoji: '🅿️', short: 'Limited parking', color: 'text-white/70', bg: 'bg-white/8 border-white/15' },
  poorly_lit: { emoji: '💡', short: 'Poorly lit', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
  well_lit: { emoji: '✨', short: 'Well lit', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-400/30' },
  public_park: { emoji: '🌳', short: 'Public park', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-400/30' },
  business_district: { emoji: '🏙️', short: 'Business district', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-400/30' },
  water_hazard: { emoji: '💧', short: 'Water hazard', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30' },
};

export function labelMeta(type: LocationLabelType | string): LabelMeta {
  return LABEL_META[type] ?? {
    emoji: '📍',
    short: type.replace(/_/g, ' '),
    color: 'text-white/70',
    bg: 'bg-white/8 border-white/15',
  };
}
