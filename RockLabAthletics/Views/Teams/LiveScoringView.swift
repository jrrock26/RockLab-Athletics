import SwiftUI

struct LiveScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let sportId: String
    let vm: StatsViewModel
    @State private var selectedPlayer: RosterEntry?
    /// The player a logged play is credited to; nil means "Team".
    @State private var playPlayer: RosterEntry?
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
            Section {
                HStack(alignment: .center) {
                    VStack(spacing: 2) {
                        Text("US").font(.caption2.bold()).foregroundStyle(.secondary)
                        Text("\(current.teamScore)")
                            .font(.system(size: 40, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                    }
                    .frame(maxWidth: .infinity)
                    Text("–").font(.title2).foregroundStyle(.secondary)
                    VStack(spacing: 2) {
                        Text(current.opponent.uppercased())
                            .font(.caption2.bold())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text("\(current.opponentScore)")
                            .font(.system(size: 40, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.vertical, 4)

                Picker("Status", selection: Binding(
                    get: { current.status },
                    set: { newStatus in Task { await vm.setStatus(gameId: current.id, status: newStatus) } }
                )) {
                    ForEach(GameStatus.allCases, id: \.self) { status in
                        Text(status.rawValue.capitalized).tag(status)
                    }
                }
                .pickerStyle(.segmented)

                // Plays drive the score, but a board is sometimes just wrong —
                // a wrong tap two plays ago, or a score the table had to correct.
                Menu {
                    ForEach([-1, 1], id: \.self) { delta in
                        Button("Us \(delta > 0 ? "+1" : "−1")") {
                            Task { await vm.updateScore(gameId: current.id, delta: delta, isOpponent: false) }
                        }
                        Button("\(current.opponent) \(delta > 0 ? "+1" : "−1")") {
                            Task { await vm.updateScore(gameId: current.id, delta: delta, isOpponent: true) }
                        }
                    }
                } label: {
                    Label("Correct score", systemImage: "slider.horizontal.3")
                        .font(.footnote)
                }
                .disabled(!canScore)

                if !vm.plays.isEmpty {
                    Button(role: .destructive) {
                        Task { await vm.undoLastPlay(gameId: current.id) }
                    } label: {
                        Label("Undo last play", systemImage: "arrow.uturn.backward")
                    }
                    .disabled(!canScore)
                }
            } header: {
                Text("Score (\(definition.scoreUnit))")
            }
            .disabled(!canScore)

            if canScore {
                Section("Log a play") {
                    Menu {
                        Button("Team (no player)") { playPlayer = nil }
                        ForEach(vm.roster) { entry in
                            Button(rosterLabel(entry)) { playPlayer = entry }
                        }
                    } label: {
                        HStack {
                            Text("Player")
                            Spacer()
                            Text(playPlayer.map(rosterLabel) ?? "Team")
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
                        ForEach(SportDefinitions.scoringActions(for: sportId)) { action in
                            Button {
                                Task {
                                    await vm.recordPlay(
                                        gameId: current.id,
                                        action: action,
                                        entry: playPlayer,
                                        period: current.period,
                                        clockSeconds: clockRemaining,
                                        creditStats: canTrackPlayerStats)
                                }
                            } label: {
                                VStack(spacing: 1) {
                                    Text(action.name).font(.footnote.weight(.semibold))
                                    Text(action.shortLabel).font(.caption2).opacity(0.8)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(action.awardsOpponent ? .orange : .accentColor)
                        }
                    }
                    .padding(.vertical, 4)

                    if !canTrackPlayerStats {
                        Text("Simple scoring — plays are logged for the scoreboard, but player stats are added by the coach afterward.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if !vm.plays.isEmpty {
                Section("Play by play") {
                    ForEach(vm.plays.prefix(10)) { play in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(play.stampLabel(SportDefinitions.clock(for: sportId)))
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 62, alignment: .leading)
                            Text(play.summary)
                                .font(.footnote)
                                .foregroundStyle(play.isOurs ? .primary : .secondary)
                            Spacer()
                            if !play.isOurs {
                                Text("them")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                }
            }

            if let clock = SportDefinitions.clock(for: sportId) {
                Section("Clock") {
                    // Period chips include overtime periods that already exist on
                    // the game, plus a way to add the next one.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(0..<max(clock.periods.count, current.period + 1), id: \.self) { index in
                                Button(clock.label(forPeriod: index)) {
                                    Task { changePeriod(index, clock: clock) }
                                }
                                .buttonStyle(.bordered)
                                .tint(index == current.period ? Color.accentColor : Color.gray)
                            }
                            Button("+ OT") { Task { await startOvertime(clock) } }
                                .buttonStyle(.bordered)
                                .tint(.orange)
                        }
                    }
                    .disabled(!canScore)

                    HStack {
                        Text(clockTimeString(clockRemaining))
                            .font(.system(size: 34, weight: .bold, design: .monospaced))
                            .foregroundStyle(clockRemaining == 0 ? Color.red : Color.primary)
                        Spacer()
                        Button(clockRunning ? "Pause" : "Start") { toggleClock() }
                            .buttonStyle(.borderedProminent)
                            .disabled(clockRemaining == 0 && !clockRunning)
                        Button("Reset") { resetClock(clock) }
                            .buttonStyle(.bordered)
                    }

                    // Clocks in a gym are wrong more often than they are right:
                    // a scorekeeper needs to move time without resetting a period.
                    HStack(spacing: 6) {
                        ForEach([-60, -10, 10, 60], id: \.self) { delta in
                            Button(delta > 0 ? "+\(delta)s" : "\(delta)s") {
                                adjustClock(by: delta)
                            }
                            .buttonStyle(.bordered)
                            .font(.caption.weight(.semibold))
                        }
                    }
                    .disabled(!canScore)
                }
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
            await vm.loadPlays(gameId: game.id)
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
                // Persist the expiry, or spectators keep counting past zero.
                persistClock()
            }
        }
        .onDisappear { vm.stopWatchingGame() }
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
            // Tell every spectator's device when this started; without it they can
            // only show a frozen reading.
            persistClock()
        }
    }

    private func resetClock(_ clock: ClockConfig) {
        clockRunning = false
        let period = (vm.selectedGame ?? game).period
        clockRemaining = clock.seconds(forPeriod: period)
        persistClock()
    }

    /// Nudges the clock without ending the period.
    private func adjustClock(by delta: Int) {
        clockRemaining = max(0, clockRemaining + delta)
        persistClock()
    }

    /// Adds the next overtime period. Overtime is created on demand because a
    /// game can need a second or third one; nothing is pre-declared.
    private func startOvertime(_ clock: ClockConfig) async {
        let g = vm.selectedGame ?? game
        let next = max(g.period + 1, clock.periods.count)
        clockRunning = false
        clockRemaining = clock.seconds(forPeriod: next)
        await vm.updateClock(gameId: g.id, period: next, clockSeconds: clockRemaining)
    }

    private func rosterLabel(_ entry: RosterEntry) -> String {
        entry.jerseyNumber.isEmpty ? entry.playerName : "#\(entry.jerseyNumber) \(entry.playerName)"
    }

    private func changePeriod(_ period: Int, clock: ClockConfig) {
        clockRunning = false
        clockRemaining = clock.seconds(forPeriod: period)
        let g = vm.selectedGame ?? game
        Task { await vm.updateClock(gameId: g.id, period: period, clockSeconds: clockRemaining) }
    }

    private func persistClock() {
        let g = vm.selectedGame ?? game
        Task {
            await vm.updateClock(
                gameId: g.id, period: g.period, clockSeconds: clockRemaining, running: clockRunning)
        }
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
