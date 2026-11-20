import Foundation

/// A live broadcast link for a team — any external stream
/// (Hudl Live, NFHS Network, YouTube, etc.). Watched externally.
struct Broadcast: Identifiable, Codable {
    let id: String
    var teamId: String
    var gameId: String?
    var title: String
    var url: String
    var isLive: Bool
    var createdByName: String
    var createdAt: Date

    init(id: String, teamId: String, gameId: String?, title: String, url: String, isLive: Bool, createdByName: String, createdAt: Date) {
        self.id = id
        self.teamId = teamId
        self.gameId = gameId
        self.title = title
        self.url = url
        self.isLive = isLive
        self.createdByName = createdByName
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let title = data["title"] as? String,
              let url = data["url"] as? String, !url.isEmpty else { return nil }
        self.id = id
        self.teamId = teamId
        self.gameId = data["gameId"] as? String
        self.title = title
        self.url = url
        self.isLive = data["isLive"] as? Bool ?? false
        self.createdByName = data["createdByName"] as? String ?? ""
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }

    var watchURL: URL? { URL(string: url) }
}

