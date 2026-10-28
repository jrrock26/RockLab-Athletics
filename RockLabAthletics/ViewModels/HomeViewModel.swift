import Foundation
import Observation

/// Loads the real counts shown on the Home dashboard.
@Observable
final class HomeViewModel {
    var teamCount = 0
    var playerCount = 0
    var upcomingGameCount = 0
    var errorMessage: String?

    func load(schoolId: String) async {
        do {
            let teams = try await FirestoreService.shared.fetchTeams(schoolId: schoolId)
            teamCount = teams.count
            var players = 0
            var upcoming = 0
            for team in teams {
                players += (try await FirestoreService.shared.fetchRoster(teamId: team.id)).count
                let games = try await FirestoreService.shared.fetchGames(teamId: team.id)
                upcoming += games.filter { $0.date > Date() && $0.status != .final }.count
            }
            playerCount = players
            upcomingGameCount = upcoming
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
