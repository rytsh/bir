export const FAVORITES_STORAGE_KEY = "tools-favorite-ids";
export const FAVORITES_CHANGED_EVENT = "tools:favorites-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(value.filter((id): id is string => typeof id === "string")),
  ];
}

function emitFavoritesChanged(favoriteIds: string[]): void {
  if (!isBrowser()) return;

  window.dispatchEvent(
    new CustomEvent(FAVORITES_CHANGED_EVENT, {
      detail: { favoriteIds },
    }),
  );
}

export function getFavoriteIds(): string[] {
  if (!isBrowser()) return [];

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) return [];

    return normalizeFavoriteIds(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function setFavoriteIds(favoriteIds: string[]): string[] {
  const normalizedIds = normalizeFavoriteIds(favoriteIds);

  if (!isBrowser()) return normalizedIds;

  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalizedIds));
    emitFavoritesChanged(normalizedIds);
  } catch {
    return normalizedIds;
  }

  return normalizedIds;
}

export function toggleFavoriteId(toolId: string): string[] {
  const favoriteIds = getFavoriteIds();
  const nextFavoriteIds = favoriteIds.includes(toolId)
    ? favoriteIds.filter((id) => id !== toolId)
    : [...favoriteIds, toolId];

  return setFavoriteIds(nextFavoriteIds);
}
