import Foundation
import Observation

/// Drives the "manage people" (role change / removal) screen.
@Observable
final class PeopleViewModel {
    var users: [AppUser] = []
    var errorMessage: String?

    func load(schoolId: String) async {
        do {
            users = try await FirestoreService.shared.fetchSchoolUsers(schoolId: schoolId)
                .sorted { $0.displayName < $1.displayName }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setRole(targetUid: String, newRole: UserRole) async {
        do {
            try await FunctionsService.shared.manageUserRole(targetUid: targetUid, action: "setRole", newRole: newRole.rawValue)
            if let index = users.firstIndex(where: { $0.id == targetUid }) {
                users[index].role = newRole
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeUser(targetUid: String) async {
        do {
            try await FunctionsService.shared.manageUserRole(targetUid: targetUid, action: "remove")
            users.removeAll { $0.id == targetUid }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
