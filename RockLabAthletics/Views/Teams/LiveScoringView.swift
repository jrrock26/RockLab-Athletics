import SwiftUI

struct LiveScoringView: View {
    let game: Game
    let teamId: String
    let vm: StatsViewModel
    @State private var selectedPlayer: RosterEntry?

    var body: some View {
        let current = vm.selectedGame ?? game
        List {
            Section("Score") {
                scoreRow(title: "Us", score: current.teamScore) { delta in
                    Task { await vm.updateScore(gameId: current.id, delta: delta, isOpponent: false) }
                }
                scoreRow(title: current.opponent, score: current.opponentScore) { delta in
                    Task { await vm.updateScore(gameId: current.id, delta: delta, isOpponent: true) }
                }
                Picker("Status", selection: Binding(
                    get: { current.status },
                    set: { newStatus in Task { await vm.setStatus(gameId: current.id, status: newStatus) } }
                )) {
                    ForEach(GameStatus.allCases, id: \.self) { status in
                        Text(status.rawValue.capitalized).tag(status)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section("Player stats") {
                if vm.roster.isEmpty {
                    Text("No players on the roster yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.roster) { entry in
                        Button {
                            selectedPlayer = entry
                        } label: {
                            HStack {
                                Text(entry.playerName)
                                Spacer()
                                Text(statSummary(entry.id))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
        }
        .navigationTitle("vs \(current.opponent)")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedPlayer) { entry in
            StatEntrySheet(vm: vm, gameId: current.id, entry: entry)
        }
        .task { await vm.beginGame(game, teamId: teamId) }
    }

    private func scoreRow(title: String, score: Int, onChange: @escaping (Int) -> Void) -> some View {
        HStack {
            Text(title)
                .frame(width: 110, alignment: .leading)
                .lineLimit(1)
            Spacer()
            Text("\(score)")
                .font(.title3.bold())
            ForEach([-1, 1, 2, 3], id: \.self) { delta in
                Button(delta > 0 ? "+\(delta)" : "\(delta)") {
                    onChange(delta)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)
            }
        }
    }

    private func statSummary(_ entryId: String) -> String {
        let s = vm.stats[entryId] ?? [:]
        return "\(s["points"] ?? 0) Pts · \(s["rebounds"] ?? 0) Reb"
    }
}

struct StatEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: StatsViewModel
    let gameId: String
    let entry: RosterEntry

    var body: some View {
        NavigationStack {
            Form {
                Section(entry.playerName) {
                    ForEach(BasketballStat.allCases) { stat in
                        let value = vm.stats[entry.id]?[stat.rawValue] ?? 0
                        HStack {
                            Text(stat.displayName)
                            Spacer()
                            Button {
                                Task { await vm.incrementStat(gameId: gameId, rosterEntryId: entry.id, playerName: entry.playerName, stat: stat, delta: -1) }
                            } label: {
                                Image(systemName: "minus.circle")
                            }
                            .buttonStyle(.borderless)
                            Text("\(value)")
                                .font(.body.bold())
                                .frame(minWidth: 32)
                            Button {
                                Task { await vm.incrementStat(gameId: gameId, rosterEntryId: entry.id, playerName: entry.playerName, stat: stat, delta: 1) }
                            } label: {
                                Image(systemName: "plus.circle")
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }
            .navigationTitle("Stats")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
