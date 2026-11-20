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
    /// Everyone who offered to score. The coach picks exactly one.
    var signups: [GameScorerSignup]

    struct GameScorerSignup: Identifiable, Hashable {
        var userId: String
        var name: String
        var id: String { userId }
    }
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
        self.signups = ((data["signups"] as? [[String: Any]]) ?? []).compactMap { raw in
            guard let userId = raw["userId"] as? String else { return nil }
            return GameScorerSignup(userId: userId, name: raw["name"] as? String ?? "")
        }
        self.filledBy = data["filledBy"] as? String ?? ""
        self.filledByName = data["filledByName"] as? String ?? ""
    }
}


/// A single bout in a wrestling dual meet.
///
/// A dual is scored by weight class, not by a running total: each bout awards
/// points to the winning team based on *how* it was won (decision 3, major 4,
/// technical fall 5, fall/forfeit/default/DQ 6). The team score is the sum.
struct WrestlingBout: Identifiable, Codable, Hashable {
    var id: String
    /// Weight class label, e.g. "138".
    var weight: String
    /// "us" or "them".
    var winner: String
    /// decision | major | tech_fall | fall | forfeit | default | dq
    var result: String
    var points: Int
    var rosterEntryId: String
    var wrestlerName: String

    init(id: String = UUID().uuidString,
         weight: String,
         winner: String,
         result: String,
         rosterEntryId: String = "",
         wrestlerName: String = "") {
        self.id = id
        self.weight = weight
        self.winner = winner
        self.result = result
        self.points = WrestlingBout.points(for: result)
        self.rosterEntryId = rosterEntryId
        self.wrestlerName = wrestlerName
    }

    static func points(for result: String) -> Int {
        switch result {
        case "major": return 4
        case "tech_fall": return 5
        case "fall", "forfeit", "default", "dq": return 6
        default: return 3    // decision
        }
    }

    /// The career stat this result credits, for a bout our wrestler won.
    var statKey: String? {
        switch result {
        case "fall": return "pins"
        case "tech_fall": return "tech_falls"
        case "major": return "major_decisions"
        case "decision": return "decisions"
        default: return nil   // forfeit / default / DQ are not wrestled wins
        }
    }

    var isCountedWin: Bool { statKey != nil }

    var resultLabel: String {
        switch result {
        case "major": return "Major dec"
        case "tech_fall": return "Tech fall"
        case "fall": return "Fall"
        case "forfeit": return "Forfeit"
        case "default": return "Default"
        case "dq": return "DQ"
        default: return "Decision"
        }
    }

    init?(data: [String: Any]) {
        guard let weight = data["weight"] as? String,
              let winner = data["winner"] as? String,
              let result = data["result"] as? String else { return nil }
        self.id = data["id"] as? String ?? UUID().uuidString
        self.weight = weight
        self.winner = winner
        self.result = result
        self.points = data["points"] as? Int ?? WrestlingBout.points(for: result)
        self.rosterEntryId = data["rosterEntryId"] as? String ?? ""
        self.wrestlerName = data["wrestlerName"] as? String ?? ""
    }

    var asDictionary: [String: Any] {
        [
            "id": id, "weight": weight, "winner": winner, "result": result,
            "points": points, "rosterEntryId": rosterEntryId, "wrestlerName": wrestlerName,
        ]
    }
}

