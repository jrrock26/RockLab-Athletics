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

    init(id: String, teamId: String, opponent: String, isHome: Bool, date: Date, status: GameStatus, teamScore: Int, opponentScore: Int, isDistrictGame: Bool = false, opponentTeamId: String? = nil, period: Int = 0, clockSeconds: Int = 0) {
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
    }
}
