import { useState, useEffect, useCallback } from 'react';

const FAVORITES_KEY = 'gif_favorites';
const RECENT_KEY = 'gif_recent';
const MAX_RECENT = 20;

export interface SavedGif {
  id: string;
  url: string;
  previewUrl: string;
  title?: string;
  savedAt: number;
}

export function useGifFavorites() {
  const [favorites, setFavorites] = useState<SavedGif[]>([]);
  const [recent, setRecent] = useState<SavedGif[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedFavorites = localStorage.getItem(FAVORITES_KEY);
      const storedRecent = localStorage.getItem(RECENT_KEY);
      
      if (storedFavorites) {
        setFavorites(JSON.parse(storedFavorites));
      }
      if (storedRecent) {
        setRecent(JSON.parse(storedRecent));
      }
    } catch (error) {
      console.error('Failed to load GIF data:', error);
    }
  }, []);

  // Save favorites to localStorage
  const saveFavorites = useCallback((newFavorites: SavedGif[]) => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  }, []);

  // Save recent to localStorage
  const saveRecent = useCallback((newRecent: SavedGif[]) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(newRecent));
      setRecent(newRecent);
    } catch (error) {
      console.error('Failed to save recent:', error);
    }
  }, []);

  // Add to favorites
  const addFavorite = useCallback((gif: Omit<SavedGif, 'savedAt'>) => {
    setFavorites(prev => {
      // Don't add duplicates
      if (prev.some(g => g.id === gif.id)) {
        return prev;
      }
      const newFavorites = [{ ...gif, savedAt: Date.now() }, ...prev];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      return newFavorites;
    });
  }, []);

  // Remove from favorites
  const removeFavorite = useCallback((gifId: string) => {
    setFavorites(prev => {
      const newFavorites = prev.filter(g => g.id !== gifId);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      return newFavorites;
    });
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback((gif: Omit<SavedGif, 'savedAt'>) => {
    const isFavorite = favorites.some(g => g.id === gif.id);
    if (isFavorite) {
      removeFavorite(gif.id);
    } else {
      addFavorite(gif);
    }
    return !isFavorite;
  }, [favorites, addFavorite, removeFavorite]);

  // Check if GIF is favorited
  const isFavorite = useCallback((gifId: string) => {
    return favorites.some(g => g.id === gifId);
  }, [favorites]);

  // Add to recent (when user selects a GIF)
  const addRecent = useCallback((gif: Omit<SavedGif, 'savedAt'>) => {
    setRecent(prev => {
      // Remove if already exists (will be re-added at front)
      const filtered = prev.filter(g => g.id !== gif.id);
      const newRecent = [{ ...gif, savedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(newRecent));
      return newRecent;
    });
  }, []);

  // Clear all recent
  const clearRecent = useCallback(() => {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  }, []);

  return {
    favorites,
    recent,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    addRecent,
    clearRecent,
  };
}
