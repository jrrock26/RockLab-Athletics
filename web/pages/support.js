import Link from 'next/link';
import { SUPPORT_EMAIL } from '../lib/contact';

export default function Support() {
  return (
    <main className="page prose">
      <h1>Support</h1>

      <h2>Common questions</h2>

      <h3>I didn&apos;t get an invitation email</h3>
      <p>
        Ask your coach to check that your email is on the roster. Invitations also appear in the
        app under <em>Invitations</em> if you&apos;re already signed in with that email address.
      </p>

      <h3>How do I join a team?</h3>
      <p>
        Coaches invite players and parents by email from the roster screen. If you&apos;re a
        follower, ask the coach for the team&apos;s follow link.
      </p>

      <h3>How do I leave a team?</h3>
      <p>Open the team, then <em>Team Settings → Leave Team</em>.</p>

      <h3>How do I report something?</h3>
      <p>
        Long-press any message and choose <em>Report message</em>. Your athletic director and coach
        are notified. You can also block the sender from the same menu.
      </p>

      <h3>How do I delete my account?</h3>
      <p>
        <em>Settings → Delete Account</em>. Athletic directors and head coaches must hand off
        ownership first.
      </p>

      <h3>We&apos;re a school and want to buy</h3>
      <p>
        School plans are purchased on the web. See <Link href="/billing">plans and limits</Link> for
        what each tier includes — subscriptions are never sold inside the iOS app.
      </p>

      <h2>Contact</h2>
      <p>
        Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
      <p className="muted small"><Link href="/privacy">Privacy</Link> · <Link href="/">Home</Link></p>
    </main>
  );
}
