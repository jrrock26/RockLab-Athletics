import SwiftUI

struct SignInView: View {
    @Environment(AuthViewModel.self) private var auth
    let onSignUp: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false

    var body: some View {
        VStack(spacing: 12) {
            Text("Welcome back")
                .font(.title2.bold())
            Text("Sign in to RockLab Athletics")
                .font(.footnote)
                .foregroundStyle(.secondary)

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            SecureField("Password", text: $password)
                .textContentType(.password)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            if let error = auth.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await signIn() }
            } label: {
                if isWorking {
                    ProgressView().frame(maxWidth: .infinity).padding()
                } else {
                    Text("Sign In").fontWeight(.semibold).frame(maxWidth: .infinity).padding()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty || isWorking)

            Button("Don't have an account? Sign up", action: onSignUp)
                .font(.footnote)
        }
        .padding(24)
        .frame(maxWidth: 420)
    }

    private func signIn() async {
        isWorking = true
        await auth.signIn(email: email, password: password)
        isWorking = false
    }
}
