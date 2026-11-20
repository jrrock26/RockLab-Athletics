import Foundation

/// A volunteer work event (concessions, fundraiser, etc.) divided into
/// equal time slots, each needing N volunteers.
struct VolunteerShift: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var start: Date
    var end: Date
    var slotsPerShift: Int      // volunteers needed per time slot
    var incrementMinutes: Int   // length of each slot in minutes
    var playersCanVolunteer: Bool  // parents may sign up their linked players
    var note: String

    init(id: String, teamId: String, title: String, start: Date, end: Date,
         slotsPerShift: Int, incrementMinutes: Int, playersCanVolunteer: Bool = true, note: String) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.start = start
        self.end = end
        self.slotsPerShift = slotsPerShift
        self.incrementMinutes = incrementMinutes
        self.playersCanVolunteer = playersCanVolunteer
        self.note = note
    }

    init?(id: String, data: [String: Any]) {
        guard let title = data["title"] as? String,
              let start = data["start"] as? Double,
              let end = data["end"] as? Double else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.title = title
        self.start = Date(timeIntervalSince1970: start)
        self.end = Date(timeIntervalSince1970: end)
        // Support legacy docs that used `slotsNeeded`.
        self.slotsPerShift = (data["slotsPerShift"] as? Int) ?? (data["slotsNeeded"] as? Int) ?? 1
        self.incrementMinutes = (data["incrementMinutes"] as? Int) ?? 60
        self.playersCanVolunteer = data["playersCanVolunteer"] as? Bool ?? true
        self.note = data["note"] as? String ?? ""
    }

    var timeRangeText: String {
        "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))"
    }

    /// The generated time slots for this event.
    var slots: [ShiftSlot] {
        let totalMinutes = max(1, Int(end.timeIntervalSince(start) / 60))
        let inc = max(15, incrementMinutes)
        let count = max(1, Int(ceil(Double(totalMinutes) / Double(inc))))
        return (0..<count).map { i in
            let s = start.addingTimeInterval(Double(i * inc) * 60)
            let e = min(end, s.addingTimeInterval(Double(inc) * 60))
            return ShiftSlot(index: i, start: s, end: e, capacity: slotsPerShift)
        }
    }
}

/// A single time slot within a volunteer event.
struct ShiftSlot: Identifiable {
    let index: Int
    let start: Date
    let end: Date
    let capacity: Int

    var id: Int { index }

    var timeText: String {
        "\(start.formatted(date: .omitted, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))"
    }

    func filled(in signups: [ShiftSignup]) -> Int {
        signups.filter { $0.slotIndex == index }.count
    }
}

/// A volunteer's sign-up for one slot of a shift.
struct ShiftSignup: Identifiable, Codable {
    let id: String          // participant userId (one slot per person per shift)
    var shiftId: String
    var userId: String      // who is volunteering (self or linked player)
    var name: String
    var slotIndex: Int
    var signedUpBy: String  // account that registered (self, or a parent for their player)
    var createdAt: Date

    init(id: String, shiftId: String, userId: String, name: String, slotIndex: Int,
         signedUpBy: String? = nil, createdAt: Date) {
        self.id = id
        self.shiftId = shiftId
        self.userId = userId
        self.name = name
        self.slotIndex = slotIndex
        self.signedUpBy = signedUpBy ?? userId
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let userId = data["userId"] as? String else { return nil }
        self.id = id
        self.shiftId = data["shiftId"] as? String ?? ""
        self.userId = userId
        self.name = data["name"] as? String ?? ""
        self.slotIndex = data["slotIndex"] as? Int ?? 0
        self.signedUpBy = data["signedUpBy"] as? String ?? userId
        let created = (data["createdAt"] as? Double) ?? (data["createdAtSeconds"] as? Double) ?? 0
        self.createdAt = Date(timeIntervalSince1970: created)
    }
}
