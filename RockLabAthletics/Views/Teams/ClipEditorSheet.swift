import SwiftUI
import AVKit

/// Marks one play from game film: in/out points, the player, and the action.
struct ClipEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let teamId: String
    let videoDuration: Double
    let roster: [RosterEntry]
    let clip: ReelClip
    let onSave: (ReelClip) -> Void

    @State private var start: Double
    @State private var end: Double
    @State private var playerId: String
    @State private var action: String
    @State private var playTag: String
    @State private var scrub: Double = 0
    @State private var player: AVPlayer?
    @State private var isPreviewing = false

    private let tags = ["Offense", "Defense", "Special Teams", "Other"]
    private let ticker = Timer.publish(every: 0.08, on: .main, in: .common).autoconnect()

    private var maxTime: Double { max(videoDuration, clip.endSeconds, 1) }

    init(teamId: String, videoDuration: Double, roster: [RosterEntry], clip: ReelClip, onSave: @escaping (ReelClip) -> Void) {
        self.teamId = teamId
        self.videoDuration = videoDuration
        self.roster = roster
        self.clip = clip
        self.onSave = onSave
        _start = State(initialValue: clip.startSeconds)
        _end = State(initialValue: max(clip.endSeconds, clip.startSeconds + 1))
        _playerId = State(initialValue: clip.playerId)
        _action = State(initialValue: clip.action)
        _playTag = State(initialValue: clip.playTag.isEmpty ? "Offense" : clip.playTag)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Film", value: clip.videoTitle)
                    Picker("Tag", selection: $playTag) {
                        ForEach(tags, id: \.self) { Text($0).tag($0) }
                    }
                }

                if clip.isExternal {
                    externalTrimSection
                } else {
                    localTrimSection
                }

                Section("Player") {
                    Picker("Player", selection: $playerId) {
                        Text("Unassigned").tag("")
                        ForEach(roster) { entry in
                            Text(entry.jerseyNumber.isEmpty
                                 ? entry.playerName
                                 : "#\(entry.jerseyNumber) \(entry.playerName)").tag(entry.id)
                        }
                    }
                }

                Section("Action") {
                    TextField("Describe the play (e.g. strip-sack, forced fumble)", text: $action, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(clip.action.isEmpty ? "New Clip" : "Edit Clip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(end <= start)
                }
            }
            .onAppear { preparePlayer() }
            .onDisappear { player?.pause() }
            .onReceive(ticker) { _ in
                guard isPreviewing, let player else { return }
                let current = CMTimeGetSeconds(player.currentTime())
                if current >= end {
                    player.pause()
                    isPreviewing = false
                }
            }
        }
    }
}

extension ClipEditorSheet {

    // MARK: Local film with a real player

    private var localTrimSection: some View {
        Section {
            if let player {
                VideoPlayer(player: player)
                    .frame(height: 190)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Position").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(ReelClip.clock(scrub)).font(.caption.monospacedDigit())
                }
                Slider(value: Binding(
                    get: { min(max(scrub, 0), maxTime) },
                    set: { newValue in
                        scrub = newValue
                        player?.seek(to: CMTime(seconds: newValue, preferredTimescale: 600),
                                     toleranceBefore: .zero, toleranceAfter: .zero)
                    }
                ), in: 0...maxTime)
            }

            HStack(spacing: 12) {
                Button {
                    start = min(scrub, end - 0.5)
                } label: {
                    Label("Set in", systemImage: "arrow.right.to.line")
                }
                .buttonStyle(.bordered)

                Button {
                    end = max(scrub, start + 0.5)
                } label: {
                    Label("Set out", systemImage: "arrow.left.to.line")
                }
                .buttonStyle(.bordered)

                Spacer()

                Button {
                    preview()
                } label: {
                    Label(isPreviewing ? "Stop" : "Play", systemImage: isPreviewing ? "stop.fill" : "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            HStack {
                Text("In").font(.caption).foregroundStyle(.secondary)
                Text(ReelClip.clock(start)).font(.caption.monospacedDigit())
                Spacer()
                Text("Out").font(.caption).foregroundStyle(.secondary)
                Text(ReelClip.clock(end)).font(.caption.monospacedDigit())
                Spacer()
                Text("Clip").font(.caption).foregroundStyle(.secondary)
                Text(ReelClip.clock(max(0, end - start))).font(.caption.monospacedDigit().bold())
            }
        } header: {
            Text("Trim the play")
        } footer: {
            Text("Scrub to the start of the play and tap Set in, then scrub to the end and tap Set out.")
                .font(.caption)
        }
    }

    // MARK: External link (YouTube / Hudl / NFHS)

    private var externalTrimSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Start").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(ReelClip.clock(start)).font(.caption.monospacedDigit())
                }
                Slider(value: $start, in: 0...max(1, end - 0.5))
                HStack {
                    Text("End").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(ReelClip.clock(end)).font(.caption.monospacedDigit())
                }
                Slider(value: $end, in: (start + 0.5)...maxTime)
            }
        } header: {
            Text("Mark the play time")
        } footer: {
            Text("Linked videos can't be trimmed on-device. The reel shows every clip with its start time and opens the source at that moment.")
                .font(.caption)
        }
    }

    // MARK: Actions

    private func preparePlayer() {
        guard !clip.isExternal, let url = URL(string: clip.videoURL) else { return }
        let avPlayer = AVPlayer(url: url)
        player = avPlayer
        scrub = start
        avPlayer.seek(to: CMTime(seconds: start, preferredTimescale: 600))
    }

    private func preview() {
        guard let player else { return }
        if isPreviewing {
            player.pause()
            isPreviewing = false
            return
        }
        player.seek(to: CMTime(seconds: start, preferredTimescale: 600),
                    toleranceBefore: .zero, toleranceAfter: .zero) { _ in
            player.play()
            isPreviewing = true
        }
    }

    private func save() {
        let entry = roster.first { $0.id == playerId }
        let saved = ReelClip(id: clip.id,
                             videoId: clip.videoId,
                             videoTitle: clip.videoTitle,
                             videoURL: clip.videoURL,
                             isExternal: clip.isExternal,
                             startSeconds: min(start, end),
                             endSeconds: max(start, end),
                             playerId: playerId,
                             playerName: entry?.playerName ?? "",
                             jersey: entry?.jerseyNumber ?? "",
                             action: action.trimmingCharacters(in: .whitespacesAndNewlines),
                             playTag: playTag)
        onSave(saved)
        dismiss()
    }
}

