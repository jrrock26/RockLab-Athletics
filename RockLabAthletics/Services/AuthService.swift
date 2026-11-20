import Foundation
import FirebaseAuth

/// Thin wrapper around Firebase Authentication.
struct AuthService {
    static let shared = AuthService()

    /// Internal test/staff accounts on these domains are exempt from the
    /// email-verification gate so dev logins keep working.
    static let devEmailDomains: Set<String> = ["rocklabathletics.com"]

    private init() {}

    var currentUserId: String? {
        Auth.auth().currentUser?.uid
    }

    var currentEmail: String? {
        Auth.auth().currentUser?.email
    }

    /// Whether the signed-in Firebase user's email is verified.
    var isEmailVerified: Bool {
        Auth.auth().currentUser?.isEmailVerified ?? false
    }

    func signUp(email: String, password: String) async throws -> String {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        // Send the verification link immediately; failure here shouldn't block
        // account creation — the user can resend from the verify screen.
        try? await result.user.sendEmailVerification()
        return result.user.uid
    }

    func signIn(email: String, password: String) async throws -> String {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return result.user.uid
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    /// Sends a password-reset email.
    func sendPasswordReset(email: String) async throws {
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }

    /// Re-sends the verification email to the signed-in user.
    func resendVerificationEmail() async throws {
        guard let user = Auth.auth().currentUser else {
            throw NSError(domain: "AuthService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "You are not signed in."])
        }
        try await user.sendEmailVerification()
    }

    /// Reloads the Firebase user so `isEmailVerified` reflects the latest state.
    @discardableResult
    func reloadCurrentUser() async throws -> Bool {
        guard let user = Auth.auth().currentUser else { return false }
        try await user.reload()
        return Auth.auth().currentUser?.isEmailVerified ?? false
    }

    /// True for internal test accounts (by email domain).
    static func isDevEmail(_ email: String?) -> Bool {
        guard let email,
              let domain = email.lowercased().split(separator: "@").last else { return false }
        return devEmailDomains.contains(String(domain))
    }
}

