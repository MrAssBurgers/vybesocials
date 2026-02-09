/**
 * Reset theme CSS variables to default classic theme
 * Used on logout to ensure theme doesn't persist between accounts
 */
export function resetThemeToDefault() {
  const root = document.documentElement;
  
  // Default classic theme values
  const defaults = {
    '--primary': '330 100% 60%',
    '--secondary': '240 10% 12%',
    '--accent': '185 100% 50%',
    '--ring': '330 100% 60%',
    '--background': '240 10% 4%',
    '--card': '240 10% 6%',
    '--popover': '240 10% 6%',
    '--foreground': '0 0% 98%',
    '--muted': '240 10% 10%',
    '--muted-foreground': '240 5% 55%',
    '--card-foreground': '0 0% 98%',
    '--popover-foreground': '0 0% 98%',
    '--primary-foreground': '0 0% 100%',
    '--secondary-foreground': '0 0% 98%',
    '--accent-foreground': '0 0% 100%',
    '--border': '240 10% 18%',
    '--input': '240 10% 18%',
    '--input-foreground': '0 0% 98%',
    '--glass': '240 10% 10%',
    '--glass-border': '240 10% 20%',
    '--neon-pink': '330 100% 60%',
    '--neon-purple': '280 100% 60%',
    '--neon-cyan': '185 100% 50%',
    '--gradient-start': '330 100% 60%',
    '--gradient-mid': '240 10% 12%',
    '--gradient-end': '185 100% 50%',
    '--sidebar-background': '240 10% 6%',
    '--sidebar-foreground': '0 0% 98%',
    '--sidebar-primary': '330 100% 60%',
    '--sidebar-primary-foreground': '0 0% 100%',
    '--sidebar-accent': '240 10% 12%',
    '--sidebar-accent-foreground': '0 0% 98%',
    '--sidebar-border': '240 10% 20%',
    '--sidebar-ring': '330 100% 60%',
    '--chart-1': '330 100% 60%',
    '--chart-2': '240 10% 12%',
    '--chart-3': '185 100% 50%',
    '--chart-4': '330 100% 60%',
    '--chart-5': '185 100% 50%',
    '--radius': '0.75rem',
    '--anim-speed': '1',
    '--anim-easing': 'cubic-bezier(0.4, 0, 0.2, 1)',
  };
  
  // Apply all default values
  Object.entries(defaults).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  
  // Reset data attributes
  root.dataset.animSpeed = 'normal';
  root.dataset.animStyle = 'smooth';
  delete root.dataset.hasBgImage;
  delete root.dataset.bgEffect;
  
  // Remove background image
  root.style.removeProperty('--bg-image-url');
  root.style.removeProperty('--bg-image-opacity');
  root.style.removeProperty('--bg-image-blur');
  
  // Reset to dark mode
  root.classList.remove('light');
  root.classList.add('dark');
}
