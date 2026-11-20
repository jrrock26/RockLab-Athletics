import Foundation

enum GameStatus: String, Codable, CaseIterable {
    case upcoming, live, final
}

/// A competitive game for a team, with a live score.
struct Game: Identifiable, Codable {
    let id: String
    var teamId: String
    var opponent: String
    var isHome: Bool
    var date: Date
    var status: GameStatus
    var teamScore: Int
    var opponentScore: Int
    var isDistrictGame: Bool
    var opponentTeamId: String?
    var period: Int
    var clockSeconds: Int
    /// Volleyball-style set results: [{ "us": 25, "them": 20 }, …]. A match is
    /// decided by sets won, so the running score alone cannot express it.
    var sets: [[String: Int]]
    /// unverified | verified — only verified stats reach career totals.
    var statsStatus: String

    init(id: String, teamId: String, opponent: String, isHome: Bool, date: Date, status: GameStatus, teamScore: Int, opponentScore: Int, isDistrictGame: Bool = false, opponentTeamId: String? = nil, period: Int = 0, clockSeconds: Int = 0, sets: [[String: Int]] = [], statsStatus: String = "unverified") {
        self.id = id
        self.teamId = teamId
        self.opponent = opponent
        self.isHome = isHome
        self.date = date
        self.status = status
        self.teamScore = teamScore
        self.opponentScore = opponentScore
        self.isDistrictGame = isDistrictGame
        self.opponentTeamId = opponentTeamId
        self.period = period
        self.clockSeconds = clockSeconds
        self.sets = sets
        self.statsStatus = statsStatus
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let opponent = data["opponent"] as? String,
              let dateRaw = data["date"] as? Double else { return nil }
        self.id = id
        self.teamId = teamId
        self.opponent = opponent
        self.isHome = data["isHome"] as? Bool ?? true
        self.date = Date(timeIntervalSince1970: dateRaw)
        self.status = GameStatus(rawValue: data["status"] as? String ?? "") ?? .upcoming
        self.teamScore = data["teamScore"] as? Int ?? 0
        self.opponentScore = data["opponentScore"] as? Int ?? 0
        self.isDistrictGame = data["isDistrictGame"] as? Bool ?? false
        self.opponentTeamId = data["opponentTeamId"] as? String
        self.period = data["period"] as? Int ?? 0
        self.clockSeconds = data["clockSeconds"] as? Int ?? 0
        self.sets = (data["sets"] as? [[String: Any]])?.compactMap { raw in
            guard let us = raw["us"] as? Int, let them = raw["them"] as? Int else { return nil }
            return ["us": us, "them": them]
        } ?? []
        self.statsStatus = data["statsStatus"] as? String ?? "unverified"
    }
}

/// A coach's open call for a volunteer to run one game's scoring.
///
/// Claiming creates a per-game grant (games/{gameId}/scorers/{uid}) rather than
/// a staff role, so a parent who helps once does not keep scoring rights all
/// season.
struct GameStatisticianRequest: Identifiable {
    let id: String
    var teamId: String
    var gameId: String
    var opponent: String
    var isHome: Bool
    /// open | filled | cancelled
    var status: String
    /// simple | advanced — what the coach allowed the volunteer to do.
    var mode: String
    var filledBy: String
    var filledByName: String

    init?(id: String, data: [String: Any]) {
        guard let gameId = data["gameId"] as? String else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.gameId = gameId
        self.opponent = data["opponent"] as? String ?? ""
        self.isHome = data["isHome"] as? Bool ?? true
        self.status = data["status"] as? String ?? "open"
        self.mode = data["mode"] as? String ?? "simple"
        self.filledBy = data["filledBy"] as? String ?? ""
        self.filledByName = data["filledByName"] as? String ?? ""
    }
}

