import Foundation

/// A user account record, mirroring the Firestore `users` document.
struct AppUser: Identifiable, Equatable {
    let id: String
    var email: String
    var displayName: String
    var role: UserRole
    var schoolId: String?
    var zipCode: String
    var phone: String
    var teamIds: [String]
    var linkedPlayerIds: [String]
    var photoURL: String

    init(
        id: String,
        email: String,
        displayName: String,
        role: UserRole,
        schoolId: String? = nil,
        zipCode: String = "",
        phone: String = "",
        teamIds: [String] = [],
        linkedPlayerIds: [String] = [],
        photoURL: String = ""
    ) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.role = role
        self.schoolId = schoolId
        self.zipCode = zipCode
        self.phone = phone
        self.teamIds = teamIds
        self.linkedPlayerIds = linkedPlayerIds
        self.photoURL = photoURL
    }

    init(id: String, data: [String: Any]) {
        self.id = id
        self.email = data["email"] as? String ?? ""
        self.displayName = data["displayName"] as? String ?? ""
        self.role = UserRole(rawValue: data["role"] as? String ?? "") ?? .follower
        self.schoolId = data["schoolId"] as? String
        self.zipCode = data["zipCode"] as? String ?? ""
        self.phone = data["phone"] as? String ?? ""
        self.teamIds = data["teamIds"] as? [String] ?? []
        self.linkedPlayerIds = data["linkedPlayerIds"] as? [String] ?? []
        self.photoURL = data["photoURL"] as? String ?? ""
    }
}
