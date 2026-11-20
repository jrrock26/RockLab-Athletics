import Foundation

/// The authorization tier for a user within the system.
enum UserRole: String, Codable, CaseIterable {
    case ad
    case coach
    case staff
    case player
    case parent
    case follower

    var displayName: String {
        switch self {
        case .ad: return "Athletic Director"
        case .coach: return "Coach"
        case .staff: return "Staff"
        case .player: return "Player"
        case .parent: return "Parent / Guardian"
        case .follower: return "Follower"
        }
    }
}
