import SwiftUI

/// A single player's forms & eligibility.
///
/// Eligibility is computed only from forms the AD/coach has **issued**
/// (published). If nothing has been issued, the player is eligible. Eligibility
/// status is visible to AD/coach/staff only — never to players or parents.
struct FormsView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let entryId: String
    @State private var vm = RosterViewModel()
    @State private var access = TeamAccess()
    @State private var documents: [UploadedDocument] = []

    private var canViewEligibility: Bool {
        access.canManageTeam || access.isStaff
    }

    private var entry: RosterEntry? {
        vm.roster.first { $0.id == entryId }
    }

    var body: some View {
        Form {
            if canViewEligibility, let status = vm.eligibility[entryId] {
                Section("Eligibility") {
                    HStack {
                        Text("Status").fontWeight(.semibold)
                        Spacer()
                        EligibilityBadge(status: status)
                    }
                    if status == .injured {
                        Label("Not cleared to play while injured.", systemImage: "bandage")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    ForEach(status.missingForms, id: \.self) { title in
                        Label(title, systemImage: "exclamationmark.circle")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    if status.isEligible {
                        Text("All issued forms are complete.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Issued forms") {
                if vm.publishedForms.isEmpty {
                    Text("No forms have been issued for this team.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.publishedForms) { form in
                        let submission = vm.submissionsByForm[form.id]?[entryId]
                        VStack(alignment: .leading, spacing: 2) {
                            Text(form.title).font(.headline)
                            Text(statusText(form: form, submission: submission))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // A family uploads through the web portal, which stores the file beside this
            // requirement and records `documentUrl` on it. Without this section the
            // upload is invisible here and the physical reads as still missing.
            Section("Uploaded documents") {
                if documents.isEmpty {
                    Text("No documents uploaded from the family portal.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(documents) { doc in
                        VStack(alignment: .leading, spacing: 4) {
                            if let url = doc.url {
                                Link(destination: url) {
                                    Label(doc.fileName.isEmpty ? doc.formId : doc.fileName,
                                          systemImage: "paperclip")
                                }
                            } else {
                                Label(doc.fileName.isEmpty ? doc.formId : doc.fileName,
                                      systemImage: "paperclip")
                                    .foregroundStyle(.secondary)
                            }
                            Text(documentSubtitle(doc))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private func documentSubtitle(_ doc: UploadedDocument) -> String {
        var parts = [doc.status.displayName]
        if !doc.signedByName.isEmpty { parts.append("signed by \(doc.signedByName)") }
        if let d = doc.signedAt { parts.append(d.formatted(date: .abbreviated, time: .omitted)) }
        return parts.joined(separator: " · ")
    }

    private func statusText(form: TeamForm, submission: FormSubmission?) -> String {
        guard let submission else { return "Not submitted" }
        var text = submission.status.displayName
        if submission.requiresParentSignature && submission.parentSignedByName.isEmpty {
            text += " · parent signature needed"
        }
        if let d = submission.signedAt {
            text += " · signed \(d.formatted(date: .abbreviated, time: .omitted))"
        }
        return text
    }

    private func load() async {
        access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        await vm.loadRoster(teamId: teamId, includeEligibility: canViewEligibility)
        documents = (try? await FirestoreService.shared.fetchUploadedDocuments(
            teamId: teamId, rosterEntryId: entryId)) ?? []
    }
}

