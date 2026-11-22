import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/// Starting a team from the web.
///
/// The iOS app walks this as a wizard (sport, then which genders, then which levels) and
/// creates each combination. The web needs the same power, so the shape is kept: pick a
/// sport, then gender and level, then create. `createTeam` is AD-only server-side, so
/// nothing here is the security boundary -- it is the form in front of it.
const SPORTS = [
  'Basketball', 'Baseball', 'Softball', 'Football', 'Soccer', 'Volleyball',
  'Track & Field', 'Cross Country', 'Golf', 'Tennis', 'Wrestling', 'Swimming',
  'Lacrosse', 'Ice Hockey', 'Field Hockey', 'Gymnastics', 'Cheerleading', 'Bowling',
];

const LEVELS = [
  '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade',
  '6th Grade', '7th Grade', '8th Grade',
  'Freshman', 'Junior Varsity', 'Varsity',
];
const SQUADS = ['', 'A', 'B'];
const GENDERS = ['Boys', 'Girls', 'Coed'];
const SEASONS = ['Fall', 'Winter', 'Spring'];

const slug = (name) =>
  name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AddTeam({ schoolId, onCreated }) {
  const [sport, setSport] = useState('Basketball');
  const [gender, setGender] = useState('Boys');
  const [level, setLevel] = useState('Varsity');
  const [squad, setSquad] = useState('');
  const [season, setSeason] = useState('Fall');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  // A and B squads are stored in the level string ("7th Grade A") because createTeam
  // takes a free-text level and nothing downstream would read a separate field.
  const levelValue = squad ? `${level} ${squad}` : level;

  async function create() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await httpsCallable(functions, 'createTeam')({
        schoolId,
        sportId: slug(sport),
        sportName: sport,
        gender,
        level: levelValue,
        season,
      });
      setDone(`${gender} ${level} ${sport} created.`);
      if (onCreated) onCreated(res.data);
    } catch (err) {
      setError(err?.message || 'That team could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Start a team</h2>
      <p className="small muted">
        Pick the sport, who plays it, and which level. Each combination is its own team,
        because boys and girls varsity basketball are two rosters.
      </p>

      <div className="form-grid">
        <label>
          Sport
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Who plays
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>
          Squad
          <select value={squad} onChange={(e) => setSquad(e.target.value)}>
            {SQUADS.map((s) => (
              <option key={s || 'none'} value={s}>{s === '' ? 'No A/B split' : `${s} team`}</option>
            ))}
          </select>
        </label>
        <label>
          Season
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <button type="button" onClick={create} disabled={busy || !schoolId}>
        {busy ? 'Creating…' : `Create ${gender} ${levelValue} ${sport}`}
      </button>
      {error && <p className="error">{error}</p>}
      {done && <p className="ok">{done}</p>}
    </section>
  );
}
