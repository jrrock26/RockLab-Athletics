import Foundation
import Observation
import FirebaseAuth

/// Manages authentication state and the current user's profile/role.
@Observable
final class AuthViewModel {
    var user: AppUser?
    var isSignedIn = false
    var isLoading = true
    var errorMessage: String?

    private var handle: AuthStateDidChangeListenerHandle?
    private var didStart = false

    init() {
        // Listener starts via start() after FirebaseApp.configure() has run.
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

    private func handleAuthChange(user: FirebaseAuth.User?) async {
        if let user {
            do {
                if let existing = try await FirestoreService.shared.fetchUser(id: user.uid) {
                    self.user = existing
                } else {
                    try await FirestoreService.shared.createUser(
                        id: user.uid,
                        email: user.email ?? "",
                        name: user.displayName ?? "",
                        role: .follower
                    )
                    self.user = try await FirestoreService.shared.fetchUser(id: user.uid)
                }
                self.isSignedIn = true
            } catch {
                self.errorMessage = error.localizedDescription
                self.isSignedIn = false
            }
        } else {
            self.user = nil
            self.isSignedIn = false
        }
        self.isLoading = false
    }

    func signUp(email: String, password: String, name: String) async {
        do {
            let uid = try await AuthService.shared.signUp(email: email, password: password)
            if let current = Auth.auth().currentUser {
                let change = current.createProfileChangeRequest()
                change.displayName = name
                try? await change.commitChanges()
            }
            try await FirestoreService.shared.createUser(id: uid, email: email, name: name, role: .follower)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signIn(email: String, password: String) async {
        do {
            _ = try await AuthService.shared.signIn(email: email, password: password)
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

    /// Re-fetches the current user's profile (e.g. after onboarding sets a role/school).
    func refreshUser() async {
        guard let uid = AuthService.shared.currentUserId else { return }
        if let updated = try? await FirestoreService.shared.fetchUser(id: uid) {
            user = updated
        }
    }

    func clearError() {
        errorMessage = nil
    }
}
