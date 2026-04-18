/**
 * Animation Warm-up
 * 
 * Forces the browser to compile keyframes once at app boot so the first
 * play of each animation is jank-free. Uses an offscreen, invisible host.
 */

const WARMUP_ANIMATIONS = [
  'fade-in',
  'fade-out',
  'scale-in',
  'scale-out',
  'slide-in-right',
  'slide-out-right',
  'accordion-down',
  'accordion-up',
  'create-button-gradient-flow',
  'pulse',
  'spin',
  'enter',
  'exit',
];

let warmedUp = false;

export function warmupAnimations() {
  if (warmedUp || typeof document === 'undefined') return;
  warmedUp = true;

  const run = () => {
    try {
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = [
        'position:fixed',
        'top:-9999px',
        'left:-9999px',
        'width:1px',
        'height:1px',
        'pointer-events:none',
        'opacity:0',
        'contain:strict',
      ].join(';');

      WARMUP_ANIMATIONS.forEach((name) => {
        const el = document.createElement('div');
        el.style.cssText = `width:1px;height:1px;animation:${name} 1ms linear 1 forwards;`;
        host.appendChild(el);
      });

      // Also warm up GPU compositing layers for transform/opacity
      const gpu = document.createElement('div');
      gpu.style.cssText =
        'width:1px;height:1px;transform:translateZ(0);will-change:transform,opacity;backdrop-filter:blur(1px);';
      host.appendChild(gpu);

      document.body.appendChild(host);

      // Remove after one frame — keyframes are now compiled & cached
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          host.remove();
        });
      });
    } catch (err) {
      console.warn('[VYBE] Animation warmup failed:', err);
    }
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 200);
  }
}

/**
 * Preload Framer Motion chunk so the first animated route doesn't
 * wait for the chunk download.
 */
export function preloadFramerMotion() {
  if (typeof window === 'undefined') return;
  const run = () => {
    import('framer-motion').catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 300);
  }
}
