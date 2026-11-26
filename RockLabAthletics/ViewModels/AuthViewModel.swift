import Foundation
import Observation
import FirebaseAuth

/// Manages authentication state and the current user's profile/role.
@Observable
final class AuthViewModel {
    var user: AppUser?
    var school: School?
    var isSignedIn = false
    var isLoading = true
    var errorMessage: String?

    /// Whether the signed-in Firebase account's email address is verified.
    var emailVerified = false

    private var handle: AuthStateDidChangeListenerHandle?
    private var didStart = false

    init() {
        // Listener starts via start() after FirebaseApp.configure() has run.
    }

    /// The signed-in account's email (Firebase is the source of truth).
    var email: String {
        AuthService.shared.currentEmail ?? user?.email ?? ""
    }

    /// Internal dev/test accounts bypass the verification gate.
    var isDevAccount: Bool {
        AuthService.isDevEmail(AuthService.shared.currentEmail ?? user?.email)
    }

    /// When true the app must show the "Verify your email" screen instead of
    /// the main experience. Dev accounts are always treated as verified.
    var needsEmailVerification: Bool {
        guard isSignedIn else { return false }
        return !emailVerified && !isDevAccount
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, firebaseUser in
            Task { @MainActor in
                await self?.handleAuthChange(user: firebaseUser)
            }
        }
    }

    deinit {
        if let handle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }

    /// Main-actor isolated: this mutates observable state and calls the main-actor
    /// isolated `AppDelegate`. A nonisolated async function awaited from the
    /// listener's `@MainActor` task would still hop off the main actor.
    @MainActor
    private func handleAuthChange(user: FirebaseAuth.User?) async {
        if let user {
            do {
                emailVerified = user.isEmailVerified
                if let existing = try await FirestoreService.shared.fetchUser(id: user.uid) {
                    self.user = existing
                } else {
                    // Minimal placeholder (merge, no role) so a concurrent sign-up's
                    // explicit role/name isn't clobbered by this auth-listener fallback.
                    try await FirestoreService.shared.ensureUser(
                        id: user.uid,
                        email: user.email ?? "",
                        name: user.displayName ?? ""
                    )
                    self.user = try await FirestoreService.shared.fetchUser(id: user.uid)
                }
                self.isSignedIn = true
                AppDelegate.storeCurrentFCMToken()
                AnalyticsService.setUser(userId: user.uid,
                                         role: self.user?.role.rawValue,
                                         schoolId: self.user?.schoolId)
                AnalyticsService.breadcrumb("signed in as \(self.user?.role.rawValue ?? "unknown")")
                await self.loadSchool()
            } catch {
                self.errorMessage = error.localizedDescription
                self.isSignedIn = false
            }
        } else {
            self.user = nil
            self.isSignedIn = false
            self.emailVerified = false
            AnalyticsService.clearUser()
        }
        self.isLoading = false
    }

    func signUp(email: String, password: String, name: String, role: UserRole = .follower, inviteCode: String? = nil, zipCode: String = "", phone: String = "") async {
        do {
            let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
            let uid = try await AuthService.shared.signUp(email: trimmedEmail, password: password)
            if let current = Auth.auth().currentUser {
                let change = current.createProfileChangeRequest()
                change.displayName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                try? await change.commitChanges()
            }
            try await FirestoreService.shared.createUser(id: uid, email: trimmedEmail, name: name, role: role, zipCode: zipCode, phone: phone.trimmingCharacters(in: .whitespacesAndNewlines))
            await refreshUser()
            AnalyticsService.log(AnalyticsService.Event.signUp, [
                "method": "email",
                "role": role.rawValue,
            ])
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signIn(email: String, password: String) async {
        do {
            _ = try await AuthService.shared.signIn(email: email, password: password)
            AnalyticsService.log(AnalyticsService.Event.login, ["method": "email"])
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        do {
            try AuthService.shared.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Email verification

    /// Re-sends the verification email. Returns true on success.
    func resendVerificationEmail() async -> Bool {
        do {
            try await AuthService.shared.resendVerificationEmail()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Reloads the Firebase user to pick up a verification that happened in
    /// another app (Mail, browser). Returns true once verified.
    @discardableResult
    func checkEmailVerification() async -> Bool {
        do {
            let verified = try await AuthService.shared.reloadCurrentUser()
            emailVerified = verified
            if verified {
                errorMessage = nil
                AnalyticsService.log(AnalyticsService.Event.emailVerified)
                await refreshUser()
            }
            return verified
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: - Password reset

    /// Sends a password-reset email. Returns true when the request was accepted.
    /// For privacy we report success even if the address has no account.
    func sendPasswordReset(email rawEmail: String) async -> Bool {
        let address = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else { return false }
        do {
            try await AuthService.shared.sendPasswordReset(email: address)
            AnalyticsService.log(AnalyticsService.Event.passwordResetRequested)
            return true
        } catch {
            let code = (error as NSError).code
            // Don't reveal whether an account exists.
            if code == AuthErrorCode.userNotFound.rawValue {
                return true
            }
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Re-fetches the current user's profile (e.g. after onboarding sets a role/school).
    func refreshUser() async {
        guard let uid = AuthService.shared.currentUserId else { return }
        if let updated = try? await FirestoreService.shared.fetchUser(id: uid) {
            user = updated
        }
        await loadSchool()
    }

    func loadSchool() async {
        guard let schoolId = user?.schoolId else {
            school = nil
            return
        }
        school = try? await FirestoreService.shared.fetchSchool(id: schoolId)
    }

    /// Removes the user's school association so they must re-follow a school.
    func leaveSchool() async {
        guard let uid = AuthService.shared.currentUserId else { return }
        do {
            try await FirestoreService.shared.leaveSchool(userId: uid)
            user?.schoolId = nil
            school = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Removes the user from a team (leave team).
    func leaveTeam(teamId: String) async {
        guard let uid = AuthService.shared.currentUserId else { return }
        do {
            try await FirestoreService.shared.removeMember(teamId: teamId, userId: uid)
            user?.teamIds.removeAll { $0 == teamId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clearError() {
        errorMessage = nil
    }
}
