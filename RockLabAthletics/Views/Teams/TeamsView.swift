import SwiftUI

struct TeamsView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = RosterViewModel()
    @State private var showingNewTeam = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(vm.teams) { team in
                    NavigationLink {
                        TeamDetailView(team: team)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(team.sportName) \(team.level)")
                                .font(.headline)
                            Text("\(team.season) · \(team.gender)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .overlay {
                if vm.teams.isEmpty {
                    ContentUnavailableView(
                        "No teams yet",
                        systemImage: "person.3",
                        description: Text("Create a team to start managing a roster.")
                    )
                }
            }
            .navigationTitle("Teams")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingNewTeam = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingNewTeam) {
                NewTeamSheet(vm: vm)
            }
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.loadTeams(schoolId: schoolId)
                }
            }
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

