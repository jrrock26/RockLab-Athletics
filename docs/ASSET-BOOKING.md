# Asset booking (facilities, fields, buses)

Organizations own physical assets. An AD registers them once; coaches book them
by time window. A booking makes the asset unavailable, the way a conference room
calendar does.

---

## 1. Model

```
resources/{resourceId}
  schoolId, name, type: facility | field | bus | other
  notes, active, createdBy, createdAt

resourceBookings/{bookingId}
  schoolId, resourceId, resourceName, resourceType
  teamId, teamName, title
  startMs, endMs, dateKey
  status: booked | cancelled
  bookedBy, bookedByName, createdAt
```

- Assets are **retired, not deleted** (`active: false`). Past bookings must keep
  pointing at a real asset or the calendar history becomes meaningless.
- Bookings are **cancelled, not deleted**, for the same reason: a slot that was
  held and released is different from one that was never used.

## 2. Why overlap is enforced server-side

`bookResource` runs the availability check and the write **inside a Firestore
transaction**. A client-side check would let two coaches load the same empty
calendar and both book the gym for 6pm — the exact failure the feature exists to
prevent. The UI can display availability, but it never has the final say: if the
transaction finds a clash it returns `already-exists` and the UI shows the error.

## 3. Permissions

| Action | Who |
| --- | --- |
| Add / retire a resource | AD only (`createResource`, `removeResource`) |
| Book a resource | AD, or the coach of that team (`bookResource`) |
| Cancel a booking | Whoever booked it, that team's coach, or the AD |
| Read resources & bookings | Any signed-in user (needed for availability) |

All four writes are Cloud Functions; `resources` and `resourceBookings` deny
client writes entirely. Cross-organization booking is rejected — the team and the
asset must belong to the same school.

## 4. The coach flow

The Schedule tab has a **Facilities & buses** button:

1. Pick a date.
2. Pick a resource — the screen shows what is already booked on it that day, or
   "Free all day".
3. Choose a start and end time, add a label ("Practice"), and book.
4. If the slot is taken, the screen lists **everything booked that day** across
   all resources, so the coach can find an alternative without leaving the form.

ADs get an "Add a resource" section at the top of the same screen.

## 5. Recurring bookings

A practice is usually the same window several days a week for weeks. The booking
form has **Repeat weekly**: pick weekday chips plus a number of weeks, and the
server expands the series into concrete windows and books each one.

- Expansion is pure, tested logic (`functions/booking.js`, `expandRecurring`).
- **Partial success is reported rather than swallowed.** If three windows clash,
  the rest are booked and the response lists the conflicts, so a coach gets a
  mostly-complete schedule plus an explicit note instead of an all-or-nothing
  failure.
- The first window is always the one the coach picked; weekdays are time-of-day
  copies of it.

## 6. Open hours

Each resource carries `openMin` / `closeMin` in local minutes past midnight
(default 06:00–22:00). The AD sets them when adding an asset.

- `bookResource` refuses anything outside those hours, and refuses a booking that
  crosses midnight.
- The booking form shows "Bookable 06:00–22:00" for the selected resource so the
  restriction is visible before someone tries.
- The client sends its UTC offset; the server uses it to turn absolute timestamps
  into local minutes. This is a usability guard, not a security boundary — the
  overlap transaction is the security boundary.

## 7. Bookings and schedule events

Booking can create the schedule entry at the same time.

- `bookResource` accepts `createEvent` (plus `eventTitle` / `eventType`) and writes
  the `events` document **inside the same transaction**, only if at least one
  window was actually booked.
- The event carries `location` = resource name, plus `resourceId` and
  `resourceBookingIds`, so the schedule and the calendar point at each other.
- Passing an existing `eventId` instead attaches the booking to that event rather
  than creating a second one.

## 8. Test coverage

`functions/booking.js` holds the pure rules and `functions/booking.test.js` covers
them with `node --test` (`npm test`):

- overlap semantics, including that touching intervals are free
- local day / minute conversion round-trip
- open hours: inside, too early, too late, crossing midnight, end before start
- recurrence: Mon–Thu × 2 weeks = 8 windows, correct weekday and time, sorted,
  first window equal to the chosen one; empty weekdays = single window
- partition: clashes reported with the blocking team, cancelled bookings ignored

## 9. Remaining gaps

- **No cancellation notification** — a coach whose slot is cancelled is not told
  the resource is free again.
- **Bookings cannot be edited in place**; you cancel and re-book.
- **No conflict preview before booking** across a whole series (the form shows the
  selected day, and the server reports what it refused).

