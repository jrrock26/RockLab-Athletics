import SwiftUI

struct InviteCoachSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let team: Team
    let onCreated: () -> Void

    @State private var email = ""
    @State private var role: UserRole = .coach
    @State private var generatedCode = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    /// ADs only invite coaches; coaches/staff invite players, parents, etc.
    private var availableRoles: [UserRole] {
        if auth.user?.role == .ad {
            return [.coach]
        }
        return [.staff, .player, .parent, .follower]
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(auth.user?.role == .ad ? "Invite a coach" : "Invite someone") {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    if availableRoles.count > 1 {
                        Picker("Role", selection: $role) {
                            ForEach(availableRoles, id: \.self) { r in
                                Text(r.displayName).tag(r)
                            }
                        }
                    } else {
                        LabeledContent("Role", value: "Coach")
                    }
                }

                if !generatedCode.isEmpty {
                    Section("Invite code") {
                        Text("Share this code with \(email). They enter it in Settings → Join a team.")
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
            .navigationTitle(auth.user?.role == .ad ? "Invite Coach" : "Invite")
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
            .onAppear {
                if let first = availableRoles.first, !availableRoles.contains(role) {
                    role = first
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
            onCreated()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

