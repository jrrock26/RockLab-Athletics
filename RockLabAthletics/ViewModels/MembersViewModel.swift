import Foundation
import Observation

/// Drives the team member list (permissions + removal).
@Observable
final class MembersViewModel {
    var members: [TeamMembership] = []
    var errorMessage: String?

    func load(teamId: String) async {
        do {
            members = try await FirestoreService.shared.fetchMemberships(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
