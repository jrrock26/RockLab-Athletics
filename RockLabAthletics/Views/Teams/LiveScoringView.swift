import SwiftUI

struct LiveScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let sportId: String
    let vm: StatsViewModel
    @State private var selectedPlayer: RosterEntry?
    @State private var access = TeamAccess()
    @State private var isGameScorer = false
    @State private var scoringMode = "simple"
    @State private var clockRemaining = 0
    @State private var clockRunning = false
    private let clockTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var definition: SportDefinition { SportDefinitions.definition(for: sportId) }

    private var canScore: Bool {
        access.canManageTeam || access.hasPerm(.statistician) || isGameScorer
    }

    /// Coaches and staff statisticians always get player stats. A volunteer only
    /// gets them when the coach assigned advanced scoring — inaccurate live stats
    /// are worse than none.
    private var canTrackPlayerStats: Bool {
        access.canManageTeam || access.hasPerm(.statistician) || scoringMode == "advanced"
    }

    var body: some View {
        let current = vm.selectedGame ?? game
        List {
            Section("Score (\(definition.scoreUnit))") {
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
            .disabled(!canScore)

            if let clock = SportDefinitions.clock(for: sportId) {
                Section("Clock") {
                    Picker("Period", selection: Binding(
                        get: { current.period },
                        set: { newPeriod in Task { await changePeriod(newPeriod, clock: clock) } }
                    )) {
                        ForEach(Array(clock.periods.enumerated()), id: \.offset) { index, name in
                            Text(name).tag(index)
                        }
                    }
                    .pickerStyle(.segmented)

                    HStack {
                        Text(clockTimeString(clockRemaining))
                            .font(.system(size: 34, weight: .bold, design: .monospaced))
                        Spacer()
                        Button(clockRunning ? "Pause" : "Start") { toggleClock() }
                            .buttonStyle(.borderedProminent)
                            .disabled(clockRemaining == 0 && !clockRunning)
                        Button("Reset") { resetClock(clock) }
                            .buttonStyle(.bordered)
                    }
                }
                .disabled(!canScore)
            }

            if isGameScorer && scoringMode == "simple" {
                Section {
                    Label("Simple scoring — score and clock only", systemImage: "1.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text("Player stats are added after the game by the coach.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if access.canSeeAllEvents && canTrackPlayerStats {
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
        }
        .navigationTitle("vs \(current.opponent)")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedPlayer) { entry in
            StatEntrySheet(vm: vm, gameId: current.id, entry: entry, canEdit: canScore, stats: definition.stats)
        }
        .task {
            await vm.beginGame(game, teamId: teamId)
            vm.watchGame(gameId: game.id)
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            // A volunteer who claimed this game holds a per-game grant; its mode
            // decides whether they may touch player stats.
            if let uid = auth.user?.id {
                let grant = await FirestoreService.shared.scoringGrant(gameId: game.id, userId: uid)
                isGameScorer = grant.isScorer
                scoringMode = grant.mode
            }
        }
        .onAppear {
            if let clock = SportDefinitions.clock(for: sportId) {
                let base = vm.selectedGame?.clockSeconds ?? game.clockSeconds
                clockRemaining = base == 0 ? clock.minutesPerPeriod * 60 : base
            }
        }
        .onReceive(clockTimer) { _ in
            guard clockRunning else { return }
            if clockRemaining > 0 {
                clockRemaining -= 1
            } else {
                clockRunning = false
            }
        }
        .onDisappear { vm.stopWatchingGame() }
    }

    private func scoreRow(title: String, score: Int, onChange: @escaping (Int) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                Text("\(score)").font(.title3.bold())
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Button("-1") {
                        onChange(-1)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    ForEach(definition.scoreButtons, id: \.self) { delta in
                        Button("+\(delta)") {
                            onChange(delta)
                        }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.circle)
                    }
                }
            }
        }
    }

    private func statSummary(_ entryId: String) -> String {
        let s = vm.stats[entryId] ?? [:]
        let top = definition.stats.prefix(2)
        return top.map { "\(s[$0.key] ?? 0) \($0.name)" }.joined(separator: " · ")
    }

    private func clockTimeString(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private func toggleClock() {
        if clockRunning {
            clockRunning = false
            persistClock()
        } else if clockRemaining > 0 {
            clockRunning = true
        }
    }

    private func resetClock(_ clock: ClockConfig) {
        clockRunning = false
        clockRemaining = clock.minutesPerPeriod * 60
        persistClock()
    }

    private func changePeriod(_ period: Int, clock: ClockConfig) {
        clockRunning = false
        clockRemaining = clock.minutesPerPeriod * 60
        let g = vm.selectedGame ?? game
        Task { await vm.updateClock(gameId: g.id, period: period, clockSeconds: clockRemaining) }
    }

    private func persistClock() {
        let g = vm.selectedGame ?? game
        Task { await vm.updateClock(gameId: g.id, period: g.period, clockSeconds: clockRemaining) }
    }
}

struct StatEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: StatsViewModel
    let gameId: String
    let entry: RosterEntry
    let canEdit: Bool
    let stats: [SportStat]

    var body: some View {
        NavigationStack {
            Form {
                Section(entry.playerName) {
                    ForEach(stats) { stat in
                        let value = vm.stats[entry.id]?[stat.key] ?? 0
                        HStack {
                            Text(stat.name)
                            Spacer()
                            if canEdit {
                                Button {
                                    Task { await vm.incrementStat(gameId: gameId, rosterEntryId: entry.id, playerName: entry.playerName, statKey: stat.key, delta: -1) }
                                } label: {
                                    Image(systemName: "minus.circle")
                                }
                                .buttonStyle(.borderless)
                            }
                            Text("\(value)")
                                .font(.body.bold())
                                .frame(minWidth: 32)
                            if canEdit {
                                Button {
                                    Task { await vm.incrementStat(gameId: gameId, rosterEntryId: entry.id, playerName: entry.playerName, statKey: stat.key, delta: 1) }
                                } label: {
                                    Image(systemName: "plus.circle")
                                }
                                .buttonStyle(.borderless)
                            }
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
