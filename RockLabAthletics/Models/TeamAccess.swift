import Foundation

/// Effective access for the signed-in user against a single team,
/// computed from their global role plus their team membership & staff permissions.
struct TeamAccess {
    var membership: TeamMembership?
    var isAd: Bool = false

    var isCoach: Bool { membership?.role == .coach }
    var isStaff: Bool { membership?.role == .staff }
    var isPlayer: Bool { membership?.role == .player }
    var isParent: Bool { membership?.role == .parent }
    var isFollower: Bool { membership?.role == .follower }

    /// AD or the coach assigned to this team: full management.
    var canManageTeam: Bool { isAd || isCoach }

    /// Whether the user holds a staff permission (managers always pass).
    func hasPerm(_ perm: StaffPermission) -> Bool {
        if canManageTeam { return true }
        guard isStaff else { return false }
        return membership?.permissions.contains(perm.rawValue) ?? false
    }

    /// Showcase/highlight profile is owned by the athlete and their
    /// parent/guardian — never by the AD, a coach, or staff.
    ///
    /// - `entry.userId` is the athlete's account; parents are linked through
    ///   `users/{uid}.linkedPlayerIds`.
    func canEditShowcase(for entry: RosterEntry, userId: String?, linkedPlayerIds: [String]) -> Bool {
        guard let userId, let ownerId = entry.userId else { return false }
        return ownerId == userId || linkedPlayerIds.contains(ownerId)
    }

    /// Members (and followers, for the calendar) can see all event types.
    /// Followers get games, meetings, meals and travel — not practice details.
    var canSeeAllEvents: Bool { isAd || isCoach || isStaff || isPlayer || isParent || isFollower }

    /// Whether this chat channel is visible to the user.
    func canSee(_ type: ChatType) -> Bool {
        switch type {
        case .commBoard: return isAd || isCoach || isStaff || isPlayer || isParent || isFollower
        case .team: return isAd || isCoach || isStaff || isPlayer
        case .parent: return isAd || isCoach || isPlayer || isParent
        case .staff: return isAd || isCoach || hasPerm(.staffChat)
        }
    }

    /// Whether the user can post in this chat channel.
    func canPost(_ type: ChatType) -> Bool {
        switch type {
        case .commBoard: return canManageTeam || hasPerm(.commBoardPost)
        case .team: return isAd || isCoach || isStaff || isPlayer
        case .parent: return isAd || isCoach || isPlayer || isParent
        case .staff: return isAd || isCoach || hasPerm(.staffChat)
        }
    }
}
