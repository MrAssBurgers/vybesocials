export type RecentMessageUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

const KEY = "recent_message_users_v1";
const MAX = 12;

export function getRecentMessageUsers(): RecentMessageUser[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (u) =>
          u &&
          typeof u.id === "string" &&
          typeof u.username === "string" &&
          (typeof u.display_name === "string" || u.display_name === null) &&
          (typeof u.avatar_url === "string" || u.avatar_url === null)
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentMessageUser(user: RecentMessageUser): RecentMessageUser[] {
  const next = [user, ...getRecentMessageUsers().filter((u) => u.id !== user.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
