import SwiftUI

/// Shows pending invitations for the current user so they can accept or reject.
struct MyInvitationsView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var invitations: [Invitation] = []
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if invitations.isEmpty {
                    Section {
                        Label("No pending invitations", systemImage: "tray")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Pending Invitations") {
                        ForEach(invitations) { invitation in
                            invitationRow(invitation)
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("My Invitations")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
        }
    }

    private var pendingInvitations: [Invitation] {
        invitations.filter { $0.status == "pending" }
    }

    private func invitationRow(_ invitation: Invitation) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(invitation.schoolName.isEmpty ? "School" : invitation.schoolName)
                    .font(.headline)
                Text(invitation.role.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let teamName = invitation.teamName, !teamName.isEmpty {
                    Text(teamName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if invitation.adTransfer {
                    // Make the consequence explicit: this is not a role on a team,
                    // it takes the school off the person who holds it today.
                    Text("Takes over as Athletic Director from \(invitation.invitedByName.isEmpty ? "the current AD" : invitation.invitedByName). Accepting ends their AD access.")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
            Spacer()
            if isWorking {
                ProgressView()
            } else {
                Button("Accept") {
                    Task { await accept(invitation) }
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)

                Button("Reject") {
                    Task { await reject(invitation) }
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }
        }
    }

    private func load() async {
        guard let email = auth.user?.email, !email.isEmpty else { return }
        do {
            invitations = try await FirestoreService.shared.fetchInvitationsByEmail(email: email)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func accept(_ invitation: Invitation) async {
        guard let uid = auth.user?.id, let email = auth.user?.email else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            if invitation.adTransfer {
                // Accepting a handoff transfers the school, so it goes through the
                // dedicated function; the generic path refuses role 'ad'.
                _ = try await FunctionsService.shared.acceptAdTransfer(invitationId: invitation.id)
            } else {
                _ = try await FunctionsService.shared.acceptInvitation(
                    invitationId: invitation.id,
                    userId: uid,
                    email: email,
                    name: auth.user?.displayName ?? email
                )
            }
            await auth.refreshUser()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reject(_ invitation: Invitation) async {
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await FunctionsService.shared.rejectInvitation(invitationId: invitation.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
