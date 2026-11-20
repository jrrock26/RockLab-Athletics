import Foundation
import Observation
import FirebaseFirestore

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
    var newIsDistrictGame = false
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
                teamId: teamId, opponent: opponent, isHome: newIsHome, date: newGameDate,
                isDistrictGame: newIsDistrictGame)
            games.append(Game(id: id, teamId: teamId, opponent: opponent, isHome: newIsHome,
                              date: newGameDate, status: .upcoming, teamScore: 0, opponentScore: 0,
                              isDistrictGame: newIsDistrictGame))
            games.sort { $0.date < $1.date }
            newOpponent = ""
            newIsDistrictGame = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Live scoring

    private var gameListener: ListenerRegistration?

    func beginGame(_ game: Game, teamId: String) async {
        selectedGame = game
        do {
            // Followers can't read the roster, so tolerate that failure and
            // still load the game stats (which are public).
            roster = (try? await FirestoreService.shared.fetchRoster(teamId: teamId)) ?? []
            stats = try await FirestoreService.shared.fetchStats(gameId: game.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Starts a real-time listener so the score/status updates for all viewers.
    func watchGame(gameId: String) {
        stopWatchingGame()
        gameListener = FirestoreService.shared.listenToGame(gameId: gameId) { [weak self] game in
            guard let game else { return }
            Task { @MainActor in
                guard let self else { return }
                self.selectedGame = game
                if let i = self.games.firstIndex(where: { $0.id == game.id }) {
                    self.games[i] = game
                }
            }
        }
    }

    func stopWatchingGame() {
        gameListener?.remove()
        gameListener = nil
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

    func updateClock(gameId: String, period: Int, clockSeconds: Int) async {
        guard var game = selectedGame else { return }
        game.period = period
        game.clockSeconds = clockSeconds
        selectedGame = game
        if let index = games.firstIndex(where: { $0.id == gameId }) {
            games[index] = game
        }
        do {
            try await FirestoreService.shared.updateGameClock(gameId: gameId, period: period, clockSeconds: clockSeconds)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Sum of all entered player stroke totals (golf team score).
    var golfTeamTotal: Int {
        stats.values.reduce(0) { $0 + ($1["strokes"] ?? 0) }
    }

    func setGolfHoles(gameId: String, entry: RosterEntry, holes: [Int]) async {
        do {
            try await FirestoreService.shared.setGolfHoles(
                gameId: gameId, rosterEntryId: entry.id, playerName: entry.playerName, holes: holes)
            var current = stats[entry.id] ?? [:]
            var total = 0
            for (index, strokes) in holes.enumerated() {
                current["h\(index + 1)"] = strokes
                total += strokes
            }
            current["strokes"] = total
            stats[entry.id] = current
            if var game = selectedGame {
                game.teamScore = golfTeamTotal
                selectedGame = game
                if let gameIndex = games.firstIndex(where: { $0.id == gameId }) { games[gameIndex] = game }
                try? await FirestoreService.shared.updateGameScore(
                    gameId: gameId, teamScore: game.teamScore, opponentScore: game.opponentScore, status: game.status)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func incrementStat(gameId: String, rosterEntryId: String, playerName: String, statKey: String, delta: Int) async {
        do {
            try await FirestoreService.shared.incrementStat(
                gameId: gameId, rosterEntryId: rosterEntryId, playerName: playerName, stat: statKey, delta: delta)
            var current = stats[rosterEntryId] ?? [:]
            current[statKey] = max(0, (current[statKey] ?? 0) + delta)
            stats[rosterEntryId] = current
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
