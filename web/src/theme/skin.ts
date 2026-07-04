// Manages the persisted skin + theme.
// Bootstrap in index.html sets data-skin/data-theme before first paint to
// avoid FOUC; this hook keeps the DOM and localStorage in sync when the user
// changes preference at runtime (Config page § Skin).
import { useCallback, useEffect, useState } from 'react';

export type Skin = 'pixel-retro' | 'kawaii' | 'y2k';
export type Theme = 'pixel' | 'newspaper';

export const SKINS: readonly Skin[] = ['pixel-retro', 'kawaii', 'y2k'] as const;
export const THEMES: readonly Theme[] = ['pixel', 'newspaper'] as const;

const SKIN_KEY = 'downspace.skin';
const THEME_KEY = 'downspace.theme';

function readAttr(attr: 'data-skin' | 'data-theme'): string | null {
  return document.documentElement.getAttribute(attr);
}

function isSkin(v: string | null): v is Skin {
  return v === 'pixel-retro' || v === 'kawaii' || v === 'y2k';
}
function isTheme(v: string | null): v is Theme {
  return v === 'pixel' || v === 'newspaper';
}

export function useSkin() {
  const [skin, setSkinState] = useState<Skin>(() => {
    const attr = readAttr('data-skin');
    return isSkin(attr) ? attr : 'pixel-retro';
  });
  const [theme, setThemeState] = useState<Theme>(() => {
    const attr = readAttr('data-theme');
    return isTheme(attr) ? attr : 'pixel';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin);
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch { /* private-mode / disabled storage */ }
  }, [skin]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* private-mode / disabled storage */ }
  }, [theme]);

  const setSkin = useCallback((s: Skin) => setSkinState(s), []);
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return { skin, theme, setSkin, setTheme };
}
