import Foundation
import Observation

/// Drives games, live scoring, and player stat tracking.
@Observable
final class StatsViewModel {
    var games: [Game] = []
    var selectedGame: Game?
    var roster: [RosterEntry] = []
    var stats: [String: [String: Int]] = [:]
    var errorMessage: String?

    // New game form
    var newOpponent = ""
    var newIsHome = true
    var newGameDate = Date()

    // MARK: Games

    func loadGames(teamId: String) async {
        do {
            games = try await FirestoreService.shared.fetchGames(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addGame(teamId: String) async {
        let opponent = newOpponent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !opponent.isEmpty else { return }
        do {
            let id = try await FirestoreService.shared.createGame(
                teamId: teamId, opponent: opponent, isHome: newIsHome, date: newGameDate)
            games.append(Game(id: id, teamId: teamId, opponent: opponent, isHome: newIsHome,
                              date: newGameDate, status: .upcoming, teamScore: 0, opponentScore: 0))
            games.sort { $0.date < $1.date }
            newOpponent = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Live scoring

    func beginGame(_ game: Game, teamId: String) async {
        selectedGame = game
        do {
            roster = try await FirestoreService.shared.fetchRoster(teamId: teamId)
            stats = try await FirestoreService.shared.fetchStats(gameId: game.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateScore(gameId: String, delta: Int, isOpponent: Bool) async {
        guard var game = selectedGame else { return }
        if isOpponent {
            game.opponentScore = max(0, game.opponentScore + delta)
        } else {
            game.teamScore = max(0, game.teamScore + delta)
        }
        selectedGame = game
        if let index = games.firstIndex(where: { $0.id == gameId }) {
            games[index] = game
        }
        do {
            try await FirestoreService.shared.updateGameScore(
                gameId: gameId, teamScore: game.teamScore, opponentScore: game.opponentScore, status: game.status)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setStatus(gameId: String, status: GameStatus) async {
        guard var game = selectedGame else { return }
        game.status = status
        selectedGame = game
        if let index = games.firstIndex(where: { $0.id == gameId }) {
            games[index] = game
        }
        do {
            try await FirestoreService.shared.setGameStatus(gameId: gameId, status: status)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func incrementStat(gameId: String, rosterEntryId: String, playerName: String, stat: BasketballStat, delta: Int) async {
        do {
            try await FirestoreService.shared.incrementStat(
                gameId: gameId, rosterEntryId: rosterEntryId, playerName: playerName, stat: stat, delta: delta)
            var current = stats[rosterEntryId] ?? [:]
            current[stat.rawValue] = max(0, (current[stat.rawValue] ?? 0) + delta)
            stats[rosterEntryId] = current
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
