import SwiftUI

/// The highlight reel studio — a game-by-game library of produced reels.
/// Videographers, AD, coaches and staff build reels; everyone (including
/// followers) can watch published reels.
struct HighlightStudioView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let sportId: String
    let teamName: String

    @State private var reels: [HighlightReel] = []
    @State private var access = TeamAccess()
    @State private var showingNew = false
    @State private var errorMessage: String?

    private var canEdit: Bool { access.canManageTeam || access.isStaff }

    var body: some View {
        List {
            if reels.isEmpty {
                Section {
                    Text(canEdit
                         ? "No reels yet. Tap + to build one from game film."
                         : "No highlight reels have been published yet.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Reels") {
                    ForEach(reels) { reel in
                        NavigationLink {
                            if canEdit {
                                ReelEditorView(teamId: teamId, teamName: teamName, sportId: sportId, reel: reel) {
                                    Task { await load() }
                                }
                            } else {
                                ReelPlayerView(teamId: teamId, reel: reel)
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ReelBanner(reel: reel, compact: true)
                                HStack(spacing: 8) {
                                    ReelStatusBadge(status: reel.status)
                                    Text("\(reel.views) views")
                                        .font(.caption2).foregroundStyle(.secondary)
                                    Spacer()
                                    if reel.clips.isEmpty {
                                        Text("No clips").font(.caption2).foregroundStyle(.orange)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .onDelete { index in
                        guard canEdit else { return }
                        for i in index {
                            let reel = reels[i]
                            Task { await delete(reel) }
                        }
                    }
                    .deleteDisabled(!canEdit)
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Highlight Reels")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingNew = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New highlight reel")
                }
            }
        }
        .sheet(isPresented: $showingNew) {
            NewReelSheet(teamId: teamId, teamName: teamName) { _ in
                Task { await load() }
            }
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await load()
        }
    }

    private func load() async {
        do {
            reels = try await HighlightService.shared.fetchReels(teamId: teamId, publishedOnly: !canEdit)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func delete(_ reel: HighlightReel) async {
        do {
            try await HighlightService.shared.deleteReel(teamId: teamId, reelId: reel.id)
            reels.removeAll { $0.id == reel.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Creates the reel shell (game info + team color banner).
struct NewReelSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let teamName: String
    let onCreated: (HighlightReel) -> Void

    @State private var title = "Game Highlights"
    @State private var homeTeam = ""
    @State private var awayTeam = ""
    @State private var gameDate = Date()
    @State private var colorHex = ReelColorPalette.colors.first?.hex ?? "#0A84FF"
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Reel") {
                    TextField("Title", text: $title)
                }
                Section("Game") {
                    TextField("Home team", text: $homeTeam)
                    TextField("Away team / opponent", text: $awayTeam)
                    DatePicker("Date", selection: $gameDate, displayedComponents: .date)
                }
                Section("Team color banner") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))], spacing: 10) {
                        ForEach(ReelColorPalette.colors, id: \.hex) { color in
                            Circle()
                                .fill(Color(reelHex: color.hex))
                                .frame(height: 34)
                                .overlay {
                                    if color.hex == colorHex {
                                        Image(systemName: "checkmark")
                                            .font(.caption.bold())
                                            .foregroundStyle(.white)
                                    }
                                }
                                .onTapGesture { colorHex = color.hex }
                        }
                    }
                    .padding(.vertical, 4)
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Highlight Reel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(isWorking)
                }
            }
            .onAppear {
                if homeTeam.isEmpty { homeTeam = teamName }
            }
        }
    }

    private func create() async {
        isWorking = true
        defer { isWorking = false }
        let reel = HighlightReel(
            teamId: teamId,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            homeTeam: homeTeam.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? teamName : homeTeam,
            awayTeam: awayTeam.trimmingCharacters(in: .whitespacesAndNewlines),
            gameDate: gameDate,
            teamColorHex: colorHex,
            createdByName: auth.user?.displayName ?? "")
        do {
            try await HighlightService.shared.saveReel(reel)
            AnalyticsService.log(AnalyticsService.Event.reelCreated, [
                "color": colorHex,
            ])
            onCreated(reel)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

