import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProfileViewProfile } from '../types';

interface ProfileAboutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileViewProfile;
  showBio?: boolean;
  showOtherDetails?: boolean;
  showLocation?: boolean;
  showBirthday?: boolean;
  showPronouns?: boolean;
}

export function ProfileAboutSheet({
  open,
  onOpenChange,
  profile,
  showBio = false,
  showOtherDetails = false,
  showLocation,
  showBirthday,
  showPronouns,
}: ProfileAboutSheetProps) {
  const rows: { label: string; value: string }[] = [];
  if (showBio && profile.bio) rows.push({ label: 'Bio', value: profile.bio });
  if (showPronouns && profile.pronouns) rows.push({ label: 'Pronouns', value: profile.pronouns });
  if (showLocation && profile.location) rows.push({ label: 'Location', value: profile.location });
  if (showBirthday && profile.date_of_birth) {
    rows.push({ label: 'Birthday', value: profile.date_of_birth });
  }
  if (showOtherDetails && profile.link_url) rows.push({ label: 'Link', value: profile.link_url });
  if (showOtherDetails && profile.created_at) {
    rows.push({
      label: 'Joined',
      value: new Date(profile.created_at).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
          )}
          {rows.map((row) => (
            <div key={row.label}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{row.value}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
