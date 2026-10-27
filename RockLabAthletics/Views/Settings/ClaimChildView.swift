import SwiftUI

struct ClaimChildView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var childEmail = ""
    @State private var message = ""
    @State private var isWorking = false

    var body: some View {
        Form {
            Section("Link a player") {
                TextField("Player's email", text: $childEmail)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
            }
            if !message.isEmpty {
                Section {
                    Text(message).font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section {
                Button("Link player") {
                    Task { await link() }
                }
                .disabled(childEmail.isEmpty || isWorking)
            }
        }
        .navigationTitle("Link a Child")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func link() async {
        guard let parentId = auth.user?.id else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let email = childEmail.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let player = try await FirestoreService.shared.findUserByEmail(email: email) else {
                message = "No player found with that email."
                return
            }
            try await FirestoreService.shared.linkChild(parentUserId: parentId, playerUserId: player.id)
            message = "Linked \(player.displayName)."
            childEmail = ""
        } catch {
            message = error.localizedDescription
        }
    }
}
