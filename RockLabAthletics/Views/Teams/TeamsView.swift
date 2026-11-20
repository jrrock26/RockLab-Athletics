import SwiftUI

struct TeamsView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = RosterViewModel()
    @State private var showingNewTeam = false
    @State private var showingCoachSetup = false

    // AD-only: teams started by coaches that are waiting to be adopted.
    @State private var unattached: [Team] = []
    @State private var adoptingTeamId: String?

    private var isCoach: Bool { auth.user?.role == .coach }

    /// First-run guidance differs by role — every role lands on an actionable next step.
    private var emptyStateMessage: String {
        switch auth.user?.role {
        case .ad:
            return "Add your first team, or invite a coach — their team will appear here for you to approve."
        case .coach:
            return "Set up your team to start building a roster and schedule."
        case .player, .parent:
            return "You're not on a team yet. Ask your coach for an invitation."
        case .follower:
            return "Follow a team to see scores and game updates."
        default:
            return "No teams yet."
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(vm.teams) { team in
                    NavigationLink {
                        TeamDetailView(team: team)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(team.title)
                                .font(.headline)
                            Text(subtitle(team))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if isCoach {
                    Section {
                        Button {
                            showingCoachSetup = true
                        } label: {
                            Label("Start another team", systemImage: "plus.circle")
                        }
                    } footer: {
                        Text("You only see the teams you coach.")
                            .font(.caption)
                    }
                }

                if canCreateTeam && !unattached.isEmpty {
                    Section {
                        ForEach(unattached) { team in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(team.title).font(.subheadline.weight(.semibold))
                                    Text("Start coach listed: \(team.schoolNameHint.isEmpty ? "—" : team.schoolNameHint)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Adopt") {
                                    Task { await adopt(team) }
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                                .disabled(adoptingTeamId != nil)
                            }
                        }
                    } header: {
                        Text("Teams waiting to be adopted")
                    } footer: {
                        Text("These teams were started by coaches. Adopting one adds it to your school and replaces the coach's school name with yours.")
                            .font(.caption)
                    }
                }
            }
            .overlay {
                if vm.teams.isEmpty && unattached.isEmpty {
                    ContentUnavailableView {
                        Label("No teams yet", systemImage: "person.3")
                    } description: {
                        Text(emptyStateMessage)
                    } actions: {
                        if canCreateTeam {
                            Button("Add a team") { showingNewTeam = true }
                                .buttonStyle(.borderedProminent)
                        } else if isCoach {
                            Button("Set up my team") { showingCoachSetup = true }
                                .buttonStyle(.borderedProminent)
                        }
                    }
                }
            }
            .navigationTitle("Teams")
            .toolbar {
                if canCreateTeam {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showingNewTeam = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Create team")
                    }
                }
            }
            .sheet(isPresented: $showingNewTeam) {
                NewTeamSheet(vm: vm)
            }
            .sheet(isPresented: $showingCoachSetup) {
                CoachTeamSetupView {
                    Task { await load() }
                }
            }
            .task { await load() }
        }
    }

    private func subtitle(_ team: Team) -> String {
        var parts = [team.season, team.gender].filter { !$0.isEmpty }
        if team.isUnattached {
            parts.append("Not yet adopted by a school")
        }
        return parts.joined(separator: " · ")
    }

    private var canCreateTeam: Bool {
        auth.user?.role == .ad
    }

    /// Coaches load only their own teams; ADs load their school's teams plus the
    /// adoption queue.
    private func load() async {
        guard let user = auth.user else { return }
        if let schoolId = user.schoolId, !isCoach {
            await vm.loadTeams(schoolId: schoolId)
        } else {
            await vm.loadMyTeams(userId: user.id, teamIds: user.teamIds)
        }

        if canCreateTeam, let schoolId = user.schoolId, !schoolId.isEmpty {
            unattached = (try? await FirestoreService.shared.fetchUnattachedTeams()) ?? []
        }
    }

    private func adopt(_ team: Team) async {
        adoptingTeamId = team.id
        defer { adoptingTeamId = nil }
        do {
            _ = try await FunctionsService.shared.adoptTeam(teamId: team.id)
            AnalyticsService.log("team_adopted", ["sport": team.sportId])
            await load()
        } catch {
            // Leave the queue intact; the row stays adoptable.
        }
    }
}

struct NewTeamSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    @Bindable var vm: RosterViewModel

    private let levels = ["Varsity", "JV", "Freshman"]
    private let seasons = ["Fall", "Winter", "Spring"]
    private let genders = ["Boys", "Girls", "Coed"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Sport") {
                    Picker("Sport", selection: $vm.newTeamSportId) {
                        ForEach(SportsCatalog.all) { sport in
                            Text("\(sport.emoji) \(sport.name)").tag(sport.id)
                        }
                    }
                }
                Section("Details") {
                    Picker("Level", selection: $vm.newTeamLevel) {
                        ForEach(levels, id: \.self) { Text($0) }
                    }
                    Picker("Season", selection: $vm.newTeamSeason) {
                        ForEach(seasons, id: \.self) { Text($0) }
                    }
                    Picker("Gender", selection: $vm.newTeamGender) {
                        ForEach(genders, id: \.self) { Text($0) }
                    }
                }
            }
            .navigationTitle("New Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            if let schoolId = auth.user?.schoolId, let headCoachId = auth.user?.id {
                                if await vm.createTeam(schoolId: schoolId, headCoachId: headCoachId) {
                                    dismiss()
                                }
                            }
                        }
                    }
                    .disabled(vm.newTeamSportId.isEmpty)
                }
            }
            .onAppear {
                if vm.newTeamSportId.isEmpty, let first = SportsCatalog.all.first {
                    vm.newTeamSportId = first.id
                }
            }
        }
    }
}

