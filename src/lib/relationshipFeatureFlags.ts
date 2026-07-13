/** Re-exports relationship rollout flags from the shared dm inbox flag module. */
export {
  getDmInboxFlag as getRelationshipFeatureFlag,
  setDmInboxFlag as setRelationshipFeatureFlag,
  isRelationshipProjectionReadEnabled,
  isRelationshipEmojiUiEnabled,
  isVybeScoreUiEnabled,
  type DmInboxFlag as RelationshipFeatureFlag,
} from '@/lib/dmInboxFeatureFlags';
