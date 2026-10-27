import Foundation
import FirebaseFirestore

/// Thin wrapper around Firestore for the core collections.
struct FirestoreService {
    static let shared = FirestoreService()

    private let db = Firestore.firestore()

    private init() {}

    // MARK: - Users

    func createUser(id: String, email: String, name: String, role: UserRole) async throws {
        let data: [String: Any] = [
            "email": email,
            "displayName": name,
            "role": role.rawValue,
            "schoolId": NSNull(),
            "linkedPlayerIds": [],
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await db.collection("users").document(id).setData(data)
    }

    func fetchUser(id: String) async throws -> AppUser? {
        let snapshot = try await db.collection("users").document(id).getDocument()
        guard let data = snapshot.data() else { return nil }
        return AppUser(id: snapshot.documentID, data: data)
    }

    func updateUserRoleAndSchool(id: String, role: UserRole, schoolId: String) async throws {
        try await db.collection("users").document(id).setData([
            "role": role.rawValue,
            "schoolId": schoolId
        ], merge: true)
    }

    // MARK: - Schools

    func createSchool(name: String, mascot: String, adUserId: String, sports: [Sport]) async throws -> String {
        let ref = db.collection("schools").document()
        let data: [String: Any] = [
            "name": name,
            "mascot": mascot,
            "adUserId": adUserId,
            "activeSports": sports.map { $0.asDictionary },
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    // MARK: - Invitations

    func createInvitation(
        email: String,
        role: UserRole,
        schoolId: String,
        schoolName: String,
        sportNames: [String]
    ) async throws {
        let ref = db.collection("invitations").document()
        let data: [String: Any] = [
            "email": email,
            "role": role.rawValue,
            "schoolId": schoolId,
            "schoolName": schoolName,
            "sportNames": sportNames,
            "token": UUID().uuidString,
            "status": "pending",
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
    }

    func fetchInvitations(schoolId: String) async throws -> [Invitation] {
        let snapshot = try await db.collection("invitations")
            .whereField("schoolId", isEqualTo: schoolId)
            .getDocuments()
        return snapshot.documents.compactMap { Invitation(id: $0.documentID, data: $0.data()) }
    }
}
