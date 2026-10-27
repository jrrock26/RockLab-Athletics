import Foundation

/// A user account record, mirroring the Firestore `users` document.
struct AppUser: Identifiable, Equatable {
    let id: String
    var email: String
    var displayName: String
    var role: UserRole
    var schoolId: String?
    var linkedPlayerIds: [String]

    init(
        id: String,
        email: String,
        displayName: String,
        role: UserRole,
        schoolId: String? = nil,
        linkedPlayerIds: [String] = []
    ) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.role = role
        self.schoolId = schoolId
        self.linkedPlayerIds = linkedPlayerIds
    }

    init(id: String, data: [String: Any]) {
        self.id = id
        self.email = data["email"] as? String ?? ""
        self.displayName = data["displayName"] as? String ?? ""
        self.role = UserRole(rawValue: data["role"] as? String ?? "") ?? .follower
        self.schoolId = data["schoolId"] as? String
        self.linkedPlayerIds = data["linkedPlayerIds"] as? [String] ?? []
    }
}
