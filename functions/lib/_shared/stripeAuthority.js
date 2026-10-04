import { HttpsError } from 'firebase-functions/v2/https';
function requireOwner(resource, id, uid) {
    // These bindings are written with the server's Stripe key. A Firestore ID
    // alone is not proof: older client rules allowed payment-reference edits.
    if (resource.id !== id || resource.deleted || resource.metadata?.uid !== uid) {
        throw new HttpsError('failed-precondition', 'Payment account ownership needs verification. Contact support.');
    }
}
export async function verifiedCreatorPaymentProfile(db, stripe, uid) {
    if (typeof uid !== 'string' || !uid || uid.includes('/') || uid.length > 128) {
        throw new HttpsError('invalid-argument', 'Invalid creator account');
    }
    const rows = await db.collection('creator_profiles').where('user_id', '==', uid).limit(2).get();
    if (rows.empty)
        return { accountId: null, ref: db.collection('creator_profiles').doc(uid) };
    // Never arbitrarily select one of conflicting migrated payment profiles.
    if (rows.docs.length !== 1)
        throw new HttpsError('failed-precondition', 'Payment profile needs verification. Contact support.');
    const id = rows.docs[0].data().stripe_account_id;
    if (id == null || id === '')
        return { accountId: null, ref: rows.docs[0].ref };
    if (typeof id !== 'string' || !/^acct_[A-Za-z0-9]+$/.test(id)) {
        throw new HttpsError('failed-precondition', 'Payment account needs verification. Contact support.');
    }
    requireOwner(await stripe.accounts.retrieve(id), id, uid);
    return { accountId: id, ref: rows.docs[0].ref };
}
export async function verifiedCreatorAccountId(db, stripe, uid) {
    return (await verifiedCreatorPaymentProfile(db, stripe, uid)).accountId;
}
export async function verifiedCustomerId(stripe, uid, id) {
    if (typeof id !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(id)) {
        throw new HttpsError('failed-precondition', 'No verified Stripe customer');
    }
    requireOwner(await stripe.customers.retrieve(id), id, uid);
    return id;
}
//# sourceMappingURL=stripeAuthority.js.map