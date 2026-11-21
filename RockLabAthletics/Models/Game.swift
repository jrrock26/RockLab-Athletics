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
    /// True while the game clock is running. Written by the scorer so a spectator's
    /// device can work out the time remaining without polling.
    var clockRunning: Bool
    /// When the clock was last started. With `clockSeconds` this is enough for any
    /// other device to compute the live reading.
    var clockStartedAt: Date?
    /// Volleyball-style set results: [{ "us": 25, "them": 20 }, …]. A match is
    /// decided by sets won, so the running score alone cannot express it.
    var sets: [[String: Int]]
    /// unverified | verified — only verified stats reach career totals.
    var statsStatus: String

    init(id: String, teamId: String, opponent: String, isHome: Bool, date: Date, status: GameStatus, teamScore: Int, opponentScore: Int, isDistrictGame: Bool = false, opponentTeamId: String? = nil, period: Int = 0, clockSeconds: Int = 0, clockRunning: Bool = false, clockStartedAt: Date? = nil, sets: [[String: Int]] = [], statsStatus: String = "unverified") {
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
        self.clockRunning = clockRunning
        self.clockStartedAt = clockStartedAt
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
        self.clockRunning = data["clockRunning"] as? Bool ?? false
        self.clockStartedAt = (data["clockStartedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.sets = (data["sets"] as? [[String: Any]])?.compactMap { raw in
            guard let us = raw["us"] as? Int, let them = raw["them"] as? Int else { return nil }
            return ["us": us, "them": them]
        } ?? []
        self.statsStatus = data["statsStatus"] as? String ?? "unverified"
    }

    /// The clock reading right now, on any device.
    ///
    /// A spectator never receives every tick — that would be a write per second.
    /// Instead the scorer writes the remaining time plus the moment the clock
    /// started, and everyone else subtracts the elapsed wall-clock time.
    func liveClockSeconds(now: Date = Date()) -> Int {
        guard clockRunning, let started = clockStartedAt else { return clockSeconds }
        return max(0, clockSeconds - Int(now.timeIntervalSince(started)))
    }

    /// Sets won / lost, for set-based sports where the running total is meaningless.
    var setsWon: Int { sets.filter { ($0["us"] ?? 0) > ($0["them"] ?? 0) }.count }
    var setsLost: Int { sets.filter { ($0["them"] ?? 0) > ($0["us"] ?? 0) }.count }
}

/// One logged play: the play-by-play line that gives the audience something to
/// follow. Stored in `games/{gameId}/plays` so a single play can be deleted again
/// when a scorer mis-taps, without rewriting an array on the game document.
struct GamePlay: Identifiable, Codable, Hashable {
    let id: String
    /// Period index at the time of the play.
    var period: Int
    var clockSeconds: Int
    /// Which side the points went to: "us" or "them".
    var side: String
    var actionKey: String
    var actionName: String
    var points: Int
    var rosterEntryId: String
    var playerName: String
    /// Stat column this play credits, if any. Stored on the play so an undo can
    /// reverse exactly what the play wrote.
    var statKey: String?
    var createdAt: Date

    init(id: String = UUID().uuidString,
         period: Int,
         clockSeconds: Int,
         side: String,
         actionKey: String,
         actionName: String,
         points: Int,
         rosterEntryId: String = "",
         playerName: String = "",
         statKey: String? = nil,
         createdAt: Date = Date()) {
        self.id = id
        self.period = period
        self.clockSeconds = clockSeconds
        self.side = side
        self.actionKey = actionKey
        self.actionName = actionName
        self.points = points
        self.rosterEntryId = rosterEntryId
        self.playerName = playerName
        self.statKey = statKey
        self.createdAt = createdAt
    }

    /// Builds a play from a sport action without the caller negating points by
    /// hand — `awardsOpponent` is the single place that decides whose column
    /// moves, so an error can never be credited to the wrong team.
    init(action: ScoringAction, entry: RosterEntry?, period: Int, clockSeconds: Int) {
        self.init(
            period: period,
            clockSeconds: clockSeconds,
            side: action.awardsOpponent ? "them" : "us",
            actionKey: action.key,
            actionName: action.name,
            points: action.points,
            rosterEntryId: entry?.id ?? "",
            playerName: entry?.playerName ?? "",
            statKey: action.statKey)
    }

    init?(data: [String: Any], id: String) {
        guard let actionName = data["actionName"] as? String else { return nil }
        self.id = id
        self.period = data["period"] as? Int ?? 0
        self.clockSeconds = data["clockSeconds"] as? Int ?? 0
        self.side = data["side"] as? String ?? "us"
        self.actionKey = data["actionKey"] as? String ?? ""
        self.actionName = actionName
        self.points = data["points"] as? Int ?? 0
        self.rosterEntryId = data["rosterEntryId"] as? String ?? ""
        self.playerName = data["playerName"] as? String ?? ""
        self.statKey = data["statKey"] as? String
        self.createdAt = (data["createdAt"] as? Double).map { Date(timeIntervalSince1970: $0) } ?? Date()
    }

    var asDictionary: [String: Any] {
        var data: [String: Any] = [
            "period": period,
            "clockSeconds": clockSeconds,
            "side": side,
            "actionKey": actionKey,
            "actionName": actionName,
            "points": points,
            "rosterEntryId": rosterEntryId,
            "playerName": playerName,
            "createdAt": createdAt.timeIntervalSince1970,
        ]
        if let statKey { data["statKey"] = statKey }
        return data
    }

    var isOurs: Bool { side == "us" }

    /// "Q2 4:32" — the clock reading at the moment of the play.
    func stampLabel(_ clock: ClockConfig?) -> String {
        let periodLabel = clock?.label(forPeriod: period) ?? "P\(period + 1)"
        let mm = clockSeconds / 60
        let ss = clockSeconds % 60
        return String(format: "%@ %d:%02d", periodLabel, mm, ss)
    }

    /// "Ava Reyes — Three +3"
    var summary: String {
        let who = playerName.isEmpty ? "Team" : playerName
        return "\(who) — \(actionName) +\(points)"
    }
}

/// A single line in a tennis team match.
///
/// A team match is decided by lines, not by a running score: each singles or
/// doubles line won is worth one team point, and the sets won in that line credit
/// the players' season stats.
struct TennisLine: Identifiable, Codable, Hashable {
    var id: String
    /// "singles" or "doubles".
    var type: String
    /// Court number within the type, 1-based.
    var slot: Int
    var playerIds: [String]
    var playerNames: String
    /// "us" or "them".
    var winner: String
    var ourSets: Int
    var theirSets: Int

    init(id: String = UUID().uuidString,
         type: String,
         slot: Int,
         playerIds: [String] = [],
         playerNames: String = "",
         winner: String = "us",
         ourSets: Int = 2,
         theirSets: Int = 0) {
        self.id = id
        self.type = type
        self.slot = slot
        self.playerIds = playerIds
        self.playerNames = playerNames
        self.winner = winner
        self.ourSets = ourSets
        self.theirSets = theirSets
    }

    var typeLabel: String { type == "doubles" ? "Doubles" : "Singles" }

    /// The stat crediting a won line.
    var statKey: String { type == "doubles" ? "doubles_wins" : "singles_wins" }

    var scoreLabel: String { "\(ourSets)–\(theirSets)" }

    init?(data: [String: Any]) {
        guard let type = data["type"] as? String,
              let winner = data["winner"] as? String else { return nil }
        self.id = data["id"] as? String ?? UUID().uuidString
        self.type = type
        self.slot = data["slot"] as? Int ?? 1
        self.playerIds = data["playerIds"] as? [String] ?? []
        self.playerNames = data["playerNames"] as? String ?? ""
        self.winner = winner
        self.ourSets = data["ourSets"] as? Int ?? 0
        self.theirSets = data["theirSets"] as? Int ?? 0
    }

    var asDictionary: [String: Any] {
        [
            "id": id, "type": type, "slot": slot, "playerIds": playerIds,
            "playerNames": playerNames, "winner": winner,
            "ourSets": ourSets, "theirSets": theirSets,
        ]
    }
}

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

