import Foundation

enum EventType: String, Codable, CaseIterable, Identifiable {
    case practice, game, meeting, meal, travel

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .practice: return "Practice"
        case .game: return "Game"
        case .meeting: return "Meeting"
        case .meal: return "Team Meal"
        case .travel: return "Travel"
        }
    }

    var systemImage: String {
        switch self {
        case .practice: return "figure.run"
        case .game: return "sportscourt"
        case .meeting: return "person.2"
        case .meal: return "fork.knife"
        case .travel: return "bus"
        }
    }
}

/// A scheduled event for a team (practice, game, meal, travel, etc.).
struct Event: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var type: EventType
    var date: Date
    var location: String
    var notes: String

    init(id: String, teamId: String, title: String, type: EventType, date: Date, location: String, notes: String) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.type = type
        self.date = date
        self.location = location
        self.notes = notes
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let title = data["title"] as? String,
              let typeRaw = data["type"] as? String,
              let type = EventType(rawValue: typeRaw),
              let dateRaw = data["date"] as? Double else { return nil }
        self.id = id
        self.teamId = teamId
        self.title = title
        self.type = type
        self.date = Date(timeIntervalSince1970: dateRaw)
        self.location = data["location"] as? String ?? ""
        self.notes = data["notes"] as? String ?? ""
    }
}

enum RSVPStatus: String, Codable, CaseIterable, Identifiable {
    case attending, notAttending, pending

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .attending: return "Attending"
        case .notAttending: return "Not attending"
        case .pending: return "No response"
        }
    }
}

enum AttendanceStatus: String, Codable, CaseIterable, Identifiable {
    case present, excused, unexcused, pending

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .present: return "Present"
        case .excused: return "Excused"
        case .unexcused: return "Unexcused"
        case .pending: return "—"
        }
    }
}

/// A guardian's "how is my athlete getting home" declaration for one event.
///
/// Choosing another parent from the team list IS the consent — there is no
/// separate authorised-adult registry. Carpooling between parents on the same
/// team is normal, so the picker is the whole authorisation.
struct ReleasePlan: Identifiable, Equatable {
    /// The roster entry id.
    var id: String
    var athleteName: String
    /// bus | me | other_parent | not_attending
    var homeWith: String
    var pickupUserId: String
    var pickupName: String
    var declaredByName: String
    var declaredAtMs: Double
    /// Set when an AD or coach changed a guardian's plan instead of the guardian.
    var isOverridden: Bool
    var overriddenByName: String
    var overrideReason: String

    var isDeclared: Bool { !homeWith.isEmpty }

    /// "Declared 12 min ago" — so a coach can tell a plan set last Tuesday from
    /// one changed as the bus was loading.
    var declaredAgo: String {
        guard declaredAtMs > 0 else { return "" }
        let date = Date(timeIntervalSince1970: declaredAtMs / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    var declaredByLabel: String {
        if isOverridden {
            let who = overriddenByName.isEmpty ? "Staff" : overriddenByName
            return "Overridden by \(who) \(declaredAgo)"
        }
        let who = declaredByName.isEmpty ? "guardian" : declaredByName
        return "Set by \(who) \(declaredAgo)"
    }

    var summary: String {
        switch homeWith {
        case "bus": return "Riding the bus home"
        case "me": return "Picked up by \(declaredByName.isEmpty ? "guardian" : declaredByName)"
        case "other_parent":
            return "Riding home with \(pickupName.isEmpty ? "another parent" : pickupName)"
        case "not_attending": return "Not attending"
        default: return "No plan yet"
        }
    }

    init(id: String,
         athleteName: String,
         homeWith: String,
         pickupUserId: String = "",
         pickupName: String = "",
         declaredByName: String = "",
         declaredAtMs: Double = 0,
         isOverridden: Bool = false,
         overriddenByName: String = "",
         overrideReason: String = "") {
        self.id = id
        self.athleteName = athleteName
        self.homeWith = homeWith
        self.pickupUserId = pickupUserId
        self.pickupName = pickupName
        self.declaredByName = declaredByName
        self.declaredAtMs = declaredAtMs
        self.isOverridden = isOverridden
        self.overriddenByName = overriddenByName
        self.overrideReason = overrideReason
    }

    init?(id: String, data: [String: Any]) {
        let home = data["homeWith"] as? String ?? ""
        guard !home.isEmpty else { return nil }
        self.id = id
        self.athleteName = data["athleteName"] as? String ?? ""
        self.homeWith = home
        self.pickupUserId = data["pickupUserId"] as? String ?? ""
        self.pickupName = data["pickupName"] as? String ?? ""
        self.declaredByName = data["declaredByName"] as? String ?? ""
        self.declaredAtMs = data["declaredAtMs"] as? Double ?? 0
        self.isOverridden = data["overridden"] as? Bool ?? false
        self.overriddenByName = data["overriddenByName"] as? String ?? ""
        self.overrideReason = data["overrideReason"] as? String ?? ""
    }
}

/// The coach's handoff record: who released the athlete, to whom, and when.
/// Kept separately from the plan because a plan is intent and this is the event.
struct ReleaseRecord: Identifiable {
    var id: String          // rosterEntryId
    var athleteName: String
    /// released | reopened
    var status: String
    var releasedToType: String
    var releasedToName: String
    var note: String
    var confirmedByName: String
    var confirmedAtMs: Double
    var correctionReason: String

    var isReleased: Bool { status == "released" }

    var confirmedAgo: String {
        guard confirmedAtMs > 0 else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(
            for: Date(timeIntervalSince1970: confirmedAtMs / 1000), relativeTo: Date())
    }

    var summary: String {
        let target = releasedToName.isEmpty ? releasedToType : releasedToName
        return "Released to \(target) · \(confirmedByLabel) \(confirmedAgo)"
    }

    var confirmedByLabel: String {
        confirmedByName.isEmpty ? "staff" : confirmedByName
    }

    init?(id: String, data: [String: Any]) {
        guard let status = data["status"] as? String else { return nil }
        self.id = id
        self.athleteName = data["athleteName"] as? String ?? ""
        self.status = status
        self.releasedToType = data["releasedToType"] as? String ?? ""
        self.releasedToName = data["releasedToName"] as? String ?? ""
        self.note = data["note"] as? String ?? ""
        self.confirmedByName = data["confirmedByName"] as? String ?? ""
        self.confirmedAtMs = data["confirmedAtMs"] as? Double ?? 0
        self.correctionReason = data["correctionReason"] as? String ?? ""
    }
}

