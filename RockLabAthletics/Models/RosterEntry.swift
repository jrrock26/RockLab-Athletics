import Foundation

/// A player's slot on a team roster.
struct RosterEntry: Identifiable, Codable {
    let id: String
    var teamId: String
    var playerName: String
    var jerseyNumber: String
    var position: String
    var userId: String?

    init(
        id: String,
        teamId: String,
        playerName: String,
        jerseyNumber: String,
        position: String,
        userId: String? = nil
    ) {
        self.id = id
        self.teamId = teamId
        self.playerName = playerName
        self.jerseyNumber = jerseyNumber
        self.position = position
        self.userId = userId
    }

    init?(id: String, data: [String: Any]) {
        guard let playerName = data["playerName"] as? String else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.playerName = playerName
        self.jerseyNumber = data["jerseyNumber"] as? String ?? ""
        self.position = data["position"] as? String ?? ""
        self.userId = data["userId"] as? String
    }
}
