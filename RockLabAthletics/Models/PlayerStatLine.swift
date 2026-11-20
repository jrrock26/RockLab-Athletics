import Foundation

/// A player's per-game average stat line for the matchup/leaders view.
struct PlayerStatLine: Identifiable {
    let id: String          // rosterEntryId
    let playerName: String
    let gamesPlayed: Int
    let averages: [String: Double]   // statKey -> per-game average

    func average(for key: String) -> Double { averages[key] ?? 0 }
}
