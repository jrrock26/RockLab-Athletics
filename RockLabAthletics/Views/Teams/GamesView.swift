import SwiftUI

struct GamesView: View {
    let teamId: String
    let sportId: String
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = StatsViewModel()
    @State private var showingAdd = false
    @State private var access = TeamAccess()
    @State private var scorerRequests: [GameStatisticianRequest] = []
    @State private var scorerBusy = ""
    @State private var scorerError = ""

    private var openRequests: [GameStatisticianRequest] {
        scorerRequests.filter { $0.status == "open" }
    }

    /// Games this user is personally scoring (a per-game grant, not staff).
    private var myClaims: [GameStatisticianRequest] {
        scorerRequests.filter { $0.status == "filled" && $0.filledBy == (auth.user?.id ?? "") }
    }

    var body: some View {
        List {
            if !openRequests.isEmpty || !myClaims.isEmpty {
                Section("Scoring help") {
                    ForEach(openRequests) { req in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(req.isHome ? "vs" : "@") \(req.opponent)")
                                    .font(.subheadline.weight(.semibold))
                                Text("Needs a statistician")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                            Spacer()
                            if scorerBusy == req.id {
                                ProgressView()
                            } else {
                                Button("I'll run it") { Task { await claim(req) } }
                                    .font(.caption.bold())
                                    .buttonStyle(.borderless)
                            }
                        }
                    }
                    ForEach(myClaims) { req in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(req.isHome ? "vs" : "@") \(req.opponent)")
                                    .font(.subheadline.weight(.semibold))
                                Text("You're scoring this game")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            }
                            Spacer()
                            Button("Release") { Task { await release(req) } }
                                .font(.caption)
                                .buttonStyle(.borderless)
                                .disabled(!scorerBusy.isEmpty)
                        }
                    }
                }
            }

            if !scorerError.isEmpty {
                Section {
                    Text(scorerError).font(.footnote).foregroundStyle(.red)
                }
            }

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
                        .swipeActions(edge: .trailing) {
                            if access.canManageTeam && game.status != .final {
                                Button {
                                    Task { await askForScorer(game) }
                                } label: {
                                    Label("Ask for a scorer", systemImage: "person.badge.clock")
                                }
                                .tint(.orange)
                            }
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
            await loadScorerRequests()
        }
    }

    // MARK: - Statistician help

    private func loadScorerRequests() async {
        scorerRequests = (try? await FirestoreService.shared.fetchStatisticianRequests(teamId: teamId)) ?? []
    }

    private func askForScorer(_ game: Game) async {
        scorerBusy = game.id
        scorerError = ""
        do {
            _ = try await FunctionsService.shared.requestGameStatistician(gameId: game.id)
            await loadScorerRequests()
        } catch {
            scorerError = error.localizedDescription
        }
        scorerBusy = ""
    }

    private func claim(_ request: GameStatisticianRequest) async {
        scorerBusy = request.id
        scorerError = ""
        do {
            _ = try await FunctionsService.shared.claimGameStatistician(requestId: request.id)
            await loadScorerRequests()
        } catch {
            scorerError = error.localizedDescription
        }
        scorerBusy = ""
    }

    private func release(_ request: GameStatisticianRequest) async {
        scorerBusy = request.id
        scorerError = ""
        do {
            _ = try await FunctionsService.shared.releaseGameStatistician(requestId: request.id)
            await loadScorerRequests()
        } catch {
            scorerError = error.localizedDescription
        }
        scorerBusy = ""
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
