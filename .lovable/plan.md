

## Plan: Remove Client-Side E2EE Completely — Use Infrastructure Encryption Only

### How Major Companies Do It
WhatsApp/Instagram/iMessage use E2EE but the **user never sees ciphertext**. The encryption/decryption happens transparently at the protocol level. Your current setup has a broken client-side ECDH implementation where encrypted text (`e2ee:...`) leaks into the UI and database, and old encrypted messages are permanently unreadable.

The right approach for this platform (per your existing memory/architecture decisions): **messages are plaintext in the client and database, protected by TLS in transit and AES-256 at rest** — exactly how Discord, Telegram (cloud chats), and Slack operate. No client-side crypto needed.

### Changes

**1. Remove all E2EE infrastructure files**
- Delete `src/lib/e2ee.ts`
- Delete `src/hooks/useMessageEncryption.ts`
- Delete `src/hooks/useDecryptedMessages.ts`
- Delete `src/hooks/useEncryptionKeys.ts`

**2. Stop initializing encryption on login**
- `src/components/app/DeferredAuthHooks.tsx` — Remove `useInitEncryption` import and call

**3. Clean up message display for old encrypted messages**
- `src/components/chat/ChatView.tsx` — Add a simple inline check: if message content starts with `e2ee:`, display "🔒 Message from older encryption version" instead of raw ciphertext
- `src/components/chat/ConversationList.tsx` — Already handles this with the `e2ee:` check; keep the "🔒 Encrypted message" fallback for conversation previews

**4. Remove stale encryption references**
- `src/hooks/useInstantSend.ts` — Remove the `encryptedContent` variable and plaintext-preservation comment; just pass `content` directly
- `src/App.tsx` — Remove the encryption comment

**5. Keep "Secret Chats" branding in premium perks**
- The PaywallSheet and PremiumPerkActions references to "encrypted messages" are marketing copy for a future feature — leave them as-is

### Result
Messages send and display as plaintext. No `e2ee:` prefix ever appears. Old encrypted messages show a graceful fallback. Security comes from TLS + database-level AES-256 encryption at rest — the industry standard for platforms without device-to-device E2EE.

