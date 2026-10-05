import type { MapContentPin } from '@/lib/vybemap/mapPinService';
import './mapContentMarker.css';

export const mapPinContentLabel = (pin: MapContentPin) => pin.sourceType === 'short' ? 'clip' : pin.sourceType === 'video' ? 'video' : 'post';
export const mapPinLabel = (pin: MapContentPin) => `Open ${mapPinContentLabel(pin)} by ${pin.author.displayName || pin.author.username || 'Vybe member'} · ${pin.areaLabel} · approximate area`;

/** Native button semantics work in either renderer, without interpolated HTML. */
export function createMapContentMarker(initial: MapContentPin, onOpen: (pin: MapContentPin) => void) {
  const element = document.createElement('div');
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'vybe-content-pin'; element.append(button);
  const image = document.createElement('img'); image.alt = ''; image.referrerPolicy = 'no-referrer';
  image.loading = 'lazy'; image.onerror = () => { image.hidden = true; };
  const symbol = document.createElement('span'); symbol.setAttribute('aria-hidden', 'true');
  button.append(symbol, image);
  let current = initial, callback = onOpen, active = true, thumbnail: string | null = null;
  const click = (event: MouseEvent) => { event.stopPropagation(); if (active) callback(current); };
  button.addEventListener('click', click);
  const update = (pin: MapContentPin, nextOpen: (pin: MapContentPin) => void) => {
    current = pin; callback = nextOpen;
    button.setAttribute('aria-label', mapPinLabel(pin)); button.title = mapPinLabel(pin);
    button.dataset.kind = pin.kind;
    symbol.textContent = pin.sourceType === 'post' ? '▤' : '▶';
    // Only source-checked thumbnails are shown. Never fetch a video as an image.
    const nextThumbnail = pin.thumbnailUrl || null;
    if (nextThumbnail !== thumbnail) {
      thumbnail = nextThumbnail; image.hidden = !thumbnail;
      if (thumbnail) image.src = thumbnail; else image.removeAttribute('src');
    } else if (!thumbnail) image.hidden = true;
  };
  update(initial, onOpen);
  return { element, update, dispose: () => { active = false; button.disabled = true; button.removeEventListener('click', click); image.onerror = null; } };
}
