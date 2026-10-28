import SwiftUI

struct SignUpView: View {
    @Environment(AuthViewModel.self) private var auth
    let onSignIn: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var inviteCode = ""
    @State private var isWorking = false

    var body: some View {
        VStack(spacing: 12) {
            Text("Create your account")
                .font(.title2.bold())
            Text("Set up RockLab Athletics for your school")
                .font(.footnote)
                .foregroundStyle(.secondary)

            TextField("Full name", text: $name)
                .textContentType(.name)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            SecureField("Password (6+ characters)", text: $password)
                .textContentType(.newPassword)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            TextField("Invite code (optional)", text: $inviteCode)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            if let error = auth.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await signUp() }
            } label: {
                if isWorking {
                    ProgressView().frame(maxWidth: .infinity).padding()
                } else {
                    Text("Sign Up").fontWeight(.semibold).frame(maxWidth: .infinity).padding()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(name.isEmpty || email.isEmpty || password.count < 6 || isWorking)

            Button("Already have an account? Sign in", action: onSignIn)
                .font(.footnote)
        }
        .padding(24)
        .frame(maxWidth: 420)
    }

    private func signUp() async {
        isWorking = true
        await auth.signUp(email: email, password: password, name: name, inviteCode: inviteCode)
        isWorking = false
    }
}

