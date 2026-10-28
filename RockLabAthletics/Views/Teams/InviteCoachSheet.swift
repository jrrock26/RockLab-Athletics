import SwiftUI

struct InviteCoachSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let team: Team

    @State private var email = ""
    @State private var role: UserRole = .coach
    @State private var generatedCode = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    private let roles: [UserRole] = [.coach, .staff, .player, .parent, .follower]

    var body: some View {
        NavigationStack {
            Form {
                Section("Invite someone") {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    Picker("Role", selection: $role) {
                        ForEach(roles, id: \.self) { r in
                            Text(r.displayName).tag(r)
                        }
                    }
                }

                if !generatedCode.isEmpty {
                    Section("Invite code") {
                        Text("Share this code with \(email):")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text(generatedCode)
                            .font(.title2.bold().monospaced())
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Invite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create invite") {
                        Task { await createInvite() }
                    }
                    .disabled(email.isEmpty || isWorking)
                }
            }
        }
    }

    private func createInvite() async {
        guard let schoolId = auth.user?.schoolId else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let code = try await FirestoreService.shared.createInvitation(
                email: email,
                role: role,
                schoolId: schoolId,
                schoolName: "",
                sportNames: [team.sportName],
                teamId: team.id,
                teamName: "\(team.sportName) \(team.level)"
            )
            generatedCode = code
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
