/**
 * Bundled to public/boot-theme.js — synchronous pre-paint theme before React.
 */
import { prepaintThemeFromStorage } from './lib/theme/themePrepaint';

try {
  prepaintThemeFromStorage();
  document.documentElement.setAttribute('data-vybe-theme-painted', 'true');
} catch {
  document.documentElement.setAttribute('data-vybe-theme-painted', 'true');
}
