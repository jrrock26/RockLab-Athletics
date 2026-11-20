import SwiftUI

struct PlayerDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let sportId: String
    let entry: RosterEntry
    @State private var selection: Int
    @State private var showingLinkParent = false
    @State private var showingEdit = false
    @State private var showingInjury = false
    @State private var access = TeamAccess()
    @State private var injuryVM = RosterViewModel()
    @State private var liveEntry: RosterEntry?

    private var shownEntry: RosterEntry { liveEntry ?? entry }

    init(teamId: String, sportId: String, entry: RosterEntry, initialTab: Int = 0) {
        self.teamId = teamId
        self.sportId = sportId
        self.entry = entry
        _selection = State(initialValue: initialTab)
    }

    /// Attendance is an AD / coach / permitted-staff function only.
    private var canViewAttendance: Bool {
        access.canManageTeam || access.hasPerm(.attendance)
    }

    /// Injury reporting is for AD, coaches, staff, and trainers.
    private var canManageInjury: Bool {
        access.canManageTeam || access.isStaff
    }

    var body: some View {
        VStack(spacing: 0) {
            if shownEntry.isInjured {
                Button {
                    if canManageInjury { showingInjury = true }
                } label: {
                    HStack(spacing: 8) {
                        InjuryBadge(status: shownEntry.injuryStatus)
                        Text(shownEntry.injuryBodyPart.isEmpty ? "Not cleared to play" : "\(shownEntry.injuryBodyPart) — not cleared to play")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        if canManageInjury {
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .disabled(!canManageInjury)
                .background(Color.orange.opacity(0.08))
            }
            Picker("Section", selection: $selection) {
                Text("Forms").tag(0)
                Text("Stats").tag(1)
                if canViewAttendance {
                    Text("Attendance").tag(2)
                }
                Text("Profile").tag(3)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            switch selection {
            case 1: PlayerStatsView(teamId: teamId, sportId: sportId, entryId: entry.id)
            case 2:
                if canViewAttendance {
                    PlayerAttendanceView(teamId: teamId, entryId: entry.id)
                } else {
                    FormsView(teamId: teamId, entryId: entry.id)
                }
            case 3: ShowcaseView(teamId: teamId, sportId: sportId, entry: entry)
            default: FormsView(teamId: teamId, entryId: entry.id)
            }
        }
        .navigationTitle(entry.playerName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManageInjury || access.canManageTeam {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if canManageInjury {
                        Button { showingInjury = true } label: {
                            Image(systemName: "bandage")
                        }
                    }
                    if access.canManageTeam {
                        Button { showingEdit = true } label: { Image(systemName: "pencil") }
                        .accessibilityLabel("Edit player")
                        Button { showingLinkParent = true } label: {
                            Image(systemName: "person.crop.circle.badge.plus")
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $showingInjury, onDismiss: {
            Task { await refreshEntry() }
        }) {
            InjuryReportSheet(vm: injuryVM, teamId: teamId, entry: entry)
        }
        .sheet(isPresented: $showingLinkParent) {
            LinkParentSheet(teamId: teamId, entry: entry)
        }
        .sheet(isPresented: $showingEdit) {
            EditPlayerSheet(teamId: teamId, sportId: sportId, entry: entry)
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            if canManageInjury {
                await injuryVM.loadRoster(teamId: teamId, includeEligibility: false)
                liveEntry = injuryVM.roster.first { $0.id == entry.id }
            }
        }
    }

    private func refreshEntry() async {
        await injuryVM.loadRoster(teamId: teamId, includeEligibility: false)
        liveEntry = injuryVM.roster.first { $0.id == entry.id }
    }
}

struct EditPlayerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let teamId: String
    let sportId: String
    let entry: RosterEntry

    @State private var name = ""
    @State private var jersey = ""
    @State private var position = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Player") {
                    TextField("Full name", text: $name)
                    TextField("Jersey #", text: $jersey)
                    PositionField(positions: SportDefinitions.definition(for: sportId).positions, selection: $position)
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Edit Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                }
            }
            .onAppear {
                name = entry.playerName
                jersey = entry.jerseyNumber
                position = entry.position
            }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await FirestoreService.shared.updateRosterEntry(
                teamId: teamId, entryId: entry.id,
                playerName: name.trimmingCharacters(in: .whitespacesAndNewlines),
                jerseyNumber: jersey.trimmingCharacters(in: .whitespacesAndNewlines),
                position: position.trimmingCharacters(in: .whitespacesAndNewlines))
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct PlayerStatsView: View {
    let teamId: String
    let sportId: String
    let entryId: String
    @State private var careerStats: [String: Int] = [:]

    var body: some View {
        List {
            Section("Career stats") {
                ForEach(SportDefinitions.definition(for: sportId).stats) { stat in
                    HStack {
                        Text(stat.name)
                        Spacer()
                        Text("\(careerStats[stat.key] ?? 0)")
                            .fontWeight(.semibold)
                    }
                }
            }
        }
        .task {
            careerStats = (try? await FirestoreService.shared.fetchCareerStats(
                teamId: teamId, rosterEntryId: entryId,
                stats: SportDefinitions.definition(for: sportId).stats)) ?? [:]
        }
    }
}

struct AttendanceRecord: Identifiable {
    let id: String
    let eventTitle: String
    let date: Date
    let status: AttendanceStatus
}

struct PlayerAttendanceView: View {
    let teamId: String
    let entryId: String
    @State private var records: [AttendanceRecord] = []

    var body: some View {
        List {
            if records.isEmpty {
                Section { Text("No attendance recorded yet.").foregroundStyle(.secondary) }
            } else {
                Section("Attendance") {
                    ForEach(records) { record in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(record.eventTitle).font(.headline)
                                Text(record.date.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(record.status.displayName)
                                .font(.caption.bold())
                                .foregroundStyle(record.status == .present ? Color.green : Color.secondary)
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let events = try await FirestoreService.shared.fetchEvents(teamId: teamId)
            var r: [AttendanceRecord] = []
            for event in events {
                let att = try await FirestoreService.shared.fetchAttendance(eventId: event.id)
                let status = att[entryId] ?? .pending
                r.append(AttendanceRecord(id: event.id, eventTitle: event.title, date: event.date, status: status))
            }
            records = r.sorted { $0.date < $1.date }
        } catch {
            records = []
        }
    }
}

