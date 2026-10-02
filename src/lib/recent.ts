export const RECENT_STORAGE_KEY = "tools-recent-ids";
export const RECENT_CHANGED_EVENT = "tools:recent-changed";
export const RECENT_LIMIT = 8;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeRecentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(value.filter((id): id is string => typeof id === "string")),
  ].slice(0, RECENT_LIMIT);
}

function emitRecentChanged(recentIds: string[]): void {
  if (!isBrowser()) return;

  window.dispatchEvent(
    new CustomEvent(RECENT_CHANGED_EVENT, {
      detail: { recentIds },
    }),
  );
}

export function getRecentIds(): string[] {
  if (!isBrowser()) return [];

  try {
    const stored = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!stored) return [];

    return normalizeRecentIds(JSON.parse(stored));
  } catch {
    return [];
  }
}

function saveRecentIds(recentIds: string[]): string[] {
  const normalizedIds = normalizeRecentIds(recentIds);

  if (!isBrowser()) return normalizedIds;

  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(normalizedIds));
    emitRecentChanged(normalizedIds);
  } catch {
    return normalizedIds;
  }

  return normalizedIds;
}

export function addRecentId(toolId: string): string[] {
  const recentIds = getRecentIds();
  if (recentIds[0] === toolId) return recentIds;

  return saveRecentIds([toolId, ...recentIds.filter((id) => id !== toolId)]);
}

export function removeRecentId(toolId: string): string[] {
  return saveRecentIds(getRecentIds().filter((id) => id !== toolId));
}

export function clearRecentIds(): string[] {
  return saveRecentIds([]);
}
