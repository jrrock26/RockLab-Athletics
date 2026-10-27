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

    init(id: String, teamId: String, opponent: String, isHome: Bool, date: Date, status: GameStatus, teamScore: Int, opponentScore: Int) {
        self.id = id
        self.teamId = teamId
        self.opponent = opponent
        self.isHome = isHome
        self.date = date
        self.status = status
        self.teamScore = teamScore
        self.opponentScore = opponentScore
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
    }
}

/// Stat categories for basketball (the first sport with live scoring).
enum BasketballStat: String, Codable, CaseIterable, Identifiable {
    case points, rebounds, assists, steals, blocks

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .points: return "Points"
        case .rebounds: return "Rebounds"
        case .assists: return "Assists"
        case .steals: return "Steals"
        case .blocks: return "Blocks"
        }
    }

    var shortName: String {
        switch self {
        case .points: return "Pts"
        case .rebounds: return "Reb"
        case .assists: return "Ast"
        case .steals: return "Stl"
        case .blocks: return "Blk"
        }
    }
}
