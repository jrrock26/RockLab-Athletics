import SwiftUI

/// Small pill showing a player's eligibility. Staff-only — never shown to
/// players, parents, or followers.
struct EligibilityBadge: View {
    let status: EligibilityStatus

    private var tint: Color {
        switch status {
        case .eligible: return .green
        case .injured: return .orange
        case .ineligible: return .red
        }
    }

    var body: some View {
        Text(status.label)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.15))
            .foregroundStyle(tint)
            .clipShape(Capsule())
    }
}

/// Small pill showing injury / availability. Visible to all team members.
struct InjuryBadge: View {
    let status: InjuryStatus

    private var tint: Color {
        switch status {
        case .healthy: return .green
        case .injured: return .red
        case .limited: return .orange
        }
    }

    var body: some View {
        Label(status.displayName, systemImage: status == .injured ? "cross.case.fill" : "bandage.fill")
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.15))
            .foregroundStyle(tint)
            .clipShape(Capsule())
    }
}

struct RosterView: View {
    let teamId: String
    let sportId: String
    @State private var vm = RosterViewModel()
    @Environment(AuthViewModel.self) private var auth
    @State private var showingAddPlayer = false
    @State private var showingCSV = false
    @State private var access = TeamAccess()
    @State private var editingEntry: RosterEntry?
    @State private var injuryEntry: RosterEntry?

    /// Eligibility is visible only to AD, coaches, and staff — never to
    /// players, parents, or followers.
    private var canViewEligibility: Bool {
        access.canManageTeam || access.isStaff
    }

    var body: some View {
        List {
            if access.hasPerm(.emergencyContacts) {
                Section {
                    NavigationLink {
                        EmergencyContactsView(teamId: teamId, sportId: sportId)
                    } label: {
                        Label("Emergency contacts", systemImage: "phone.badge.checkmark")
                    }
                }
            }

            ForEach(vm.roster) { entry in
                NavigationLink {
                    PlayerDetailView(teamId: teamId, sportId: sportId, entry: entry)
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.playerName).font(.headline)
                            Text(subtitle(entry))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            if entry.injuryStatus != .healthy {
                                InjuryBadge(status: entry.injuryStatus)
                            }
                            if canViewEligibility {
                                EligibilityBadge(status: vm.eligibility[entry.id] ?? .eligible)
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Opens the player's profile, stats, and forms.")
                }
                .swipeActions(edge: .leading) {
                    if canViewEligibility {
                        Button {
                            injuryEntry = entry
                        } label: {
                            Label("Injury", systemImage: "bandage")
                        }
                        .tint(.orange)
                    }
                    if access.canManageTeam {
                        Button {
                            editingEntry = entry
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        .tint(.blue)
                    }
                }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    let entry = vm.roster[index]
                    Task { await vm.dropPlayer(teamId: teamId, entryId: entry.id) }
                }
            }
            .deleteDisabled(!access.canManageTeam)
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
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            if access.canManageTeam {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showingCSV = true } label: { Image(systemName: "square.and.arrow.down") }
                    .accessibilityLabel("Import roster from CSV")
                    Button { showingAddPlayer = true } label: { Image(systemName: "person.badge.plus") }
                    .accessibilityLabel("Add player")
                }
            }
        }
        .sheet(isPresented: $showingAddPlayer) {
            AddPlayerSheet(vm: vm, teamId: teamId, sportId: sportId)
        }
        .sheet(isPresented: $showingCSV) {
            CSVImportSheet(vm: vm, teamId: teamId)
        }
        .sheet(item: $editingEntry) { entry in
            EditPlayerSheet(teamId: teamId, sportId: sportId, entry: entry)
        }
        .sheet(item: $injuryEntry) { entry in
            InjuryReportSheet(vm: vm, teamId: teamId, entry: entry)
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.loadRoster(teamId: teamId, includeEligibility: canViewEligibility)
        }
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
    let sportId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Player") {
                    TextField("Full name", text: $vm.newPlayerName)
                    TextField("Jersey #", text: $vm.newPlayerJersey)
                    PositionField(positions: SportDefinitions.definition(for: sportId).positions, selection: $vm.newPlayerPosition)
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
    @State private var summary: String?
    @State private var isImporting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Paste CSV (Name, Jersey, Position, Parent Email)") {
                    TextEditor(text: $vm.csvText)
                        .frame(minHeight: 160)
                }
                Section {
                    Text("Example:\nJohn Smith,12,QB,parent@email.com\nJane Doe,7,OH,")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } footer: {
                    Text("Add a parent email and they'll get an invitation linked to that athlete automatically.")
                        .font(.caption)
                }
            }
            .navigationTitle("Import Roster")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        Task {
                            isImporting = true
                            summary = await vm.importRosterAndInviteParents(teamId: teamId)
                            isImporting = false
                        }
                    }
                    .disabled(vm.csvText.isEmpty || isImporting)
                }
            }
            .alert("Import complete", isPresented: Binding(get: { summary != nil },
                                                           set: { if !$0 { summary = nil } })) {
                Button("Done") { dismiss() }
            } message: {
                Text(summary ?? "")
            }
        }
    }
}
