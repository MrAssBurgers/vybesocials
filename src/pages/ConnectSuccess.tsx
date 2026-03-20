/**
 * ConnectSuccess
 * ──────────────
 * Simple success page shown after a Stripe Checkout completes.
 * Displays the Checkout Session ID for reference.
 */

import { useSearchParams, Link } from "react-router-dom";

export default function ConnectSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="rounded-xl border border-border bg-card p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-xl font-bold mb-2">Payment Successful!</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Thank you for your purchase.
        </p>
        {sessionId && (
          <p className="text-xs font-mono text-muted-foreground break-all mb-6">
            Session: {sessionId}
          </p>
        )}
        <Link
          to="/connect/dashboard"
          className="text-primary underline text-sm"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
