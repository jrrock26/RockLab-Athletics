import SwiftUI

struct HomeView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = HomeViewModel()

    private var myTeams: [Team] {
        let ids = auth.user?.teamIds ?? []
        return vm.teams.filter { ids.contains($0.id) }
    }

    private var role: UserRole { auth.user?.role ?? .follower }
    private var isAdmin: Bool { role == .ad }

    var body: some View {
        NavigationStack {
            List {
                header
                dashboard
            }
            .navigationTitle("Home")
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.load(schoolId: schoolId)
                }
            }
        }
    }

    // MARK: Role-specific dashboard

    @ViewBuilder
    private var dashboard: some View {
        switch role {
        case .ad:
            schoolSection
            adminSummary
            adminLinks
            organizationSection
        case .coach:
            teamsSection("Coaching")
            organizationSection
        case .staff:
            teamsSection("Your teams")
            organizationSection
        case .player:
            teamsSection("Your teams")
            formsSection
            organizationSection
        case .parent:
            teamsSection("Your child's teams")
            formsSection
            organizationSection
        case .follower:
            FollowedOrgSection()
            organizationSection
        }
    }

    // MARK: Sections

    private var header: some View {
        Section {
            NavigationLink { ProfileView() } label: {
                HStack(spacing: 12) {
                    if let urlString = auth.user?.photoURL, !urlString.isEmpty, let url = URL(string: urlString) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.accentColor.opacity(0.3)
                        }
                        .frame(width: 44, height: 44)
                        .clipShape(Circle())
                    } else {
                        Text(initials)
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Color.accentColor, in: Circle())
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(greeting)
                            .font(.title3.bold())
                            .foregroundStyle(.primary)
                        Text(roleSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var initials: String {
        let parts = greeting.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters)
    }

    private var greeting: String {
        let name = auth.user?.displayName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? "Welcome" : "Hi, \(name)"
    }

    private var roleSubtitle: String {
        let count = myTeams.count
        switch role {
        case .ad: return "Athletic Director"
        case .coach: return "Coach · \(count) team\(count == 1 ? "" : "s")"
        case .staff: return "Staff · \(count) team\(count == 1 ? "" : "s")"
        case .player: return "Player · \(count) team\(count == 1 ? "" : "s")"
        case .parent: return "Parent / Guardian"
        case .follower: return "Following \(count) team\(count == 1 ? "" : "s")"
        }
    }

    @ViewBuilder
    private var schoolSection: some View {
        if let school = auth.school {
            Section("Your School") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(school.name).font(.headline)
                    if !school.mascot.isEmpty {
                        Text(school.mascot).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if school.activeSports.isEmpty {
                    Text("No sports selected yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(school.activeSports) { sport in
                        NavigationLink {
                            SportGendersView(schoolId: school.id, sport: sport)
                        } label: {
                            Label("\(sport.emoji) \(sport.name)", systemImage: "sportscourt")
                        }
                    }
                }
            }
        }
    }

    private var adminSummary: some View {
        Section("Organization overview") {
            summaryCard(title: "Teams", value: "\(vm.teamCount)", systemImage: "person.3.fill", tint: .blue)
            summaryCard(title: "Players", value: "\(vm.playerCount)", systemImage: "person.fill", tint: .green)
            summaryCard(title: "Upcoming Games", value: "\(vm.upcomingGameCount)", systemImage: "calendar", tint: .orange)
        }
    }

    private var adminLinks: some View {
        Section("Administration") {
            NavigationLink { PeopleView() } label: {
                Label("Manage people", systemImage: "person.2")
            }
            NavigationLink { TeamsView() } label: {
                Label("Manage teams", systemImage: "sportscourt")
            }
            NavigationLink { ADDirectoryView() } label: {
                Label("AD Directory", systemImage: "building.columns")
            }
        }
    }

    private func teamsSection(_ title: String) -> some View {
        Section(title) {
            if myTeams.isEmpty {
                Text("No teams yet.").foregroundStyle(.secondary)
            } else {
                ForEach(myTeams) { team in
                    teamRow(team)
                }
            }
        }
    }

    private var formsSection: some View {
        Section("Forms to sign") {
            if myTeams.isEmpty {
                Text("No forms.").foregroundStyle(.secondary)
            } else {
                ForEach(myTeams) { team in
                    NavigationLink { MyFormsView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("\(team.sportName) \(team.level)", systemImage: "signature")
                    }
                }
            }
        }
    }

    private var noTeamSection: some View {
        Section {
            Label("You're not following a team yet.", systemImage: "info.circle")
                .foregroundStyle(.secondary)
            Text("Browse the organization below and tap a team to follow it.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var organizationSection: some View {
        let orgName = auth.school?.name ?? (isAdmin ? "All Teams" : "Organization")
        return Section(orgName) {
            if vm.teams.isEmpty {
                Text("No teams yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(vm.teams) { team in
                    teamRow(team)
                }
            }
        }
    }

    private func teamRow(_ team: Team) -> some View {
        NavigationLink { TeamDetailView(team: team) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(team.sportName) \(team.level)").font(.headline)
                Text("\(team.season) · \(team.gender)").font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func summaryCard(title: String, value: String, systemImage: String, tint: Color) -> some View {
        HStack {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(value).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }
}


// MARK: - Follower: organization dashboard

/// The follower experience.
///
/// A follower follows an **organization**, not individual teams: search the
/// school, tap Follow, and the dashboard aggregates everything public across
/// every team in that school — upcoming games, this week's results, fundraisers,
/// and the team list to browse. Nothing here exposes rosters, forms, injuries,
/// RSVP, chat, or eligibility; those stay gated behind a team membership.
struct FollowedOrgSection: View {
    @Environment(AuthViewModel.self) private var auth

    @State private var schools: [School] = []
    @State private var teams: [Team] = []
    @State private var games: [Game] = []
    @State private var fundraisers: [Fundraiser] = []
    @State private var searchTerm = ""
    @State private var results: [School] = []
    @State private var loading = true
    @State private var busyId = ""
    @State private var errorMessage = ""

    private var teamLookup: [String: Team] {
        Dictionary(teams.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    /// Next few games from today onward, soonest first. Live games are excluded
    /// because they get their own section — showing one game in two places makes
    /// the list look stale.
    private var upcoming: [Game] {
        let cutoff = Date().addingTimeInterval(-3600)
        return Array(games
            .filter { $0.status != .final && $0.status != .live && $0.date >= cutoff }
            .sorted { $0.date < $1.date }
            .prefix(6))
    }

    /// Games in progress right now, across every followed school.
    private var liveGames: [Game] {
        games.filter { $0.status == .live }.sorted { $0.date < $1.date }
    }

    /// Finals from the last seven days, most recent first.
    private var recentResults: [Game] {
        let cutoff = Date().addingTimeInterval(-7 * 24 * 3600)
        return Array(games
            .filter { $0.status == .final && $0.date >= cutoff }
            .sorted { $0.date > $1.date }
            .prefix(8))
    }

    private var activeFundraisers: [Fundraiser] {
        Array(fundraisers.sorted { $0.raised > $1.raised }.prefix(5))
    }

    var body: some View {
        Group {
            if loading {
                Section { ProgressView() }
            } else {
                schoolSection
                if !liveGames.isEmpty { liveSection }
                if !upcoming.isEmpty { upcomingSection }
                if !recentResults.isEmpty { resultsSection }
                if !activeFundraisers.isEmpty { fundraiserSection }
                if !schools.isEmpty { teamsSectionForSchools }
                if !errorMessage.isEmpty {
                    Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
                }
            }
        }
        .task { await load() }
    }

    // MARK: Sections

    @ViewBuilder
    private var schoolSection: some View {
        Section {
            TextField("Search for your school", text: $searchTerm)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .onSubmit { Task { await search() } }

            ForEach(results) { school in
                Button {
                    Task { await follow(school) }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(school.name).foregroundStyle(.primary)
                            if !school.mascot.isEmpty {
                                Text(school.mascot)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if busyId == school.id {
                            ProgressView()
                        } else {
                            Text("Follow").font(.caption.bold()).foregroundStyle(.blue)
                        }
                    }
                }
                .disabled(!busyId.isEmpty)
            }
        } header: {
            Text(schools.isEmpty ? "Follow your school" : "Find another school")
        } footer: {
            if schools.isEmpty {
                Text("Follow a school to see its games, scores, fundraisers and announcements. You do not need to be on a team.")
            }
        }

        if !schools.isEmpty {
            Section("Following") {
                ForEach(schools) { school in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(school.name).font(.headline)
                            if !school.mascot.isEmpty {
                                Text(school.mascot).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button("Unfollow") {
                            Task { await unfollow(school) }
                        }
                        .font(.caption)
                        .buttonStyle(.borderless)
                        .disabled(!busyId.isEmpty)
                    }
                }
            }
        }
    }
}


extension FollowedOrgSection {

    private var upcomingSection: some View {
        Section("Upcoming games") {
            ForEach(upcoming) { game in
                spectatorLink(game, showScore: false)
            }
        }
    }

    private var liveSection: some View {
        Section("Live now") {
            ForEach(liveGames) { game in
                spectatorLink(game, showScore: true)
            }
        }
    }

    /// Opens the read-only live view. A follower has no scoring rights, so sending
    /// them to the scorer's screen showed a wall of disabled controls.
    @ViewBuilder
    private func spectatorLink(_ game: Game, showScore: Bool) -> some View {
        if let team = teamLookup[game.teamId] {
            NavigationLink {
                SpectatorGameView(game: game, sportId: team.sportId, ourName: team.title)
            } label: {
                gameRow(game, showScore: showScore)
            }
        } else {
            gameRow(game, showScore: showScore)
        }
    }

    private var resultsSection: some View {
        Section("This week's results") {
            ForEach(recentResults) { game in
                spectatorLink(game, showScore: true)
            }
        }
    }

    private var fundraiserSection: some View {
        Section("Fundraisers") {
            ForEach(activeFundraisers) { fundraiser in
                VStack(alignment: .leading, spacing: 2) {
                    Text(fundraiser.title).font(.subheadline.weight(.semibold))
                    Text(teamLookup[fundraiser.teamId]?.title ?? "")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var teamsSectionForSchools: some View {
        Section("Teams") {
            ForEach(schools) { school in
                let schoolTeams = teams.filter { $0.schoolId == school.id }
                    .sorted { $0.title < $1.title }
                ForEach(schoolTeams) { team in
                    NavigationLink {
                        TeamDetailView(team: team)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(team.title)
                            Text(team.season.isEmpty ? "Season not set" : team.season)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func gameRow(_ game: Game, showScore: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(teamLookup[game.teamId]?.title ?? "Team")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Text("\(game.isHome ? "vs" : "@") \(game.opponent)")
                    .font(.subheadline)
                Spacer()
                if showScore {
                    Text("\(game.teamScore)–\(game.opponentScore)")
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                        .foregroundStyle(game.teamScore > game.opponentScore ? .green : .secondary)
                } else {
                    Text(game.date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: Data

    private func load() async {
        guard let userId = auth.user?.id else { loading = false; return }
        do {
            schools = try await FirestoreService.shared.fetchFollowedSchools(userId: userId)
            var allTeams: [Team] = []
            for school in schools {
                allTeams += (try? await FirestoreService.shared.fetchTeams(schoolId: school.id)) ?? []
            }
            teams = allTeams
            let ids = allTeams.map(\.id)
            games = (try? await FirestoreService.shared.fetchGames(teamIds: ids)) ?? []
            fundraisers = (try? await FirestoreService.shared.fetchFundraisers(teamIds: ids)) ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }

    private func search() async {
        do {
            results = try await FirestoreService.shared.searchSchools(matching: searchTerm)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func follow(_ school: School) async {
        guard let user = auth.user else { return }
        busyId = school.id
        do {
            try await FirestoreService.shared.followSchool(
                schoolId: school.id,
                userId: user.id,
                name: user.displayName,
                email: user.email)
            searchTerm = ""
            results = []
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        busyId = ""
    }

    private func unfollow(_ school: School) async {
        guard let user = auth.user else { return }
        busyId = school.id
        do {
            try await FirestoreService.shared.unfollowSchool(schoolId: school.id, userId: user.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        busyId = ""
    }
}

