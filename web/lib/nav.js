import { normalizeRole } from './portal.mjs';

/// The rail, per role. One map, because the same links have to appear in the shell, the
/// mobile overflow row and any future breadcrumb — three copies of this list is how a
/// navigation item ends up on desktop and nowhere else.
///
/// The shape follows the iOS tab bar (Home, Teams, Schedule, Chat, Settings) so a person
/// who uses both apps is not learning two products. Labels are what a user calls the
/// thing, not what the collection is called: "Messages", not "chats".
///
/// `roles` is deliberately explicit rather than "everyone except": a new role should get
/// an empty rail that someone has to think about, not automatic access to a page whose
/// rules were never considered.
const ITEMS = [
  // Athletic director — the console that already shipped.
  { href: '/dashboard', label: 'Teams', roles: ['ad'] },
  { href: '/coaches', label: 'Coaches', roles: ['ad'] },
  { href: '/calendar', label: 'Calendar', roles: ['ad'] },
  { href: '/seasons', label: 'Seasons', roles: ['ad'] },
  { href: '/directory', label: 'Directory', roles: ['ad'] },
  { href: '/import', label: 'Import', roles: ['ad'] },
  { href: '/requests', label: 'Requests', roles: ['ad'] },
  { href: '/reports', label: 'Reports', roles: ['ad'] },
  { href: '/records', label: 'Records', roles: ['ad'] },
  { href: '/audit', label: 'Audit log', roles: ['ad'] },
  { href: '/portal', label: 'Team portal', roles: ['ad'] },
  { href: '/profile', label: 'Profile', roles: ['ad'] },

  // Everyone on a team. Home is the portal: it already answers "what do I owe, when is
  // the next game, how do I reach the coach" and it is where invitations are accepted.
  { href: '/portal', label: 'Home', roles: ['coach', 'staff', 'player', 'parent', 'follower'] },
  { href: '/teams', label: 'My teams', roles: ['coach', 'staff', 'player', 'parent'] },
  { href: '/schedule', label: 'Schedule', roles: ['coach', 'staff', 'player', 'parent', 'follower'] },
  { href: '/messages', label: 'Messages', roles: ['coach', 'staff', 'player', 'parent', 'follower'] },
  // Signed paperwork belongs to a roster entry, and a follower has none. Staff and
  // coaches are left out too: their iOS screen is the review side (who has not signed),
  // which the web does not have yet — a link to a family's forms page would be a dead
  // end for them rather than a shortcut.
  { href: '/forms', label: 'Forms', roles: ['player', 'parent'] },
  { href: '/requests', label: 'Requests', roles: ['coach'] },
  { href: '/records', label: 'Records', roles: ['coach', 'staff'] },
  { href: '/profile', label: 'Profile', roles: ['coach', 'staff', 'player', 'parent', 'follower'] },
];

/// The rail for a stored role. `family` is a legacy spelling of `parent` and must not
/// fall through to the follower's narrower list.
export function railFor(role) {
  const normalized = normalizeRole(role);
  if (!normalized) return [];
  return ITEMS.filter((item) => item.roles.includes(normalized)).map(({ href, label }) => ({
    href,
    label,
  }));
}

/// Where the brand link goes: the console for an AD, the portal for everyone else, and
/// the sign-in page for a role the app does not know.
export function homeFor(role) {
  const normalized = normalizeRole(role);
  if (normalized === 'ad') return '/dashboard';
  if (!normalized) return '/';
  return '/portal';
}

/// A role's own name, for the header pill. iOS says "Parent / Guardian" and the web was
/// printing the raw stored value.
export function roleLabel(role) {
  const normalized = normalizeRole(role);
  return (
    {
      ad: 'AD',
      coach: 'Coach',
      staff: 'Staff',
      player: 'Player',
      parent: 'Parent',
      follower: 'Follower',
    }[normalized] || normalized
  );
}
