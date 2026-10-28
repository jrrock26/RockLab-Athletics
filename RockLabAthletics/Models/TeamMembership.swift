import Foundation

/// The fine-grained capabilities a coach/AD can grant to a staff member on a team.
enum StaffPermission: String, Codable, CaseIterable, Identifiable {
    case statistician     // operate live scoring
    case videographer     // make/edit highlight reels
    case injuryUpdates    // update player injury status
    case invites          // invite/accept players & parents
    case forms            // publish/review forms
    case fundraising      // update fundraiser completions
    case concessions      // manage concessions / work shifts
    case attendance       // record attendance
    case staffChat        // access the staff chat

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .statistician: return "Statistician (live scoring)"
        case .videographer: return "Videographer (highlights)"
        case .injuryUpdates: return "Injury updates"
        case .invites: return "Invite players & parents"
        case .forms: return "Publish / review forms"
        case .fundraising: return "Update fundraising"
        case .concessions: return "Manage concessions"
        case .attendance: return "Record attendance"
        case .staffChat: return "Staff chat access"
        }
    }
}

/// A user's membership and permissions on a specific team.
struct TeamMembership: Identifiable, Codable {
    let id: String          // userId (document id)
    var teamId: String
    var userId: String
    var role: UserRole
    var name: String
    var email: String
    var permissions: [String]  // StaffPermission rawValues

    init(id: String, teamId: String, userId: String, role: UserRole, name: String, email: String, permissions: [String] = []) {
        self.id = id
        self.teamId = teamId
        self.userId = userId
        self.role = role
        self.name = name
        self.email = email
        self.permissions = permissions
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let userId = data["userId"] as? String,
              let roleRaw = data["role"] as? String,
              let role = UserRole(rawValue: roleRaw) else { return nil }
        self.id = id
        self.teamId = teamId
        self.userId = userId
        self.role = role
        self.name = data["name"] as? String ?? ""
        self.email = data["email"] as? String ?? ""
        self.permissions = data["permissions"] as? [String] ?? []
    }
}
