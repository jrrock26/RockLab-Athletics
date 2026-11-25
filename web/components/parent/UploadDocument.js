import { useState } from 'react';
import { uploadAthleteDocument } from '../../lib/parentData';
import { ALLOWED_DOCUMENT_TYPES, documentProblem } from '../../lib/parent.mjs';
import { REQUIREMENT_LABELS } from '../../lib/portal.mjs';

/// Upload a physical, waiver or other required document for one athlete.
///
/// Two writes happen and both must: the file goes to Storage (which the rule allows
/// only for the guardian of that roster entry), and a record is written onto the
/// roster form. A file with no record is invisible to staff — which is the failure
/// mode this component exists to avoid.
export default function UploadDocument({ teamId, entryId, athleteName, requirements, uid, onUploaded }) {
  const rows = Array.isArray(requirements) ? requirements : [];
  const [formId, setFormId] = useState(rows.length ? rows[0].id : 'physical');
  const [file, setFile] = useState(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!file) {
      setError('Choose a file first.');
      return;
    }
    const problem = documentProblem({ size: file.size, type: file.type });
    if (problem) {
      setError(problem);
      return;
    }
    if (!signature.trim()) {
      setError('Type your name to sign the upload.');
      return;
    }

    setBusy(true);
    try {
      await uploadAthleteDocument({
        teamId,
        entryId,
        athleteName,
        formId,
        file,
        uid,
        signedByName: signature,
      });
      setNotice('Uploaded. Your coach still has to review it.');
      setFile(null);
      setSignature('');
      if (onUploaded) onUploaded();
    } catch (err) {
      setError(
        err?.code === 'storage/unauthorized'
          ? 'You are not allowed to upload for this athlete. Your link may still be waiting on coach approval.'
          : err?.message || 'The upload failed. Try a smaller file.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="link" onClick={() => setOpen(true)}>
        Upload a document instead
      </button>
    );
  }

  return (
    <form className="upload" onSubmit={submit}>
      <h4>Upload for {athleteName}</h4>
      <label>
        Which requirement?
        <select value={formId} onChange={(e) => setFormId(e.target.value)}>
          {rows.length === 0 && <option value="physical">Sports physical</option>}
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label || REQUIREMENT_LABELS[r.status] || r.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        File
        <input
          type="file"
          accept={ALLOWED_DOCUMENT_TYPES.join(',')}
          onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
        />
      </label>
      <p className="small muted">PDF, JPEG or PNG, up to 10 MB.</p>
      <label>
        Sign as
        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload and sign'}
      </button>
      {error && <p className="error small">{error}</p>}
      {notice && <p className="ok small">{notice}</p>}
      <button type="button" className="link" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
