import Foundation

/// A player on a team's roster.
struct Player: Identifiable, Codable, Hashable {
    let id: UUID
    var firstName: String
    var lastName: String
    var jerseyNumber: Int?
    var position: String?
    var gradeLevel: Int?

    var fullName: String {
        "\(firstName) \(lastName)"
    }
}
