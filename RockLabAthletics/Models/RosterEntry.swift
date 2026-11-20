import Foundation

/// A player's current injury / participation status.
enum InjuryStatus: String, Codable, CaseIterable, Identifiable {
    case healthy
    case injured
    case limited

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .healthy: return "Healthy"
        case .injured: return "Injured"
        case .limited: return "Limited"
        }
    }

    /// Cleared to participate without restriction.
    var isCleared: Bool { self == .healthy }
}

/// A single injury report filed against a rostered player.
struct InjuryReport: Identifiable {
    let id: String
    var status: InjuryStatus
    var bodyPart: String
    var details: String
    var severity: String
    var expectedReturn: String
    var reportedByName: String
    var reportedAt: Date?
    var cleared: Bool
    var clearedByName: String
    var clearedAt: Date?

    init?(id: String, data: [String: Any]) {
        self.id = id
        self.status = InjuryStatus(rawValue: data["status"] as? String ?? "") ?? .injured
        self.bodyPart = data["bodyPart"] as? String ?? ""
        self.details = data["description"] as? String ?? ""
        self.severity = data["severity"] as? String ?? ""
        self.expectedReturn = data["expectedReturn"] as? String ?? ""
        self.reportedByName = data["reportedByName"] as? String ?? ""
        self.reportedAt = (data["reportedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.cleared = data["cleared"] as? Bool ?? false
        self.clearedByName = data["clearedByName"] as? String ?? ""
        self.clearedAt = (data["clearedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
    }
}

/// A player's slot on a team roster.
struct RosterEntry: Identifiable, Codable {
    let id: String
    var teamId: String
    var playerName: String
    var jerseyNumber: String
    var position: String
    var userId: String?
    var parentEmail: String
    var parentName: String
    var parentPhone: String

    // Injury / availability
    var injuryStatus: InjuryStatus
    var injuryNote: String
    var injuryBodyPart: String
    var injuryUpdatedByName: String
    var injuryUpdatedAt: Date?
    var injuryClearedByName: String
    var injuryClearedAt: Date?

    init(
        id: String,
        teamId: String,
        playerName: String,
        jerseyNumber: String,
        position: String,
        userId: String? = nil,
        parentEmail: String = "",
        parentName: String = "",
        parentPhone: String = "",
        injuryStatus: InjuryStatus = .healthy,
        injuryNote: String = "",
        injuryBodyPart: String = "",
        injuryUpdatedByName: String = "",
        injuryUpdatedAt: Date? = nil,
        injuryClearedByName: String = "",
        injuryClearedAt: Date? = nil
    ) {
        self.id = id
        self.teamId = teamId
        self.playerName = playerName
        self.jerseyNumber = jerseyNumber
        self.position = position
        self.userId = userId
        self.parentEmail = parentEmail
        self.parentName = parentName
        self.parentPhone = parentPhone
        self.injuryStatus = injuryStatus
        self.injuryNote = injuryNote
        self.injuryBodyPart = injuryBodyPart
        self.injuryUpdatedByName = injuryUpdatedByName
        self.injuryUpdatedAt = injuryUpdatedAt
        self.injuryClearedByName = injuryClearedByName
        self.injuryClearedAt = injuryClearedAt
    }

    init?(id: String, data: [String: Any]) {
        guard let playerName = data["playerName"] as? String else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.playerName = playerName
        self.jerseyNumber = data["jerseyNumber"] as? String ?? ""
        self.position = data["position"] as? String ?? ""
        self.userId = data["userId"] as? String
        self.parentEmail = data["parentEmail"] as? String ?? ""
        self.parentName = data["parentName"] as? String ?? ""
        self.parentPhone = data["parentPhone"] as? String ?? ""
        self.injuryStatus = InjuryStatus(rawValue: data["injuryStatus"] as? String ?? "") ?? .healthy
        self.injuryNote = data["injuryNote"] as? String ?? ""
        self.injuryBodyPart = data["injuryBodyPart"] as? String ?? ""
        self.injuryUpdatedByName = data["injuryUpdatedByName"] as? String ?? ""
        self.injuryUpdatedAt = (data["injuryUpdatedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.injuryClearedByName = data["injuryClearedByName"] as? String ?? ""
        self.injuryClearedAt = (data["injuryClearedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
    }

    var isInjured: Bool { injuryStatus != .healthy }
}


