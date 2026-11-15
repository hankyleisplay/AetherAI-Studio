/**
 * Liquid Glass pointer light: tells the glass surface under the pointer where the pointer is (--lg-mx / --lg-my),
 * so its highlight follows the cursor. One passive listener, at most one style write per animation frame, and
 * nothing at all in eco mode.
 */
const GLOW_SELECTOR = '.glass-panel, .glass-modal, .lg-surface, .lg-surface-thick';

export function installPointerGlow(): void {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return;

  let frame = 0;
  let last: PointerEvent | null = null;

  document.addEventListener(
    'pointermove',
    (e) => {
      last = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const ev = last;
        if (!ev || document.documentElement.classList.contains('eco-mode')) return;
        const target = ev.target instanceof Element ? ev.target.closest<HTMLElement>(GLOW_SELECTOR) : null;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--lg-mx', `${Math.round(ev.clientX - rect.left)}px`);
        target.style.setProperty('--lg-my', `${Math.round(ev.clientY - rect.top)}px`);
      });
    },
    { passive: true }
  );
}
