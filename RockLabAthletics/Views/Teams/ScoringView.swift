import SwiftUI

/// Opens the correct scoring screen for any sport.
///
/// The score **model** — not the sport name — chooses the screen. Sports whose
/// result is structurally different from "increment a number" get their own
/// view; everything else about a team is identical across sports, so a newly
/// created team is never missing anything.
struct ScoringView: View {
    let game: Game
    let teamId: String
    let sportId: String
    let vm: StatsViewModel

    var body: some View {
        switch SportDefinitions.scoreModel(for: sportId) {
        case .holes:
            GolfScoringView(game: game, teamId: teamId, vm: vm)
        case .sets:
            SetsScoringView(game: game, teamId: teamId, sportId: sportId)
        case .dualMeet:
            DualMeetScoringView(game: game, teamId: teamId, sportId: sportId)
        case .judged:
            JudgedScoringView(game: game, teamId: teamId, sportId: sportId, vm: vm)
        default:
            LiveScoringView(game: game, teamId: teamId, sportId: sportId, vm: vm)
        }
    }
}

// MARK: - Set-based scoring (volleyball)

/// A volleyball match is decided by **sets won**, each with its own score.
/// Incrementing one running total produced a meaningless final result.
struct SetsScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let sportId: String

    @State private var sets: [[String: Int]] = []
    @State private var usScore = 0
    @State private var themScore = 0
    @State private var access = TeamAccess()
    @State private var vm = StatsViewModel()
    @State private var statEntry: RosterEntry?
    @State private var scoringMode = "simple"
    @State private var isGameScorer = false
    @State private var errorMessage = ""
    @State private var busy = false

    private var canScore: Bool { access.canManageTeam || access.hasPerm(.statistician) || isGameScorer }
    /// Advanced stats only when the coach granted advanced scoring (or for staff).
    private var canTrackPlayerStats: Bool {
        access.canManageTeam || access.hasPerm(.statistician) || scoringMode == "advanced"
    }
    private var usWon: Int { sets.filter { ($0["us"] ?? 0) > ($0["them"] ?? 0) }.count }
    private var themWon: Int { sets.filter { ($0["them"] ?? 0) > ($0["us"] ?? 0) }.count }
    private var matchOver: Bool { usWon >= 3 || themWon >= 3 }

    var body: some View {
        List {
            Section("Match") {
                HStack {
                    Text("Us").font(.headline)
                    Spacer()
                    Text("\(usWon)").font(.title2.bold()).monospacedDigit()
                    Text("sets").font(.caption).foregroundStyle(.secondary)
                }
                HStack {
                    Text(game.opponent).font(.headline)
                    Spacer()
                    Text("\(themWon)").font(.title2.bold()).monospacedDigit()
                    Text("sets").font(.caption).foregroundStyle(.secondary)
                }
            }

            if !sets.isEmpty {
                Section("Sets played") {
                    ForEach(Array(sets.enumerated()), id: \.offset) { index, set in
                        HStack {
                            Text("Set \(index + 1)")
                            Spacer()
                            Text("\(set["us"] ?? 0)–\(set["them"] ?? 0)")
                                .monospacedDigit()
                                .foregroundStyle((set["us"] ?? 0) > (set["them"] ?? 0) ? .green : .secondary)
                        }
                    }
                }
            }

            if canTrackPlayerStats && !vm.roster.isEmpty {
                Section("Player stats") {
                    ForEach(vm.roster) { entry in
                        Button {
                            statEntry = entry
                        } label: {
                            HStack {
                                Text(entry.playerName)
                                Spacer()
                                Text(statSummary(entry))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            } else if isGameScorer && scoringMode == "simple" {
                Section {
                    Label("Simple scoring — sets only", systemImage: "1.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text("Player stats are added after the game by the coach.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if matchOver {
                Section {
                    Text("Match complete — \(usWon > themWon ? "win" : "loss") \(usWon)–\(themWon).")
                        .font(.subheadline.weight(.semibold))
                }
            } else {
                Section("Set \(sets.count + 1)") {
                    Stepper("Us: \(usScore)", value: $usScore, in: 0...99)
                    Stepper("\(game.opponent): \(themScore)", value: $themScore, in: 0...99)
                    Button(busy ? "Saving…" : "Save set") { Task { await saveSet() } }
                        .disabled(!canScore || busy)
                    if !canScore {
                        Text("Only a coach or statistician can score this game.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if !errorMessage.isEmpty {
                Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Score")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $statEntry) { entry in
            StatEntrySheet(
                vm: vm,
                gameId: game.id,
                entry: entry,
                canEdit: canTrackPlayerStats,
                stats: SportDefinitions.definition(for: sportId).stats)
        }
        .task {
            sets = game.sets
            access = await FirestoreService.shared.teamAccess(
                teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.beginGame(game, teamId: teamId)
            if let uid = auth.user?.id {
                let grant = await FirestoreService.shared.scoringGrant(gameId: game.id, userId: uid)
                isGameScorer = grant.isScorer
                scoringMode = grant.mode
            }
        }
    }

    private func statSummary(_ entry: RosterEntry) -> String {
        let current = vm.stats[entry.id] ?? [:]
        let stats = SportDefinitions.definition(for: sportId).stats
        return stats.prefix(2).map { "\(current[$0.key] ?? 0) \($0.name)" }.joined(separator: " · ")
    }

    private func saveSet() async {
        busy = true
        errorMessage = ""
        let updated = sets + [["us": usScore, "them": themScore]]
        let us = updated.filter { ($0["us"] ?? 0) > ($0["them"] ?? 0) }.count
        let them = updated.filter { ($0["them"] ?? 0) > ($0["us"] ?? 0) }.count
        let status: GameStatus = (us >= 3 || them >= 3) ? .final : .live
        do {
            try await FirestoreService.shared.saveVolleyballSets(
                gameId: game.id, sets: updated, status: status)
            sets = updated
            usScore = 0
            themScore = 0
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}


// MARK: - Judged sports (cheer, dance)

/// Judged sports have no live score. Offering one was misleading, so this screen
/// records the outcome and nothing else.
struct JudgedScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let sportId: String
    let vm: StatsViewModel
    @State private var access = TeamAccess()

    private var canScore: Bool { access.canManageTeam || access.hasPerm(.statistician) }

    var body: some View {
        List {
            Section {
                Text("This sport is judged — there is no live score to run.")
                    .font(.subheadline.weight(.semibold))
                Text("Mark the result final when judging is complete so families see the outcome.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Result") {
                Picker("Status", selection: Binding(
                    get: { vm.selectedGame?.status ?? game.status },
                    set: { newStatus in Task { await vm.setStatus(gameId: game.id, status: newStatus) } }
                )) {
                    ForEach(GameStatus.allCases, id: \.self) { status in
                        Text(status.rawValue.capitalized).tag(status)
                    }
                }
                .pickerStyle(.segmented)
                .disabled(!canScore)
            }
        }
        .navigationTitle("Result")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await vm.beginGame(game, teamId: teamId)
            access = await FirestoreService.shared.teamAccess(
                teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
    }
}


// MARK: - Wrestling dual meet

/// A dual meet is scored per weight class, and each bout's points depend on how
/// it was won — so a running "+1" button cannot express it. The bout list is the
/// source of truth and the team score is derived from it.
struct DualMeetScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let sportId: String

    @State private var bouts: [WrestlingBout] = []
    @State private var vm = StatsViewModel()
    @State private var access = TeamAccess()
    @State private var scoringMode = "simple"
    @State private var isGameScorer = false
    @State private var showingAdd = false
    @State private var errorMessage = ""
    @State private var busy = false

    private var definition: SportDefinition { SportDefinitions.definition(for: sportId) }
    private var weights: [String] { definition.positions }
    private var canScore: Bool {
        access.canManageTeam || access.hasPerm(.statistician) || isGameScorer
    }
    private var ourScore: Int { bouts.filter { $0.winner == "us" }.reduce(0) { $0 + $1.points } }
    private var theirScore: Int { bouts.filter { $0.winner != "us" }.reduce(0) { $0 + $1.points } }
    private var usedWeights: Set<String> { Set(bouts.map(\.weight)) }
    private var openWeights: [String] { weights.filter { !usedWeights.contains($0) } }

    var body: some View {
        List {
            Section("Team score") {
                HStack {
                    Text("Us").font(.headline)
                    Spacer()
                    Text("\(ourScore)").font(.title2.bold()).monospacedDigit()
                }
                HStack {
                    Text(game.opponent).font(.headline)
                    Spacer()
                    Text("\(theirScore)").font(.title2.bold()).monospacedDigit()
                }
            }

            Section("Bouts") {
                if bouts.isEmpty {
                    Text("No bouts yet.").foregroundStyle(.secondary)
                }
                ForEach(bouts) { bout in
                    HStack {
                        Text(bout.weight)
                            .font(.subheadline.bold())
                            .frame(minWidth: 44, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(bout.winner == "us"
                                 ? (bout.wrestlerName.isEmpty ? "Us" : bout.wrestlerName)
                                 : game.opponent)
                            Text(bout.resultLabel)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("+\(bout.points)")
                            .font(.subheadline.bold())
                            .foregroundStyle(bout.winner == "us" ? .green : .secondary)
                    }
                }
                .onDelete { indexSet in
                    let doomed = indexSet.map { bouts[$0] }
                    Task { for bout in doomed { await remove(bout) } }
                }
                .deleteDisabled(!canScore || busy)
            }

            if canScore && !openWeights.isEmpty {
                Section {
                    Button("Add bout") { showingAdd = true }
                        .disabled(busy)
                    if isGameScorer && scoringMode == "simple" {
                        Text("Simple scoring — bouts only. The coach can add per-wrestler stats after the match.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if !errorMessage.isEmpty {
                Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Dual meet")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingAdd) {
            AddBoutSheet(weights: openWeights, roster: vm.roster, opponent: game.opponent) { bout in
                Task { await add(bout) }
            }
        }
        .task {
            bouts = (try? await FirestoreService.shared.fetchWrestlingBouts(gameId: game.id)) ?? []
            access = await FirestoreService.shared.teamAccess(
                teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.beginGame(game, teamId: teamId)
            if let uid = auth.user?.id {
                let grant = await FirestoreService.shared.scoringGrant(gameId: game.id, userId: uid)
                isGameScorer = grant.isScorer
                scoringMode = grant.mode
            }
        }
    }


    private func add(_ bout: WrestlingBout) async {
        busy = true
        errorMessage = ""
        var updated = bouts + [bout]
        updated.sort {
            (weights.firstIndex(of: $0.weight) ?? 99) < (weights.firstIndex(of: $1.weight) ?? 99)
        }
        do {
            try await FirestoreService.shared.saveWrestlingBouts(
                gameId: game.id, bouts: updated, status: .live)
            bouts = updated
            await applyStats(for: bout, delta: 1)
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    /// Removing a bout must also withdraw its stat credit, or career totals drift.
    private func remove(_ bout: WrestlingBout) async {
        busy = true
        errorMessage = ""
        let updated = bouts.filter { $0.id != bout.id }
        do {
            try await FirestoreService.shared.saveWrestlingBouts(
                gameId: game.id, bouts: updated, status: .live)
            bouts = updated
            await applyStats(for: bout, delta: -1)
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    /// Credits (or withdraws) the wrestler's win and the result-specific stat.
    private func applyStats(for bout: WrestlingBout, delta: Int) async {
        guard bout.winner == "us", !bout.rosterEntryId.isEmpty, bout.isCountedWin else { return }
        await vm.incrementStat(gameId: game.id, rosterEntryId: bout.rosterEntryId,
                               playerName: bout.wrestlerName, statKey: "wins", delta: delta)
        if let key = bout.statKey {
            await vm.incrementStat(gameId: game.id, rosterEntryId: bout.rosterEntryId,
                                   playerName: bout.wrestlerName, statKey: key, delta: delta)
        }
    }
}

/// Records one bout: weight class, who won, and how.
private struct AddBoutSheet: View {
    let weights: [String]
    let roster: [RosterEntry]
    let opponent: String
    var onAdd: (WrestlingBout) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var weight = ""
    @State private var winner = "us"
    @State private var result = "decision"
    @State private var rosterEntryId = ""

    private struct ResultOption: Identifiable {
        let id: String
        let label: String
    }

    private let results: [ResultOption] = [
        ResultOption(id: "decision", label: "Decision"),
        ResultOption(id: "major", label: "Major decision"),
        ResultOption(id: "tech_fall", label: "Tech fall"),
        ResultOption(id: "fall", label: "Fall"),
        ResultOption(id: "forfeit", label: "Forfeit"),
        ResultOption(id: "default", label: "Default"),
        ResultOption(id: "dq", label: "DQ"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Bout") {
                    Picker("Weight", selection: $weight) {
                        ForEach(weights, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Winner", selection: $winner) {
                        Text("Us").tag("us")
                        Text(opponent).tag("them")
                    }
                    Picker("Result", selection: $result) {
                        ForEach(results) { option in
                            Text(option.label).tag(option.id)
                        }
                    }
                }

                if winner == "us" {
                    Section("Our wrestler") {
                        Picker("Wrestler", selection: $rosterEntryId) {
                            Text("Not listed").tag("")
                            ForEach(roster) { entry in
                                Text(entry.playerName).tag(entry.id)
                            }
                        }
                    }
                }

                Section {
                    Text("This bout awards \(WrestlingBout.points(for: result)) point(s).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if winner == "us" && WrestlingBout(weight: weight, winner: "us", result: result).isCountedWin {
                        Text("A counted win — the wrestler's win and result stats are recorded.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Add bout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { save() }
                        .disabled(weight.isEmpty)
                }
            }
            .onAppear { if weight.isEmpty { weight = weights.first ?? "" } }
        }
    }

    private func save() {
        let name = roster.first { $0.id == rosterEntryId }?.playerName ?? ""
        let bout = WrestlingBout(
            weight: weight,
            winner: winner,
            result: result,
            rosterEntryId: winner == "us" ? rosterEntryId : "",
            wrestlerName: winner == "us" ? name : "")
        onAdd(bout)
        dismiss()
    }
}

