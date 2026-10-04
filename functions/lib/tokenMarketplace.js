import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { resolveTokenActor, tokenMarketplaceState, purchaseTokenItem, activateTokenBoost, equipTokenItem } from './_shared/tokenMarketplaceAuthority.js';
import { claimTokenCredit } from './_shared/tokenCreditAuthority.js';
export const tokenMarketplace = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true, invoker: 'public' }, async (request) => {
    const uid = requireAuth(request);
    const input = request.data;
    if (!input || typeof input !== 'object' || Array.isArray(input) || !['state', 'purchase', 'activate', 'equip', 'earn'].includes(input.action)) {
        throw new HttpsError('invalid-argument', 'Unknown marketplace action');
    }
    enforceRateLimit(await rateLimit(`token-marketplace:${uid}`, 60, 60));
    if (input.action !== 'state')
        enforceRateLimit(await rateLimit(`token-marketplace-mutation:${uid}`, 30, 60));
    const actor = await resolveTokenActor(db, uid);
    switch (input.action) {
        case 'state': return tokenMarketplaceState(db, actor);
        case 'purchase': return purchaseTokenItem(db, actor, input);
        case 'activate': return activateTokenBoost(db, actor, input);
        case 'equip': return equipTokenItem(db, actor, input);
        case 'earn': return claimTokenCredit(db, actor, { type: input.type, referenceId: input.referenceId });
        default: throw new HttpsError('invalid-argument', 'Unknown marketplace action');
    }
});
//# sourceMappingURL=tokenMarketplace.js.map