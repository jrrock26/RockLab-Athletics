import Foundation
import Observation

/// Drives the "join a team with a code" flow.
@Observable
final class JoinViewModel {
    var code = ""
    var message = ""
    var isWorking = false

    func join(userId: String, email: String) async -> Bool {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !trimmed.isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            let role = try await FirestoreService.shared.joinWithCode(code: trimmed, userId: userId, email: email)
            message = "Joined as \(role.displayName)."
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }
}
