import SwiftUI
import UniformTypeIdentifiers

/// The team's game-film library. Pick an existing video or add a new one.
struct VideoLibrarySheet: View {
    @Environment(\.dismiss) private var dismiss
    let teamId: String
    let onSelect: (TeamVideo) -> Void

    @State private var videos: [TeamVideo] = []
    @State private var showingSource = false
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        showingSource = true
                    } label: {
                        Label("Add game film (upload, record, or link)", systemImage: "plus.rectangle.on.rectangle")
                    }
                }

                Section("Game film") {
                    if isLoading {
                        HStack { ProgressView(); Text("Loading…").foregroundStyle(.secondary) }
                    } else if videos.isEmpty {
                        Text("No game film yet. Upload a video or paste a YouTube / Hudl / NFHS link.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(videos) { video in
                            Button {
                                onSelect(video)
                            } label: {
                                videoRow(video)
                            }
                            .buttonStyle(.plain)
                        }
                        .onDelete { index in
                            for i in index {
                                let video = videos[i]
                                Task { await remove(video) }
                            }
                        }
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Game Film")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .sheet(isPresented: $showingSource) {
                VideoSourceSheet(teamId: teamId) { _ in
                    Task { await load() }
                }
            }
            .task { await load() }
        }
    }

    private func videoRow(_ video: TeamVideo) -> some View {
        HStack(spacing: 10) {
            Image(systemName: video.isExternalLink ? "link" : "film")
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(video.title).font(.subheadline.weight(.semibold))
                HStack(spacing: 6) {
                    Text(video.provider.displayName)
                    if video.durationSeconds > 0 {
                        Text("·")
                        Text(ReelClip.clock(video.durationSeconds))
                    }
                    Text("·")
                    Text(video.createdAt.formatted(date: .abbreviated, time: .omitted))
                }
                .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            videos = try await HighlightService.shared.fetchVideos(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func remove(_ video: TeamVideo) async {
        do {
            try await HighlightService.shared.deleteVideo(teamId: teamId, video: video)
            videos.removeAll { $0.id == video.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Adds game film: upload from the device, record in-app, import a file, or
/// paste a YouTube / Hudl / NFHS / direct video link.
struct VideoSourceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let onAdded: (TeamVideo) -> Void

    @State private var title = ""
    @State private var linkURL = ""
    @State private var showingLibraryPicker = false
    @State private var showingCameraPicker = false
    @State private var showingFileImporter = false
    @State private var isWorking = false
    @State private var statusText = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Video title") {
                    TextField("e.g. Week 4 vs Central", text: $title)
                }

                Section("Upload from this device") {
                    Button {
                        showingLibraryPicker = true
                    } label: {
                        Label("Choose a video from Photos", systemImage: "photo.on.rectangle.angled")
                    }
                    Button {
                        showingCameraPicker = true
                    } label: {
                        Label("Record a video now", systemImage: "video.badge.plus")
                    }
                    Button {
                        showingFileImporter = true
                    } label: {
                        Label("Import a file (Files app)", systemImage: "folder")
                    }
                }

                Section {
                    TextField("Paste a YouTube, Hudl, NFHS or video link", text: $linkURL, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Button {
                        Task { await addLink() }
                    } label: {
                        Label("Add link", systemImage: "link.badge.plus")
                    }
                    .disabled(isWorking || linkURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } header: {
                    Text("Link an online video")
                } footer: {
                    Text("Highlight clips from a link are marked by time and open in the source app — no download needed.")
                        .font(.caption)
                }

                if isWorking || !statusText.isEmpty {
                    Section {
                        HStack(spacing: 10) {
                            if isWorking { ProgressView() }
                            Text(isWorking ? statusText : "Done").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Add Game Film")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .sheet(isPresented: $showingLibraryPicker) {
                VideoPicker(source: .library, isPresented: $showingLibraryPicker) { url in
                    Task { await upload(url, provider: .upload) }
                }
                .ignoresSafeArea()
            }
            .sheet(isPresented: $showingCameraPicker) {
                VideoPicker(source: .camera, isPresented: $showingCameraPicker) { url in
                    Task { await upload(url, provider: .recording) }
                }
                .ignoresSafeArea()
            }
            .fileImporter(isPresented: $showingFileImporter,
                          allowedContentTypes: [.movie, .mpeg4Movie, .quickTimeMovie],
                          allowsMultipleSelection: false) { result in
                if case .success(let urls) = result, let url = urls.first {
                    Task { await upload(url, provider: .upload) }
                }
            }
        }
    }
}


extension VideoSourceSheet {

    private func upload(_ url: URL, provider: VideoProvider) async {
        isWorking = true
        statusText = "Uploading \(url.lastPathComponent)…"
        errorMessage = nil
        defer { isWorking = false }
        do {
            let video = try await HighlightService.shared.uploadVideo(
                fileURL: url,
                teamId: teamId,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                uploadedByName: auth.user?.displayName ?? "",
                provider: provider,
                onProgress: { fraction in
                    // A multi-gigabyte upload with no number on screen reads as a
                    // hung app, and people kill it before it finishes.
                    Task { @MainActor in
                        statusText = "Uploading \(url.lastPathComponent)… \(Int(fraction * 100))%"
                    }
                })
            onAdded(video)
            dismiss()
        } catch {
            statusText = ""
            errorMessage = error.localizedDescription
        }
    }

    private func addLink() async {
        isWorking = true
        statusText = "Adding link…"
        errorMessage = nil
        defer { isWorking = false }
        do {
            let video = try await HighlightService.shared.linkVideo(
                teamId: teamId,
                urlString: linkURL,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                uploadedByName: auth.user?.displayName ?? "")
            onAdded(video)
            dismiss()
        } catch {
            statusText = ""
            errorMessage = error.localizedDescription
        }
    }
}

