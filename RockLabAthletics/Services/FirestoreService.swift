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

    // MARK: - Teams

    func createTeam(
        schoolId: String,
        sportId: String,
        sportName: String,
        level: String,
        season: String,
        gender: String,
        headCoachId: String
    ) async throws -> String {
        let ref = db.collection("teams").document()
        let data: [String: Any] = [
            "schoolId": schoolId,
            "sportId": sportId,
            "sportName": sportName,
            "level": level,
            "season": season,
            "gender": gender,
            "headCoachId": headCoachId,
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchTeams(schoolId: String) async throws -> [Team] {
        let snapshot = try await db.collection("teams")
            .whereField("schoolId", isEqualTo: schoolId)
            .getDocuments()
        return snapshot.documents.compactMap { Team(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Roster

    func addRosterEntry(teamId: String, playerName: String, jerseyNumber: String, position: String) async throws -> String {
        let ref = db.collection("teams").document(teamId).collection("roster").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "playerName": playerName,
            "jerseyNumber": jerseyNumber,
            "position": position,
            "userId": NSNull(),
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchRoster(teamId: String) async throws -> [RosterEntry] {
        let snapshot = try await db.collection("teams").document(teamId).collection("roster").getDocuments()
        return snapshot.documents.compactMap { RosterEntry(id: $0.documentID, data: $0.data()) }
    }

    func removeRosterEntry(teamId: String, entryId: String) async throws {
        try await db.collection("teams").document(teamId).collection("roster").document(entryId).delete()
    }

    // MARK: - Forms

    func submitForm(teamId: String, rosterEntryId: String, type: FormType, status: FormStatus, expiresAt: Date?) async throws {
        let col = db.collection("teams").document(teamId)
            .collection("roster").document(rosterEntryId)
            .collection("forms")
        let existing = try await col.whereField("type", isEqualTo: type.rawValue).getDocuments()

        var data: [String: Any] = [
            "teamId": teamId,
            "rosterEntryId": rosterEntryId,
            "type": type.rawValue,
            "status": status.rawValue,
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let expiresAt {
            data["expiresAt"] = expiresAt.timeIntervalSince1970
        } else {
            data["expiresAt"] = NSNull()
        }

        if let doc = existing.documents.first {
            try await doc.reference.setData(data, merge: true)
        } else {
            try await col.document().setData(data)
        }
    }

    func fetchForms(teamId: String, rosterEntryId: String) async throws -> [PlayerForm] {
        let snapshot = try await db.collection("teams").document(teamId)
            .collection("roster").document(rosterEntryId)
            .collection("forms").getDocuments()
        return snapshot.documents.compactMap { PlayerForm(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Parent / player linking

    func findUserByEmail(email: String) async throws -> AppUser? {
        let snapshot = try await db.collection("users")
            .whereField("email", isEqualTo: email)
            .getDocuments()
        guard let doc = snapshot.documents.first else { return nil }
        return AppUser(id: doc.documentID, data: doc.data())
    }

    func linkChild(parentUserId: String, playerUserId: String) async throws {
        try await db.collection("users").document(parentUserId).setData([
            "linkedPlayerIds": FieldValue.arrayUnion([playerUserId])
        ], merge: true)
    }
}
