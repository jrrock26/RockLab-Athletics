import SwiftUI

/// Teams for one sport + gender, with a "create team" action for the AD.
struct SportTeamsView: View {
    @Environment(AuthViewModel.self) private var auth
    let schoolId: String
    let sport: Sport
    let gender: String

    @State private var teams: [Team] = []
    @State private var showingCreate = false

    private var filtered: [Team] {
        teams.filter { $0.sportId == sport.id && $0.gender == gender }
    }

    var body: some View {
        List {
            if filtered.isEmpty {
                Section {
                    Text("No \(gender.lowercased()) \(sport.name) teams yet.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Teams") {
                    ForEach(filtered) { team in
                        NavigationLink { TeamDetailView(team: team) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(team.level).font(.headline)
                                Text(team.season).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("\(gender) \(sport.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if auth.user?.role == .ad {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Create team")
                }
            }
        }
        .sheet(isPresented: $showingCreate) {
            CreateTeamSheet(schoolId: schoolId, sport: sport, gender: gender) {
                Task { await load() }
            }
        }
        .task { await load() }
    }

    private func load() async {
        teams = (try? await FirestoreService.shared.fetchTeams(schoolId: schoolId)) ?? []
    }
}

/// Creates a team for a given sport + gender + level.
struct CreateTeamSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let schoolId: String
    let sport: Sport
    let gender: String
    let onCreated: () -> Void

    @State private var level = "Varsity"
    @State private var season = "Fall"
    @State private var isWorking = false
    @State private var errorMessage: String?

    private let levels = ["Varsity", "JV", "Freshman", "Middle School", "Jr High", "7th Grade", "8th Grade", "9th Grade"]
    private let seasons = ["Fall", "Winter", "Spring"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Team") {
                    Picker("Level", selection: $level) {
                        ForEach(levels, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Season", selection: $season) {
                        ForEach(seasons, id: \.self) { Text($0).tag($0) }
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New \(gender) \(sport.name) Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(isWorking)
                }
            }
        }
    }

    private func create() async {
        isWorking = true
        defer { isWorking = false }
        guard let adUserId = auth.user?.id else { return }
        do {
            _ = try await FirestoreService.shared.createTeam(
                schoolId: schoolId, sportId: sport.id, sportName: sport.name,
                level: level, season: season, gender: gender, headCoachId: adUserId)
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
