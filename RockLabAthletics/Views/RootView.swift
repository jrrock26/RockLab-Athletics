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

struct HomeHeaderView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamCount: Int
    let upcomingGameCount: Int
    let inviteCount: Int

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Welcome, \\(greeting)")
                    .font(.title3.bold())
                    .foregroundStyle(.primary)
                Text(roleSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .foregroundStyle(.secondary)
                    NotificationBadge(count: inviteCount)
                }
                .frame(width: 44, height: 44)
                .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                .padding(.top, 4)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("You have \(inviteCount) pending invitation(s)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var greeting: String {
        let name = auth.user?.displayName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? "Welcome" : "Hi, \\(name)"
    }

    private var roleSubtitle: String {
        return auth.user?.role.displayName ?? "Member"
    }
}

struct NotificationBadge: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text("\(count)")
                .font(.caption2.bold())
                .foregroundStyle(.white)
                .frame(width: 16, height: 16)
                .clipShape(Circle())
        }
    }
}
