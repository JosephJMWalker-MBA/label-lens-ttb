import { PREFERENCES_STORAGE_KEY } from "./preferences";

/**
 * Inline script that applies the persisted theme, font size, and reduced-motion
 * preference to <html> BEFORE first paint, preventing a flash of the wrong theme.
 * It mirrors `applyPreferences` but must run synchronously with no imports, so it
 * is intentionally a small self-contained string.
 */
const script = `(function(){try{
var d=document.documentElement;
var raw=localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)});
var p=raw?JSON.parse(raw):{};
var theme=p.theme==='light'||p.theme==='dark'?p.theme:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
d.setAttribute('data-theme',theme);
d.setAttribute('data-font-scale',p.fontScale==='small'||p.fontScale==='large'?p.fontScale:'default');
if(p.motion==='reduce')d.setAttribute('data-motion','reduce');else d.removeAttribute('data-motion');
}catch(e){}})();`;

export function ThemeInitScript() {
  // eslint-disable-next-line @next/next/no-sync-scripts
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
