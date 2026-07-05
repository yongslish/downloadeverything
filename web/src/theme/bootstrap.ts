// Applies the persisted skin/theme to <html> before React mounts, so the
// first paint already has the right colors (no flash of the wrong skin) and
// so useSkin()'s initial state read (which just reads the DOM attribute,
// see skin.ts) picks up the user's actual saved preference instead of
// falling back to the hardcoded default.
//
// This used to be an inline <script> in index.html, which is the standard
// way to do FOUC prevention — but server.mjs sends a strict
// `Content-Security-Policy: script-src 'self'` with no 'unsafe-inline',
// so the browser silently refuses to run inline scripts. That meant this
// logic never executed: useSkin() always initialized from a missing
// attribute, defaulted to 'pixel-retro', and then wrote that default back
// to localStorage — silently clobbering whatever skin the user had picked
// on their previous visit. Running the exact same logic here, from the
// bundled module script (which IS same-origin and allowed under
// script-src 'self'), fixes that without weakening the CSP.
export function applySkinBootstrap(): void {
  try {
    const skin = localStorage.getItem('downspace.skin') || 'pixel-retro';
    const theme = localStorage.getItem('downspace.theme') || 'pixel';
    document.documentElement.setAttribute('data-skin', skin);
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-skin', 'pixel-retro');
    document.documentElement.setAttribute('data-theme', 'pixel');
  }
}
