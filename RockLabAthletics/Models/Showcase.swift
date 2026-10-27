import Foundation

/// A player's recruiting showcase profile.
struct Showcase: Identifiable, Codable {
    let id: String        // == rosterEntryId
    var rosterEntryId: String
    var teamId: String
    var playerName: String
    var position: String
    var height: String
    var weight: String
    var graduationYear: String
    var gpa: String
    var bio: String

    init(id: String, rosterEntryId: String, teamId: String, playerName: String, position: String, height: String, weight: String, graduationYear: String, gpa: String, bio: String) {
        self.id = id
        self.rosterEntryId = rosterEntryId
        self.teamId = teamId
        self.playerName = playerName
        self.position = position
        self.height = height
        self.weight = weight
        self.graduationYear = graduationYear
        self.gpa = gpa
        self.bio = bio
    }

    init?(id: String, data: [String: Any]) {
        guard let rosterEntryId = data["rosterEntryId"] as? String,
              let teamId = data["teamId"] as? String,
              let playerName = data["playerName"] as? String else { return nil }
        self.id = id
        self.rosterEntryId = rosterEntryId
        self.teamId = teamId
        self.playerName = playerName
        self.position = data["position"] as? String ?? ""
        self.height = data["height"] as? String ?? ""
        self.weight = data["weight"] as? String ?? ""
        self.graduationYear = data["graduationYear"] as? String ?? ""
        self.gpa = data["gpa"] as? String ?? ""
        self.bio = data["bio"] as? String ?? ""
    }
}

/// A highlight clip on a showcase profile.
struct Highlight: Identifiable, Codable {
    let id: String
    var title: String
    var url: String
    var description: String
    var createdAt: Date

    init(id: String, title: String, url: String, description: String, createdAt: Date) {
        self.id = id
        self.title = title
        self.url = url
        self.description = description
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let title = data["title"] as? String else { return nil }
        self.id = id
        self.title = title
        self.url = data["url"] as? String ?? ""
        self.description = data["description"] as? String ?? ""
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }
}
