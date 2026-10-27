import Foundation

/// An invitation sent by the AD to bring a coach/staff member onto the system.
struct Invitation: Identifiable, Codable {
    let id: String
    var email: String
    var role: UserRole
    var schoolId: String
    var schoolName: String
    var sportNames: [String]
    var status: String

    init(
        id: String,
        email: String,
        role: UserRole,
        schoolId: String,
        schoolName: String,
        sportNames: [String],
        status: String
    ) {
        self.id = id
        self.email = email
        self.role = role
        self.schoolId = schoolId
        self.schoolName = schoolName
        self.sportNames = sportNames
        self.status = status
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
    }
}
