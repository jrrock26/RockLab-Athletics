import SwiftUI

struct SignUpView: View {
    @Environment(AuthViewModel.self) private var auth
    let onSignIn: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var zipCode = ""
    @State private var phone = ""
    @State private var role: UserRole = .follower
    @State private var isWorking = false
    @State private var formError = ""

    var body: some View {
        VStack(spacing: 12) {
            Text("Create your account")
                .font(.title2.bold())
            Text("Follow your school first, then apply to teams.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            TextField("Full name", text: $name)
                .textContentType(.name)
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            SecureField("Password (6+ characters)", text: $password)
                .textContentType(.newPassword)
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            TextField("Zip code (optional)", text: $zipCode)
                .keyboardType(.numberPad)
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            TextField("Phone number (for emergency contact)", text: $phone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            HStack {
                Text("I am a").foregroundStyle(.secondary)
                Spacer()
                Picker("", selection: $role) {
                    ForEach(UserRole.allCases, id: \.self) { r in
                        Text(r.displayName).tag(r)
                    }
                }
                .pickerStyle(.menu)
                .tint(.primary)
            }
            .padding()
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            if let error = errorText {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await signUp() }
            } label: {
                if isWorking {
                    ProgressView().tint(.white)
                } else {
                    Text("Sign Up")
                }
            }
            .buttonStyle(PrimaryAuthButtonStyle())

            Button("Already have an account? Sign in", action: onSignIn)
                .font(.footnote)
        }
        .frame(maxWidth: .infinity)
    }

    private var errorText: String? {
        if !formError.isEmpty { return formError }
        return auth.errorMessage
    }

    private var canSubmit: Bool {
        !name.isEmpty && !email.isEmpty && password.count >= 6 && !isWorking
    }

    private func signUp() async {
        guard canSubmit else {
            formError = password.count < 6 && !password.isEmpty
                ? "Password must be at least 6 characters."
                : "Enter your name, email, and a password of 6+ characters."
            return
        }
        formError = ""
        isWorking = true
        await auth.signUp(email: email, password: password, name: name, role: role, zipCode: zipCode, phone: phone)
        isWorking = false
    }
}

