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
    @State private var errorMessage = ""
    @State private var busy = false

    private var canScore: Bool { access.canManageTeam || access.hasPerm(.statistician) }
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
        .task {
            sets = game.sets
            access = await FirestoreService.shared.teamAccess(
                teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
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

