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
        }
        .task { await load() }
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
    }
}

