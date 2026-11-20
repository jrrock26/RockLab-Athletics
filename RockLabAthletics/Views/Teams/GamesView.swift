import SwiftUI

struct GamesView: View {
    let teamId: String
    let sportId: String
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = StatsViewModel()
    @State private var showingAdd = false
    @State private var access = TeamAccess()

    var body: some View {
        List {
            if vm.games.isEmpty {
                Section {
                    Text(access.canManageTeam ? "No games yet. Tap + to schedule one." : "No games scheduled.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Games") {
                    ForEach(vm.games) { game in
                        NavigationLink {
                            ScoringView(game: game, teamId: teamId, sportId: sportId, vm: vm)
                        } label: {
                            GameRow(game: game)
                        }
                    }
                }
            }
        }
        .navigationTitle("Games")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            if access.canManageTeam {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Schedule game")
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddGameSheet(vm: vm, teamId: teamId)
        }
        .task {
            await vm.loadGames(teamId: teamId)
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
    }
}

struct GameRow: View {
    let game: Game

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("\(game.isHome ? "vs" : "@") \(game.opponent)")
                        .font(.headline)
                    if game.isDistrictGame {
                        Text("District")
                            .font(.caption2.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.purple.opacity(0.15), in: Capsule())
                            .foregroundStyle(Color.purple)
                    }
                }
                Text(game.date.formatted(date: .abbreviated, time: .shortened))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(game.teamScore) – \(game.opponentScore)")
                    .font(.title3.bold())
                Text(game.status.rawValue.capitalized)
                    .font(.caption2)
                    .foregroundStyle(game.status == .live ? Color.red : Color.secondary)
            }
        }
    }
}

struct AddGameSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: StatsViewModel
    let teamId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Opponent") {
                    TextField("Opponent name", text: $vm.newOpponent)
                    Toggle("Home game", isOn: $vm.newIsHome)
                    Toggle("District game", isOn: $vm.newIsDistrictGame)
                    DatePicker("Date & time", selection: $vm.newGameDate)
                }
            }
            .navigationTitle("New Game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addGame(teamId: teamId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newOpponent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
