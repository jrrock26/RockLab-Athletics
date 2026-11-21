// Planning logic for burning a highlight reel into a single MP4.
//
// Nothing here runs ffmpeg. This module decides *what* to run, `reel.test.js`
// proves the plan, and `renderReel` executes it. Keeping the arithmetic and text
// handling out of the process call is the only way to test a renderer on a
// machine with no media server.
//
// Shape of a render: one input (the game film), N trimmed segments, a burned-in
// lower-third on each, concatenated in clip order.

const MAX_CLIPS = 20;

/// Banner geometry, as fractions/px of the output frame.
const BANNER = {
  heightPx: 168,     // bar height
  padPx: 56,         // left inset for text
  titleSize: 46,
  subtitleSize: 30,
  titleOffsetY: 38,  // from the top of the bar
  subtitleOffsetY: 100,
};

/// Normalises a hex colour to the 0xRRGGBB form drawbox/drawtext expect.
///
/// Accepts "#0A84FF", "0a84ff" and "0x0A84FF"; anything else falls back, because
/// a malformed colour would otherwise fail the whole render rather than one bar.
function normalizeColor(input, fallback = '0A84FF') {
  const raw = String(input || '').trim().replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return `0x${fallback.toUpperCase()}`;
  return `0x${raw.toUpperCase()}`;
}

/// Escapes text for drawtext.
///
/// The value is parsed twice — once by the filtergraph parser, once by drawtext —
/// so a colon, apostrophe or backslash in a player's name will otherwise truncate
/// the text or break the render outright. Apostrophes are the common case:
/// "O'Brien" appears on rosters.
function escapeDrawtext(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/// Validates the clip list and returns the segments that will be cut.
///
/// Throws rather than skipping bad clips: a reel that silently loses a play is
/// worse than a render that refuses and says why.
function clipTimeline(clips) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error('A reel needs at least one clip.');
  }
  if (clips.length > MAX_CLIPS) {
    throw new Error(`A reel can hold at most ${MAX_CLIPS} clips; this one has ${clips.length}.`);
  }
  return clips.map((clip, index) => {
    const start = Number(clip.startSeconds);
    const end = Number(clip.endSeconds);
    if (!isFinite(start) || !isFinite(end)) {
      throw new Error(`Clip ${index + 1} has no valid in/out points.`);
    }
    if (end <= start) {
      throw new Error(`Clip ${index + 1} ends at or before it starts.`);
    }
    return { index, start, end, duration: end - start };
  });
}

function totalDuration(clips) {
  return clipTimeline(clips).reduce((sum, c) => sum + c.duration, 0);
}

/// What the banner says for a given clip.
///
/// The opening card introduces the game; every later card names the play. This is
/// the ESPN pattern, and it is why the first clip reads as a title even though it
/// is ordinary footage.
function bannerLines(clip, index, meta = {}) {
  const team = (meta.teamName || 'Us').toUpperCase();
  const opponent = (meta.opponent || 'Them').toUpperCase();
  const date = meta.dateText || '';
  if (index === 0) {
    return { title: `${team} vs ${opponent}`.trim(), subtitle: date };
  }
  const title = (clip.playerName || 'Team').toUpperCase();
  const action = clip.action || clip.playTag || '';
  return { title, subtitle: action };
}

/// Builds the filtergraph: trim each segment, burn a lower-third onto it, then
/// concatenate them in clip order.
///
/// Video only (`-an` in planRender). Game audio is usually wind, whistles and
/// parents; highlights get music the user chooses, and mixing a source track that
/// jumps at every cut sounds worse than silence.
function buildFilter({ clips, width = 1080, teamColor, fontFile, meta = {} }) {
  const segments = clipTimeline(clips);
  const color = normalizeColor(teamColor);
  const font = String(fontFile || '').replace(/:/g, '\\:');
  if (!font) throw new Error('A font file is required to burn text into the video.');

  const parts = [];
  const labels = [];
  const barHeight = BANNER.heightPx;

  segments.forEach((seg) => {
    const i = seg.index;
    // Trim first, then reset timestamps so every segment starts at zero —
    // without setpts the concat filter receives non-monotonic PTS and fails.
    parts.push(
      `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},` +
      `setpts=PTS-STARTPTS,scale=${width}:-2,` +
      `drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=${color}@0.88:t=fill` +
      `[s${i}]`
    );

    const { title, subtitle } = bannerLines(clips[i], i, meta);
    let chain = `[s${i}]`;
    const draws = [
      `drawtext=fontfile=${font}:text='${escapeDrawtext(title)}'` +
      `:x=${BANNER.padPx}:y=ih-${barHeight - BANNER.titleOffsetY}` +
      `:fontsize=${BANNER.titleSize}:fontcolor=white`,
    ];
    if (subtitle) {
      draws.push(
        `drawtext=fontfile=${font}:text='${escapeDrawtext(subtitle)}'` +
        `:x=${BANNER.padPx}:y=ih-${barHeight - BANNER.subtitleOffsetY}` +
        `:fontsize=${BANNER.subtitleSize}:fontcolor=white@0.92`
      );
    }
    parts.push(`${chain}${draws.join(',')}[b${i}]`);
    labels.push(`[b${i}]`);
  });

  parts.push(`${labels.join('')}concat=n=${segments.length}:v=1:a=0[vout]`);
  return parts.join(';');
}

/// The exact argv handed to ffmpeg.
///
/// An argument array, never a shell string: a player's name ends up in this
/// command, and string interpolation into a shell is how a text field becomes
/// remote command execution on the render host.
function planRender({
  sourcePath,
  outputPath,
  clips,
  width = 1080,
  teamColor,
  fontFile,
  meta = {},
}) {
  if (!sourcePath) throw new Error('A source video is required.');
  if (!outputPath) throw new Error('An output path is required.');
  const filter = buildFilter({ clips, width, teamColor, fontFile, meta });

  return {
    command: 'ffmpeg',
    args: [
      '-y',
      '-i', sourcePath,
      '-filter_complex', filter,
      '-map', '[vout]',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ],
    durationSeconds: totalDuration(clips),
  };
}

module.exports = {
  MAX_CLIPS,
  BANNER,
  normalizeColor,
  escapeDrawtext,
  clipTimeline,
  totalDuration,
  bannerLines,
  buildFilter,
  planRender,
};
