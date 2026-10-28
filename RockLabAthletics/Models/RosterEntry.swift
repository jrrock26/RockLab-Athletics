import Foundation

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

    init(
        id: String,
        teamId: String,
        playerName: String,
        jerseyNumber: String,
        position: String,
        userId: String? = nil,
        parentEmail: String = "",
        parentName: String = ""
    ) {
        self.id = id
        self.teamId = teamId
        self.playerName = playerName
        self.jerseyNumber = jerseyNumber
        self.position = position
        self.userId = userId
        self.parentEmail = parentEmail
        self.parentName = parentName
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
    }
}

