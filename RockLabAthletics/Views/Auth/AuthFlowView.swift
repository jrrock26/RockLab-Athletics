import SwiftUI

/// Branded container that hosts the sign-in / sign-up screens.
struct AuthFlowView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var showingSignUp = false

    var body: some View {
        ZStack {
            Image("Background")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()
                .overlay(Color.white.opacity(0.45))

            VStack(spacing: 20) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .shadow(color: .black.opacity(0.1), radius: 8, y: 3)

                if showingSignUp {
                    SignUpView(onSignIn: { showingSignUp = false })
                } else {
                    SignInView(onSignUp: { showingSignUp = true })
                }
            }
            .padding()
        }
    }
}
