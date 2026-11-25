import { notificationSummary } from '../../lib/parent.mjs';

/// What needs a family's attention, in one list.
///
/// This is deliberately in-app, not push: the platform has no mail provider
/// configured and the iOS client is the only registered push target, so claiming to
/// have notified a phone would be false. "New" means since this device last opened
/// the portal, which is honest about what it knows.
export default function Notifications({ items, onMarkSeen }) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) {
    return (
      <section className="card notifications">
        <h2>Notifications</h2>
        <p className="muted small">{notificationSummary([])}</p>
      </section>
    );
  }

  return (
    <section className="card notifications">
      <h2>Notifications</h2>
      <p className="muted small">{notificationSummary(rows)}</p>
      <ul className="notify-list">
        {rows.map((n) => (
          <li key={n.id} className={`notify ${n.kind}`}>
            <strong>{n.title}</strong>
            {n.detail ? <span className="muted small"> · {n.detail}</span> : null}
          </li>
        ))}
      </ul>
      {onMarkSeen ? (
        <button type="button" className="link" onClick={onMarkSeen}>
          Mark all as seen
        </button>
      ) : null}
    </section>
  );
}
