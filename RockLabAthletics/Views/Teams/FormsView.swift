import SwiftUI

struct FormsView: View {
    let teamId: String
    let entryId: String
    @State private var vm = RosterViewModel()
    @State private var playerName = "Player"

    var body: some View {
        Form {
            if let status = vm.eligibility[entryId] {
                Section {
                    HStack {
                        Text("Eligibility").fontWeight(.semibold)
                        Spacer()
                        EligibilityBadge(status: status)
                    }
                }
            }

            Section("Required forms") {
                ForEach(EligibilityEngine.requiredForms()) { type in
                    formRow(type)
                }
            }
        }
        .navigationTitle(playerName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func formRow(_ type: FormType) -> some View {
        let form = vm.forms[entryId]?.first(where: { $0.type == type })
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(type.displayName).font(.headline)
                Text(statusText(form)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Menu {
                Button("Mark submitted") {
                    Task { await submit(type: type, status: .submitted) }
                }
                Button("Approve") {
                    Task { await submit(type: type, status: .approved) }
                }
                Button("Mark expired", role: .destructive) {
                    Task { await submit(type: type, status: .expired) }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
            }
        }
    }

    private func submit(type: FormType, status: FormStatus) async {
        let exp = (type == .physical && status == .approved)
            ? Date().addingTimeInterval(60 * 60 * 24 * 365)
            : nil
        await vm.setFormStatus(teamId: teamId, entryId: entryId, type: type, status: status, expiresAt: exp)
    }

    private func statusText(_ form: PlayerForm?) -> String {
        guard let form else { return "Missing" }
        return form.status.rawValue.capitalized
    }

    private func load() async {
        await vm.loadRoster(teamId: teamId)
        if let entry = vm.roster.first(where: { $0.id == entryId }) {
            playerName = entry.playerName
        }
    }
}
