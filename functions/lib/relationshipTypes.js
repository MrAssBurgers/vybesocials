/** Point weights for rolling 30-day relationship score. */
export const RELATIONSHIP_EVENT_WEIGHTS = {
    snap_sent: 6,
    snap_received: 6,
    snap_reply: 7,
    message_sent: 2,
    message_received: 2,
    voice_message: 3,
    call_minute: 1,
    video_call_minute: 1,
    shared_post_reply: 2,
    reaction: 0.5,
    friend_added: 0,
};
export const ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STREAK_WARNING_MS = 4 * 60 * 60 * 1000;
export const STREAK_RESTORATION_MS = 48 * 60 * 60 * 1000;
export const BEST_FRIEND_SLOTS = 8;
export const RANK_STABILITY_DELTA = 3;
export const MUTUAL_NUMBER_ONE_CLOSE_DAYS = 14;
export const MUTUAL_NUMBER_ONE_FOREVER_DAYS = 60;
export const RECALC_DEBOUNCE_MS = 60_000;
export const RELATIONSHIP_TITLE = {
    forever_number_one: 'Forever Number One',
    close_number_one: 'Close Number One',
    number_one: 'Number One',
    best_friend: 'Best Friend',
    mutual_best_friend: 'Mutual Best Friend',
    mutual_number_one: 'Mutual Number One',
    rising_friend: 'Rising Friend',
    new_close_friend: 'New Close Friend',
    cooling_down: 'Cooling Down',
    friend: 'Friend',
};
//# sourceMappingURL=relationshipTypes.js.map