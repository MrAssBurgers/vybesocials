/** Shared create-studio publish readiness (text vs media). */
export function canPublishCreatePost(options: {
  contentType: 'text' | 'post' | 'short' | 'video';
  caption: string;
  fileCount: number;
}): boolean {
  const { contentType, caption, fileCount } = options;
  if (contentType === 'text' || fileCount === 0) {
    return caption.trim().length > 0;
  }
  return fileCount > 0;
}

export function resolvePublishContentType(options: {
  contentType: 'text' | 'post' | 'short' | 'video';
  fileCount: number;
}): 'text' | 'post' | 'short' | 'video' {
  if (options.contentType === 'text' || options.fileCount === 0) return 'text';
  return options.contentType;
}
