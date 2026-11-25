import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { fetchParentChannel, sendParentMessage } from '../../lib/parentData';
import { sortMessages, visibleMessages } from '../../lib/parent.mjs';
import { formatWhen } from '../../lib/portal.mjs';

/// The parent/guardian channel for one team.
///
/// The channel document is created by iOS under coach authority, so a family cannot
/// open one. When it does not exist the component says exactly that instead of
/// showing an empty room that looks broken.
///
/// A live listener is used after the first read so a coach's reply appears without a
/// reload; the read rule authorises it because the channel path is fixed and the
/// rule's membership check does not depend on the message document.
export default function Messages({ teamId, uid, senderName }) {
  const [state, setState] = useState({
    loading: true, exists: false, title: 'Parent chat', messages: [], error: '',
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const chatIdRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    async function start() {
      setState({ loading: true, exists: false, title: 'Parent chat', messages: [], error: '' });
      try {
        const info = await fetchParentChannel(teamId);
        if (cancelled) return;
        chatIdRef.current = info.chatId;
        setState({
          loading: false, exists: info.exists, title: info.title, messages: info.messages, error: '',
        });
        if (!info.exists) return;

        unsubscribe = onSnapshot(
          collection(db, 'chats', info.chatId, 'messages'),
          (snap) => {
            const rows = sortMessages(
              visibleMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            ).slice(-200);
            setState((prev) => ({ ...prev, messages: rows }));
          },
          () => { /* keep the fetched rows if the listener is refused */ },
        );
        // The component may have unmounted while the first read was in flight; the
        // cleanup below already ran, so close the listener here instead of leaking it.
        if (cancelled && unsubscribe) unsubscribe();
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false, exists: false, title: 'Parent chat', messages: [],
            error: err?.message || 'The parent chat could not be opened.',
          });
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [teamId]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setSendError('');
    try {
      await sendParentMessage({
        chatId: chatIdRef.current,
        uid,
        senderName,
        text: body,
      });
      setText('');
    } catch (err) {
      setSendError(
        err?.code === 'permission-denied'
          ? 'You cannot post here yet. Your coach has to open the parent channel first.'
          : err?.message || 'That message could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <p className="muted small">Loading messages…</p>;
  if (state.error) return <p className="error small">{state.error}</p>;
  if (!state.exists) {
    return (
      <p className="muted">
        Your coach has not opened the parent chat for this team yet. Announcements still
        appear on the overview.
      </p>
    );
  }

  return (
    <div className="thread">
      <h4>{state.title}</h4>
      {state.messages.length === 0 ? (
        <p className="muted small">No messages yet.</p>
      ) : (
        <ul className="bubbles">
          {state.messages.map((m) => (
            <li key={m.id} className={m.senderId === uid ? 'bubble mine' : 'bubble'}>
              <span className="small muted">
                {m.senderName || 'Coach'} · {formatWhen(m.at)}
              </span>
              <div>{m.text}</div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={send}>
        <label>
          Message your coaches
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about practice, paperwork or travel"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        {sendError && <p className="error small">{sendError}</p>}
        <p className="small muted">
          Coaches and other guardians on this team can read this channel.
        </p>
      </form>
    </div>
  );
}
