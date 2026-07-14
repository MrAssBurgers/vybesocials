import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildProfileShareUrl } from '@/lib/shareLinks';
import { toast } from 'sonner';
import type { ProfileMenuActionId, ProfileViewMode, ProfileViewProfile } from '../types';

interface ProfileMoreMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileViewProfile;
  mode: ProfileViewMode;
  menuActions: ProfileMenuActionId[];
  onViewFriendship?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onRemoveFriend?: () => void;
}

const LABELS: Record<ProfileMenuActionId, string> = {
  edit_profile: 'Edit Profile',
  copy_link: 'Copy Link',
  share_profile: 'Share Profile',
  story_settings: 'Story Settings',
  privacy: 'Privacy',
  theme: 'Theme Designer',
  account_settings: 'Account Settings',
  chat_settings: 'Chat Settings',
  mute: 'Mute',
  location_sharing: 'Location Sharing',
  view_friendship: 'View Friendship',
  create_group: 'Create Group with…',
  remove_friend: 'Remove Friend',
  block: 'Block',
  report: 'Report',
  hide_suggestion: 'Hide Suggestion',
};

export function ProfileMoreMenuSheet({
  open,
  onOpenChange,
  profile,
  mode: _mode,
  menuActions,
  onViewFriendship,
  onBlock,
  onReport,
  onRemoveFriend,
}: ProfileMoreMenuSheetProps) {
  const navigate = useNavigate();

  const run = async (action: ProfileMenuActionId) => {
    switch (action) {
      case 'edit_profile':
      case 'account_settings':
      case 'privacy':
      case 'story_settings':
      case 'theme':
        onOpenChange(false);
        navigate('/settings');
        break;
      case 'copy_link': {
        const url = buildProfileShareUrl(profile.username);
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
        onOpenChange(false);
        break;
      }
      case 'share_profile': {
        const url = buildProfileShareUrl(profile.username);
        if (navigator.share) {
          await navigator.share({
            title: `${profile.display_name || profile.username} on VYBE`,
            url,
          });
        } else {
          await navigator.clipboard.writeText(url);
          toast.success('Link copied');
        }
        onOpenChange(false);
        break;
      }
      case 'view_friendship':
        onOpenChange(false);
        onViewFriendship?.();
        break;
      case 'create_group':
        onOpenChange(false);
        navigate('/messages');
        toast.message('Create a group from Messages');
        break;
      case 'chat_settings':
      case 'mute':
      case 'location_sharing':
        onOpenChange(false);
        navigate('/messages');
        break;
      case 'remove_friend':
        onOpenChange(false);
        onRemoveFriend?.();
        break;
      case 'block':
        onOpenChange(false);
        onBlock?.();
        break;
      case 'report':
        onOpenChange(false);
        onReport?.();
        break;
      case 'hide_suggestion':
        onOpenChange(false);
        toast.success('Suggestion hidden');
        break;
      default:
        onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>More</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {menuActions.map((action) => (
            <button
              key={action}
              type="button"
              className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted ${
                action === 'block' || action === 'remove_friend' || action === 'report'
                  ? 'text-destructive'
                  : ''
              }`}
              onClick={() => void run(action)}
            >
              {LABELS[action]}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
