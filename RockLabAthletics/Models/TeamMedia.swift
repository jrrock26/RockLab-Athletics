import Foundation

/// A photo in a team's media slideshow.
struct TeamMedia: Identifiable, Codable {
    let id: String
    var teamId: String
    var imageURL: String
    var caption: String
    var addedByName: String
    var createdAt: Date

    init(id: String, teamId: String, imageURL: String, caption: String, addedByName: String, createdAt: Date) {
        self.id = id
        self.teamId = teamId
        self.imageURL = imageURL
        self.caption = caption
        self.addedByName = addedByName
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        let imageURL = data["imageURL"] as? String ?? data["imageBase64"] as? String ?? ""
        guard !imageURL.isEmpty else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.imageURL = imageURL
        self.caption = data["caption"] as? String ?? ""
        self.addedByName = data["addedByName"] as? String ?? ""
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }
}
