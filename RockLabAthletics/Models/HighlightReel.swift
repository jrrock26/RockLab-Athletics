import Foundation

/// Where a source video came from.
enum VideoProvider: String, Codable {
    case upload      // uploaded from the device or files
    case recording   // recorded in the app
    case link        // YouTube / Hudl / NFHS / direct URL

    var displayName: String {
        switch self {
        case .upload: return "Upload"
        case .recording: return "Recorded"
        case .link: return "Link"
        }
    }
}

/// A source video a videographer has uploaded, recorded, or linked.
struct TeamVideo: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var urlString: String        // playable/download URL
    var storagePath: String      // empty for external links
    var provider: VideoProvider
    var durationSeconds: Double
    var uploadedByName: String
    var createdAt: Date

    init(id: String, teamId: String, title: String, urlString: String, storagePath: String,
         provider: VideoProvider, durationSeconds: Double, uploadedByName: String, createdAt: Date) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.urlString = urlString
        self.storagePath = storagePath
        self.provider = provider
        self.durationSeconds = durationSeconds
        self.uploadedByName = uploadedByName
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let urlString = data["urlString"] as? String, !urlString.isEmpty else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.title = data["title"] as? String ?? "Video"
        self.urlString = urlString
        self.storagePath = data["storagePath"] as? String ?? ""
        self.provider = VideoProvider(rawValue: data["provider"] as? String ?? "") ?? .upload
        self.durationSeconds = data["durationSeconds"] as? Double ?? 0
        self.uploadedByName = data["uploadedByName"] as? String ?? ""
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }

    /// External links (YouTube/Hudl/NFHS) can't be trimmed locally.
    var isExternalLink: Bool {
        provider == .link
    }

    var dictionary: [String: Any] {
        [
            "teamId": teamId,
            "title": title,
            "urlString": urlString,
            "storagePath": storagePath,
            "provider": provider.rawValue,
            "durationSeconds": durationSeconds,
            "uploadedByName": uploadedByName,
            "createdAt": createdAt.timeIntervalSince1970,
        ]
    }
}

/// One clipped play inside a highlight reel.
struct ReelClip: Identifiable, Codable, Hashable {
    let id: String
    var videoId: String
    var videoTitle: String
    var videoURL: String
    var isExternal: Bool
    var startSeconds: Double
    var endSeconds: Double
    var playerId: String
    var playerName: String
    var jersey: String
    var action: String          // e.g. "Strip-sack, forced fumble"
    var playTag: String         // Offense / Defense / Special Teams / Other

    init(id: String = UUID().uuidString,
         videoId: String,
         videoTitle: String,
         videoURL: String,
         isExternal: Bool,
         startSeconds: Double,
         endSeconds: Double,
         playerId: String,
         playerName: String,
         jersey: String,
         action: String,
         playTag: String) {
        self.id = id
        self.videoId = videoId
        self.videoTitle = videoTitle
        self.videoURL = videoURL
        self.isExternal = isExternal
        self.startSeconds = startSeconds
        self.endSeconds = endSeconds
        self.playerId = playerId
        self.playerName = playerName
        self.jersey = jersey
        self.action = action
        self.playTag = playTag
    }

    init?(data: [String: Any]) {
        guard let id = data["id"] as? String else { return nil }
        self.id = id
        self.videoId = data["videoId"] as? String ?? ""
        self.videoTitle = data["videoTitle"] as? String ?? ""
        self.videoURL = data["videoURL"] as? String ?? ""
        self.isExternal = data["isExternal"] as? Bool ?? false
        self.startSeconds = data["startSeconds"] as? Double ?? 0
        self.endSeconds = data["endSeconds"] as? Double ?? 0
        self.playerId = data["playerId"] as? String ?? ""
        self.playerName = data["playerName"] as? String ?? ""
        self.jersey = data["jersey"] as? String ?? ""
        self.action = data["action"] as? String ?? ""
        self.playTag = data["playTag"] as? String ?? "Offense"
    }

    var duration: Double { max(0, endSeconds - startSeconds) }

    var timeRangeText: String {
        "\(ReelClip.clock(startSeconds)) – \(ReelClip.clock(endSeconds))"
    }

    static func clock(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    var dictionary: [String: Any] {
        [
            "id": id,
            "videoId": videoId,
            "videoTitle": videoTitle,
            "videoURL": videoURL,
            "isExternal": isExternal,
            "startSeconds": startSeconds,
            "endSeconds": endSeconds,
            "playerId": playerId,
            "playerName": playerName,
            "jersey": jersey,
            "action": action,
            "playTag": playTag,
        ]
    }
}

enum ReelStatus: String, Codable {
    case draft
    case published

    var displayName: String { self == .published ? "Published" : "Draft" }
}


/// A produced highlight reel: a game, a team-color banner, and ordered clips.
struct HighlightReel: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var gameId: String
    var homeTeam: String
    var awayTeam: String
    var gameDate: Date
    var teamColorHex: String
    var status: ReelStatus
    var clips: [ReelClip]
    var createdByName: String
    var createdAt: Date
    var publishedAt: Date?
    var views: Int

    init(id: String = UUID().uuidString,
         teamId: String,
         title: String,
         gameId: String = "",
         homeTeam: String,
         awayTeam: String,
         gameDate: Date,
         teamColorHex: String,
         status: ReelStatus = .draft,
         clips: [ReelClip] = [],
         createdByName: String,
         createdAt: Date = Date(),
         publishedAt: Date? = nil,
         views: Int = 0) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.gameId = gameId
        self.homeTeam = homeTeam
        self.awayTeam = awayTeam
        self.gameDate = gameDate
        self.teamColorHex = teamColorHex
        self.status = status
        self.clips = clips
        self.createdByName = createdByName
        self.createdAt = createdAt
        self.publishedAt = publishedAt
        self.views = views
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String else { return nil }
        self.id = id
        self.teamId = teamId
        self.title = data["title"] as? String ?? "Highlight Reel"
        self.gameId = data["gameId"] as? String ?? ""
        self.homeTeam = data["homeTeam"] as? String ?? ""
        self.awayTeam = data["awayTeam"] as? String ?? ""
        self.gameDate = Date(timeIntervalSince1970: (data["gameDate"] as? Double) ?? 0)
        self.teamColorHex = data["teamColorHex"] as? String ?? "#0A84FF"
        self.status = ReelStatus(rawValue: data["status"] as? String ?? "") ?? .draft
        let rawClips = data["clips"] as? [[String: Any]] ?? []
        self.clips = rawClips.compactMap { ReelClip(data: $0) }
        self.createdByName = data["createdByName"] as? String ?? ""
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
        self.publishedAt = (data["publishedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.views = data["views"] as? Int ?? 0
    }

    var durationSeconds: Double { clips.reduce(0) { $0 + $1.duration } }

    /// A reel is a highlight package, not the game.
    ///
    /// 20 clips at 4–6 seconds each is roughly a 90–120 second reel — the length
    /// that actually holds attention on social. It also bounds render time and
    /// storage, which is why the limit is enforced server-side as well.
    static let maxClips = 20

    var canAddClip: Bool { clips.count < HighlightReel.maxClips }
    var clipsRemaining: Int { max(0, HighlightReel.maxClips - clips.count) }

    var matchupText: String { "\(homeTeam) vs \(awayTeam)" }

    var gameDateText: String { gameDate.formatted(date: .abbreviated, time: .omitted) }

    var durationText: String {
        let total = Int(durationSeconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    var dictionary: [String: Any] {
        var data: [String: Any] = [
            "teamId": teamId,
            "title": title,
            "gameId": gameId,
            "homeTeam": homeTeam,
            "awayTeam": awayTeam,
            "gameDate": gameDate.timeIntervalSince1970,
            "teamColorHex": teamColorHex,
            "status": status.rawValue,
            "clips": clips.map { $0.dictionary },
            "createdByName": createdByName,
            "createdAt": createdAt.timeIntervalSince1970,
            "views": views,
        ]
        if let publishedAt { data["publishedAt"] = publishedAt.timeIntervalSince1970 }
        return data
    }
}

