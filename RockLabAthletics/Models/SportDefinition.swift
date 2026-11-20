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
