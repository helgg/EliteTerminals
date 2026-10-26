// Favourites live on the server (favorites.json) and come back in the state; these only ask for changes.
import type { Favorite } from '@et/shared';

export type NewFavorite = Pick<Favorite, 'system'> & Partial<Pick<Favorite, 'station' | 'stationType' | 'pos'>>;

export async function addFavorite(f: NewFavorite): Promise<boolean> {
  try {
    const res = await fetch('/api/favorites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeFavorite(id: string): Promise<boolean> {
  try {
    return (await fetch(`/api/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' })).ok;
  } catch {
    return false;
  }
}
