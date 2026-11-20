import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Billing() {
  const router = useRouter();
  const status = router.query.status;
  const isSuccess = status === 'success';
  const isCancel = status === 'cancel';

  return (
    <main className="page prose">
      <h1>{isSuccess ? 'Subscription active' : isCancel ? 'Checkout canceled' : 'School plans'}</h1>

      {isSuccess && (
        <>
          <p>
            Thank you — your school plan is being activated. Stripe has charged your card and we
            are updating your school record now.
          </p>
          <p>
            Activation usually completes within a minute. Open the RockLab Athletics app and pull
            to refresh on your school dashboard. If nothing changes after a few minutes, email us
            and we&apos;ll sort it out.
          </p>
        </>
      )}

      {isCancel && (
        <>
          <p>No payment was taken and nothing changed on your account.</p>
          <p>
            You can restart checkout any time from the app under <em>School → Subscription</em>.
          </p>
        </>
      )}

      {!isSuccess && !isCancel && (
        <p>
          School subscriptions are purchased on the web and managed by your athletic director.
          Subscriptions are never sold inside the iOS app.
        </p>
      )}

      <h2>Need help?</h2>
      <p>
        <a href="mailto:support@rocklabathletics.com">support@rocklabathletics.com</a>
      </p>
      <p className="muted small">
        <Link href="/dashboard">Dashboard</Link> · <Link href="/privacy">Privacy</Link> ·{' '}
        <Link href="/">Home</Link>
      </p>
    </main>
  );
}
