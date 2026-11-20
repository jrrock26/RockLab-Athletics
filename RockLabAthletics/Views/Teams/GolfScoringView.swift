import SwiftUI

/// Golf-specific live scoring: per-player per-hole strokes, lower team total wins.
struct GolfScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let vm: StatsViewModel
    @State private var access = TeamAccess()
    @State private var selectedPlayer: RosterEntry?

    private var canScore: Bool { access.canManageTeam || access.hasPerm(.statistician) }

    var body: some View {
        let current = vm.selectedGame ?? game
        let ourTotal = vm.golfTeamTotal
        let theirTotal = current.opponentScore

        List {
            Section {
                VStack(spacing: 8) {
                    HStack {
                        scoreColumn(title: "Us", total: ourTotal)
                        Spacer()
                        scoreColumn(title: current.opponent, total: theirTotal)
                    }
                    Text("Lower score wins")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if ourTotal > 0 && theirTotal > 0 {
                        Text(winnerText(us: ourTotal, them: theirTotal))
                            .font(.subheadline.bold())
                            .foregroundStyle(winnerColor(us: ourTotal, them: theirTotal))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }

            Section("Team strokes") {
                if vm.roster.isEmpty {
                    Text("No players on the roster yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.roster) { entry in
                        Button {
                            selectedPlayer = entry
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.playerName)
                                    Text(holeSummary(entry))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(vm.stats[entry.id]?["strokes"] ?? 0)")
                                    .font(.body.bold())
                                    .frame(minWidth: 32)
                            }
                        }
                        .foregroundStyle(.primary)
                        .disabled(!canScore)
                    }
                }
            }

            Section("Opponent strokes") {
                HStack {
                    Text(current.opponent).lineLimit(1)
                    Spacer()
                    if canScore {
                        Button {
                            Task { await vm.updateScore(gameId: current.id, delta: -1, isOpponent: true) }
                        } label: { Image(systemName: "minus.circle") }
                        .accessibilityLabel("Decrease score")
                            .buttonStyle(.borderless)
                    }
                    Text("\(theirTotal)")
                        .font(.body.bold())
                        .frame(minWidth: 32)
                    if canScore {
                        Button {
                            Task { await vm.updateScore(gameId: current.id, delta: 1, isOpponent: true) }
                        } label: { Image(systemName: "plus.circle") }
                        .accessibilityLabel("Increase score")
                            .buttonStyle(.borderless)
                    }
                }
            }

            Section {
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
            .disabled(!canScore)
        }
        .navigationTitle("vs \(current.opponent)")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedPlayer) { entry in
            GolfHoleSheet(vm: vm, gameId: (vm.selectedGame ?? game).id, entry: entry)
        }
        .task {
            await vm.beginGame(game, teamId: teamId)
            vm.watchGame(gameId: game.id)
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
        .onDisappear { vm.stopWatchingGame() }
    }

    private func scoreColumn(title: String, total: Int) -> some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text("\(total)")
                .font(.system(size: 40, weight: .bold, design: .rounded))
        }
    }

    private func holeSummary(_ entry: RosterEntry) -> String {
        let s = vm.stats[entry.id] ?? [:]
        let values = (1...GolfConfig.holeCount).map { s["h\($0)"] ?? 0 }
        guard values.contains(where: { $0 > 0 }) else { return "No holes entered" }
        return values.map { $0 == 0 ? "–" : "\($0)" }.joined(separator: " ")
    }

    private func winnerText(us: Int, them: Int) -> String {
        if us < them { return "Ahead by \(them - us) stroke\(them - us == 1 ? "" : "s")" }
        if them < us { return "Trailing by \(us - them) stroke\(us - them == 1 ? "" : "s")" }
        return "Tied"
    }

    private func winnerColor(us: Int, them: Int) -> Color {
        us < them ? .green : (them < us ? .red : .secondary)
    }
}

/// Per-hole stroke entry for a single golfer.
struct GolfHoleSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: StatsViewModel
    let gameId: String
    let entry: RosterEntry
    @State private var holes: [String] = []

    var body: some View {
        NavigationStack {
            Form {
                Section(entry.playerName) {
                    ForEach(0..<GolfConfig.holeCount, id: \.self) { index in
                        HStack {
                            Text("Hole \(index + 1)")
                            Spacer()
                            TextField("0", text: $holes[index])
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                        }
                    }
                }
                Section {
                    HStack {
                        Text("Total")
                        Spacer()
                        Text("\(total)")
                            .font(.body.bold())
                    }
                }
            }
            .navigationTitle("Strokes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                }
            }
            .onAppear {
                holes = (0..<GolfConfig.holeCount).map { index in
                    let value = vm.stats[entry.id]?["h\(index + 1)"] ?? 0
                    return value == 0 ? "" : "\(value)"
                }
            }
        }
    }

    private var total: Int {
        holes.compactMap { Int($0) }.reduce(0, +)
    }

    private func save() async {
        let values = holes.map { Int($0) ?? 0 }
        await vm.setGolfHoles(gameId: gameId, entry: entry, holes: values)
        dismiss()
    }
}
