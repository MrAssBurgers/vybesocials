import { Users, Loader2, UserPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useContactDiscovery } from '@/hooks/useContactDiscovery';
import { LegacyContactUploads } from './LegacyContactUploads';

export function ContactDiscoveryPanel({ settings = false, onComplete }: { settings?: boolean; onComplete?: () => void }) {
  const contact = useContactDiscovery();
  const busy = contact.search.phase === 'reading' || contact.search.phase === 'matching';
  return <section className="space-y-4" aria-label="Find friends from contacts">
    <div className="flex items-start gap-3"><Users className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div>
      <h3 className="font-semibold">Find friends from contacts</h3>
      <p className="text-sm text-muted-foreground">Choose contacts on your device. Names and numbers stay on this screen; only number hashes are sent to check people who opted in.</p>
    </div></div>
    <p className="text-xs text-muted-foreground">New searches do not save your address book on VYBE. US/Canada local numbers and international numbers starting with + are supported. Up to 2,000 numbers per day.</p>
    {settings && <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium" id="contact-discoverable-label">Let friends find me by phone</p>
        {contact.loadingSettings ? <p role="status" className="text-xs text-muted-foreground">Checking phone eligibility…</p>
          : contact.settings?.eligible ? <p className="text-xs text-muted-foreground">Verified linked phone {contact.settings.maskedPhone}</p>
          : contact.settings && <p className="text-xs text-muted-foreground">Your phone is not eligible for discovery yet. {contact.settings.legacyPhoneNeedsVerification ? 'Previous SMS verification does not link your phone to your sign-in account.' : 'Discovery needs a verified phone linked to your sign-in account.'} You can still search your contacts. Phone linking is not available here yet.</p>}
      </div><Switch aria-labelledby="contact-discoverable-label" checked={contact.settings?.discoverable ?? false}
        disabled={!contact.ready || !contact.settings || (!contact.settings.eligible && !contact.settings.discoverable) || contact.saving || contact.loadingSettings}
        onCheckedChange={value => { void contact.setDiscoverable(value); }} /></div>
      {contact.saving && <p role="status" className="text-xs text-muted-foreground">Saving preference…</p>}
      {contact.settingsError && <div role="alert" className="text-sm text-destructive"><p>{contact.settingsError}</p><Button size="sm" variant="outline" onClick={() => { void contact.loadSettings(); }}>Retry preference</Button></div>}
    </div>}
    {!contact.ready && <p role="status" className="text-sm text-muted-foreground">Waiting for your signed-in profile…</p>}
    <div className="flex gap-2"><Button className="flex-1" onClick={() => { void contact.discoverFriends(); }} disabled={!contact.ready || busy}>
      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {contact.search.phase === 'reading' ? 'Opening contacts…' : contact.search.phase === 'matching' ? 'Checking contacts…' : contact.search.phase === 'idle' ? 'Choose contacts' : 'Choose contacts again'}
    </Button>{busy && <Button variant="outline" onClick={contact.cancelSearch}>Cancel search</Button>}</div>
    {contact.search.phase === 'error' && <p role="alert" className="text-sm text-destructive">{contact.search.error}</p>}
    {contact.search.phase === 'complete' && contact.search.result && <div className="space-y-3">
      <p role="status" className="text-sm">{contact.search.result.checked === 0 ? 'No supported phone numbers were selected.' : `${contact.search.result.matches.length} discoverable ${contact.search.result.matches.length === 1 ? 'person' : 'people'} found from ${contact.search.result.checked} numbers.`}</p>
      {!!contact.search.result.skipped && <p className="text-xs text-muted-foreground">{contact.search.result.skipped} unsupported numbers skipped. Include a + country code for international contacts.</p>}
      {contact.search.result.limited && <p className="text-xs text-muted-foreground">Only the first 2,000 unique numbers were checked.</p>}
      {contact.search.result.matches.map(match => <div key={match.id} className="flex items-center gap-3 rounded-lg border p-3">
        <Avatar className="h-9 w-9"><AvatarImage src={match.avatar_url || undefined} /><AvatarFallback>{(match.contactName || match.display_name || match.username || '?').charAt(0)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{match.contactName || match.display_name || match.username}</p><p className="truncate text-xs text-muted-foreground">@{match.username}</p></div>
        <Button size="sm" disabled={!!contact.adding || contact.sent.includes(match.id)} onClick={() => { void contact.addFriend(match.id); }}>
          {contact.sent.includes(match.id) ? <><Check className="mr-1 h-3 w-3" />Requested</> : <><UserPlus className="mr-1 h-3 w-3" />Add</>}
        </Button>
      </div>)}
      {contact.friendError && <p role="alert" className="text-sm text-destructive">{contact.friendError}</p>}
      {!!contact.search.result.invites.length && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Invite a contact</summary>
        <p className="my-2 text-xs text-muted-foreground">Unmatched contacts may already use VYBE with discovery off. An invite opens a text message for you to review and send.</p>
        <div className="max-h-64 overflow-y-auto space-y-2">{contact.search.result.invites.map(invite => <div key={invite.phone} className="flex items-center gap-3"><span className="flex-1 truncate text-sm">{invite.name}</span><a className="text-sm underline" href={`sms:${encodeURIComponent(invite.phone)}?&body=${encodeURIComponent('Join me on VYBE! https://vybehub.app')}`}>Invite</a></div>)}</div>
      </details>}
    </div>}
    {settings && <LegacyContactUploads />}
    {onComplete && <Button variant="outline" className="w-full" onClick={onComplete}>Done</Button>}
  </section>;
}
