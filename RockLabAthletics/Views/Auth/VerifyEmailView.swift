import SwiftUI

/// Blocks the app until the signed-in user verifies their email address.
/// Internal dev/test accounts (`@rocklabathletics.com`) skip this entirely.
struct VerifyEmailView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(\.scenePhase) private var scenePhase

    @State private var isChecking = false
    @State private var isResending = false
    @State private var resent = false
    @State private var cooldown = 0
    @State private var statusMessage: String?

    var body: some View {
        ZStack {
            Image("Background")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()
                .overlay(Color.white.opacity(0.45))

            VStack(spacing: 16) {
                Image(systemName: "envelope.badge.shield.half.filled")
                    .font(.system(size: 52, weight: .semibold))
                    .foregroundStyle(.tint)

                Text("Verify your email")
                    .font(.title2.bold())

                Text("We sent a verification link to")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Text(auth.email.isEmpty ? "your email address" : auth.email)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)

                Text("Open the link in that email to activate your account, then come back here. Check your spam folder if you don't see it.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if let statusMessage {
                    Text(statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if let error = auth.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Button {
                    Task { await check() }
                } label: {
                    if isChecking {
                        ProgressView().frame(maxWidth: .infinity).padding()
                    } else {
                        Text("I've verified — continue")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isChecking)

                Button {
                    Task { await resend() }
                } label: {
                    if isResending {
                        ProgressView()
                    } else {
                        Text(cooldown > 0 ? "Resend in \(cooldown)s" : "Resend verification email")
                    }
                }
                .font(.footnote)
                .disabled(isResending || cooldown > 0)

                Button("Use a different account") { auth.signOut() }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(24)
            .frame(maxWidth: 420)
        }
        .onChange(of: scenePhase) { _, phase in
            // Returning from the Mail app: silently re-check.
            if phase == .active { Task { await check(silent: true) } }
        }
    }

    private func check(silent: Bool = false) async {
        isChecking = !silent
        let verified = await auth.checkEmailVerification()
        if !verified && !silent {
            statusMessage = "Not verified yet. Tap the link in your email, then try again."
        }
        isChecking = false
    }

    private func resend() async {
        isResending = true
        defer { isResending = false }
        if await auth.resendVerificationEmail() {
            resent = true
            statusMessage = "Verification email sent. Check your inbox."
            cooldown = 60
            while cooldown > 0 {
                try? await Task.sleep(for: .seconds(1))
                cooldown -= 1
            }
        }
    }
}
