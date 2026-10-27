import Foundation

/// A school profile. The AD is the owner of the system for their school.
struct School: Identifiable, Codable {
    let id: String
    var name: String
    var mascot: String
    var adUserId: String
    var activeSports: [Sport]

    init(id: String, name: String, mascot: String, adUserId: String, activeSports: [Sport]) {
        self.id = id
        self.name = name
        self.mascot = mascot
        self.adUserId = adUserId
        self.activeSports = activeSports
    }
}
