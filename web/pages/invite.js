import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';

// Public page. No auth: a parent may land here before they have an account.
// The invitation itself is matched in-app on the parent's email address, so
// this page's only job is to tell them exactly what to do next.
const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || '';

export default function Invite() {
  const router = useRouter();
  const { email = '', code = '' } = router.query;
  const address = typeof email === 'string' ? email : '';
  const invitationCode = typeof code === 'string' ? code : '';

  return (
    <>
      <Head>
        <title>Invitation · RockLab Athletics</title>
      </Head>
      <main className="page">
        <h1>You&apos;re invited to RockLab Athletics</h1>
        <p className="muted">
          Your school&apos;s athletic department invited you to follow your athlete&apos;s
          team: schedules, forms, and updates in one place.
        </p>

        <div className="card">
          <h2>Three steps</h2>
          <ol>
            <li>
              <strong>Install the app.</strong>{' '}
              {APP_STORE_URL ? (
                <a href={APP_STORE_URL}>Open RockLab Athletics on the App Store</a>
              ) : (
                <span className="muted">
                  Your athletic director will send the install link.
                </span>
              )}
            </li>
            <li>
              <strong>Sign up with this exact email address.</strong>
              {address ? (
                <div className="card" style={{ marginTop: 8 }}>
                  <code>{address}</code>
                </div>
              ) : (
                <span className="muted"> (use the address your school has on file)</span>
              )}
            </li>
            <li>
              <strong>Accept the invitation.</strong> It appears under{' '}
              <em>Settings → Invitations</em> once you sign up.
            </li>
          </ol>

          {invitationCode && (
            <p className="small muted">
              Invitation code: <code>{invitationCode}</code>
            </p>
          )}

          <p className="small muted">
            Using a different email address won&apos;t show the invitation — the
            match is exact. If you need it sent to another address, ask your
            athletic director to re-issue it.
          </p>
        </div>

        <p className="muted">
          Need help? <Link href="/support">Contact support</Link>
        </p>
      </main>
    </>
  );
}
