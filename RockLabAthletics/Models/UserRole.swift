import Foundation

/// The authorization tier for a user within the system.
enum UserRole: String, Codable, CaseIterable {
    case ad
    case coach
    case staff
    case player
    case parent
    /// Extended family: grandparents, siblings, relatives. Same public surface
    /// as a follower, plus a link to a specific athlete — but deliberately no
    /// parent's consent authority over that student's records.
    case family
    case follower

    var displayName: String {
        switch self {
        case .ad: return "Athletic Director"
        case .coach: return "Coach"
        case .staff: return "Staff"
        case .player: return "Player"
        case .parent: return "Parent / Guardian"
        case .family: return "Family"
        case .follower: return "Follower"
        }
    }
}
