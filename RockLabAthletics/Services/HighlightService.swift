import Foundation
import FirebaseFirestore
import AVFoundation

/// Stores team video sources and produced highlight reels.
struct HighlightService {
    static let shared = HighlightService()
    private let db = Firestore.firestore()
    private init() {}

    private func videosRef(_ teamId: String) -> CollectionReference {
        db.collection("teams").document(teamId).collection("videos")
    }

    private func reelsRef(_ teamId: String) -> CollectionReference {
        db.collection("teams").document(teamId).collection("reels")
    }

    // MARK: - Videos

    func fetchVideos(teamId: String) async throws -> [TeamVideo] {
        let snapshot = try await videosRef(teamId).getDocuments()
        return snapshot.documents.compactMap { TeamVideo(id: $0.documentID, data: $0.data()) }
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// Uploads a video file from the device, then records it in the library.
    func uploadVideo(fileURL: URL,
                     teamId: String,
                     title: String,
                     uploadedByName: String,
                     provider: VideoProvider = .upload) async throws -> TeamVideo {
        let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey])
        let size = Double(values?.fileSize ?? 0)
        if size > 600 * 1024 * 1024 {
            throw NSError(domain: "HighlightService", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "That video is larger than 600 MB. Trim or export it first, then upload."
            ])
        }

        let duration = await Self.duration(of: fileURL)
        let ext = fileURL.pathExtension.isEmpty ? "mov" : fileURL.pathExtension.lowercased()
        let contentType = ext == "mp4" ? "video/mp4" : "video/quicktime"

        // Entitlement gate: claim storage on the server BEFORE uploading, so the
        // plan limit can't be bypassed by a modified client.
        _ = try await FunctionsService.shared.consumeVideoQuota(bytes: Int64(size))

        let path = "teams/\(teamId)/videos/\(UUID().uuidString).\(ext)"
        let url = try await StorageService.shared.uploadFile(from: fileURL, path: path, contentType: contentType)

        let video = TeamVideo(id: UUID().uuidString,
                              teamId: teamId,
                              title: title.isEmpty ? "Game film" : title,
                              urlString: url,
                              storagePath: path,
                              provider: provider,
                              durationSeconds: duration,
                              uploadedByName: uploadedByName,
                              createdAt: Date())
        try await videosRef(teamId).document(video.id).setData(video.dictionary)
        AnalyticsService.log(AnalyticsService.Event.videoUploaded, [
            "provider": provider.rawValue,
            "duration_bucket": Self.durationBucket(duration),
        ])
        return video
    }

    /// Links an external video (YouTube, Hudl, NFHS, or a direct URL).
    func linkVideo(teamId: String,
                   urlString: String,
                   title: String,
                   uploadedByName: String) async throws -> TeamVideo {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: trimmed),
              let scheme = parsed.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            throw NSError(domain: "HighlightService", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Enter a valid https link to a video."
            ])
        }
        let video = TeamVideo(id: UUID().uuidString,
                              teamId: teamId,
                              title: title.isEmpty ? "Linked video" : title,
                              urlString: trimmed,
                              storagePath: "",
                              provider: .link,
                              durationSeconds: 0,
                              uploadedByName: uploadedByName,
                              createdAt: Date())
        try await videosRef(teamId).document(video.id).setData(video.dictionary)
        AnalyticsService.log(AnalyticsService.Event.videoUploaded, ["provider": "link"])
        return video
    }

    func deleteVideo(teamId: String, video: TeamVideo) async throws {
        try await videosRef(teamId).document(video.id).delete()
        if !video.storagePath.isEmpty {
            try? await StorageService.shared.delete(path: video.storagePath)
        }
    }

    /// Coarse duration bucket so we never log exact film lengths.
    static func durationBucket(_ seconds: Double) -> String {
        switch seconds {
        case ..<60: return "under_1m"
        case ..<300: return "1_5m"
        case ..<900: return "5_15m"
        case ..<1800: return "15_30m"
        case ..<3600: return "30_60m"
        default: return "over_60m"
        }
    }

    static func duration(of url: URL) async -> Double {
        let asset = AVURLAsset(url: url)
        if let time = try? await asset.load(.duration) {
            return CMTimeGetSeconds(time)
        }
        return 0
    }

    // MARK: - Reels

    func fetchReels(teamId: String, publishedOnly: Bool = false) async throws -> [HighlightReel] {
        var query: Query = reelsRef(teamId)
        if publishedOnly {
            query = query.whereField("status", isEqualTo: ReelStatus.published.rawValue)
        }
        let snapshot = try await query.getDocuments()
        return snapshot.documents.compactMap { HighlightReel(id: $0.documentID, data: $0.data()) }
            .sorted { $0.gameDate > $1.gameDate }
    }

    func fetchReel(teamId: String, reelId: String) async throws -> HighlightReel? {
        let doc = try await reelsRef(teamId).document(reelId).getDocument()
        guard let data = doc.data() else { return nil }
        return HighlightReel(id: reelId, data: data)
    }

    func saveReel(_ reel: HighlightReel) async throws {
        try await reelsRef(reel.teamId).document(reel.id).setData(reel.dictionary, merge: true)
    }

    func deleteReel(teamId: String, reelId: String) async throws {
        try await reelsRef(teamId).document(reelId).delete()
    }

    func incrementViews(teamId: String, reelId: String) async throws {
        try await reelsRef(teamId).document(reelId)
            .setData(["views": FieldValue.increment(Int64(1))], merge: true)
    }
}
