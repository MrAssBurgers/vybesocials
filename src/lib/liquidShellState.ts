/** Remove aurora / touch document hooks so custom wallpaper owns the body stack. */
export function stripLiquidShellDocumentState(): void {
  document.body.classList.remove('has-liquid-bg');
  document.documentElement.classList.remove('vybe-aurora-active', 'vybe-liquid-touch-active');
  delete document.documentElement.dataset.liquidBg;
}

let touchSystemActive = false;

export function setVybeLiquidTouchSystemActive(active: boolean): void {
  touchSystemActive = active;
}

export function isVybeLiquidTouchSystemActive(): boolean {
  return touchSystemActive;
}
