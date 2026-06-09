/** Shared daily-brief cache slot — must match `daily_brief_cache` + prefetch. */
export type BriefTimeSlot = 'morning' | 'lunch' | 'dinner';

export function getBriefTimeSlot(): BriefTimeSlot {
  const h = new Date().getHours();
  if (h >= 4 && h < 10) return 'morning';
  if (h >= 10 && h < 16) return 'lunch';
  return 'dinner';
}

export function getNextBriefSlotTime(): Date {
  const now = new Date();
  const hour = now.getHours();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  if (hour < 4) next.setHours(4);
  else if (hour < 10) next.setHours(10);
  else if (hour < 16) next.setHours(16);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(4);
  }
  return next;
}
