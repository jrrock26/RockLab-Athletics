import SwiftUI

/// Password reset request. Sends a Firebase reset link without revealing
/// whether the address has an account.
struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth

    @State private var email = ""
    @State private var isWorking = false
    @State private var sent = false
    @State private var errorMessage: String?

    init(prefilledEmail: String = "") {
        _email = State(initialValue: prefilledEmail)
    }

    var body: some View {
        NavigationStack {
            Form {
                if sent {
                    Section {
                        Label("Check your email", systemImage: "envelope.badge")
                            .font(.headline)
                        Text("If an account exists for \(email), a password reset link is on its way. The link expires in one hour.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section {
                        TextField("Email", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .autocorrectionDisabled()
                    } header: {
                        Text("Reset your password")
                    } footer: {
                        Text("We'll email you a link to choose a new password.")
                            .font(.caption)
                    }

                    if let errorMessage {
                        Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                    }

                    Section {
                        Button {
                            Task { await send() }
                        } label: {
                            if isWorking {
                                ProgressView()
                            } else {
                                Text("Send reset link")
                            }
                        }
                        .disabled(isWorking || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .navigationTitle("Forgot Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                if sent {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
        }
    }

    private func send() async {
        isWorking = true
        defer { isWorking = false }
        auth.clearError()
        if await auth.sendPasswordReset(email: email) {
            sent = true
        } else {
            errorMessage = auth.errorMessage ?? "Couldn't send the reset email. Please try again."
        }
    }
}
