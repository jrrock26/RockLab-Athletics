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

            TextField("Zip code (optional)", text: $zipCode)
                .keyboardType(.numberPad)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

            TextField("Phone number (for emergency contact)", text: $phone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .padding()
                .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))

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
        await auth.signUp(email: email, password: password, name: name, role: role, zipCode: zipCode, phone: phone)
        isWorking = false
    }
}

