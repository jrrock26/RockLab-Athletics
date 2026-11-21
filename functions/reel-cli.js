#!/usr/bin/env node
// Render one highlight reel locally, using the same planning logic the deployed
// renderer will use.
//
// Why this exists: the filtergraph is unit-tested, but nobody has ever looked at a
// frame of output. Banner size, text length and placement are visual judgements
// that only a real render can settle. Run this on a clip of your own game film,
// watch it, then we containerise.
//
//   node functions/reel-cli.js game.mov --out reel.mp4 \
//     --clips "12.5-16.5,105-110,240-246" \
//     --team Rockwall --opponent Central --date "Oct 24" --color "#0A84FF"
//
// Or describe the clips properly (player + action per clip):
//
//   node functions/reel-cli.js game.mov --reel reel.json --out reel.mp4
//
// reel.json:
//   { "team": "Rockwall", "opponent": "Central", "date": "Oct 24",
//     "color": "#0A84FF",
//     "clips": [ { "startSeconds": 12.5, "endSeconds": 16.5,
//                  "playerName": "Ava Reyes", "action": "Three" } ] }
//
// Requires ffmpeg on PATH:  brew install ffmpeg

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { planRender } = require('./reel');

const USAGE = `
Render a highlight reel with burned-in banners.

  node functions/reel-cli.js <source-video> [options]

Options
  --out <file>        Output MP4 (default: reel.mp4)
  --clips "<a-b,c-d>" Clip ranges in seconds, e.g. "12.5-16.5,105-110"
  --reel <file>       JSON reel description (player + action per clip)
  --team <name>       Team name for the opening card
  --opponent <name>   Opponent for the opening card
  --date <text>       Date text for the opening card
  --color <hex>       Team colour, e.g. #0A84FF
  --width <px>        Output width (default 1080)
  --font <file>       TTF font file for the banners
  --dry-run           Print the ffmpeg command and exit without rendering
  --help              This message
`;

function parseArgs(argv) {
  const opts = { out: 'reel.mp4', width: 1080, clips: '', reel: '', team: '', opponent: '', date: '', color: '', font: '', dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => argv[++i];
    switch (arg) {
      case '--out': opts.out = take(); break;
      case '--clips': opts.clips = take(); break;
      case '--reel': opts.reel = take(); break;
      case '--team': opts.team = take(); break;
      case '--opponent': opts.opponent = take(); break;
      case '--date': opts.date = take(); break;
      case '--color': opts.color = take(); break;
      case '--font': opts.font = take(); break;
      case '--width': opts.width = Number(take()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h': console.log(USAGE); process.exit(0); break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option ${arg}\n${USAGE}`);
          process.exit(2);
        }
        positional.push(arg);
    }
  }
  opts.source = positional[0] || '';
  return opts;
}

/// "12.5-16.5,105-110" -> clip objects. Negative numbers are not supported: a
/// start time below zero is not a meaningful clip.
function clipsFromRanges(ranges) {
  return String(ranges || '')
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const match = chunk.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
      if (!match) throw new Error(`Clip ${index + 1} should look like "12.5-16.5" but was "${chunk}".`);
      return {
        startSeconds: Number(match[1]),
        endSeconds: Number(match[2]),
        playerName: '',
        action: '',
      };
    });
}

function clipsFromFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw.clips)) throw new Error(`${file} has no "clips" array.`);
  return raw;
}

/// First font that exists, so the caller rarely has to pass --font.
function resolveFont(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`Font not found: ${explicit}`);
    return explicit;
  }
  const candidates = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',      // macOS
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',   // Debian/Linux
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ];
  const found = candidates.find((f) => fs.existsSync(f));
  if (!found) throw new Error('No usable font found. Pass --font /path/to/Font-Bold.ttf');
  return found;
}


function requireFfmpeg() {
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (probe.error) {
    console.error('ffmpeg is not installed or not on PATH.\n  macOS:  brew install ffmpeg\n  Debian: sudo apt install ffmpeg');
    process.exit(3);
  }
  return String(probe.stdout || '').split('\n')[0];
}

/// Renders the plan. Errors carry ffmpeg's own tail, because "command failed" is
/// useless when the reason sits on line 40 of a filtergraph dump.
function run(plan) {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const tail = [];
    child.stderr.on('data', (chunk) => {
      tail.push(chunk.toString());
      if (tail.length > 40) tail.shift();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}\n${tail.join('').slice(-2000)}`));
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.source) {
    console.error(USAGE);
    process.exit(2);
  }
  if (!fs.existsSync(opts.source)) {
    console.error(`Source video not found: ${opts.source}`);
    process.exit(2);
  }

  const fromFile = opts.reel ? clipsFromFile(opts.reel) : null;
  let clips;
  try {
    clips = fromFile ? fromFile.clips : clipsFromRanges(opts.clips);
  } catch (err) {
    // A malformed range is a usage error, not a render failure.
    console.error(`Cannot render: ${err.message}`);
    process.exit(2);
  }
  if (!clips.length) {
    console.error('No clips given. Use --clips "10-14,60-64" or --reel reel.json');
    process.exit(2);
  }

  const fontFile = resolveFont(opts.font);
  let plan;
  try {
    plan = planRender({
      sourcePath: path.resolve(opts.source),
      outputPath: path.resolve(opts.out),
      clips,
      width: opts.width,
      teamColor: opts.color || (fromFile && fromFile.color) || '#0A84FF',
      fontFile,
      meta: {
        teamName: opts.team || (fromFile && fromFile.team) || '',
        opponent: opts.opponent || (fromFile && fromFile.opponent) || '',
        dateText: opts.date || (fromFile && fromFile.date) || '',
      },
    });
  } catch (err) {
    // Planning errors are the caller's to fix: bad range, too many clips, no font.
    console.error(`Cannot render: ${err.message}`);
    process.exit(2);
  }

  if (opts.dryRun) {
    console.log(plan.args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' \\\n  '));
    return;
  }

  const version = requireFfmpeg();
  console.log(`Reel: ${clips.length} clip(s), ${plan.durationSeconds.toFixed(1)}s output`);
  console.log(`Font: ${fontFile}`);
  console.log(`Using ${version}`);

  const started = Date.now();
  await run(plan);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const size = fs.statSync(path.resolve(opts.out)).size;
  console.log(`\nWrote ${opts.out} — ${(size / 1024 / 1024).toFixed(1)} MB in ${seconds}s`);
  console.log('Watch it once before we containerise: banner size, text placement and text length are the things only your eyes can settle.');
}

main().catch((err) => {
  console.error(`Render failed: ${err.message}`);
  process.exit(1);
});
