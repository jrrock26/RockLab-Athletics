import SwiftUI
import UIKit

/// Invite a guardian for one athlete.
///
/// This used to save `parentEmail` on the roster entry and stop there — the
/// address was recorded but nobody was ever contacted, and no relationship was
/// created, so a parent who installed the app saw an empty screen.
///
/// It now saves the contact AND mints a real invitation that names the athlete
/// (`rosterEntryId`). Accepting it (in the app or on the web portal) links the
/// guardian to the child and grants read access to that one roster entry —
/// nothing wider.
///
/// No email provider is configured yet, so nothing is sent: this sheet hands the
/// coach a link to send themselves, and the invitation records
/// `deliveryStatus: not_configured`. Pretending a mail went out is the failure
/// that loses a family.
struct LinkParentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let teamId: String
    let entry: RosterEntry

    @State private var parentName = ""
    @State private var parentEmail = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var inviteURL: URL?
    @State private var copied = false

    private var trimmedEmail: String {
        parentEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var emailLooksValid: Bool {
        let parts = trimmedEmail.split(separator: "@")
        return parts.count == 2 && trimmedEmail.contains(".") && !trimmedEmail.hasPrefix("@")
    }

    var body: some View {
        NavigationStack {
            Form {
                if let inviteURL {
                    successSection(url: inviteURL)
                } else {
                    formSections
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(inviteURL == nil ? "Invite Guardian" : "Invitation Ready")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(inviteURL == nil ? "Cancel" : "Done") { dismiss() }
                }
                if inviteURL == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(isWorking ? "Working…" : "Invite") {
                            Task { await inviteGuardian() }
                        }
                        .disabled(trimmedEmail.isEmpty || !emailLooksValid || isWorking)
                    }
                }
            }
            .onAppear {
                parentName = entry.parentName
                parentEmail = entry.parentEmail
            }
        }
    }

    private var formSections: some View {
        Group {
            Section("Parent / guardian") {
                TextField("Name", text: $parentName)
                TextField("Email", text: $parentEmail)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
            }

            Section {
                Text("They'll be invited to \(entry.playerName)'s team. Use the address they actually check — the invitation only matches that exact address.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func successSection(url: URL) -> some View {
        Group {
            Section("Send this to \(parentName.isEmpty ? "the guardian" : parentName)") {
                Text(url.absoluteString)
                    .font(.footnote)
                    .textSelection(.enabled)
                Button {
                    UIPasteboard.general.string = url.absoluteString
                    copied = true
                } label: {
                    Label(copied ? "Copied" : "Copy link",
                          systemImage: copied ? "checkmark" : "doc.on.doc")
                }
                ShareLink(item: url) {
                    Label("Share…", systemImage: "square.and.arrow.up")
                }
            }

            Section {
                Text("Email isn't set up yet, so nothing was sent automatically. Text or email this link — it opens a page that walks them through creating a free account.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text("The invitation expires in \(FirestoreService.invitationTtlDays) days.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func inviteGuardian() async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            // Keep the contact on the roster either way: if the invitation fails,
            // the coach should not lose what they just typed.
            try await FirestoreService.shared.updateRosterEntryParent(
                teamId: teamId, entryId: entry.id,
                parentEmail: trimmedEmail, parentName: parentName)

            let team = try await FirestoreService.shared.fetchTeam(teamId: teamId)
            let school = try? await FirestoreService.shared.fetchSchool(id: team?.schoolId ?? "")

            let teamName = [team?.sportName, team?.level]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")

            let code = try await FirestoreService.shared.createInvitation(
                email: trimmedEmail,
                role: .parent,
                schoolId: team?.schoolId ?? "",
                schoolName: school?.name ?? team?.schoolNameHint ?? "",
                sportNames: [team?.sportName].compactMap { $0 }.filter { !$0.isEmpty },
                teamId: teamId,
                teamName: teamName,
                // This is what makes the invitation about a specific child.
                rosterEntryId: entry.id)

            let encodedEmail = trimmedEmail
                .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmedEmail
            let encodedCode = code
                .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? code

            if let url = URL(string: "https://rocklab-athletics.web.app/invite/?email=\(encodedEmail)&code=\(encodedCode)") {
                inviteURL = url
            } else {
                errorMessage = "The invitation was created, but the link couldn't be built. Find it under Team → Invitations."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

