import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

/// The school's mark.
///
/// The logo object has been writable for a while -- `schools/{id}/logo.jpg` exists in the
/// bucket at 242 KB -- but nothing ever set `schools/{id}.logoURL`, so the dashboard fell
/// back to initials and the AD had no way to change it. This is the missing half: upload,
/// take the download URL, store it on the school.
///
/// Fixed object name, not a generated one. A school has exactly one mark, and a fixed name
/// means re-uploading replaces rather than accumulating orphans in the bucket (the
/// storage rule allows delete on the same terms as write).
export default function SchoolLogo({ schoolId }) {
  const [logoUrl, setLogoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    (async () => {
      const snap = await getDoc(doc(db, 'schools', schoolId)).catch(() => null);
      if (alive && snap?.exists()) setLogoUrl(snap.data().logoURL || '');
    })();
    return () => { alive = false; };
  }, [schoolId]);

  async function onPick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');

    // The storage rule caps at 10 MB too. Checked here so the AD gets a sentence rather
    // than a permission error, which reads like "you are not allowed" and is not the
    // problem.
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('That image is larger than 10 MB. Resize it and try again.');
      return;
    }

    setBusy(true);
    try {
      const objectRef = ref(storage, `schools/${schoolId}/logo.jpg`);
      await uploadBytes(objectRef, file, { contentType: file.type });
      const url = await getDownloadURL(objectRef);
      await updateDoc(doc(db, 'schools', schoolId), { logoURL: url });
      setLogoUrl(url);
      setNotice('Logo updated.');
    } catch (err) {
      // Storage reports a rules refusal as storage/unauthorized, which says nothing about
      // which condition failed. Name the likely causes instead of echoing the code.
      setError(
        err?.code === 'storage/unauthorized'
          ? 'The upload was refused. That usually means this account is not the owner of the school in its record.'
          : (err?.message || 'Could not upload that image.'),
      );
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return (
    <section className="card">
      <h2>School logo</h2>
      <div className="roster-row" style={{ alignItems: 'center', gap: 12 }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" width={56} height={56} style={{ borderRadius: 12, objectFit: 'cover' }} />
        ) : (
          <span className="avatar">?</span>
        )}
        <label className="card link-card" style={{ cursor: 'pointer', display: 'inline-block' }}>
          {busy ? 'Uploading…' : (logoUrl ? 'Replace logo' : 'Upload logo')}
          <input type="file" accept="image/*" onChange={onPick} disabled={busy} hidden />
        </label>
      </div>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
