import Foundation

/// A single stat category tracked for a sport (e.g. "points", "tackles").
struct SportStat: Identifiable, Hashable, Codable {
    let key: String
    let name: String
    var id: String { key }
}

/// Everything a sport needs for roster positions + live scoring.
struct SportDefinition: Hashable {
    let sportId: String
    let positions: [String]
    let stats: [SportStat]
    let scoreButtons: [Int]
    let scoreUnit: String
}

/// A game-clock configuration for timed sports (football, basketball, etc.).
struct ClockConfig: Hashable {
    let periods: [String]
    let minutesPerPeriod: Int
    /// Length of an overtime period. Untimed sports never reach this.
    var overtimeMinutes: Int = 5

    /// Name of any period index, including ones past the configured list.
    ///
    /// Overtime is not pre-declared per sport because the number of OTs is not
    /// knowable — a game can go to a second or third. Anything beyond the
    /// regulation periods is labelled OT1, OT2, …
    func label(forPeriod index: Int) -> String {
        if index < periods.count { return periods[index] }
        return "OT\(index - periods.count + 1)"
    }

    func isOvertime(_ index: Int) -> Bool { index >= periods.count }

    func seconds(forPeriod index: Int) -> Int {
        (isOvertime(index) ? overtimeMinutes : minutesPerPeriod) * 60
    }
}

/// One way a play can put points on the board.
///
/// This is what makes live scoring meaningful to someone watching: "Ava Reyes —
/// Three (+3)" tells the story, "+3 to us" does not. Each action also names the
/// stat it credits, so logging a play updates the scoreboard and the box score
/// from one tap instead of two.
struct ScoringAction: Identifiable, Hashable {
    let key: String
    let name: String
    /// Points this play puts on the board.
    let points: Int
    /// Stat column to credit, if any.
    let statKey: String?
    /// Volleyball and tennis: an error gives the point to the OTHER side. The
    /// scorer still logs it against our player, which is the honest record.
    let awardsOpponent: Bool

    var id: String { key }

    init(key: String, name: String, points: Int, statKey: String? = nil, awardsOpponent: Bool = false) {
        self.key = key
        self.name = name
        self.points = points
        self.statKey = statKey
        self.awardsOpponent = awardsOpponent
    }

    /// "+3" / "+1 to them" — short label for a button.
    var shortLabel: String {
        awardsOpponent ? "+\(points) them" : "+\(points)"
    }
}

/// Golf-specific scoring rules.
enum GolfConfig {
    static let holeCount = 9
}

/// Per-sport rules: positions, stat categories, and how the team score moves.
enum SportDefinitions {
    static func definition(for sportId: String) -> SportDefinition {
        definitions[sportId] ?? SportDefinition(
            sportId: sportId,
            positions: [],
            stats: [SportStat(key: "points", name: "Points")],
            scoreButtons: [1],
            scoreUnit: "Pts")
    }

    /// Game-clock rules for timed sports; nil for untimed sports.
    static func clock(for sportId: String) -> ClockConfig? {
        switch sportId {
        case "football": return ClockConfig(periods: ["Q1", "Q2", "Q3", "Q4"], minutesPerPeriod: 12)
        case "basketball": return ClockConfig(periods: ["Q1", "Q2", "Q3", "Q4"], minutesPerPeriod: 8)
        case "soccer": return ClockConfig(periods: ["1st Half", "2nd Half"], minutesPerPeriod: 40)
        case "lacrosse": return ClockConfig(periods: ["Q1", "Q2", "Q3", "Q4"], minutesPerPeriod: 12)
        case "field_hockey": return ClockConfig(periods: ["Q1", "Q2", "Q3", "Q4"], minutesPerPeriod: 15)
        case "ice_hockey": return ClockConfig(periods: ["1st Period", "2nd Period", "3rd Period"], minutesPerPeriod: 17)
        case "water_polo": return ClockConfig(periods: ["Q1", "Q2", "Q3", "Q4"], minutesPerPeriod: 7)
        default: return nil
        }
    }

    /// The plays a scorer can log for this sport, and what each is worth.
    ///
    /// Kept separate from `stats` on purpose: stats describe what a player
    /// accumulated over a season, while these describe a moment in one game.
    /// "Kill" is a stat *and* a point; "Dig" is a stat and worth nothing.
    static func scoringActions(for sportId: String) -> [ScoringAction] {
        switch sportId {
        case "basketball":
            return [
                ScoringAction(key: "ft", name: "Free throw", points: 1, statKey: "points"),
                ScoringAction(key: "two", name: "Two", points: 2, statKey: "points"),
                ScoringAction(key: "three", name: "Three", points: 3, statKey: "points"),
            ]
        case "football":
            return [
                ScoringAction(key: "td", name: "Touchdown", points: 6, statKey: "touchdowns"),
                ScoringAction(key: "xp", name: "Extra point", points: 1),
                ScoringAction(key: "two_pt", name: "2-pt conversion", points: 2),
                ScoringAction(key: "fg", name: "Field goal", points: 3),
                ScoringAction(key: "safety", name: "Safety", points: 2),
            ]
        case "volleyball":
            return [
                ScoringAction(key: "kill", name: "Kill", points: 1, statKey: "kills"),
                ScoringAction(key: "ace", name: "Ace", points: 1, statKey: "aces"),
                ScoringAction(key: "block", name: "Block", points: 1, statKey: "blocks"),
                ScoringAction(key: "error", name: "Error", points: 1, statKey: "errors", awardsOpponent: true),
            ]
        case "soccer":
            return [
                ScoringAction(key: "goal", name: "Goal", points: 1, statKey: "goals"),
                ScoringAction(key: "own_goal", name: "Own goal", points: 1, awardsOpponent: true),
            ]
        case "lacrosse", "water_polo":
            return [ScoringAction(key: "goal", name: "Goal", points: 1, statKey: "goals")]
        case "field_hockey", "ice_hockey":
            return [ScoringAction(key: "goal", name: "Goal", points: 1, statKey: "goals")]
        case "baseball", "softball":
            return [ScoringAction(key: "run", name: "Run scored", points: 1, statKey: "runs")]
        default:
            return [ScoringAction(key: "point", name: "Point", points: 1)]
        }
    }

    /// How a sport's result is structured. `runningScore` is the generic
    /// incrementing score; the others need their own scoring screen because the
    /// result is not a number that only goes up.
    enum ScoreModel {
        case runningScore
        case sets        // volleyball: match decided by sets won
        case matches     // tennis: decided by individual matches
        case dualMeet    // wrestling: points by result type per weight class
        case meetPlaces  // swimming, track, gymnastics: placings/score sums
        case judged      // cheer, dance: no live score at all
        case holes       // golf
    }

    static func scoreModel(for sportId: String) -> ScoreModel {
        switch sportId {
        case "golf": return .holes
        case "volleyball": return .sets
        case "tennis": return .matches
        case "wrestling": return .dualMeet
        case "swimming", "gymnastics", "track_field", "cross_country": return .meetPlaces
        case "cheerleading", "dance": return .judged
        default: return .runningScore
        }
    }

    static let definitions: [String: SportDefinition] = [
        "football": SportDefinition(
            sportId: "football",
            positions: ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P", "LS"],
            stats: [
                SportStat(key: "touchdowns", name: "TDs"),
                SportStat(key: "rushing_yards", name: "Rush Yds"),
                SportStat(key: "passing_yards", name: "Pass Yds"),
                SportStat(key: "receiving_yards", name: "Rec Yds"),
                SportStat(key: "receptions", name: "Receptions"),
                SportStat(key: "tackles", name: "Tackles"),
                SportStat(key: "sacks", name: "Sacks"),
                SportStat(key: "interceptions", name: "INTs"),
                SportStat(key: "field_goals", name: "FGs")
            ],
            scoreButtons: [1, 2, 3, 6],
            scoreUnit: "Pts"),

        "basketball": SportDefinition(
            sportId: "basketball",
            positions: ["PG", "SG", "SF", "PF", "C"],
            stats: [
                SportStat(key: "points", name: "Points"),
                SportStat(key: "rebounds", name: "Rebounds"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "steals", name: "Steals"),
                SportStat(key: "blocks", name: "Blocks")
            ],
            scoreButtons: [1, 2, 3],
            scoreUnit: "Pts"),

        "baseball": SportDefinition(
            sportId: "baseball",
            positions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"],
            stats: [
                SportStat(key: "runs", name: "Runs"),
                SportStat(key: "hits", name: "Hits"),
                SportStat(key: "rbis", name: "RBI"),
                SportStat(key: "home_runs", name: "HR"),
                SportStat(key: "stolen_bases", name: "SB"),
                SportStat(key: "strikeouts", name: "K"),
                SportStat(key: "errors", name: "Errors")
            ],
            scoreButtons: [1],
            scoreUnit: "Runs"),

        "softball": SportDefinition(
            sportId: "softball",
            positions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DP"],
            stats: [
                SportStat(key: "runs", name: "Runs"),
                SportStat(key: "hits", name: "Hits"),
                SportStat(key: "rbis", name: "RBI"),
                SportStat(key: "home_runs", name: "HR"),
                SportStat(key: "stolen_bases", name: "SB"),
                SportStat(key: "strikeouts", name: "K"),
                SportStat(key: "errors", name: "Errors")
            ],
            scoreButtons: [1],
            scoreUnit: "Runs"),
        "volleyball": SportDefinition(
            sportId: "volleyball",
            positions: ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist"],
            stats: [
                SportStat(key: "kills", name: "Kills"),
                SportStat(key: "aces", name: "Aces"),
                SportStat(key: "blocks", name: "Blocks"),
                SportStat(key: "digs", name: "Digs"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "serve_receptions", name: "Serve Rec")
            ],
            scoreButtons: [1],
            scoreUnit: "Pts"),

        "soccer": SportDefinition(
            sportId: "soccer",
            positions: ["GK", "Defender", "Midfielder", "Forward"],
            stats: [
                SportStat(key: "goals", name: "Goals"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "saves", name: "Saves"),
                SportStat(key: "shots", name: "Shots"),
                SportStat(key: "shots_on_goal", name: "SOG"),
                SportStat(key: "yellow_cards", name: "Yellow Cards"),
                SportStat(key: "red_cards", name: "Red Cards")
            ],
            scoreButtons: [1],
            scoreUnit: "Goals"),

        "cross_country": SportDefinition(
            sportId: "cross_country",
            positions: [],
            stats: [
                SportStat(key: "place", name: "Place"),
                SportStat(key: "points", name: "Points")
            ],
            scoreButtons: [1, 2, 3, 4, 5, 6, 8, 10],
            scoreUnit: "Pts"),

        "track_field": SportDefinition(
            sportId: "track_field",
            positions: ["Sprinter", "Distance", "Hurdler", "Jumper", "Thrower", "Relay"],
            stats: [
                SportStat(key: "place", name: "Place"),
                SportStat(key: "points", name: "Points"),
                SportStat(key: "personal_best", name: "PR")
            ],
            scoreButtons: [1, 2, 3, 4, 5, 6, 8, 10],
            scoreUnit: "Pts"),

        "wrestling": SportDefinition(
            sportId: "wrestling",
            positions: ["106", "113", "120", "126", "132", "138", "144", "150", "157", "165", "175", "190", "215", "285"],
            stats: [
                SportStat(key: "wins", name: "Wins"),
                SportStat(key: "pins", name: "Pins"),
                SportStat(key: "tech_falls", name: "Tech Falls"),
                SportStat(key: "major_decisions", name: "Major Dec"),
                SportStat(key: "decisions", name: "Decisions"),
                SportStat(key: "takedowns", name: "Takedowns"),
                SportStat(key: "escapes", name: "Escapes"),
                SportStat(key: "reversals", name: "Reversals")
            ],
            scoreButtons: [1, 2, 3, 4, 5, 6],
            scoreUnit: "Pts"),

        "swimming": SportDefinition(
            sportId: "swimming",
            positions: ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM", "Relay"],
            stats: [
                SportStat(key: "place", name: "Place"),
                SportStat(key: "points", name: "Points"),
                SportStat(key: "best_time", name: "Best Time")
            ],
            scoreButtons: [1, 2, 3, 4, 5, 6, 8, 10],
            scoreUnit: "Pts"),
        "tennis": SportDefinition(
            sportId: "tennis",
            positions: ["Singles", "Doubles"],
            stats: [
                SportStat(key: "singles_wins", name: "Singles Wins"),
                SportStat(key: "doubles_wins", name: "Doubles Wins"),
                SportStat(key: "aces", name: "Aces"),
                SportStat(key: "sets_won", name: "Sets Won")
            ],
            scoreButtons: [1],
            scoreUnit: "Wins"),

        "golf": SportDefinition(
            sportId: "golf",
            positions: [],
            stats: [
                SportStat(key: "strokes", name: "Strokes"),
                SportStat(key: "putts", name: "Putts"),
                SportStat(key: "fairways", name: "Fairways")
            ],
            scoreButtons: [1],
            scoreUnit: "Strokes"),

        "lacrosse": SportDefinition(
            sportId: "lacrosse",
            positions: ["Attack", "Midfield", "Defense", "Goalie", "Face-off"],
            stats: [
                SportStat(key: "goals", name: "Goals"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "ground_balls", name: "Ground Balls"),
                SportStat(key: "saves", name: "Saves"),
                SportStat(key: "caused_turnovers", name: "Caused TO"),
                SportStat(key: "faceoff_wins", name: "Face-off Wins")
            ],
            scoreButtons: [1],
            scoreUnit: "Goals"),

        "field_hockey": SportDefinition(
            sportId: "field_hockey",
            positions: ["Forward", "Midfield", "Defender", "Goalkeeper"],
            stats: [
                SportStat(key: "goals", name: "Goals"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "saves", name: "Saves"),
                SportStat(key: "shots", name: "Shots")
            ],
            scoreButtons: [1],
            scoreUnit: "Goals"),

        "ice_hockey": SportDefinition(
            sportId: "ice_hockey",
            positions: ["Center", "Winger", "Defenseman", "Goalie"],
            stats: [
                SportStat(key: "goals", name: "Goals"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "saves", name: "Saves"),
                SportStat(key: "plus_minus", name: "+/-"),
                SportStat(key: "penalty_minutes", name: "PIM")
            ],
            scoreButtons: [1],
            scoreUnit: "Goals"),

        "gymnastics": SportDefinition(
            sportId: "gymnastics",
            positions: ["Vault", "Bars", "Beam", "Floor", "All-Around"],
            stats: [
                SportStat(key: "vault", name: "Vault"),
                SportStat(key: "bars", name: "Bars"),
                SportStat(key: "beam", name: "Beam"),
                SportStat(key: "floor", name: "Floor"),
                SportStat(key: "all_around", name: "All-Around")
            ],
            scoreButtons: [1],
            scoreUnit: "Pts"),
        "cheerleading": SportDefinition(
            sportId: "cheerleading",
            positions: ["Base", "Flyer", "Back Spot", "Front Spot", "Tumbler"],
            stats: [
                SportStat(key: "stunts", name: "Stunts"),
                SportStat(key: "tumbling", name: "Tumbling"),
                SportStat(key: "jumps", name: "Jumps"),
                SportStat(key: "routine", name: "Routine")
            ],
            scoreButtons: [1],
            scoreUnit: "Pts"),

        "dance": SportDefinition(
            sportId: "dance",
            positions: [],
            stats: [
                SportStat(key: "routine", name: "Routine"),
                SportStat(key: "technique", name: "Technique"),
                SportStat(key: "choreography", name: "Choreography")
            ],
            scoreButtons: [1],
            scoreUnit: "Pts"),

        "bowling": SportDefinition(
            sportId: "bowling",
            positions: [],
            stats: [
                SportStat(key: "pinfall", name: "Pinfall"),
                SportStat(key: "games", name: "Games"),
                SportStat(key: "strikes", name: "Strikes"),
                SportStat(key: "spares", name: "Spares"),
                SportStat(key: "average", name: "Average")
            ],
            scoreButtons: [1],
            scoreUnit: "Pins"),

        "water_polo": SportDefinition(
            sportId: "water_polo",
            positions: ["Goalkeeper", "Center", "Attacker", "Defender"],
            stats: [
                SportStat(key: "goals", name: "Goals"),
                SportStat(key: "assists", name: "Assists"),
                SportStat(key: "steals", name: "Steals"),
                SportStat(key: "saves", name: "Saves"),
                SportStat(key: "exclusions", name: "Exclusions")
            ],
            scoreButtons: [1],
            scoreUnit: "Goals")
    ]
}
