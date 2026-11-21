import Foundation

/// An invitation to join a school/team with a specific role.
struct Invitation: Identifiable, Codable {
    let id: String
    var email: String
    var role: UserRole
    var schoolId: String
    var schoolName: String
    var sportNames: [String]
    var status: String
    var teamId: String?
    var teamName: String?
    var code: String
    /// When this invitation stops being actionable. Nil on older rows; those are
    /// treated as still valid rather than silently voided.
    var expiresAt: Date?
    /// The athlete this invitation authorises, when it names one.
    var rosterEntryId: String?
    var sendCount: Int
    /// True for an AD handoff: accepting it transfers ownership of the school
    /// rather than merely granting a role.
    var adTransfer: Bool
    var invitedByName: String

    /// Expired by date, or already marked expired by the server.
    var isExpired: Bool {
        if status == "expired" { return true }
        guard let expiresAt else { return false }
        return Date() >= expiresAt
    }

    /// Only a pending, unexpired invitation can be accepted.
    var canAccept: Bool { status == "pending" && !isExpired }

    init(
        id: String,
        email: String,
        role: UserRole,
        schoolId: String,
        schoolName: String,
        sportNames: [String],
        status: String,
        teamId: String? = nil,
        teamName: String? = nil,
        code: String = "",
        expiresAt: Date? = nil,
        rosterEntryId: String? = nil,
        sendCount: Int = 0,
        adTransfer: Bool = false,
        invitedByName: String = ""
    ) {
        self.id = id
        self.email = email
        self.role = role
        self.schoolId = schoolId
        self.schoolName = schoolName
        self.sportNames = sportNames
        self.status = status
        self.teamId = teamId
        self.teamName = teamName
        self.code = code
        self.expiresAt = expiresAt
        self.rosterEntryId = rosterEntryId
        self.sendCount = sendCount
        self.adTransfer = adTransfer
        self.invitedByName = invitedByName
    }

    init?(id: String, data: [String: Any]) {
        guard let email = data["email"] as? String else { return nil }
        self.id = id
        self.email = email
        self.role = UserRole(rawValue: data["role"] as? String ?? "") ?? .coach
        self.schoolId = data["schoolId"] as? String ?? ""
        self.schoolName = data["schoolName"] as? String ?? ""
        self.sportNames = data["sportNames"] as? [String] ?? []
        self.status = data["status"] as? String ?? "pending"
        self.teamId = data["teamId"] as? String
        self.teamName = data["teamName"] as? String
        // Older rows carry `token` instead of `code`; both must keep resolving or
        // every invitation sent before the rename stops working.
        let codeValue = data["code"] as? String ?? ""
        let tokenValue = data["token"] as? String ?? ""
        self.code = codeValue.isEmpty ? tokenValue : codeValue
        self.expiresAt = (data["expiresAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.rosterEntryId = data["rosterEntryId"] as? String
        self.sendCount = data["sendCount"] as? Int ?? 0
        self.adTransfer = data["adTransfer"] as? Bool ?? false
        self.invitedByName = data["invitedByName"] as? String ?? ""
    }
}

