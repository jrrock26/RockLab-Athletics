const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_CLIPS,
  normalizeColor,
  escapeDrawtext,
  clipTimeline,
  totalDuration,
  bannerLines,
  buildFilter,
  planRender,
} = require('./reel');

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

function clip(start, end, extra = {}) {
  return { startSeconds: start, endSeconds: end, ...extra };
}

// --- limits ---------------------------------------------------------------

test('a reel needs at least one clip', () => {
  assert.throws(() => clipTimeline([]), /at least one clip/);
  assert.throws(() => clipTimeline(null), /at least one clip/);
});

test('a reel refuses more than 20 clips', () => {
  const many = Array.from({ length: MAX_CLIPS + 1 }, (_, i) => clip(i * 5, i * 5 + 4));
  assert.throws(() => clipTimeline(many), /at most 20 clips/);
});

test('exactly 20 clips is allowed', () => {
  const twenty = Array.from({ length: MAX_CLIPS }, (_, i) => clip(i * 5, i * 5 + 4));
  assert.strictEqual(clipTimeline(twenty).length, 20);
});

test('an inverted or empty range is rejected, not skipped', () => {
  // Silently dropping a play would produce a reel missing a moment the user
  // chose, with no indication anything went wrong.
  assert.throws(() => clipTimeline([clip(10, 10)]), /ends at or before it starts/);
  assert.throws(() => clipTimeline([clip(12, 9)]), /ends at or before it starts/);
  assert.throws(() => clipTimeline([{ startSeconds: 'x', endSeconds: 4 }]), /valid in\/out/);
});

test('durations accumulate', () => {
  const clips = [clip(0, 4.5), clip(100, 106), clip(200, 203.5)];
  assert.strictEqual(totalDuration(clips), 14);
});

// --- colour ---------------------------------------------------------------

test('colour accepts the formats a coach might paste', () => {
  assert.strictEqual(normalizeColor('#0a84ff'), '0x0A84FF');
  assert.strictEqual(normalizeColor('0A84FF'), '0x0A84FF');
  assert.strictEqual(normalizeColor('0x0a84ff'), '0x0A84FF');
});

test('a malformed colour falls back instead of failing the render', () => {
  assert.strictEqual(normalizeColor('maroon'), '0x0A84FF');
  assert.strictEqual(normalizeColor(''), '0x0A84FF');
  assert.strictEqual(normalizeColor(undefined), '0x0A84FF');
  assert.strictEqual(normalizeColor('red', 'FFFFFF'), '0xFFFFFF');
});


// --- text escaping --------------------------------------------------------

test('apostrophes and colons survive into drawtext', () => {
  // "O'Brien: 40-yard TD" unescaped ends the filter value at the quote and then
  // fails on the colon — the render dies on a name, not on anything structural.
  assert.strictEqual(escapeDrawtext("O'Brien"), "O\\'Brien");
  assert.strictEqual(escapeDrawtext('Sack: 3rd & 8'), 'Sack\\: 3rd & 8');
  assert.strictEqual(escapeDrawtext('100% effort'), '100\\% effort');
});

test('newlines collapse rather than breaking the filtergraph', () => {
  assert.strictEqual(escapeDrawtext('Ava\nReyes'), 'Ava Reyes');
  assert.strictEqual(escapeDrawtext(null), '');
});

// --- banner copy ----------------------------------------------------------

test('the first card introduces the game, later cards name the play', () => {
  const meta = { teamName: 'Rockwall', opponent: 'Central', dateText: 'Oct 24' };
  const first = bannerLines(clip(0, 5, { playerName: 'Ava Reyes', action: 'Dunk' }), 0, meta);
  assert.strictEqual(first.title, 'ROCKWALL vs CENTRAL');
  assert.strictEqual(first.subtitle, 'Oct 24');

  const second = bannerLines(clip(6, 11, { playerName: 'Ava Reyes', action: 'Dunk' }), 1, meta);
  assert.strictEqual(second.title, 'AVA REYES');
  assert.strictEqual(second.subtitle, 'Dunk');
});

test('a clip with no player falls back to the team', () => {
  const lines = bannerLines(clip(6, 11), 1, {});
  assert.strictEqual(lines.title, 'TEAM');
});

// --- filtergraph ----------------------------------------------------------

test('one trim and one banner per clip, concatenated in order', () => {
  const clips = [clip(0, 4), clip(30, 34), clip(60, 65)];
  const filter = buildFilter({ clips, teamColor: '#0A84FF', fontFile: FONT });

  assert.strictEqual((filter.match(/trim=start=/g) || []).length, 3);
  assert.strictEqual((filter.match(/drawbox=/g) || []).length, 3);
  assert.strictEqual((filter.match(/setpts=PTS-STARTPTS/g) || []).length, 3);
  assert.match(filter, /concat=n=3:v=1:a=0\[vout\]/);
  assert.match(filter, /color=0x0A84FF@0\.88/);
  // Segments must be labelled in order, or the concatenation silently reorders.
  assert.ok(filter.indexOf('[b0]') < filter.indexOf('[b1]'));
  assert.ok(filter.indexOf('[b1]') < filter.indexOf('[b2]'));
});

test('every segment gets its own timestamp reset', () => {
  // Without this concat receives non-monotonic PTS and the render fails on the
  // second clip, which reads like a corrupt upload rather than a filter bug.
  const filter = buildFilter({ clips: [clip(10, 14), clip(50, 54)], teamColor: '#fff', fontFile: FONT });
  assert.strictEqual((filter.match(/setpts=PTS-STARTPTS/g) || []).length, 2);
});

test('missing font is refused with a clear reason', () => {
  assert.throws(() => buildFilter({ clips: [clip(0, 4)], teamColor: '#fff' }), /font file is required/);
});

// --- command --------------------------------------------------------------

test('the ffmpeg command is an argument array, never a shell string', () => {
  const plan = planRender({
    sourcePath: '/tmp/game.mov',
    outputPath: '/tmp/reel.mp4',
    // The first clip shows the matchup and later clips show the player, so the
    // name has to be on clip 2 to reach the filtergraph at all.
    clips: [clip(0, 4), clip(10, 15, { playerName: "O'Brien", action: 'Sack' })],
    teamColor: '#123456',
    fontFile: FONT,
    meta: { teamName: 'Rockwall', opponent: 'Central', dateText: 'Oct 24' },
  });

  assert.strictEqual(plan.command, 'ffmpeg');
  assert.ok(Array.isArray(plan.args));
  assert.ok(plan.args.includes('-filter_complex'));
  assert.strictEqual(plan.args[plan.args.length - 1], '/tmp/reel.mp4');
  // A name with an apostrophe must be escaped, not passed through as a quote.
  // bannerLines uppercases, so the rendered text is O\'BRIEN.
  const graph = plan.args[plan.args.indexOf('-filter_complex') + 1];
  assert.ok(graph.includes("O\\'BRIEN"), `expected an escaped apostrophe in:\n${graph}`);
});

test('render is muted and web-ready', () => {
  const plan = planRender({
    sourcePath: 'a.mov', outputPath: 'b.mp4',
    clips: [clip(0, 5)], fontFile: FONT, teamColor: '#fff',
  });
  assert.ok(plan.args.includes('-an'), 'highlight reels are muted for music');
  assert.ok(plan.args.includes('+faststart'), 'faststart lets social players start instantly');
  assert.strictEqual(plan.args[plan.args.indexOf('-pix_fmt') + 1], 'yuv420p');
});

test('render refuses a missing source or output', () => {
  assert.throws(() => planRender({ outputPath: 'b.mp4', clips: [clip(0, 5)], fontFile: FONT }), /source video/);
  assert.throws(() => planRender({ sourcePath: 'a.mov', clips: [clip(0, 5)], fontFile: FONT }), /output path/);
});
