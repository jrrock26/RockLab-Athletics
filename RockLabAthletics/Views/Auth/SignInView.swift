import SwiftUI

struct SignInView: View {
    @Environment(AuthViewModel.self) private var auth
    let onSignUp: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var showingForgotPassword = false
    @State private var formError = ""

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
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            SecureField("Password", text: $password)
                .textContentType(.password)
                .submitLabel(.go)
                .onSubmit { Task { await signIn() } }
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            if let error = errorText {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await signIn() }
            } label: {
                if isWorking {
                    ProgressView().tint(.white)
                } else {
                    Text("Sign In")
                }
            }
            .buttonStyle(PrimaryAuthButtonStyle())

            Button("Forgot password?") { showingForgotPassword = true }
                .font(.footnote)

            Button("Don't have an account? Sign up", action: onSignUp)
                .font(.footnote)
        }
        .frame(maxWidth: .infinity)
        .sheet(isPresented: $showingForgotPassword) {
            ForgotPasswordView(prefilledEmail: email)
        }
    }

    /// Local validation takes precedence over the view model's auth error, so a
    /// stale "wrong password" doesn't sit under an empty form.
    private var errorText: String? {
        if !formError.isEmpty { return formError }
        return auth.errorMessage
    }

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !isWorking
    }

    private func signIn() async {
        guard canSubmit else {
            formError = "Enter your email and password to sign in."
            return
        }
        formError = ""
        isWorking = true
        await auth.signIn(email: email, password: password)
        isWorking = false
    }
}
