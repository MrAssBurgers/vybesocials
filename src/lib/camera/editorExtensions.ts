/**
 * Structured extension points for the snap editor's top-right tool rail.
 *
 * Core tools (text / stickers / draw / image overlay / media mode / save) are
 * built into SnapEditor. Tools that need work not yet supported by the
 * codebase (music overlay baking, crop, video trim, mute, captions) register
 * here when implemented — SnapEditor renders whatever is registered, so adding
 * a tool never touches the editor layout again.
 */
import type { LucideIcon } from 'lucide-react';

export interface SnapEditorExtension {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Invoked with the current media; returns a replacement blob or nothing. */
  run: (media: { url: string; type: 'photo' | 'video' }) => void | Promise<void>;
}

const extensions: SnapEditorExtension[] = [];

export function registerSnapEditorExtension(ext: SnapEditorExtension): void {
  if (!extensions.some((e) => e.id === ext.id)) extensions.push(ext);
}

export function getSnapEditorExtensions(): SnapEditorExtension[] {
  return [...extensions];
}

/**
 * Known gaps (documented, not yet registered):
 * - music: SoundPicker/MusicGallery exist but audio is not mixed into exports.
 * - crop:  ImageCropEditor exists under create/editors — needs snap wiring.
 * - trim:  VideoTrimEditor exists under create/editors — needs snap wiring.
 * - mute / captions: no existing implementation.
 */
export const SNAP_EDITOR_PLANNED_EXTENSIONS = ['music', 'crop', 'trim', 'mute', 'captions'] as const;
