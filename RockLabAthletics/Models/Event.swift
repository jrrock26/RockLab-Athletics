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

    var isDeclared: Bool { !homeWith.isEmpty }

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
         declaredAtMs: Double = 0) {
        self.id = id
        self.athleteName = athleteName
        self.homeWith = homeWith
        self.pickupUserId = pickupUserId
        self.pickupName = pickupName
        self.declaredByName = declaredByName
        self.declaredAtMs = declaredAtMs
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
    }
}

