import SwiftUI

/// Top-level router: decides between auth, onboarding, and the main app.
import SwiftUI

struct RootView: View {
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        Group {
            if auth.isLoading {
                ProgressView("Loading…")
            } else if !auth.isSignedIn {
                AuthFlowView()
            } else if auth.needsEmailVerification {
                VerifyEmailView()
            } else if let user = auth.user, user.schoolId == nil, user.teamIds.isEmpty {
                // A coach who already started a team goes straight into the app;
                // they don't need a school organization to exist.
                if user.role == .ad {
                    OnboardingFlowView()
                } else {
                    DiscoverSchoolsView()
                }
            } else {
                ContentView()
            }
        }
        .animation(.default, value: auth.isSignedIn)
        .animation(.default, value: auth.needsEmailVerification)
        .onAppear { auth.start() }
        .task(id: auth.isSignedIn) {
            // Ask for notification permission only once the user is actually signed
            // in. Asking at launch (before login) suppresses opt-in and is against
            // Apple's HIG guidance for permission prompts.
            if auth.isSignedIn {
                AppDelegate.requestNotificationPermission()
            }
        }
    }
}
