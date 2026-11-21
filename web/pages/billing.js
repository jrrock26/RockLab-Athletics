import Link from 'next/link';
import { useRouter } from 'next/router';
import { SUPPORT_EMAIL } from '../lib/contact';
import { PLANS, PRICE_ON_REQUEST } from '../lib/plans';

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
        <>
          <p>
            A plan belongs to the <strong>school</strong>, not to a person or a phone.
            Your athletic director buys it once on the web and every team, coach, and
            athlete under that school is covered — you do not buy it per user.
          </p>

          <h2>Who pays, and where</h2>
          <ul>
            <li>Only the <strong>athletic director</strong> can start or change a plan.</li>
            <li>
              Plans are bought <strong>here on the web</strong>, never inside the iOS app.
              Apple requires that, so there is deliberately no purchase button in the app —
              the app shows your plan and links back to this page.
            </li>
            <li>Every school starts on the free plan. No card, no trial clock.</li>
          </ul>

          <h2>The plans</h2>
          {PLANS.map((plan) => (
            <section className="card" key={plan.id} style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>
                {plan.name}{' '}
                <span className="muted small">
                  {plan.price ? `— ${plan.price} ${plan.cadence}` : `— ${PRICE_ON_REQUEST}`}
                </span>
              </h3>
              <p className="muted small" style={{ marginTop: 0 }}>{plan.blurb}</p>
              <ul>
                <li>
                  {plan.teams} {plan.teams === 1 ? 'team' : 'teams'}
                </li>
                <li>
                  {plan.reels} highlight {plan.reels === 1 ? 'reel' : 'reels'} per month
                </li>
                <li>{plan.storage} of game film</li>
              </ul>
            </section>
          ))}

          <h2>What counts against a plan</h2>
          <p>
            Film storage is checked when a video is uploaded, so you cannot be
            surprised by a bill later — an upload that would exceed the storage
            allowance is refused with a message telling you to remove old film or
            move up a plan. Records, rosters, forms, schedules, scoring, and stats
            are not metered.
          </p>

          <h2>Getting set up</h2>
          <p>
            Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your
            school address and tell us which plan fits. We will send a payment link
            and switch the school on, usually the same day.
          </p>
        </>
      )}

      <h2>Need help?</h2>
      <p>
        Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
      <p className="muted small">
        <Link href="/dashboard">Dashboard</Link> · <Link href="/privacy">Privacy</Link> ·{' '}
        <Link href="/">Home</Link>
      </p>
    </main>
  );
}
