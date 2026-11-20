import SwiftUI

/// Self-service account deletion (App Store 5.1.1(v)).
/// Ownership of a school or team must be handed off first — we never silently
/// transfer it, because that would move a program without the AD's consent.
struct DeleteAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth

    @State private var isLoading = true
    @State private var canDelete = false
    @State private var blockers: [(message: String, detail: String)] = []
    @State private var confirmation = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?

    private var confirmed: Bool {
        confirmation.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "DELETE"
    }

    var body: some View {
        NavigationStack {
            Form {
                if isLoading {
                    Section { ProgressView() }
                } else if canDelete {
                    Section {
                        Text("This permanently deletes your account and detaches your data. Coaches will no longer see you on their roster, and forms you signed stay with the school.")
                            .font(.footnote)
                    } header: {
                        Text("This cannot be undone")
                    }

                    Section("What happens") {
                        Label("Your profile, photo, and sign-in are removed", systemImage: "person.crop.circle.badge.xmark")
                        Label("You leave every team", systemImage: "person.3")
                        Label("You're unlinked from any player/family records", systemImage: "link.badge.plus")
                        Label("Forms you signed stay with the school", systemImage: "doc.text")
                    }

                    Section {
                        TextField("Type DELETE to confirm", text: $confirmation)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                    }

                    Section {
                        Button(role: .destructive) {
                            Task { await deleteAccount() }
                        } label: {
                            if isDeleting {
                                ProgressView()
                            } else {
                                Text("Delete my account")
                            }
                        }
                        .disabled(!confirmed || isDeleting)
                    }
                } else {
                    Section {
                        Label("You can't delete your account yet", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                        ForEach(blockers, id: \.message) { blocker in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(blocker.message).font(.subheadline)
                                if !blocker.detail.isEmpty {
                                    Text(blocker.detail).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    } footer: {
                        Text("Hand off ownership, then come back here to delete your account.")
                            .font(.caption)
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Delete Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await FunctionsService.shared.previewAccountDeletion()
            canDelete = (result["canDelete"] as? Bool) ?? false
            let raw = (result["blockers"] as? [[String: Any]]) ?? []
            blockers = raw.map {
                (message: $0["message"] as? String ?? "You have unfinished account ownership.",
                 detail: $0["detail"] as? String ?? "")
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await FunctionsService.shared.deleteMyAccount()
            auth.signOut()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
