import SwiftUI

/// Small pill showing a player's eligibility.
struct EligibilityBadge: View {
    let status: EligibilityStatus

    var body: some View {
        Text(status.isEligible ? "Eligible" : "Ineligible")
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(status.isEligible ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
            .foregroundStyle(status.isEligible ? Color.green : Color.red)
            .clipShape(Capsule())
    }
}

struct RosterView: View {
    let teamId: String
    @State private var vm = RosterViewModel()
    @State private var showingAddPlayer = false
    @State private var showingCSV = false

    var body: some View {
        List {
            ForEach(vm.roster) { entry in
                NavigationLink {
                    PlayerDetailView(teamId: teamId, entry: entry)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.playerName).font(.headline)
                            Text(subtitle(entry))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        EligibilityBadge(status: vm.eligibility[entry.id] ?? .eligible)
                    }
                }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    let entry = vm.roster[index]
                    Task { await vm.dropPlayer(teamId: teamId, entryId: entry.id) }
                }
            }
        }
        .overlay {
            if vm.roster.isEmpty {
                ContentUnavailableView(
                    "No players",
                    systemImage: "person.crop.circle.badge.plus",
                    description: Text("Add players manually or import a CSV.")
                )
            }
        }
        .navigationTitle("Roster")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showingCSV = true } label: { Image(systemName: "square.and.arrow.down") }
                Button { showingAddPlayer = true } label: { Image(systemName: "person.badge.plus") }
            }
        }
        .sheet(isPresented: $showingAddPlayer) {
            AddPlayerSheet(vm: vm, teamId: teamId)
        }
        .sheet(isPresented: $showingCSV) {
            CSVImportSheet(vm: vm, teamId: teamId)
        }
        .task { await vm.loadRoster(teamId: teamId) }
    }

    private func subtitle(_ entry: RosterEntry) -> String {
        var parts: [String] = []
        if !entry.jerseyNumber.isEmpty { parts.append("#\(entry.jerseyNumber)") }
        if !entry.position.isEmpty { parts.append(entry.position) }
        return parts.isEmpty ? "No number" : parts.joined(separator: " · ")
    }
}

struct AddPlayerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: RosterViewModel
    let teamId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Player") {
                    TextField("Full name", text: $vm.newPlayerName)
                    TextField("Jersey #", text: $vm.newPlayerJersey)
                    TextField("Position", text: $vm.newPlayerPosition)
                }
            }
            .navigationTitle("Add Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addPlayer(teamId: teamId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newPlayerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct CSVImportSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: RosterViewModel
    let teamId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Paste CSV (Name, Jersey, Position — one per line)") {
                    TextEditor(text: $vm.csvText)
                        .frame(minHeight: 160)
                }
                Section {
                    Text("Example:\nJohn Smith,12,QB\nJane Doe,7,OH")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Import Roster")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        Task {
                            await vm.importCSV(teamId: teamId)
                            dismiss()
                        }
                    }
                    .disabled(vm.csvText.isEmpty)
                }
            }
        }
    }
}
