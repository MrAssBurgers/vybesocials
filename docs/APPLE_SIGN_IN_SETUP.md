# Sign in with Apple — Firebase setup

## Status

- Firebase **Services ID** field is now set to **`com.despia.vybe.web`**
- Team ID / Key / `.p8` already configured
- You must create that Services ID in Apple Developer or Apple keeps returning **403**

## Create Services ID (required)

1. https://developer.apple.com/account/resources/identifiers/list/serviceId → **+**
2. Identifier **exactly:** `com.despia.vybe.web`
3. Enable **Sign In with Apple** → Configure:
   - Primary App ID: `com.despia.vybe`
   - Domains: `vybe-daaab.firebaseapp.com`
   - Return URL: `https://vybe-daaab.firebaseapp.com/__/auth/handler`
4. Save / Register
5. Retry Continue with Apple on `http://127.0.0.1:8081/auth`

If you already use a different Services ID string, tell Cursor that exact ID so Firebase can be patched to match.
