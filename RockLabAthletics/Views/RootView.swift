import SwiftUI

/// Top-level router: decides between auth, onboarding, and the main app.
struct RootView: View {
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        Group {
            if auth.isLoading {
                ProgressView("Loading…")
            } else if !auth.isSignedIn {
                AuthFlowView()
            } else if let user = auth.user, user.schoolId == nil {
                OnboardingFlowView()
            } else {
                ContentView()
            }
        }
        .animation(.default, value: auth.isSignedIn)
        .onAppear { auth.start() }
    }
}
