# OneSignal MCP (Cursor)

Connect Cursor to the VYBE OneSignal app for push debugging, user lookup, test sends, and delivery stats.

**Server URL:** `https://server.smithery.ai/onesignal/onesignal`  
**VYBE App ID:** `85bcf4b4-16fb-4101-90b3-59ca9574e57b` (Despia / native)

## Quick setup

### 1. Project config (committed)

`.cursor/mcp.json` already registers the OneSignal MCP server for this repo.

### 2. Authenticate

**Option A — Browser (recommended, no secrets in files)**

1. Restart Cursor
2. **Settings → MCP & Integrations**
3. Click **Authenticate** (or **Needs login**) next to **onesignal**
4. On the Connect OneSignal page, enter:
   - **App ID:** `85bcf4b4-16fb-4101-90b3-59ca9574e57b`
   - **API Key:** REST API key from [OneSignal Dashboard → Settings → Keys & IDs](https://dashboard.onesignal.com)  
     Use the **secret key value** shown once at creation — not the Key ID.

**Option B — Headers from `.env`**

```bash
# Add to .env (never commit the REST key):
# ONESIGNAL_REST_API_KEY=your_rest_key

npm run setup:onesignal-mcp
```

This merges header auth into `.cursor/mcp.json` and `~/.cursor/mcp.json`.

### 3. Verify

In a new Cursor chat:

```text
Use onesignal_health to check if OneSignal MCP is connected.
```

You should get `ok`. Then try `onesignal_reference_overview` for available tools.

## Common tools

| Task | Tool |
|------|------|
| Health check | `onesignal_health` |
| Send test push | `send_message` (requires confirmation) |
| Look up user | `view_user` |
| Delivery stats | `view_message` |
| List segments | `list_segments` |

## Related repo setup

| Script | Purpose |
|--------|---------|
| `npm run setup:onesignal-secrets` | Firebase Functions secrets for production push |
| `docs/AUTH_SMS_PUSH_SETUP.md` | End-user push checklist |

Official docs: https://documentation.onesignal.com/docs/en/model-context-protocol
