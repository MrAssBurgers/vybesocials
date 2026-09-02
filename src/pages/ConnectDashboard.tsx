/**
 * ConnectDashboard
 * ────────────────
 * The main dashboard for a Stripe Connect V2 connected account owner.
 * 
 * Features:
 *   • Create a new V2 Connected Account
 *   • Start / resume onboarding via Account Links
 *   • View live account status (fetched directly from Stripe API)
 *   • Create products on the connected account
 *   • Subscribe to the platform's SaaS plan
 *   • Manage subscription via Billing Portal
 *
 * The `accountId` is persisted in the URL query string so the user can
 * bookmark or share the page.  In production you'd look this up from
 * your database instead.
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import { openStripeConnectFlow } from "@/lib/openStripeConnectFlow";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

interface AccountStatus {
  account_id: string;
  display_name: string | null;
  ready_to_process_payments: boolean;
  onboarding_complete: boolean;
  requirements_status: string;
  details: { card_payments_status: string };
}

// ── Component ──────────────────────────────────────────────────────────

export default function ConnectDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountIdFromUrl = searchParams.get("accountId");

  const [accountId, setAccountId] = useState(accountIdFromUrl || "");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(false);

  // Product creation form
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productPrice, setProductPrice] = useState("");

  // ── Fetch account status from Stripe (always live, never cached) ────
  const fetchStatus = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-account-status", {
        body: { account_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStatus(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch account status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount / URL change
  useEffect(() => {
    if (accountIdFromUrl) {
      setAccountId(accountIdFromUrl);
      fetchStatus(accountIdFromUrl);
    }
  }, [accountIdFromUrl, fetchStatus]);

  // ── Create a new V2 Connected Account ────────────────────────────────
  const handleCreateAccount = async () => {
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-create-account", {
        body: {
          display_name: "My Business", // In production, collect from a form
          contact_email: "owner@example.com", // In production, use the user's email
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newId = data.account_id;
      setAccountId(newId);
      setSearchParams({ accountId: newId });
      toast.success(`Account created: ${newId}`);
      fetchStatus(newId);
    } catch (e: any) {
      toast.error(e.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  // ── Start onboarding (Account Link) ──────────────────────────────────
  const handleOnboard = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-account-link", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const opened = await openStripeConnectFlow(data.url);
      if (!opened) throw new Error('Could not open Stripe onboarding');
    } catch (e: any) {
      toast.error(e.message || "Failed to create onboarding link");
    } finally {
      setLoading(false);
    }
  };

  // ── Create a product on the connected account ────────────────────────
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-create-product", {
        body: {
          account_id: accountId,
          name: productName,
          description: productDesc || undefined,
          price_cents: Math.round(parseFloat(productPrice) * 100),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Product "${productName}" created!`);
      setProductName("");
      setProductDesc("");
      setProductPrice("");
    } catch (e: any) {
      toast.error(e.message || "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  // ── Subscribe to platform plan ───────────────────────────────────────
  const handleSubscribe = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-subscription", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        const opened = await openStripeConnectFlow(data.url);
        if (!opened) throw new Error('Could not open Stripe checkout');
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to start subscription");
    } finally {
      setLoading(false);
    }
  };

  // ── Open billing portal ──────────────────────────────────────────────
  const handleBillingPortal = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-billing-portal", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        const opened = await openStripeConnectFlow(data.url);
        if (!opened) throw new Error('Could not open Stripe checkout');
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to open billing portal");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Stripe Connect V2 Dashboard</h1>

      {/* ── Step 1: Create Account ─────────────────────────────────── */}
      {!accountId ? (
        <section className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Get Started</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Create a new Stripe Connected Account to start accepting payments.
          </p>
          <button
            onClick={handleCreateAccount}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Creating…" : "Create Connected Account"}
          </button>
        </section>
      ) : (
        <>
          {/* ── Account Status ──────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Account Status</h2>
              <button
                onClick={() => fetchStatus(accountId)}
                disabled={loading}
                className="text-sm text-primary hover:underline disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <div className="text-xs font-mono text-muted-foreground mb-3 break-all">
              Account ID: {accountId}
            </div>

            {status ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${status.ready_to_process_payments ? "bg-green-500" : "bg-amber-500"}`} />
                  <span>
                    Card Payments: <strong>{status.details.card_payments_status}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${status.onboarding_complete ? "bg-green-500" : "bg-amber-500"}`} />
                  <span>
                    Onboarding: <strong>{status.onboarding_complete ? "Complete" : "Incomplete"}</strong>
                    {status.requirements_status !== "none" && (
                      <span className="text-muted-foreground ml-1">
                        ({status.requirements_status})
                      </span>
                    )}
                  </span>
                </div>
                {status.display_name && (
                  <div className="text-muted-foreground">Name: {status.display_name}</div>
                )}
              </div>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : null}

            {/* Onboard button */}
            {status && !status.onboarding_complete && (
              <button
                onClick={handleOnboard}
                disabled={loading}
                className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? "Loading…" : "Onboard to Collect Payments"}
              </button>
            )}
          </section>

          {/* ── Create Product ──────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create a Product</h2>
            <form onSubmit={handleCreateProduct} className="space-y-3">
              <input
                type="text"
                placeholder="Product name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="number"
                step="0.01"
                min="0.50"
                placeholder="Price (USD)"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={loading || !productName || !productPrice}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? "Creating…" : "Create Product"}
              </button>
            </form>

            {/* Link to storefront */}
            <p className="mt-4 text-sm text-muted-foreground">
              View your{" "}
              <a
                href={`/connect/storefront/${accountId}`}
                className="text-primary underline"
              >
                storefront →
              </a>
            </p>
          </section>

          {/* ── Platform Subscription ──────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-2">Platform Subscription</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Subscribe to the platform to unlock premium features.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                Subscribe
              </button>
              <button
                onClick={handleBillingPortal}
                disabled={loading}
                className="px-4 py-2 rounded-lg border border-border bg-background font-medium hover:bg-accent disabled:opacity-50 transition"
              >
                Manage Subscription
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
