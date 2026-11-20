import SwiftUI
import AVKit

/// Plays a finished reel clip-by-clip with the team-color banner overlay.
struct ReelPlayerView: View {
    let teamId: String
    let reel: HighlightReel

    @Environment(\.openURL) private var openURL
    @State private var index = 0
    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var didCountView = false

    private let ticker = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()

    private var clip: ReelClip? {
        reel.clips.indices.contains(index) ? reel.clips[index] : nil
    }

    var body: some View {
        VStack(spacing: 0) {
            ReelBanner(reel: reel, compact: true)
                .padding(.horizontal)
                .padding(.top, 8)

            stage
                .frame(maxWidth: .infinity)
                .background(Color.black)

            clipStrip

            infoPanel
                .padding(.horizontal)

            controls
                .padding(.horizontal)
                .padding(.bottom, 8)

            Spacer(minLength: 0)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(reel.title.isEmpty ? "Highlight Reel" : reel.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: "\(reel.homeTeam) vs \(reel.awayTeam) — \(reel.gameDateText) highlight reel") {
                    Image(systemName: "square.and.arrow.up")
                }
            }
        }
        .onAppear {
            loadClip()
            AnalyticsService.log(AnalyticsService.Event.reelViewed, [
                "clip_count": reel.clips.count,
                "is_published": reel.status == .published,
            ])
            if !didCountView {
                didCountView = true
                Task { try? await HighlightService.shared.incrementViews(teamId: teamId, reelId: reel.id) }
            }
        }
        .onDisappear { player?.pause() }
        .onReceive(ticker) { _ in
            guard isPlaying, let player, let clip, !clip.isExternal else { return }
            if CMTimeGetSeconds(player.currentTime()) >= clip.endSeconds {
                advance()
            }
        }
    }
}

extension ReelPlayerView {

    @ViewBuilder
    private var stage: some View {
        if let clip, clip.isExternal {
            VStack(spacing: 12) {
                Image(systemName: "link")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                Text(clip.videoTitle).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                Text("Clip starts at \(ReelClip.clock(clip.startSeconds))")
                    .font(.caption).foregroundStyle(.white.opacity(0.6))
                Button {
                    if let url = externalURL(for: clip) { openURL(url) }
                } label: {
                    Label("Open clip", systemImage: "arrow.up.right.square")
                }
                .buttonStyle(.borderedProminent)
                Text("Linked film plays in its source app.")
                    .font(.caption2).foregroundStyle(.white.opacity(0.5))
            }
            .frame(height: 240)
            .frame(maxWidth: .infinity)
            .background(Color.black)
        } else if let player {
            VideoPlayer(player: player)
                .frame(height: 240)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .background(Color.black)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "film").font(.largeTitle).foregroundStyle(.white.opacity(0.5))
                Text(reel.clips.isEmpty ? "No clips in this reel yet." : "Clip unavailable")
                    .font(.caption).foregroundStyle(.white.opacity(0.7))
            }
            .frame(height: 240)
            .frame(maxWidth: .infinity)
            .background(Color.black)
        }
    }

    private var clipStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(reel.clips.enumerated()), id: \.element.id) { i, c in
                    Button {
                        index = i
                        loadClip()
                    } label: {
                        VStack(spacing: 2) {
                            Text("\(i + 1)")
                                .font(.caption2.bold())
                            Text(ReelClip.clock(c.startSeconds))
                                .font(.system(size: 9, design: .monospaced))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(i == index ? Color(reelHex: reel.teamColorHex) : Color.secondary.opacity(0.15))
                        .foregroundStyle(i == index ? Color.white : Color.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
    }

    @ViewBuilder
    private var infoPanel: some View {
        if let clip {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    if clip.jersey.isEmpty {
                        Text(clip.playerName.isEmpty ? "Team play" : clip.playerName)
                            .font(.headline)
                    } else {
                        Text("#\(clip.jersey)").font(.headline.monospacedDigit())
                        Text(clip.playerName).font(.headline)
                    }
                    Text(clip.playTag)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(Capsule())
                    Spacer()
                    Text("\(index + 1)/\(reel.clips.count)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if !clip.action.isEmpty {
                    Text(clip.action).font(.subheadline)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 10)
        } else {
            Text("No clips")
                .font(.footnote).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 10)
        }
    }

    private var controls: some View {
        HStack(spacing: 18) {
            Button {
                previous()
            } label: {
                Image(systemName: "backward.end.fill").font(.title3)
            }
            .disabled(index == 0)

            Button {
                togglePlay()
            } label: {
                Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 44))
            }
            .disabled(clip?.isExternal ?? true)

            Button {
                advance()
            } label: {
                Image(systemName: "forward.end.fill").font(.title3)
            }
            .disabled(index >= reel.clips.count - 1)

            Spacer()

            Text(reel.durationText)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.top, 4)
    }
}


extension ReelPlayerView {

    // MARK: Playback

    private func loadClip() {
        player?.pause()
        isPlaying = false
        player = nil
        guard let clip, !clip.isExternal, let url = URL(string: clip.videoURL) else { return }
        let avPlayer = AVPlayer(url: url)
        player = avPlayer
        avPlayer.seek(to: CMTime(seconds: clip.startSeconds, preferredTimescale: 600),
                      toleranceBefore: .zero, toleranceAfter: .zero) { _ in
            avPlayer.play()
            isPlaying = true
        }
    }

    private func togglePlay() {
        guard let player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            guard let clip else { return }
            // Restart from the clip's in-point if we're past the out-point.
            if CMTimeGetSeconds(player.currentTime()) >= clip.endSeconds - 0.05 {
                player.seek(to: CMTime(seconds: clip.startSeconds, preferredTimescale: 600),
                            toleranceBefore: .zero, toleranceAfter: .zero)
            }
            player.play()
            isPlaying = true
        }
    }

    private func advance() {
        guard index < reel.clips.count - 1 else {
            player?.pause()
            isPlaying = false
            return
        }
        index += 1
        loadClip()
    }

    private func previous() {
        guard index > 0 else { return }
        index -= 1
        loadClip()
    }

    /// Adds a start timestamp for YouTube links so the clip opens at the right moment.
    private func externalURL(for clip: ReelClip) -> URL? {
        guard var components = URLComponents(string: clip.videoURL) else {
            return URL(string: clip.videoURL)
        }
        let host = components.host?.lowercased() ?? ""
        if host.contains("youtube") || host.contains("youtu.be") {
            var items = components.queryItems ?? []
            items.removeAll { $0.name == "t" || $0.name == "start" }
            items.append(URLQueryItem(name: "t", value: "\(Int(clip.startSeconds))s"))
            components.queryItems = items
        }
        return components.url ?? URL(string: clip.videoURL)
    }
}

