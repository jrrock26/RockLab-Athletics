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
    @State private var promoteEntry: RosterEntry?
    /// Player being added to a different team or sport.
    @State private var transferEntry: RosterEntry?

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
                .swipeActions(edge: .trailing) {
                    if access.canManageTeam {
                        Button {
                            transferEntry = entry
                        } label: {
                            Label("Transfer", systemImage: "arrow.left.arrow.right")
                        }
                        .tint(.indigo)
                        Button {
                            promoteEntry = entry
                        } label: {
                            Label("Move", systemImage: "arrow.up.forward.circle")
                        }
                        .tint(.green)
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
        .sheet(item: $promoteEntry) { entry in
            PromotePlayerSheet(entry: entry, fromTeamId: teamId, sportId: sportId) {
                Task { await vm.loadRoster(teamId: teamId, includeEligibility: canViewEligibility) }
            }
        }
        .sheet(item: $transferEntry) { entry in
            TransferPlayerSheet(
                entry: entry,
                fromTeamId: teamId,
                schoolId: auth.user?.schoolId,
                userId: auth.user?.id ?? "",
                teamIds: auth.user?.teamIds ?? []
            ) {
                Task { await vm.loadRoster(teamId: teamId, includeEligibility: canViewEligibility) }
            }
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

// MARK: - Move / promote a player

/// Moves an athlete to another team — the end-of-season case being Jr High up to
/// JV. Identity and guardian contact carry over, the athlete's account stays
/// linked, and injury state resets. The old roster keeps the entry, marked as
/// promoted, so the previous season stays accurate.
private struct PromotePlayerSheet: View {
    let entry: RosterEntry
    let fromTeamId: String
    let sportId: String
    var onDone: () -> Void

    @Environment(AuthViewModel.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var teams: [Team] = []
    @State private var busyTeamId: String?
    @State private var error = ""

    /// Same-sport teams first — that is almost always the intended destination.
    private var destinations: [Team] {
        teams
            .filter { $0.id != fromTeamId }
            .sorted { lhs, rhs in
                if (lhs.sportId == sportId) != (rhs.sportId == sportId) {
                    return lhs.sportId == sportId
                }
                return lhs.title < rhs.title
            }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Player") {
                    Text(entry.playerName).font(.headline)
                    if !summary.isEmpty {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    if destinations.isEmpty {
                        Text("No other teams in this school yet.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(destinations) { team in
                        Button {
                            Task { await move(to: team) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(team.title)
                                        .foregroundStyle(.primary)
                                    Text(team.season.isEmpty ? "Season not set" : team.season)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if busyTeamId == team.id {
                                    ProgressView()
                                } else if team.sportId == sportId {
                                    Text("Same sport")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .disabled(busyTeamId != nil)
                    }
                } header: {
                    Text("Move to")
                } footer: {
                    Text("Guardian contacts and the athlete's account move with them. Injury status resets for the new team. The player stays on the old roster, marked as promoted, so that season stays accurate.")
                }

                if !error.isEmpty {
                    Section {
                        Text(error).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Move player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private var summary: String {
        var parts: [String] = []
        if !entry.jerseyNumber.isEmpty { parts.append("#\(entry.jerseyNumber)") }
        if !entry.position.isEmpty { parts.append(entry.position) }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        do {
            if let schoolId = auth.user?.schoolId, !schoolId.isEmpty {
                teams = try await FirestoreService.shared.fetchTeams(schoolId: schoolId)
            } else {
                teams = try await FirestoreService.shared.fetchTeams(
                    forUser: auth.user?.id ?? "",
                    teamIds: auth.user?.teamIds ?? [])
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func move(to team: Team) async {
        busyTeamId = team.id
        error = ""
        do {
            let result = try await FunctionsService.shared.promotePlayer(
                entryId: entry.id,
                fromTeamId: fromTeamId,
                toTeamId: team.id)
            let existed = result["existed"] as? Bool ?? false

            if !existed { onDone() }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        busyTeamId = nil
    }
}

/// Puts an existing player onto another team's roster.
///
/// Two different needs look the same on this screen and must not be conflated:
/// a **transfer** (they left the JV team for varsity) removes them from this
/// roster, while a **multi-sport athlete** belongs on both. The toggle decides,
/// and defaults to keeping both because deleting a player from a roster is the
/// destructive branch.
struct TransferPlayerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let entry: RosterEntry
    let fromTeamId: String
    let schoolId: String?
    let userId: String
    let teamIds: [String]
    let onDone: () -> Void

    @State private var teams: [Team] = []
    @State private var targetId = ""
    @State private var position = ""
    @State private var keepOriginal = true
    @State private var busy = false
    @State private var errorMessage = ""

    private var target: Team? { teams.first { $0.id == targetId } }

    private var targetPositions: [String] {
        guard let target else { return [] }
        return SportDefinitions.definition(for: target.sportId).positions
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Player") {
                    Text(entry.playerName)
                    if !entry.jerseyNumber.isEmpty {
                        Text("Jersey #\(entry.jerseyNumber)").foregroundStyle(.secondary)
                    }
                }

                Section("Add to") {
                    if teams.isEmpty {
                        Text("No other teams available.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(teams) { team in
                        Button {
                            targetId = team.id
                            position = ""
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(team.sportName) — \(team.level)")
                                        .foregroundStyle(.primary)
                                    Text(team.season)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if targetId == team.id {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                    }
                }

                if target != nil {
                    Section("Position on the new team") {
                        Picker("Position", selection: $position) {
                            Text("None").tag("")
                            ForEach(targetPositions, id: \.self) { name in
                                Text(name).tag(name)
                            }
                        }
                    }

                    Section {
                        Toggle("Keep on this roster too", isOn: $keepOriginal)
                    } footer: {
                        Text(keepOriginal
                             ? "For a multi-sport athlete: the same player appears on both rosters and signs in once."
                             : "The player is removed from this roster once added to the new one.")
                    }
                }

                if !errorMessage.isEmpty {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Add to another team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Add") {
                        Task { await transfer() }
                    }
                    .disabled(busy || target == nil)
                }
            }
            .task { await loadTeams() }
        }
    }

    private func loadTeams() async {
        var loaded: [Team] = []
        if let schoolId, !schoolId.isEmpty {
            loaded = (try? await FirestoreService.shared.fetchTeams(schoolId: schoolId)) ?? []
        }
        if loaded.isEmpty {
            loaded = (try? await FirestoreService.shared.fetchTeams(forUser: userId, teamIds: teamIds)) ?? []
        }
        teams = loaded.filter { $0.id != fromTeamId }
        targetId = teams.first?.id ?? ""
    }

    private func transfer() async {
        guard let target else { return }
        busy = true
        errorMessage = ""
        do {
            try await FirestoreService.shared.transferRosterEntry(
                entry: entry,
                fromTeamId: fromTeamId,
                toTeamId: target.id,
                newPosition: position,
                keepOriginal: keepOriginal)
            onDone()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}
