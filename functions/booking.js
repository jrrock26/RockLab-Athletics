// Pure booking logic, kept out of index.js so it can be unit tested.
//
// The rules here are the ones that matter operationally:
//   • two bookings must never overlap on the same resource
//   • a booking must fall inside the resource's open hours, on one day
//   • a recurring series expands to concrete windows that are then checked
//     individually, so one conflict cannot silently vanish

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

/** Two half-open intervals [start, end) overlap when each starts before the other ends. */
function hasOverlap(aStartMs, aEndMs, bStartMs, bEndMs) {
  return aStartMs < bEndMs && aEndMs > bStartMs;
}

/** Minutes since local midnight for an absolute timestamp plus a UTC offset. */
function localMinutesOfDay(ms, utcOffsetMinutes) {
  const shifted = ms + utcOffsetMinutes * MS_PER_MINUTE;
  const within = ((shifted % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return Math.floor(within / MS_PER_MINUTE);
}

/** Local calendar day index, used to reject bookings that span midnight. */
function localDayIndex(ms, utcOffsetMinutes) {
  const shifted = ms + utcOffsetMinutes * MS_PER_MINUTE;
  return Math.floor(shifted / MS_PER_DAY);
}

/**
 * Checks a window against a resource's open hours.
 * Returns null when valid, or a human-readable reason when not.
 */
function openHoursViolation(startMs, endMs, utcOffsetMinutes, openMin, closeMin) {
  if (!(endMs > startMs)) return 'The end time must be after the start time.';
  if (localDayIndex(startMs, utcOffsetMinutes) !== localDayIndex(endMs, utcOffsetMinutes)) {
    return 'A booking must start and end on the same day.';
  }
  const startMin = localMinutesOfDay(startMs, utcOffsetMinutes);
  const endMin = localMinutesOfDay(endMs, utcOffsetMinutes);
  if (startMin < openMin || endMin > closeMin) {
    return `Outside open hours (${formatMinutes(openMin)}–${formatMinutes(closeMin)}).`;
  }
  return null;
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Expands a recurring series into concrete windows.
 *
 * The first window defines the time of day. `weekdays` uses JS numbering
 * (0 = Sunday … 6 = Saturday) and must include the first window's weekday.
 * `weeks` counts calendar weeks from the first window; week 0 is the first.
 */
function expandRecurring({ startMs, endMs, weekdays, weeks, utcOffsetMinutes }) {
  const durationMs = endMs - startMs;
  const lengthDays = Math.max(1, Math.min(52, Number(weeks) || 1));
  const days = Array.isArray(weekdays) && weekdays.length > 0
    ? Array.from(new Set(weekdays.map(Number).filter((d) => d >= 0 && d <= 6)))
    : [];

  if (days.length === 0) {
    return [{ startMs, endMs }];
  }

  const firstLocalDay = localDayIndex(startMs, utcOffsetMinutes);
  const firstWeekday = weekdayOf(firstLocalDay);
  // Day-0 of the series is the first window itself.
  const dayZero = firstLocalDay;

  const out = [];
  for (let week = 0; week < lengthDays; week++) {
    for (const weekday of days) {
      const offsetFromZero = (weekday - firstWeekday + 7) % 7;
      const localDay = dayZero + week * 7 + offsetFromZero;
      if (localDay < firstLocalDay) continue;
      const dayStartMs = (localDay * MS_PER_DAY) - utcOffsetMinutes * MS_PER_MINUTE;
      const candidateStart = dayStartMs + localMinutesOfDay(startMs, utcOffsetMinutes) * MS_PER_MINUTE;
      out.push({ startMs: candidateStart, endMs: candidateStart + durationMs });
    }
  }
  // Stable ordering, and drop duplicates (e.g. the first window appearing twice).
  const seen = new Set();
  return out
    .sort((a, b) => a.startMs - b.startMs)
    .filter((w) => {
      if (seen.has(w.startMs)) return false;
      seen.add(w.startMs);
      return true;
    });
}

/** Weekday for a local day index, where day 0 (1970-01-01) was a Thursday. */
function weekdayOf(localDayIndexValue) {
  return ((localDayIndexValue + 4) % 7 + 7) % 7;
}

/**
 * Splits candidate windows into bookable ones and conflicts against existing
 * bookings. Existing bookings that are cancelled are ignored.
 */
function partitionCandidates(candidates, existing) {
  const active = (existing || []).filter((b) => b && b.status !== 'cancelled');
  const available = [];
  const conflicts = [];
  for (const candidate of candidates) {
    const clash = active.find((b) =>
      hasOverlap(candidate.startMs, candidate.endMs, Number(b.startMs) || 0, Number(b.endMs) || 0));
    if (clash) {
      conflicts.push({
        startMs: candidate.startMs,
        endMs: candidate.endMs,
        withTeam: clash.teamName || '',
      });
    } else {
      available.push(candidate);
    }
  }
  return { available, conflicts };
}

module.exports = {
  MINUTES_PER_DAY,
  MS_PER_MINUTE,
  MS_PER_DAY,
  hasOverlap,
  localMinutesOfDay,
  localDayIndex,
  weekdayOf,
  openHoursViolation,
  expandRecurring,
  partitionCandidates,
  formatMinutes,
};
