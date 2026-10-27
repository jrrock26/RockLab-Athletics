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
