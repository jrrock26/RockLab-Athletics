import Link from 'next/link';
import { PRIVACY_EMAIL } from '../lib/contact';

export default function Privacy() {
  return (
    <main className="page prose">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: November 4, 2026</p>

      <h2>Who we are</h2>
      <p>
        RockLab Athletics provides team management software to schools and athletic programs.
        Schools (the “Customer”) decide what data is collected about their athletes. We act as a
        service provider to the school.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email, role (AD, coach, staff, player, parent, follower), and profile photo.</li>
        <li><strong>Team data:</strong> rosters, jersey numbers, positions, schedules, results, forms, and messages entered by school staff.</li>
        <li><strong>Media:</strong> photos and game film uploaded by coaches and staff.</li>
        <li><strong>Devices:</strong> push notification token, so we can send game and schedule alerts.</li>
        <li><strong>Diagnostics:</strong> crash and performance data, and coarse usage analytics.</li>
      </ul>

      <h2>Student data</h2>
      <p>
        Rosters may include information about minors. That information is provided by the school,
        is visible only to members of that team, and is never sold or used for advertising. Schools
        are responsible for the notices and consents their policies require.
      </p>

      <h2>How we use it</h2>
      <p>
        To operate the features you use: rosters, schedules, communication, forms, highlights, and
        notifications. We do not sell personal information, and we do not use student data for
        advertising or to train third-party models.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>Team members see their own team&apos;s content.</li>
        <li>Followers see games, scores, and public updates — not practice details or rosters.</li>
        <li>School athletic directors see their school&apos;s data and moderation reports.</li>
        <li>We access data only to operate and support the service.</li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We use Google Firebase (authentication, database, file storage, push notifications) and
        Stripe (billing for schools). Both process data on our behalf under their own terms.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        You can delete your account in the app under <em>Settings → Delete Account</em>. Deletion
        removes your profile, photo, and sign-in, removes you from teams, and unlinks you from
        family records. Records the school owns — such as submitted forms and team history — stay
        with the school. Athletic directors and head coaches must hand off ownership before
        deleting, because a program cannot be left without an owner.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Turn off push notifications in iOS Settings.</li>
        <li>Report or block content from any message in a chat.</li>
        <li>Ask your school to correct or delete roster information.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Privacy and data requests:{' '}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
      </p>
      <p className="muted small"><Link href="/support">Support</Link> · <Link href="/">Home</Link></p>
    </main>
  );
}
