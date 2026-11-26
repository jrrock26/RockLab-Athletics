import SwiftUI
import FirebaseFirestore

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
            if access.canManageTeam || !openRequests.isEmpty || !myClaims.isEmpty {
                Section("Scoring help") {
                    // The request used to live only in a swipe action, which meant
                    // coaches who did not already know it existed never found it.
                    if access.canManageTeam {
                        Menu {
                            let candidates = vm.games.filter { $0.status != .final }
                            if candidates.isEmpty {
                                Text("No games to request scoring for.")
                            }
                            ForEach(candidates) { game in
                                Button("\(game.isHome ? "vs" : "@") \(game.opponent) · \(game.date.formatted(date: .abbreviated, time: .omitted))") {
                                    Task { await askForScorer(game) }
                                }
                            }
                        } label: {
                            Label("Ask for a volunteer scorer", systemImage: "person.badge.clock")
                        }
                        .disabled(!scorerBusy.isEmpty)
                    }
                    ForEach(openRequests) { req in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(req.isHome ? "vs" : "@") \(req.opponent)")
                                    .font(.subheadline.weight(.semibold))
                                Text(req.signups.isEmpty
                                     ? "Needs a statistician"
                                     : "\(req.signups.count) signed up — coach picks")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                            Spacer()
                            if access.canManageTeam {
                                Button(req.mode == "advanced" ? "Advanced" : "Simple") {
                                    Task { await toggleMode(req) }
                                }
                                .font(.caption2.bold())
                                .buttonStyle(.borderless)
                                .disabled(!scorerBusy.isEmpty)
                                if !req.signups.isEmpty {
                                    Menu("Pick") {
                                        ForEach(req.signups) { signup in
                                            Button(signup.name.isEmpty ? signup.userId : signup.name) {
                                                Task { await assign(req, userId: signup.userId) }
                                            }
                                        }
                                    }
                                    .font(.caption2.bold())
                                }
                            }
                            if scorerBusy == req.id {
                                ProgressView()
                            } else if req.signups.contains(where: { $0.userId == (auth.user?.id ?? "") }) {
                                Text("Signed up")
                                    .font(.caption.bold())
                                    .foregroundStyle(.green)
                            } else {
                                Button("I'll do it") { Task { await signUp(req) } }
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
                            if access.canManageTeam && game.status == .final {
                                Button {
                                    Task { await verify(game) }
                                } label: {
                                    Label("Verify stats", systemImage: "checkmark.seal")
                                }
                                .tint(.green)
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

    private func signUp(_ request: GameStatisticianRequest) async {
        scorerBusy = request.id
        scorerError = ""
        do {
            _ = try await FunctionsService.shared.signUpForGame(requestId: request.id)
            await loadScorerRequests()
        } catch {
            scorerError = error.localizedDescription
        }
        scorerBusy = ""
    }

    /// Coach/AD picks one scorer. The server revokes every other grant.
    private func assign(_ request: GameStatisticianRequest, userId: String) async {
        scorerBusy = request.id
        scorerError = ""
        do {
            _ = try await FunctionsService.shared.assignGameStatistician(
                requestId: request.id, userId: userId)
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

    /// Simple vs advanced: advanced lets a trusted statistician attribute stats
    /// live; simple restricts the volunteer to the score and clock.
    private func toggleMode(_ request: GameStatisticianRequest) async {
        scorerBusy = request.id
        scorerError = ""
        let next = request.mode == "advanced" ? "simple" : "advanced"
        do {
            _ = try await FunctionsService.shared.setScoringMode(requestId: request.id, mode: next)
            await loadScorerRequests()
        } catch {
            scorerError = error.localizedDescription
        }
        scorerBusy = ""
    }

    private func verify(_ game: Game) async {
        scorerBusy = game.id
        scorerError = ""
        do {
            _ = try await FunctionsService.shared.verifyGameStats(gameId: game.id)
            await vm.loadGames(teamId: teamId)
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
                    if game.statsStatus == "verified" {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                            .accessibilityLabel("Stats verified")
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


/// Read-only live game view for anyone who is not scoring it: parents following
/// the school, players on the bench, an AD checking in from the office.
///
/// Deliberately has no controls at all. The old path sent followers into the
/// scorer's screen, where every control was disabled — which reads as broken
/// rather than read-only.
struct SpectatorGameView: View {
    @State private var current: Game
    private let sportId: String
    private let ourName: String

    @State private var plays: [GamePlay] = []
    @State private var gameListener: ListenerRegistration?
    @State private var playsListener: ListenerRegistration?
    @State private var now = Date()

    /// Re-renders the countdown once a second without touching the network.
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(game: Game, sportId: String, ourName: String) {
        _current = State(initialValue: game)
        self.sportId = sportId
        self.ourName = ourName
    }

    private var clock: ClockConfig? { SportDefinitions.clock(for: sportId) }
    private var isSets: Bool {
        if case .sets = SportDefinitions.scoreModel(for: sportId) { return true }
        return false
    }

    private var remaining: Int { current.liveClockSeconds(now: now) }

    var body: some View {
        List {
            Section { scoreboard }

            Section("Play by play") {
                if plays.isEmpty {
                    Text(current.status == .live
                         ? "Waiting for the first play."
                         : "No plays were logged for this game.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(plays) { play in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(play.stampLabel(clock))
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
        .navigationTitle("Live")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let gameId = current.id
            gameListener = FirestoreService.shared.listenToGame(gameId: gameId) { game in
                guard let game else { return }
                Task { @MainActor in current = game }
            }
            playsListener = FirestoreService.shared.listenToPlays(gameId: gameId) { latest in
                Task { @MainActor in plays = latest }
            }
        }
        .onReceive(ticker) { time in now = time }
        .onDisappear {
            gameListener?.remove()
            playsListener?.remove()
        }
    }

    // MARK: Subviews

    private var scoreboard: some View {
        VStack(spacing: 10) {
            HStack {
                HStack(spacing: 6) {
                    if current.status == .live {
                        Circle().fill(.red).frame(width: 8, height: 8)
                    }
                    Text(current.status == .live ? "LIVE" : current.status.rawValue.uppercased())
                        .font(.caption2.bold())
                        .foregroundStyle(current.status == .live ? Color.red : Color.secondary)
                }
                Spacer()
                if let clock {
                    Text(clock.label(forPeriod: current.period))
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                }
            }

            HStack(alignment: .top, spacing: 4) {
                side(name: ourName.isEmpty ? "Us" : ourName,
                     value: isSets ? current.setsWon : current.teamScore,
                     leads: oursLead)
                Text("–").font(.title3).foregroundStyle(.secondary)
                side(name: current.opponent,
                     value: isSets ? current.setsLost : current.opponentScore,
                     leads: theirsLead)
            }

            if clock != nil {
                Text(clockString(remaining))
                    .font(.system(size: 44, weight: .bold, design: .monospaced))
                    .foregroundStyle(remaining == 0 ? Color.red : Color.primary)
            }

            if isSets, let latest = current.sets.last {
                Text("Set \(current.sets.count): \(latest["us"] ?? 0)–\(latest["them"] ?? 0)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private var oursLead: Bool {
        isSets ? current.setsWon > current.setsLost : current.teamScore > current.opponentScore
    }

    private var theirsLead: Bool {
        isSets ? current.setsLost > current.setsWon : current.opponentScore > current.teamScore
    }

    private func side(name: String, value: Int, leads: Bool) -> some View {
        VStack(spacing: 2) {
            Text(name.uppercased())
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text("\(value)")
                .font(.system(size: 46, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(leads ? Color.accentColor : Color.primary)
        }
        .frame(maxWidth: .infinity)
    }

    private func clockString(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}
