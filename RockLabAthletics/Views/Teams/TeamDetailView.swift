import SwiftUI
import FirebaseFirestore

struct TeamDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let team: Team
    @State private var showingInvite = false
    @State private var invites: [Invitation] = []
    @State private var myMembership: TeamMembership?
    @State private var media: [TeamMedia] = []
    @State private var showingAddMedia = false
    @State private var wins = 0
    @State private var losses = 0
    @State private var districtTeams: [DistrictTeam] = []
    @State private var liveGames: [Game] = []
    @State private var liveBroadcasts: [Broadcast] = []
    @State private var scoringVM = StatsViewModel()
    @State private var gamesListener: ListenerRegistration?
    @State private var broadcastsListener: ListenerRegistration?
    @State private var publishedReels: [HighlightReel] = []
    @State private var showingRollover = false
    @State private var rolloverMessage = ""
    @Environment(\.openURL) private var openURL

    private var canInvite: Bool {
        auth.user?.role == .ad || myMembership?.role == .coach
    }

    private var isFollowing: Bool {
        myMembership?.role == .follower
    }

    /// Members (not followers) see roster/trips/fundraising; followers see games only.
    private var showsTeamContent: Bool {
        if auth.user?.role == .ad { return true }
        guard let role = myMembership?.role else { return false }
        return role != .follower
    }

    private var showsFollowButton: Bool {
        if auth.user?.role == .ad { return false }
        if myMembership == nil { return true }
        if myMembership?.role == .follower { return true }
        return false
    }

    /// Players and parents sign & submit their own forms.
    private var canSubmitForms: Bool {
        myMembership?.role == .player || myMembership?.role == .parent
    }

    /// AD/coach, or staff with the `forms` permission, manage team forms.
    private var canManageForms: Bool {
        if auth.user?.role == .ad { return true }
        if myMembership?.role == .coach { return true }
        if myMembership?.role == .staff {
            return myMembership?.permissions.contains(StaffPermission.forms.rawValue) ?? false
        }
        return false
    }

    /// AD/coach or any staff member can add team photos.
    private var canAddMedia: Bool {
        if auth.user?.role == .ad { return true }
        if myMembership?.role == .coach { return true }
        if myMembership?.role == .staff { return true }
        return false
    }

    var body: some View {
        List {
            if !media.isEmpty {
                TeamMediaStrip(media: media)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            if !liveGames.isEmpty || !liveBroadcasts.isEmpty {
                Section {
                    HStack(spacing: 6) {
                        Image(systemName: "record.circle.fill")
                            .foregroundStyle(.red)
                            .symbolEffect(.pulse, options: .repeating)
                        Text("LIVE NOW")
                            .font(.caption.bold())
                            .foregroundStyle(.red)
                    }
                    ForEach(liveGames) { game in
                        NavigationLink {
                            liveScoringDestination(for: game)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(game.isHome ? "vs" : "@") \(game.opponent)").font(.headline)
                                    Text("\(game.teamScore)–\(game.opponentScore)")
                                        .font(.subheadline.bold())
                                        .foregroundStyle(.red)
                                }
                                Spacer()
                                Label("Watch", systemImage: "play.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                    ForEach(liveBroadcasts) { broadcast in
                        if let url = broadcast.watchURL {
                            Button {
                                openURL(url)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(broadcast.title).font(.headline)
                                        Text("Live stream").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Label("Watch", systemImage: "arrow.up.right.square")
                                        .foregroundStyle(.red)
                                }
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                }
            }
            Section {
                if showsTeamContent {
                    NavigationLink { RosterView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Roster", systemImage: "person.3")
                    }
                    if canSubmitForms {
                        NavigationLink { MyFormsView(teamId: team.id, sportId: team.sportId) } label: {
                            Label("My Forms", systemImage: "signature")
                        }
                        NavigationLink { MyPlayerProfileView(teamId: team.id, sportId: team.sportId) } label: {
                            Label("My player profile", systemImage: "person.crop.circle")
                        }
                    }
                }
                NavigationLink { GamesView(teamId: team.id, sportId: team.sportId) } label: {
                    Label("Games", systemImage: "sportscourt")
                }
                NavigationLink { BroadcastsView(teamId: team.id) } label: {
                    Label("Broadcasts", systemImage: "dot.radiowaves.left.and.right")
                }
                if showsTeamContent {
                    NavigationLink { TripsView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Trips", systemImage: "bus")
                    }
                    NavigationLink { FundraisingView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Fundraising", systemImage: "dollarsign.circle")
                    }
                    NavigationLink { VolunteerView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Volunteer", systemImage: "calendar.badge.clock")
                    }
                    NavigationLink { MessagesView(teamId: team.id, sportId: team.sportId, schoolId: team.schoolId) } label: {
                        Label("Messages", systemImage: "envelope")
                    }
                }
            }

            if !publishedReels.isEmpty || showsTeamContent {
                Section("Highlight reels") {
                    ForEach(publishedReels.prefix(3)) { reel in
                        NavigationLink {
                            ReelPlayerView(teamId: team.id, reel: reel)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                ReelBanner(reel: reel, compact: true)
                                HStack(spacing: 8) {
                                    Text("\(reel.clips.count) clips").font(.caption2).foregroundStyle(.secondary)
                                    Text("·").font(.caption2).foregroundStyle(.secondary)
                                    Text("\(reel.views) views").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    NavigationLink {
                        HighlightStudioView(teamId: team.id, sportId: team.sportId, teamName: team.sportName)
                    } label: {
                        Label(publishedReels.isEmpty ? "Highlight reels" : "All highlight reels",
                              systemImage: "film.stack")
                    }
                }
            }

            Section("Record") {
                HStack {
                    LabeledContent("Wins", value: "\(wins)")
                    Divider()
                    LabeledContent("Losses", value: "\(losses)")
                }
            }

            if !districtTeams.isEmpty {
                Section("District teams") {
                    ForEach(districtTeams) { dt in
                        NavigationLink {
                            MatchupView(
                                teamId: team.id,
                                myName: "\(team.sportName) \(team.level)",
                                opponentTeamId: dt.id,
                                opponentName: dt.teamName,
                                sportId: team.sportId)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(dt.teamName).font(.headline)
                                Text(dt.schoolName).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            if canInvite {
                Section("Team management") {
                    NavigationLink { MembersView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Members & permissions", systemImage: "person.2.badge.gearshape")
                    }
                    NavigationLink { ParentLinkRequestsView(teamId: team.id) } label: {
                        Label("Parent link requests", systemImage: "person.badge.key")
                    }
                    NavigationLink { FollowersView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Followers", systemImage: "person.2")
                    }
                    Button {
                        showingInvite = true
                    } label: {
                        Label("Invite a coach", systemImage: "person.badge.plus")
                    }
                    Button {
                        showingRollover = true
                    } label: {
                        Label("Start next season", systemImage: "calendar.badge.plus")
                    }

                    let pendingInvites = invites.filter { $0.status == "pending" }
                    if pendingInvites.isEmpty {
                        Text("No pending invitations.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(pendingInvites) { invite in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(invite.email) · \(invite.role.displayName)")
                                        .font(.subheadline)
                                    Text(invite.status.capitalized)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button(role: .destructive) {
                                    Task { await deleteInvite(invite) }
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                    }
                }
            }

            if canManageForms {
                Section("Forms") {
                    NavigationLink { TeamFormsView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("Manage forms", systemImage: "doc.text")
                    }
                }
            }

            if showsFollowButton {
                Section {
                    Button(isFollowing ? "Unfollow team" : "Follow team") {
                        Task { await toggleFollow() }
                    }
                }
            }

            if auth.user?.role == .parent {
                Section("Parent") {
                    NavigationLink { ParentLinkView(teamId: team.id) } label: {
                        Label("Link to a player", systemImage: "link")
                    }
                }
            }

            Section("Join code") {
                HStack {
                    Text("Share this code so players, parents, and followers can join.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(team.joinCode.isEmpty ? "—" : team.joinCode)
                        .font(.title3.bold().monospaced())
                }
            }
        }
        .navigationTitle("\(team.sportName) \(team.level)")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: team.sportId))
        }
        .toolbar {
            if canAddMedia {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAddMedia = true } label: { Image(systemName: "photo.badge.plus") }
                    .accessibilityLabel("Add team photo")
                }
            }
        }
        .sheet(isPresented: $showingInvite) {
            InviteCoachSheet(team: team) {
                Task { await loadInvites() }
            }
        }
        .sheet(isPresented: $showingAddMedia) {
            AddMediaSheet(teamId: team.id) {
                Task { await loadMedia() }
            }
        }
        .sheet(isPresented: $showingRollover) {
            RolloverSeasonSheet(team: team) { message in
                rolloverMessage = message
            }
        }
        .alert("Next season", isPresented: .constant(!rolloverMessage.isEmpty)) {
            Button("OK") { rolloverMessage = "" }
        } message: {
            Text(rolloverMessage)
        }
        .onAppear { startLiveListeners() }
        .onDisappear { stopLiveListeners() }
        .task {
            await loadInvites()
            await loadMyMembership()
            await loadMedia()
            await loadTeamStats()
            await loadPublishedReels()
        }
        .refreshable {
            await loadTeamStats()
            await loadPublishedReels()
        }
    }

    private func loadPublishedReels() async {
        publishedReels = (try? await HighlightService.shared.fetchReels(teamId: team.id, publishedOnly: true)) ?? []
    }

    private func loadInvites() async {
        do {
            invites = try await FirestoreService.shared.fetchTeamInvitations(teamId: team.id)
        } catch {
            // keep the list empty on error
        }
    }

    private func deleteInvite(_ invite: Invitation) async {
        do {
            _ = try await FunctionsService.shared.deleteInvitation(invitationId: invite.id)
            await loadInvites()
        } catch {
            // leave list unchanged on failure
        }
    }

    private func loadMyMembership() async {
        guard let uid = auth.user?.id else { return }
        myMembership = try? await FirestoreService.shared.fetchMembership(teamId: team.id, userId: uid)
    }

    private func loadMedia() async {
        media = (try? await FirestoreService.shared.fetchTeamMedia(teamId: team.id)) ?? []
    }

    private func loadTeamStats() async {
        let r = (try? await FirestoreService.shared.fetchTeamRecord(teamId: team.id)) ?? (wins: 0, losses: 0)
        wins = r.wins
        losses = r.losses
        districtTeams = (try? await FirestoreService.shared.fetchDistrictTeams(schoolId: team.schoolId)) ?? []
    }

    private func startLiveListeners() {
        gamesListener?.remove()
        gamesListener = FirestoreService.shared.listenToGames(teamId: team.id) { games in
            let live = games.filter { $0.status == .live }
            Task { @MainActor in self.liveGames = live }
        }
        broadcastsListener?.remove()
        broadcastsListener = FirestoreService.shared.listenToBroadcasts(teamId: team.id) { broadcasts in
            let live = broadcasts.filter { $0.isLive }
            Task { @MainActor in self.liveBroadcasts = live }
        }
    }

    private func stopLiveListeners() {
        gamesListener?.remove()
        broadcastsListener?.remove()
        gamesListener = nil
        broadcastsListener = nil
    }

    @ViewBuilder
    private func liveScoringDestination(for game: Game) -> some View {
        ScoringView(game: game, teamId: team.id, sportId: team.sportId, vm: scoringVM)
    }

    private func toggleFollow() async {
        guard let uid = auth.user?.id else { return }
        do {
            if isFollowing {
                try await FirestoreService.shared.removeMember(teamId: team.id, userId: uid)
            } else {
                try await FirestoreService.shared.followTeam(
                    teamId: team.id, userId: uid,
                    name: auth.user?.displayName ?? "", email: auth.user?.email ?? "")
            }
            await loadMyMembership()
        } catch {
            // ignore
        }
    }
}






// MARK: - Season rollover

/// Creates next season's team from an existing one.
///
/// The copy is deliberately partial: athletes, guardian contacts and coaches
/// carry over, but forms and injury clearances do not, because those expire with
/// the season. Every athlete must be re-cleared — that is the compliance-safe
/// default, not an oversight.
private struct RolloverSeasonSheet: View {
    let team: Team
    var onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var season = ""
    @State private var busy = false
    @State private var error = ""

    private var canSubmit: Bool {
        !busy && !season.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("New season") {
                    TextField("e.g. Fall 2027", text: $season)
                        .textInputAutocapitalization(.words)
                }

                Section("What carries over") {
                    Label("Athletes and guardian contacts", systemImage: "checkmark.circle.fill")
                    Label("Coaches and staff", systemImage: "checkmark.circle.fill")
                    Label("Forms and injury clearances", systemImage: "xmark.circle")
                        .foregroundStyle(.secondary)
                }

                Section {
                    Text("Forms and injury status reset, so every athlete must be cleared again for the new season. Existing photos, schedules and results stay with the old team.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if !error.isEmpty {
                    Section {
                        Text(error).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Start next season")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Working…" : "Create") {
                        Task { await run() }
                    }
                    .disabled(!canSubmit)
                }
            }
            .onAppear {
                if season.isEmpty { season = suggestedSeason }
            }
        }
    }

    /// A guess at the next season based on today's date. Coaches can overwrite it.
    private var suggestedSeason: String {
        let month = Calendar.current.component(.month, from: Date())
        let year = Calendar.current.component(.year, from: Date())
        switch month {
        case 3...6: return "Fall \(year)"
        case 7...11: return "Winter \(year + 1)"
        default: return "Spring \(year)"
        }
    }

    private func run() async {
        let trimmed = season.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        error = ""
        do {
            let result = try await FunctionsService.shared.rolloverTeam(teamId: team.id, newSeason: trimmed)
            let existed = result["existed"] as? Bool ?? false
            let roster = result["rosterCount"] as? Int ?? 0
            onDone(existed
                   ? "\(team.sportName) \(trimmed) already exists — nothing was created."
                   : "Created \(team.sportName) \(trimmed) with \(roster) athlete(s).")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

