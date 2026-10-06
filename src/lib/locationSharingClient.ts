/** Load map request validation only when location sharing is actually used. */
export async function locationSharingRequest(
  ...args: Parameters<typeof import('./locationSharingService').locationSharingRequest>
) {
  args[2]();
  const service = await import('./locationSharingService');
  args[2]();
  return service.locationSharingRequest(...args);
}
