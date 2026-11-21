import SwiftUI

/// The reel workbench: game info, ordered clips, publish controls.
struct ReelEditorView: View {
    let teamId: String
    let teamName: String
    let sportId: String
    let onClosed: () -> Void

    @State private var reel: HighlightReel
    @State private var roster: [RosterEntry] = []
    @State private var showingLibrary = false
    @State private var showingDetails = false
    @State private var editingClip: ReelClip?
    @State private var errorMessage: String?
    @State private var isSaving = false

    init(teamId: String, teamName: String, sportId: String, reel: HighlightReel, onClosed: @escaping () -> Void) {
        self.teamId = teamId
        self.teamName = teamName
        self.sportId = sportId
        self.onClosed = onClosed
        _reel = State(initialValue: reel)
    }

    var body: some View {
        List {
            Section {
                ReelBanner(reel: reel)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                Button {
                    showingDetails = true
                } label: {
                    Label("Edit game info & banner", systemImage: "slider.horizontal.3")
                }
            }

            Section {
                if reel.clips.isEmpty {
                    Text("Add clips from your game film to build the reel.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(reel.clips.enumerated()), id: \.element.id) { index, clip in
                        Button {
                            editingClip = clip
                        } label: {
                            clipRow(index: index, clip: clip)
                        }
                        .buttonStyle(.plain)
                    }
                    .onMove { source, destination in
                        reel.clips.move(fromOffsets: source, toOffset: destination)
                        Task { await save() }
                    }
                    .onDelete { index in
                        reel.clips.remove(atOffsets: index)
                        Task { await save() }
                    }
                }
                Button {
                    showingLibrary = true
                } label: {
                    Label("Add clip from game film", systemImage: "scissors")
                }
                .disabled(!reel.canAddClip)
            } header: {
                HStack {
                    Text("Clips")
                    Spacer()
                    Text("\(reel.clips.count)/\(HighlightReel.maxClips)")
                        .font(.caption2)
                        .foregroundStyle(reel.canAddClip ? Color.secondary : Color.orange)
                    if reel.durationSeconds > 0 {
                        Text(reel.durationText).font(.caption2)
                    }
                }
            } footer: {
                if reel.canAddClip {
                    Text("Drag to reorder · swipe to delete · tap a clip to edit the player or action.")
                        .font(.caption)
                } else {
                    Text("That's the 20-clip limit — about a 2-minute reel. Delete a clip to swap one out.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            publishSection

            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle(reel.title.isEmpty ? "Reel" : reel.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if isSaving { ProgressView() }
            }
            if !reel.clips.isEmpty {
                ToolbarItem(placement: .topBarTrailing) { EditButton() }
            }
        }
        .sheet(isPresented: $showingLibrary) {
            VideoLibrarySheet(teamId: teamId) { video in
                showingLibrary = false
                editingClip = ReelClip(videoId: video.id,
                                       videoTitle: video.title,
                                       videoURL: video.urlString,
                                       isExternal: video.isExternalLink,
                                       startSeconds: 0,
                                       endSeconds: min(max(video.durationSeconds, 1), 10),
                                       playerId: "", playerName: "", jersey: "",
                                       action: "", playTag: "Offense")
            }
        }
        .sheet(item: $editingClip) { clip in
            ClipEditorSheet(teamId: teamId,
                            videoDuration: videoDuration(for: clip),
                            roster: roster,
                            clip: clip) { saved in
                if let index = reel.clips.firstIndex(where: { $0.id == saved.id }) {
                    reel.clips[index] = saved
                } else if reel.canAddClip {
                    reel.clips.append(saved)
                    AnalyticsService.log(AnalyticsService.Event.clipAdded, [
                        "play_tag": saved.playTag,
                        "is_external": saved.isExternal,
                    ])
                } else {
                    // Guard here as well as on the button: the sheet can be open
                    // while the reel is already at the limit.
                    errorMessage = "This reel already has \(HighlightReel.maxClips) clips."
                }
                Task { await save() }
            }
        }
        .sheet(isPresented: $showingDetails) {
            EditReelDetailsSheet(reel: reel) { updated in
                reel = updated
                Task { await save() }
            }
        }
        .task {
            roster = (try? await FirestoreService.shared.fetchRoster(teamId: teamId)) ?? []
        }
        .onDisappear { onClosed() }
    }
}

extension ReelEditorView {

    private var publishSection: some View {
        Section {
            NavigationLink {
                ReelPlayerView(teamId: teamId, reel: reel)
            } label: {
                Label("Preview reel", systemImage: "play.rectangle.fill")
            }
            .disabled(reel.clips.isEmpty)

            Toggle(isOn: Binding(
                get: { reel.status == .published },
                set: { publish in
                    reel.status = publish ? .published : .draft
                    reel.publishedAt = publish ? Date() : nil
                    if publish {
                        AnalyticsService.log(AnalyticsService.Event.reelPublished, [
                            "clip_count": reel.clips.count,
                        ])
                    }
                    Task { await save() }
                }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Published")
                    Text("Published reels appear on the team dashboard for followers and parents.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .disabled(reel.clips.isEmpty)

            ShareLink(item: "\(reel.homeTeam) vs \(reel.awayTeam) — \(reel.gameDateText) highlight reel (\(reel.clips.count) clips)") {
                Label("Share reel", systemImage: "square.and.arrow.up")
            }
        } header: {
            Text("Publish & share")
        }
    }

    @ViewBuilder
    private func clipRow(index: Int, clip: ReelClip) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(index + 1)")
                .font(.caption.bold())
                .frame(width: 20, alignment: .center)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(clip.playerName.isEmpty ? "Unassigned" : "#\(clip.jersey) \(clip.playerName)")
                        .font(.subheadline.weight(.semibold))
                    Text(clip.playTag)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.12))
                        .clipShape(Capsule())
                }
                if !clip.action.isEmpty {
                    Text(clip.action).font(.caption).foregroundStyle(.primary)
                }
                Text("\(clip.videoTitle) · \(clip.timeRangeText)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "line.3.horizontal")
                .font(.caption).foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    private func videoDuration(for clip: ReelClip) -> Double {
        // External links have no local duration; allow up to 10 minutes of marks.
        clip.isExternal ? 600 : max(clip.endSeconds, 1)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await HighlightService.shared.saveReel(reel)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Edits the reel's game information and banner color.
struct EditReelDetailsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let reel: HighlightReel
    let onSave: (HighlightReel) -> Void

    @State private var title = ""
    @State private var homeTeam = ""
    @State private var awayTeam = ""
    @State private var gameDate = Date()
    @State private var colorHex = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Reel") { TextField("Title", text: $title) }
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
            }
            .navigationTitle("Reel Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var updated = reel
                        updated.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
                        updated.homeTeam = homeTeam.trimmingCharacters(in: .whitespacesAndNewlines)
                        updated.awayTeam = awayTeam.trimmingCharacters(in: .whitespacesAndNewlines)
                        updated.gameDate = gameDate
                        updated.teamColorHex = colorHex
                        onSave(updated)
                        dismiss()
                    }
                }
            }
            .onAppear {
                title = reel.title
                homeTeam = reel.homeTeam
                awayTeam = reel.awayTeam
                gameDate = reel.gameDate
                colorHex = reel.teamColorHex
            }
        }
    }
}

