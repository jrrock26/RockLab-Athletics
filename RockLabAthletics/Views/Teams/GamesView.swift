import SwiftUI

struct GamesView: View {
    let teamId: String
    let sportId: String
    @State private var vm = StatsViewModel()
    @State private var showingAdd = false

    var body: some View {
        List {
            if vm.games.isEmpty {
                Section {
                    Text("No games yet. Tap + to schedule one.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Games") {
                    ForEach(vm.games) { game in
                        NavigationLink {
                            LiveScoringView(game: game, teamId: teamId, vm: vm)
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
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddGameSheet(vm: vm, teamId: teamId)
        }
        .task { await vm.loadGames(teamId: teamId) }
    }
}

struct GameRow: View {
    let game: Game

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(game.isHome ? "vs" : "@") \(game.opponent)")
                    .font(.headline)
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
