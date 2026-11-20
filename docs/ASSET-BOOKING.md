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

## 5. Known gaps

- **No recurring bookings.** Practice is often 4–6pm Mon–Thu; today that is four
  separate bookings. This is the next thing to add.
- **No open-hours model.** Any time can be booked, including 2am. A resource
  could carry available hours, and bookings outside them would be refused.
- **Bookings are not yet linked to events.** A booking records the team and a
  label; it does not create or attach to a schedule event. Linking them would let
  one action schedule the practice *and* reserve the gym.
- **No notification when a booking is cancelled**, so a coach whose slot is
  released is not told the gym is free.
