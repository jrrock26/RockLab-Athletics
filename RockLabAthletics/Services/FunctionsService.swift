import Foundation
import FirebaseFunctions

/// Wraps Firebase Callable Cloud Functions.
struct FunctionsService {
    static let shared = FunctionsService()
    private let functions = Functions.functions()
    private init() {}

    /// Calls the server-side `manageUserRole` function.
    func manageUserRole(targetUid: String, action: String, newRole: String? = nil) async throws {
        var data: [String: Any] = ["targetUid": targetUid, "action": action]
        if let newRole { data["newRole"] = newRole }
        _ = try await functions.httpsCallable("manageUserRole").call(data)
    }
}
