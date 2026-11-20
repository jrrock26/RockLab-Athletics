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
        case .matches:
            TennisScoringView(game: game, teamId: teamId, sportId: sportId)
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


// MARK: - Tennis team match

/// A tennis team match is decided by lines: each singles or doubles line won is
/// one team point. The line list is the source of truth and the team score is
/// derived from it, so the two can never disagree.
struct TennisScoringView: View {
    @Environment(AuthViewModel.self) private var auth
    let game: Game
    let teamId: String
    let sportId: String

    @State private var lines: [TennisLine] = []
    @State private var vm = StatsViewModel()
    @State private var access = TeamAccess()
    @State private var scoringMode = "simple"
    @State private var isGameScorer = false
    @State private var showingAdd = false
    @State private var errorMessage = ""
    @State private var busy = false

    private var canScore: Bool {
        access.canManageTeam || access.hasPerm(.statistician) || isGameScorer
    }
    private var ourScore: Int { lines.filter { $0.winner == "us" }.count }
    private var theirScore: Int { lines.filter { $0.winner != "us" }.count }

    /// Slots still available, per type — a court cannot be scored twice.
    private var openSlots: [(String, Int)] {
        var open: [(String, Int)] = []
        for type in ["singles", "doubles"] {
            let used = Set(lines.filter { $0.type == type }.map(\.slot))
            for slot in 1...5 where !used.contains(slot) { open.append((type, slot)) }
        }
        return open
    }

    private var sortedLines: [TennisLine] {
        lines.sorted {
            if $0.type != $1.type { return $0.type < $1.type }
            return $0.slot < $1.slot
        }
    }

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

            Section("Lines") {
                if lines.isEmpty {
                    Text("No lines yet.").foregroundStyle(.secondary)
                }
                ForEach(sortedLines) { line in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(line.typeLabel) \(line.slot)")
                                .font(.subheadline.bold())
                            Text(line.winner == "us"
                                 ? (line.playerNames.isEmpty ? "Us" : line.playerNames)
                                 : game.opponent)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(line.scoreLabel)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Text(line.winner == "us" ? "W" : "L")
                            .font(.subheadline.bold())
                            .foregroundStyle(line.winner == "us" ? .green : .red)
                    }
                }
                .onDelete { indexSet in
                    let doomed = indexSet.map { sortedLines[$0] }
                    Task { for line in doomed { await remove(line) } }
                }
                .deleteDisabled(!canScore || busy)
            }

            if canScore && !openSlots.isEmpty {
                Section {
                    Button("Add line") { showingAdd = true }
                        .disabled(busy)
                    if isGameScorer && scoringMode == "simple" {
                        Text("Simple scoring — match result only. The coach can add player detail afterwards.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if !errorMessage.isEmpty {
                Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Team match")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingAdd) {
            AddTennisLineSheet(openSlots: openSlots, roster: vm.roster, opponent: game.opponent) { line in
                Task { await add(line) }
            }
        }
        .task {
            lines = (try? await FirestoreService.shared.fetchTennisLines(gameId: game.id)) ?? []
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


    private func add(_ line: TennisLine) async {
        busy = true
        errorMessage = ""
        let updated = lines + [line]
        do {
            try await FirestoreService.shared.saveTennisLines(
                gameId: game.id, lines: updated, status: .live)
            lines = updated
            await applyStats(for: line, delta: 1)
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    /// Removing a line withdraws its team point and its stat credit.
    private func remove(_ line: TennisLine) async {
        busy = true
        errorMessage = ""
        let updated = lines.filter { $0.id != line.id }
        do {
            try await FirestoreService.shared.saveTennisLines(
                gameId: game.id, lines: updated, status: .live)
            lines = updated
            await applyStats(for: line, delta: -1)
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    /// A won line credits singles/doubles wins plus the sets won in that line.
    private func applyStats(for line: TennisLine, delta: Int) async {
        guard line.winner == "us", !line.playerIds.isEmpty else { return }
        for id in line.playerIds {
            let name = vm.roster.first { $0.id == id }?.playerName ?? line.playerNames
            await vm.incrementStat(gameId: game.id, rosterEntryId: id, playerName: name,
                                   statKey: line.statKey, delta: delta)
            if line.ourSets > 0 {
                await vm.incrementStat(gameId: game.id, rosterEntryId: id, playerName: name,
                                       statKey: "sets_won", delta: delta * line.ourSets)
            }
        }
    }
}


/// Records one line: court, who played, the result, and the set score.
private struct AddTennisLineSheet: View {
    let openSlots: [(String, Int)]
    let roster: [RosterEntry]
    let opponent: String
    var onAdd: (TennisLine) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var type = "singles"
    @State private var slot = 1
    @State private var winner = "us"
    @State private var ourSets = 2
    @State private var theirSets = 0
    @State private var firstId = ""
    @State private var secondId = ""

    private var slotsForType: [Int] {
        openSlots.filter { $0.0 == type }.map(\.1).sorted()
    }
    private var typeOpen: Bool { !slotsForType.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("Line") {
                    Picker("Type", selection: $type) {
                        Text("Singles").tag("singles")
                        Text("Doubles").tag("doubles")
                    }
                    .pickerStyle(.segmented)

                    if typeOpen {
                        Picker("Court", selection: $slot) {
                            ForEach(slotsForType, id: \.self) { number in
                                Text("\(type == "doubles" ? "Doubles" : "Singles") \(number)").tag(number)
                            }
                        }
                    } else {
                        Text("All \(type) courts are already scored.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Players") {
                    Picker(type == "doubles" ? "Player 1" : "Player", selection: $firstId) {
                        Text("Not listed").tag("")
                        ForEach(roster) { entry in
                            Text(entry.playerName).tag(entry.id)
                        }
                    }
                    if type == "doubles" {
                        Picker("Player 2", selection: $secondId) {
                            Text("Not listed").tag("")
                            ForEach(roster.filter { $0.id != firstId }) { entry in
                                Text(entry.playerName).tag(entry.id)
                            }
                        }
                    }
                }

                Section("Result") {
                    Picker("Winner", selection: $winner) {
                        Text("Us").tag("us")
                        Text(opponent).tag("them")
                    }
                    Stepper("Our sets: \(ourSets)", value: $ourSets, in: 0...3)
                    Stepper("Their sets: \(theirSets)", value: $theirSets, in: 0...3)
                }

                Section {
                    Text("A won line is one team point and credits \(type == "doubles" ? "doubles" : "singles") wins plus \(ourSets) set(s).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Add line")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { save() }
                        .disabled(!typeOpen)
                }
            }
            .onAppear { slot = slotsForType.first ?? 1 }
            .onChange(of: type) { _, _ in
                slot = slotsForType.first ?? 1
                if type == "singles" { secondId = "" }
            }
        }
    }

    private func save() {
        var ids: [String] = []
        if !firstId.isEmpty { ids.append(firstId) }
        if type == "doubles", !secondId.isEmpty { ids.append(secondId) }
        let names = ids.compactMap { id in roster.first { $0.id == id }?.playerName }
            .joined(separator: " / ")
        let line = TennisLine(
            type: type,
            slot: slot,
            playerIds: winner == "us" ? ids : [],
            playerNames: winner == "us" ? names : "",
            winner: winner,
            ourSets: ourSets,
            theirSets: theirSets)
        onAdd(line)
        dismiss()
    }
}

