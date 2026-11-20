import Foundation
import FirebaseFirestore

/// Thin wrapper around Firestore for the core collections.
struct FirestoreService {
    static let shared = FirestoreService()

    private let db = Firestore.firestore()

    private init() {}

    // MARK: - Users

    func createUser(id: String, email: String, name: String, role: UserRole, zipCode: String = "", phone: String = "") async throws {
        let data: [String: Any] = [
            "email": email,
            "displayName": name,
            "role": role.rawValue,
            "schoolId": NSNull(),
            "zipCode": zipCode,
            "phone": phone,
            "linkedPlayerIds": [],
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await db.collection("users").document(id).setData(data)
    }

    /// Creates a minimal user doc without touching `role`, so it never clobbers
    /// a role set by an in-flight sign-up. Used by the auth-listener fallback.
    func ensureUser(id: String, email: String, name: String) async throws {
        try await db.collection("users").document(id).setData([
            "email": email,
            "displayName": name
        ], merge: true)
    }

    func updateUserPhoto(userId: String, photoURL: String) async throws {
        try await db.collection("users").document(userId).setData(["photoURL": photoURL], merge: true)
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

    func createSchool(name: String, mascot: String, zipCode: String, district: String, adUserId: String, sports: [Sport]) async throws -> String {
        let ref = db.collection("schools").document()
        let data: [String: Any] = [
            "name": name,
            "mascot": mascot,
            "zipCode": zipCode,
            "district": district,
            "districtKey": district.lowercased().trimmingCharacters(in: .whitespacesAndNewlines),
            "adUserId": adUserId,
            "logoURL": "",
            "activeSports": sports.map { $0.asDictionary },
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func updateSchoolLogo(schoolId: String, logoURL: String) async throws {
        try await db.collection("schools").document(schoolId).setData(["logoURL": logoURL], merge: true)
    }

    func updateSchool(schoolId: String, name: String, mascot: String, zipCode: String, district: String) async throws {
        try await db.collection("schools").document(schoolId).setData([
            "name": name,
            "mascot": mascot,
            "zipCode": zipCode,
            "district": district,
            "districtKey": district.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        ], merge: true)
    }

    func fetchSchool(id: String) async throws -> School? {
        let doc = try await db.collection("schools").document(id).getDocument()
        guard let data = doc.data() else { return nil }
        return School(id: id, data: data)
    }

    // MARK: - Invitations

    func createInvitation(
        email: String,
        role: UserRole,
        schoolId: String,
        schoolName: String,
        sportNames: [String],
        teamId: String? = nil,
        teamName: String? = nil
    ) async throws -> String {
        let ref = db.collection("invitations").document()
        let code = randomCode()
        var data: [String: Any] = [
            "email": email,
            "role": role.rawValue,
            "schoolId": schoolId,
            "schoolName": schoolName,
            "sportNames": sportNames,
            "code": code,
            "token": UUID().uuidString,
            "status": "pending",
            "createdAt": FieldValue.serverTimestamp()
        ]
        if let teamId { data["teamId"] = teamId }
        if let teamName { data["teamName"] = teamName }
        try await ref.setData(data)
        return code
    }

    func fetchInvitations(schoolId: String) async throws -> [Invitation] {
        let snapshot = try await db.collection("invitations")
            .whereField("schoolId", isEqualTo: schoolId)
            .getDocuments()
        return snapshot.documents.compactMap { Invitation(id: $0.documentID, data: $0.data()) }
    }

    func fetchInvitationsByEmail(email: String) async throws -> [Invitation] {
        let snapshot = try await db.collection("invitations")
            .whereField("email", isEqualTo: email)
            .getDocuments()
        return snapshot.documents.compactMap { Invitation(id: $0.documentID, data: $0.data()) }
    }

    func fetchSchools() async throws -> [School] {
        let snapshot = try await db.collection("schools").getDocuments()
        return snapshot.documents.compactMap { School(id: $0.documentID, data: $0.data()) }
    }

    /// Client-side school search (fine for a single-school directory; use a
    /// dedicated search index like Algolia/Typesense at production scale).
    func searchSchools(query: String) async throws -> [School] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let schools = try await fetchSchools()
        guard !q.isEmpty else { return schools.sorted { $0.name < $1.name } }
        return schools
            .filter { $0.name.lowercased().contains(q.lowercased()) }
            .sorted { $0.name < $1.name }
    }

    /// Associates a user with a school (lets them browse/follow that school's teams).
    func followSchool(userId: String, schoolId: String) async throws {
        try await db.collection("users").document(userId).setData(["schoolId": schoolId], merge: true)
    }

    /// Removes the user's association with their school (un-follow / leave school).
    func leaveSchool(userId: String) async throws {
        try await db.collection("users").document(userId).setData(["schoolId": FieldValue.delete()], merge: true)
    }

    func updateDisplayName(userId: String, name: String) async throws {
        try await db.collection("users").document(userId).setData(["displayName": name], merge: true)
    }

    func updateUserPhone(userId: String, phone: String) async throws {
        try await db.collection("users").document(userId).setData(["phone": phone], merge: true)
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
    ) async throws -> Team {
        // Creates the team *and* the head coach's membership so the new team
        // has every feature from day one.
        let result = try await FunctionsService.shared.createTeam(
            schoolId: schoolId,
            sportId: sportId,
            sportName: sportName,
            level: level,
            season: season,
            gender: gender,
            headCoachId: headCoachId)
        guard let teamId = result["teamId"] as? String else {
            throw NSError(domain: "FirestoreService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Team creation failed."])
        }
        let joinCode = result["joinCode"] as? String ?? ""
        return Team(id: teamId, schoolId: schoolId, sportId: sportId, sportName: sportName,
                    level: level, season: season, gender: gender, headCoachId: headCoachId, joinCode: joinCode)
    }

    func fetchTeams(schoolId: String) async throws -> [Team] {
        let snapshot = try await db.collection("teams")
            .whereField("schoolId", isEqualTo: schoolId)
            .getDocuments()
        return snapshot.documents.compactMap { Team(id: $0.documentID, data: $0.data()) }
    }

    /// Teams a user is personally attached to — used for coaches, who only ever
    /// see their own teams (never the whole school's list).
    func fetchTeams(forUser userId: String, teamIds: [String] = []) async throws -> [Team] {
        var result: [Team] = []
        var seen = Set<String>()

        let coached = try await db.collection("teams")
            .whereField("headCoachId", isEqualTo: userId)
            .getDocuments()
        for doc in coached.documents {
            if let team = Team(id: doc.documentID, data: doc.data()), !seen.contains(team.id) {
                result.append(team)
                seen.insert(team.id)
            }
        }

        for teamId in teamIds where !seen.contains(teamId) {
            if let team = try? await fetchTeam(teamId: teamId), !seen.contains(team.id) {
                result.append(team)
                seen.insert(team.id)
            }
        }

        return result.sorted { $0.sportName < $1.sportName }
    }

    /// Teams started by coaches that have no school yet (AD adoption queue).
    func fetchUnattachedTeams() async throws -> [Team] {
        let snapshot = try await db.collection("teams")
            .whereField("adoptionStatus", isEqualTo: Team.AdoptionStatus.unattached.rawValue)
            .getDocuments()
        return snapshot.documents.compactMap { Team(id: $0.documentID, data: $0.data()) }
            .sorted { $0.sportName < $1.sportName }
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

    func updateRosterEntry(teamId: String, entryId: String, playerName: String, jerseyNumber: String, position: String) async throws {
        try await db.collection("teams").document(teamId).collection("roster").document(entryId).setData([
            "playerName": playerName,
            "jerseyNumber": jerseyNumber,
            "position": position
        ], merge: true)
    }

    // MARK: - Forms

    func submitForm(
        teamId: String,
        rosterEntryId: String,
        type: FormType,
        status: FormStatus,
        expiresAt: Date? = nil,
        dueDate: Date? = nil,
        signedByName: String? = nil,
        signedAt: Date? = nil,
        submittedBy: String? = nil
    ) async throws {
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
        data["expiresAt"] = expiresAt.map { $0.timeIntervalSince1970 } ?? NSNull()
        data["dueDate"] = dueDate.map { $0.timeIntervalSince1970 } ?? NSNull()
        if let signedByName { data["signedByName"] = signedByName }
        if let signedAt { data["signedAt"] = signedAt.timeIntervalSince1970 }
        if let submittedBy { data["submittedBy"] = submittedBy }

        if let doc = existing.documents.first {
            try await doc.reference.setData(data, merge: true)
        } else {
            try await col.document().setData(data)
        }
    }

    /// Sets (or clears) a due date without touching the form's status/signature.
    func setFormDueDate(teamId: String, rosterEntryId: String, type: FormType, dueDate: Date?) async throws {
        let col = db.collection("teams").document(teamId)
            .collection("roster").document(rosterEntryId)
            .collection("forms")
        let existing = try await col.whereField("type", isEqualTo: type.rawValue).getDocuments()
        let data: [String: Any] = [
            "teamId": teamId,
            "rosterEntryId": rosterEntryId,
            "type": type.rawValue,
            "dueDate": dueDate.map { $0.timeIntervalSince1970 } ?? NSNull(),
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let doc = existing.documents.first {
            try await doc.reference.setData(data, merge: true)
        } else {
            try await col.document().setData(data)
        }
    }

    // MARK: - Team forms (templates)

    func createTeamForm(teamId: String, title: String, description: String, body: String = "", dueDate: Date?, fields: [FormField] = [], requiresParentSignature: Bool = false) async throws -> String {
        let ref = db.collection("teams").document(teamId).collection("forms").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "title": title,
            "description": description,
            "body": body,
            "dueDate": dueDate.map { $0.timeIntervalSince1970 } ?? NSNull(),
            "published": false,
            "requiresParentSignature": requiresParentSignature,
            "fields": fields.map { ["id": $0.id, "type": $0.type.rawValue, "label": $0.label, "required": $0.required] },
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchTeamForms(teamId: String, publishedOnly: Bool = false) async throws -> [TeamForm] {
        let base = db.collection("teams").document(teamId).collection("forms")
        let query: Query = publishedOnly ? base.whereField("published", isEqualTo: true) : base
        let snapshot = try await query.getDocuments()
        return snapshot.documents.compactMap { TeamForm(id: $0.documentID, data: $0.data()) }
    }

    func setTeamFormPublished(teamId: String, formId: String, published: Bool) async throws {
        try await db.collection("teams").document(teamId).collection("forms").document(formId)
            .setData(["published": published], merge: true)
    }

    func deleteTeamForm(teamId: String, formId: String) async throws {
        try await db.collection("teams").document(teamId).collection("forms").document(formId).delete()
    }

    /// Unpublishes every form for the team, which resets eligibility
    /// (eligibility only applies to forms the coach/AD has issued).
    func unpublishAllTeamForms(teamId: String) async throws {
        let forms = try await fetchTeamForms(teamId: teamId)
        let batch = db.batch()
        for form in forms where form.published {
            let ref = db.collection("teams").document(teamId).collection("forms").document(form.id)
            batch.setData(["published": false], forDocument: ref, merge: true)
        }
        try await batch.commit()
    }

    // MARK: - Injury reports

    func fetchInjuryReports(teamId: String, rosterEntryId: String) async throws -> [InjuryReport] {
        let snapshot = try await db.collection("teams").document(teamId).collection("roster")
            .document(rosterEntryId).collection("injuryReports").getDocuments()
        return snapshot.documents.compactMap { InjuryReport(id: $0.documentID, data: $0.data()) }
            .sorted { ($0.reportedAt ?? .distantPast) > ($1.reportedAt ?? .distantPast) }
    }

    func fetchFormSubmissions(teamId: String, formId: String) async throws -> [FormSubmission] {
        let snapshot = try await db.collection("teams").document(teamId).collection("forms")
            .document(formId).collection("submissions").getDocuments()
        return snapshot.documents.compactMap { FormSubmission(id: $0.documentID, data: $0.data()) }
    }

    func fetchFormSubmission(teamId: String, formId: String, entryId: String) async throws -> FormSubmission? {
        let doc = try await db.collection("teams").document(teamId).collection("forms")
            .document(formId).collection("submissions").document(entryId).getDocument()
        guard let data = doc.data() else { return nil }
        return FormSubmission(id: entryId, data: data)
    }

    func submitTeamForm(teamId: String, formId: String, rosterEntryId: String, playerName: String, signerName: String, userId: String, responses: [String: String] = [:], requiresParentSignature: Bool = false, parentSignerName: String? = nil) async throws {
        let ref = db.collection("teams").document(teamId).collection("forms")
            .document(formId).collection("submissions").document(rosterEntryId)
        try await ref.setData([
            "formId": formId,
            "rosterEntryId": rosterEntryId,
            "playerName": playerName,
            "status": FormStatus.submitted.rawValue,
            "signedByName": signerName,
            "signedAt": Date().timeIntervalSince1970,
            "submittedBy": userId,
            "responses": responses,
            "requiresParentSignature": requiresParentSignature,
            "parentSignedByName": parentSignerName ?? "",
            "updatedAt": FieldValue.serverTimestamp()
        ])
    }

    func reviewTeamFormSubmission(teamId: String, formId: String, rosterEntryId: String, status: FormStatus) async throws {
        try await db.collection("teams").document(teamId).collection("forms")
            .document(formId).collection("submissions").document(rosterEntryId)
            .setData(["status": status.rawValue, "updatedAt": FieldValue.serverTimestamp()], merge: true)
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

    // MARK: - Events

    func createEvent(teamId: String, title: String, type: EventType, date: Date, location: String, notes: String) async throws -> String {
        let ref = db.collection("events").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "title": title,
            "type": type.rawValue,
            "date": date.timeIntervalSince1970,
            "location": location,
            "notes": notes,
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchEvents(teamId: String) async throws -> [Event] {
        let snapshot = try await db.collection("events")
            .whereField("teamId", isEqualTo: teamId)
            .getDocuments()
        return snapshot.documents
            .compactMap { Event(id: $0.documentID, data: $0.data()) }
            .sorted { $0.date < $1.date }
    }

    /// Game-only event fetch for followers and non-members (the only event
    /// type they are allowed to read).
    func fetchGameEvents(teamId: String) async throws -> [Event] {
        let snapshot = try await db.collection("events")
            .whereField("teamId", isEqualTo: teamId)
            .whereField("type", isEqualTo: EventType.game.rawValue)
            .getDocuments()
        return snapshot.documents
            .compactMap { Event(id: $0.documentID, data: $0.data()) }
            .sorted { $0.date < $1.date }
    }

    func deleteEvent(eventId: String) async throws {
        try await db.collection("events").document(eventId).delete()
    }

    // MARK: - RSVP

    func setRSVP(eventId: String, userId: String, status: RSVPStatus) async throws {
        try await db.collection("events").document(eventId).collection("rsvps").document(userId).setData([
            "eventId": eventId,
            "userId": userId,
            "status": status.rawValue,
            "updatedAt": FieldValue.serverTimestamp()
        ])
    }

    func fetchRSVP(eventId: String, userId: String) async throws -> RSVPStatus? {
        let snapshot = try await db.collection("events").document(eventId).collection("rsvps").document(userId).getDocument()
        guard let data = snapshot.data(), let raw = data["status"] as? String else { return nil }
        return RSVPStatus(rawValue: raw)
    }

    // MARK: - Attendance

    func setAttendance(eventId: String, rosterEntryId: String, status: AttendanceStatus) async throws {
        try await db.collection("events").document(eventId).collection("attendance").document(rosterEntryId).setData([
            "eventId": eventId,
            "rosterEntryId": rosterEntryId,
            "status": status.rawValue,
            "updatedAt": FieldValue.serverTimestamp()
        ])
    }

    func fetchAttendance(eventId: String) async throws -> [String: AttendanceStatus] {
        let snapshot = try await db.collection("events").document(eventId).collection("attendance").getDocuments()
        var result: [String: AttendanceStatus] = [:]
        for doc in snapshot.documents {
            if let raw = doc.data()["status"] as? String, let status = AttendanceStatus(rawValue: raw) {
                result[doc.documentID] = status
            }
        }
        return result
    }

    // MARK: - Chats

    /// Read-only fetch of a team's existing chat channels, restricted to the
    /// given types (each queried separately so security rules never deny the
    /// whole query for users who can't see every channel).
    func fetchChats(teamId: String, types: [ChatType]) async throws -> [Chat] {
        var result: [Chat] = []
        for type in types {
            let snapshot = try await db.collection("chats")
                .whereField("teamId", isEqualTo: teamId)
                .whereField("type", isEqualTo: type.rawValue)
                .getDocuments()
            result.append(contentsOf: snapshot.documents.compactMap { Chat(id: $0.documentID, data: $0.data()) })
        }
        return result
    }

    /// Ensures the four default channels (comm board, team, staff, parent)
    /// exist for a team and returns all of its channels. Caller must be a manager.
    /// Channel IDs are deterministic so this is idempotent with the server-side
    /// `onTeamCreated` trigger that also seeds channels + welcome messages.
    func ensureDefaultChats(teamId: String) async throws -> [Chat] {
        var result: [Chat] = []
        for type in ChatType.allCases {
            let snapshot = try await db.collection("chats")
                .whereField("teamId", isEqualTo: teamId)
                .whereField("type", isEqualTo: type.rawValue)
                .getDocuments()
            if let doc = snapshot.documents.first, let chat = Chat(id: doc.documentID, data: doc.data()) {
                result.append(chat)
            } else {
                let chatId = "\(teamId)_\(type.rawValue)"
                let title = type.displayName
                let ref = db.collection("chats").document(chatId)
                try await ref.setData([
                    "teamId": teamId,
                    "type": type.rawValue,
                    "title": title,
                    "createdAt": FieldValue.serverTimestamp()
                ])
                try await seedWelcomeMessage(chatId: chatId, title: title)
                result.append(Chat(id: chatId, teamId: teamId, type: type, title: title))
            }
        }
        return result
    }

    /// Posts the system welcome message for a channel (idempotent, fixed id).
    private func seedWelcomeMessage(chatId: String, title: String) async throws {
        let ref = db.collection("chats").document(chatId).collection("messages").document("welcome")
        try await ref.setData([
            "chatId": chatId,
            "senderId": "system",
            "senderName": "RockLab Athletics",
            "text": "Welcome to \(title)!",
            "createdAt": Date().timeIntervalSince1970
        ])
    }

    func sendMessage(chatId: String, senderId: String, senderName: String, senderPhotoURL: String = "", text: String, category: String = CommCategory.general.rawValue) async throws {
        let ref = db.collection("chats").document(chatId).collection("messages").document()
        try await ref.setData([
            "chatId": chatId,
            "senderId": senderId,
            "senderName": senderName,
            "senderPhotoURL": senderPhotoURL,
            "text": text,
            "category": category,
            "createdAt": Date().timeIntervalSince1970
        ])
    }

    func listenToMessages(chatId: String, categories: [String]? = nil, onChange: @escaping ([Message]) -> Void) -> ListenerRegistration {
        var query: Query = db.collection("chats").document(chatId).collection("messages")
        if let categories {
            query = query.whereField("category", in: categories)
        }
        return query.order(by: "createdAt").addSnapshotListener { snapshot, _ in
            let messages = (snapshot?.documents ?? []).compactMap { Message(id: $0.documentID, data: $0.data()) }
            onChange(messages)
        }
    }

    // MARK: - Games & stats

    func createGame(teamId: String, opponent: String, isHome: Bool, date: Date, isDistrictGame: Bool = false) async throws -> String {
        let ref = db.collection("games").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "opponent": opponent,
            "isHome": isHome,
            "date": date.timeIntervalSince1970,
            "status": GameStatus.upcoming.rawValue,
            "teamScore": 0,
            "opponentScore": 0,
            "isDistrictGame": isDistrictGame,
            "period": 0,
            "clockSeconds": 0,
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchGames(teamId: String) async throws -> [Game] {
        let snapshot = try await db.collection("games")
            .whereField("teamId", isEqualTo: teamId)
            .getDocuments()
        return snapshot.documents
            .compactMap { Game(id: $0.documentID, data: $0.data()) }
            .sorted { $0.date < $1.date }
    }

    /// Live listener for a single game (score/status updates in real time).
    func listenToGame(gameId: String, onChange: @escaping (Game?) -> Void) -> ListenerRegistration {
        db.collection("games").document(gameId).addSnapshotListener { snapshot, _ in
            guard let data = snapshot?.data() else { onChange(nil); return }
            onChange(Game(id: gameId, data: data))
        }
    }

    /// Live listener for all of a team's games (for the live-now banner).
    func listenToGames(teamId: String, onChange: @escaping ([Game]) -> Void) -> ListenerRegistration {
        db.collection("games")
            .whereField("teamId", isEqualTo: teamId)
            .addSnapshotListener { snapshot, _ in
                guard let snapshot else { return }
                onChange(snapshot.documents.compactMap { Game(id: $0.documentID, data: $0.data()) })
            }
    }

    /// Live listener for a team's broadcasts (for the live-now banner).
    func listenToBroadcasts(teamId: String, onChange: @escaping ([Broadcast]) -> Void) -> ListenerRegistration {
        db.collection("broadcasts")
            .whereField("teamId", isEqualTo: teamId)
            .addSnapshotListener { snapshot, _ in
                guard let snapshot else { return }
                onChange(snapshot.documents.compactMap { Broadcast(id: $0.documentID, data: $0.data()) })
            }
    }

    /// A team's win/loss record from final games.
    func fetchTeamRecord(teamId: String) async throws -> (wins: Int, losses: Int) {
        let games = try await fetchGames(teamId: teamId)
        var wins = 0
        var losses = 0
        for g in games where g.status == .final {
            if g.teamScore > g.opponentScore { wins += 1 }
            else if g.teamScore < g.opponentScore { losses += 1 }
        }
        return (wins, losses)
    }

    /// Teams (from other organizations) that share this school's district.
    func fetchDistrictTeams(schoolId: String) async throws -> [DistrictTeam] {
        guard let school = try await fetchSchool(id: schoolId), !school.districtKey.isEmpty else { return [] }
        let schoolsSnap = try await db.collection("schools")
            .whereField("districtKey", isEqualTo: school.districtKey)
            .getDocuments()
        var schoolNames: [String: String] = [:]
        var ids: [String] = []
        for doc in schoolsSnap.documents {
            ids.append(doc.documentID)
            schoolNames[doc.documentID] = doc.data()["name"] as? String ?? "School"
        }
        guard !ids.isEmpty else { return [] }
        var result: [DistrictTeam] = []
        for chunk in ids.chunked(into: 10) {
            let teamsSnap = try await db.collection("teams").whereField("schoolId", in: chunk).getDocuments()
            for doc in teamsSnap.documents {
                guard let team = Team(id: doc.documentID, data: doc.data()), team.schoolId != schoolId else { continue }
                result.append(DistrictTeam(
                    id: team.id,
                    teamName: "\(team.sportName) \(team.level)",
                    schoolName: schoolNames[team.schoolId] ?? "School",
                    schoolId: team.schoolId))
            }
        }
        return result.sorted { $0.schoolName < $1.schoolName }
    }

    func updateGameScore(gameId: String, teamScore: Int, opponentScore: Int, status: GameStatus) async throws {
        try await db.collection("games").document(gameId).setData([
            "teamScore": teamScore,
            "opponentScore": opponentScore,
            "status": status.rawValue
        ], merge: true)
    }

    func setGameStatus(gameId: String, status: GameStatus) async throws {
        try await db.collection("games").document(gameId).setData(["status": status.rawValue], merge: true)
    }

    func updateGameClock(gameId: String, period: Int, clockSeconds: Int) async throws {
        try await db.collection("games").document(gameId).setData(["period": period, "clockSeconds": clockSeconds], merge: true)
    }

    func setGolfHoles(gameId: String, rosterEntryId: String, playerName: String, holes: [Int]) async throws {
        let ref = db.collection("games").document(gameId).collection("stats").document(rosterEntryId)
        var data: [String: Any] = [
            "gameId": gameId,
            "rosterEntryId": rosterEntryId,
            "playerName": playerName
        ]
        var total = 0
        for (index, strokes) in holes.enumerated() {
            data["h\(index + 1)"] = strokes
            total += strokes
        }
        data["strokes"] = total
        try await ref.setData(data, merge: true)
    }

    func incrementStat(gameId: String, rosterEntryId: String, playerName: String, stat: String, delta: Int) async throws {
        let ref = db.collection("games").document(gameId).collection("stats").document(rosterEntryId)
        try await ref.setData([
            "gameId": gameId,
            "rosterEntryId": rosterEntryId,
            "playerName": playerName,
            stat: FieldValue.increment(Int64(delta))
        ], merge: true)
    }

    func fetchStats(gameId: String) async throws -> [String: [String: Int]] {
        let snapshot = try await db.collection("games").document(gameId).collection("stats").getDocuments()
        var result: [String: [String: Int]] = [:]
        for doc in snapshot.documents {
            var stats: [String: Int] = [:]
            for (key, value) in doc.data() {
                if let int = value as? Int { stats[key] = int }
            }
            result[doc.documentID] = stats
        }
        return result
    }

    /// Per-player per-game averages for a team, derived from public game stats
    /// (so it works for other organizations' teams too).
    func fetchTeamStatLines(teamId: String, stats: [SportStat]) async throws -> [PlayerStatLine] {
        let keys = stats.map { $0.key }
        let primaryKey = keys.first
        let games = try await fetchGames(teamId: teamId)
        var totals: [String: [String: Int]] = [:]
        var names: [String: String] = [:]
        var gameCounts: [String: Int] = [:]
        for game in games {
            let snapshot = try await db.collection("games").document(game.id).collection("stats").getDocuments()
            for doc in snapshot.documents {
                let data = doc.data()
                let entryId = doc.documentID
                names[entryId] = data["playerName"] as? String ?? "Player"
                gameCounts[entryId, default: 0] += 1
                for key in keys {
                    totals[entryId, default: [:]][key, default: 0] += (data[key] as? Int) ?? 0
                }
            }
        }
        return totals.map { entryId, statTotals in
            let gp = max(gameCounts[entryId] ?? 1, 1)
            var averages: [String: Double] = [:]
            for key in keys { averages[key] = Double(statTotals[key] ?? 0) / Double(gp) }
            return PlayerStatLine(id: entryId, playerName: names[entryId] ?? "Player",
                                  gamesPlayed: gameCounts[entryId] ?? 0, averages: averages)
        }
        .sorted { ($0.averages[primaryKey ?? ""] ?? 0) > ($1.averages[primaryKey ?? ""] ?? 0) }
    }

    /// All athletic directors across all organizations, with their school name.
    func fetchADDirectory() async throws -> [ADContact] {
        let snapshot = try await db.collection("users").whereField("role", isEqualTo: "ad").getDocuments()
        var result: [ADContact] = []
        for doc in snapshot.documents {
            let data = doc.data()
            var schoolName = ""
            var zipCode = ""
            var district = ""
            var districtKey = ""
            if let schoolId = data["schoolId"] as? String, let school = try? await fetchSchool(id: schoolId) {
                schoolName = school.name
                zipCode = school.zipCode
                district = school.district
                districtKey = school.districtKey
            }
            let email = data["email"] as? String ?? ""
            let name = (data["displayName"] as? String)?.isEmpty == false ? (data["displayName"] as! String) : email
            result.append(ADContact(id: doc.documentID, name: name, email: email, schoolName: schoolName, zipCode: zipCode, district: district, districtKey: districtKey))
        }
        return result.sorted { $0.schoolName < $1.schoolName }
    }

    // MARK: - Trips

    func createTrip(teamId: String, title: String, destination: String, departureDate: Date, returnDate: Date, busNumber: String, hotelInfo: String, mealPlan: String) async throws -> String {
        let ref = db.collection("trips").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "title": title,
            "destination": destination,
            "departureDate": departureDate.timeIntervalSince1970,
            "returnDate": returnDate.timeIntervalSince1970,
            "busNumber": busNumber,
            "hotelInfo": hotelInfo,
            "mealPlan": mealPlan,
            "rosterIds": [],
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchTrips(teamId: String) async throws -> [Trip] {
        let snapshot = try await db.collection("trips")
            .whereField("teamId", isEqualTo: teamId)
            .getDocuments()
        return snapshot.documents
            .compactMap { Trip(id: $0.documentID, data: $0.data()) }
            .sorted { $0.departureDate < $1.departureDate }
    }

    func toggleTripRoster(tripId: String, rosterEntryId: String, isOn: Bool) async throws {
        let value = isOn ? FieldValue.arrayUnion([rosterEntryId]) : FieldValue.arrayRemove([rosterEntryId])
        try await db.collection("trips").document(tripId).setData(["rosterIds": value], merge: true)
    }

    func deleteTrip(tripId: String) async throws {
        try await db.collection("trips").document(tripId).delete()
    }

    // MARK: - Fundraisers

    func createFundraiser(teamId: String, title: String, type: FundraiserType, goal: Double) async throws -> String {
        let ref = db.collection("fundraisers").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "title": title,
            "type": type.rawValue,
            "goal": goal,
            "raised": 0.0,
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchFundraisers(teamId: String) async throws -> [Fundraiser] {
        let snapshot = try await db.collection("fundraisers")
            .whereField("teamId", isEqualTo: teamId)
            .getDocuments()
        return snapshot.documents.compactMap { Fundraiser(id: $0.documentID, data: $0.data()) }
    }

    func addDonation(fundraiserId: String, donorName: String, amount: Double) async throws -> String {
        let ref = db.collection("fundraisers").document(fundraiserId).collection("donations").document()
        try await ref.setData([
            "fundraiserId": fundraiserId,
            "donorName": donorName,
            "amount": amount,
            "date": Date().timeIntervalSince1970
        ])
        try await db.collection("fundraisers").document(fundraiserId).setData(["raised": FieldValue.increment(amount)], merge: true)
        return ref.documentID
    }

    func fetchDonations(fundraiserId: String) async throws -> [Donation] {
        let snapshot = try await db.collection("fundraisers").document(fundraiserId).collection("donations").getDocuments()
        return snapshot.documents
            .compactMap { Donation(id: $0.documentID, data: $0.data()) }
            .sorted { $0.date > $1.date }
    }

    func fetchFundraiserProgress(fundraiserId: String) async throws -> [FundraiserProgress] {
        let snapshot = try await db.collection("fundraisers").document(fundraiserId).collection("progress").getDocuments()
        return snapshot.documents.compactMap { FundraiserProgress(id: $0.documentID, data: $0.data()) }
    }

    /// Upserts a player's raised amount and/or submitted flag on a campaign.
    func upsertFundraiserProgress(fundraiserId: String, rosterEntryId: String, playerName: String, raised: Double?, submitted: Bool?) async throws {
        let ref = db.collection("fundraisers").document(fundraiserId).collection("progress").document(rosterEntryId)
        var data: [String: Any] = [
            "fundraiserId": fundraiserId,
            "rosterEntryId": rosterEntryId,
            "playerName": playerName,
        ]
        if let raised { data["raised"] = raised }
        if let submitted { data["submitted"] = submitted }
        try await ref.setData(data, merge: true)
    }

    // MARK: - Volunteer shifts

    func createVolunteerShift(teamId: String, title: String, start: Date, end: Date, slotsPerShift: Int, incrementMinutes: Int, playersCanVolunteer: Bool, note: String) async throws -> String {
        let ref = db.collection("teams").document(teamId).collection("volunteerShifts").document()
        try await ref.setData([
            "teamId": teamId,
            "title": title,
            "start": start.timeIntervalSince1970,
            "end": end.timeIntervalSince1970,
            "slotsPerShift": slotsPerShift,
            "incrementMinutes": incrementMinutes,
            "playersCanVolunteer": playersCanVolunteer,
            "note": note,
            "createdAt": FieldValue.serverTimestamp()
        ])
        return ref.documentID
    }

    func fetchVolunteerShifts(teamId: String) async throws -> [VolunteerShift] {
        let snapshot = try await db.collection("teams").document(teamId).collection("volunteerShifts").getDocuments()
        return snapshot.documents.compactMap { VolunteerShift(id: $0.documentID, data: $0.data()) }
            .sorted { $0.start < $1.start }
    }

    func deleteVolunteerShift(teamId: String, shiftId: String) async throws {
        try await db.collection("teams").document(teamId).collection("volunteerShifts").document(shiftId).delete()
    }

    func fetchShiftSignups(teamId: String, shiftId: String) async throws -> [ShiftSignup] {
        let snapshot = try await db.collection("teams").document(teamId).collection("volunteerShifts").document(shiftId)
            .collection("signups").getDocuments()
        return snapshot.documents.compactMap { ShiftSignup(id: $0.documentID, data: $0.data()) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    // MARK: - Team media

    func addTeamMedia(teamId: String, imageURL: String, caption: String, addedByName: String) async throws {
        let ref = db.collection("teams").document(teamId).collection("media").document()
        try await ref.setData([
            "teamId": teamId,
            "imageURL": imageURL,
            "caption": caption,
            "addedByName": addedByName,
            "createdAt": Date().timeIntervalSince1970
        ])
    }

    func fetchTeamMedia(teamId: String) async throws -> [TeamMedia] {
        let snapshot = try await db.collection("teams").document(teamId).collection("media").getDocuments()
        return snapshot.documents
            .compactMap { TeamMedia(id: $0.documentID, data: $0.data()) }
            .sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Direct messages

    func conversationId(_ a: String, _ b: String) -> String {
        [a, b].sorted().joined(separator: "_")
    }

    func fetchOrCreateConversation(myUid: String, myName: String, otherUid: String, otherName: String) async throws -> Conversation {
        let id = conversationId(myUid, otherUid)
        let snapshot = try await db.collection("conversations")
            .whereField("participantIds", arrayContains: myUid)
            .getDocuments()
        if let doc = snapshot.documents.first(where: { ($0.data()["participantIds"] as? [String])?.contains(otherUid) == true }),
           let conv = Conversation(id: doc.documentID, data: doc.data()) {
            return conv
        }
        let conv = Conversation(id: id, participantIds: [myUid, otherUid],
                                participantNames: [myUid: myName, otherUid: otherName], createdAt: Date())
        try await db.collection("conversations").document(id).setData([
            "participantIds": [myUid, otherUid],
            "participantNames": [myUid: myName, otherUid: otherName],
            "createdAt": Date().timeIntervalSince1970
        ])
        return conv
    }

    func fetchMyConversations(userId: String) async throws -> [Conversation] {
        let snapshot = try await db.collection("conversations")
            .whereField("participantIds", arrayContains: userId)
            .getDocuments()
        return snapshot.documents.compactMap { Conversation(id: $0.documentID, data: $0.data()) }
    }

    func listenToDirectMessages(conversationId: String, onChange: @escaping ([DirectMessage]) -> Void) -> ListenerRegistration {
        db.collection("conversations").document(conversationId).collection("messages")
            .order(by: "createdAt")
            .addSnapshotListener { snapshot, _ in
                let messages = (snapshot?.documents ?? []).compactMap { DirectMessage(id: $0.documentID, data: $0.data()) }
                onChange(messages)
            }
    }

    func sendDirectMessage(conversationId: String, senderId: String, senderName: String, senderPhotoURL: String = "", text: String) async throws {
        let ref = db.collection("conversations").document(conversationId).collection("messages").document()
        try await ref.setData([
            "conversationId": conversationId,
            "senderId": senderId,
            "senderName": senderName,
            "senderPhotoURL": senderPhotoURL,
            "text": text,
            "createdAt": Date().timeIntervalSince1970
        ])
    }

    // MARK: - Showcases & highlights

    func fetchShowcase(rosterEntryId: String) async throws -> Showcase? {
        let snapshot = try await db.collection("showcases").document(rosterEntryId).getDocument()
        guard let data = snapshot.data() else { return nil }
        return Showcase(id: snapshot.documentID, data: data)
    }

    func createShowcase(rosterEntryId: String, teamId: String, playerName: String, position: String) async throws {
        try await db.collection("showcases").document(rosterEntryId).setData([
            "rosterEntryId": rosterEntryId,
            "teamId": teamId,
            "playerName": playerName,
            "position": position,
            "height": "",
            "weight": "",
            "graduationYear": "",
            "gpa": "",
            "bio": "",
            "createdAt": FieldValue.serverTimestamp()
        ])
    }

    func saveShowcase(_ showcase: Showcase) async throws {
        try await db.collection("showcases").document(showcase.id).setData([
            "rosterEntryId": showcase.rosterEntryId,
            "teamId": showcase.teamId,
            "playerName": showcase.playerName,
            "position": showcase.position,
            "height": showcase.height,
            "weight": showcase.weight,
            "graduationYear": showcase.graduationYear,
            "gpa": showcase.gpa,
            "bio": showcase.bio
        ], merge: true)
    }

    // MARK: - Broadcasts

    func createBroadcast(teamId: String, gameId: String?, title: String, url: String, createdByName: String) async throws -> String {
        let ref = db.collection("broadcasts").document()
        var data: [String: Any] = [
            "teamId": teamId,
            "title": title,
            "url": url,
            "isLive": false,
            "createdByName": createdByName,
            "createdAt": Date().timeIntervalSince1970
        ]
        if let gameId { data["gameId"] = gameId }
        try await ref.setData(data)
        return ref.documentID
    }

    func fetchBroadcasts(teamId: String) async throws -> [Broadcast] {
        let snapshot = try await db.collection("broadcasts").whereField("teamId", isEqualTo: teamId).getDocuments()
        return snapshot.documents
            .compactMap { Broadcast(id: $0.documentID, data: $0.data()) }
            .sorted { $0.createdAt > $1.createdAt }
    }

    func setBroadcastLive(id: String, isLive: Bool) async throws {
        try await db.collection("broadcasts").document(id).setData(["isLive": isLive], merge: true)
    }

    func removeBroadcast(id: String) async throws {
        try await db.collection("broadcasts").document(id).delete()
    }

    /// Aggregates a player's stats across all games for a team (stat-to-profile sync).
    func fetchCareerStats(teamId: String, rosterEntryId: String, stats: [SportStat]) async throws -> [String: Int] {
        let keys = stats.map { $0.key }
        let games = try await fetchGames(teamId: teamId)
        var totals: [String: Int] = [:]
        for game in games {
            let doc = try await db.collection("games").document(game.id).collection("stats").document(rosterEntryId).getDocument()
            guard let data = doc.data() else { continue }
            for key in keys {
                totals[key] = (totals[key] ?? 0) + ((data[key] as? Int) ?? 0)
            }
        }
        return totals
    }

    // MARK: - Invites & joining

    private func randomCode(length: Int = 6) -> String {
        let chars = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        return String((0..<length).map { _ in chars.randomElement()! })
    }

    func fetchTeam(teamId: String) async throws -> Team? {
        let snapshot = try await db.collection("teams").document(teamId).getDocument()
        guard let data = snapshot.data() else { return nil }
        return Team(id: snapshot.documentID, data: data)
    }

    func findTeamByJoinCode(_ code: String) async throws -> Team? {
        let snapshot = try await db.collection("teams")
            .whereField("joinCode", isEqualTo: code)
            .getDocuments()
        return snapshot.documents.first.flatMap { Team(id: $0.documentID, data: $0.data()) }
    }

    func findInvitationByCode(_ code: String) async throws -> Invitation? {
        let snapshot = try await db.collection("invitations")
            .whereField("code", isEqualTo: code)
            .getDocuments()
        return snapshot.documents.first.flatMap { Invitation(id: $0.documentID, data: $0.data()) }
    }

    func fetchTeamInvitations(teamId: String) async throws -> [Invitation] {
        let snapshot = try await db.collection("invitations")
            .whereField("teamId", isEqualTo: teamId)
            .getDocuments()
        return snapshot.documents.compactMap { Invitation(id: $0.documentID, data: $0.data()) }
    }

    /// Joins the current user via an invite code (role-specific) or a team
    /// join code (follower). Creates the team membership. Returns the role.
    func joinWithCode(code: String, userId: String, email: String, name: String = "") async throws -> UserRole {
        if let invitation = try await findInvitationByCode(code) {
            guard invitation.email.lowercased() == email.lowercased() else {
                throw NSError(domain: "join", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "This invite is for \(invitation.email)."])
            }
            var schoolId = invitation.schoolId
            var teamId: String?
            if let tid = invitation.teamId, let team = try await fetchTeam(teamId: tid) {
                schoolId = team.schoolId
                teamId = tid
            }
            try await updateUserRoleAndSchool(id: userId, role: invitation.role, schoolId: schoolId)
            if let tid = teamId {
                try await createMembership(teamId: tid, userId: userId, role: invitation.role, name: name, email: email)
                try await addTeamToUser(userId: userId, teamId: tid)
                // A coach who joins a team becomes that team's head coach (admin).
                if invitation.role == .coach {
                    try await db.collection("teams").document(tid).setData(["headCoachId": userId], merge: true)
                }
            }
            return invitation.role
        }
        if let team = try await findTeamByJoinCode(code) {
            try await db.collection("users").document(userId).setData(["schoolId": team.schoolId], merge: true)
            try await createMembership(teamId: team.id, userId: userId, role: .follower, name: name, email: email)
            try await addTeamToUser(userId: userId, teamId: team.id)
            return .follower
        }
        throw NSError(domain: "join", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "Invalid invite code."])
    }

    func updateRosterEntryParent(teamId: String, entryId: String, parentEmail: String, parentName: String) async throws {
        try await db.collection("teams").document(teamId).collection("roster").document(entryId).setData([
            "parentEmail": parentEmail,
            "parentName": parentName
        ], merge: true)
    }

    func fetchSchoolUsers(schoolId: String) async throws -> [AppUser] {
        let snapshot = try await db.collection("users")
            .whereField("schoolId", isEqualTo: schoolId)
            .getDocuments()
        return snapshot.documents.map { AppUser(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Team memberships & permissions

    func createMembership(teamId: String, userId: String, role: UserRole, name: String, email: String, permissions: [String] = []) async throws {
        try await db.collection("teams").document(teamId).collection("members").document(userId).setData([
            "teamId": teamId,
            "userId": userId,
            "role": role.rawValue,
            "name": name,
            "email": email,
            "permissions": permissions,
            "createdAt": FieldValue.serverTimestamp()
        ], merge: true)
    }

    func fetchMemberships(teamId: String) async throws -> [TeamMembership] {
        let snapshot = try await db.collection("teams").document(teamId).collection("members").getDocuments()
        return snapshot.documents.compactMap { TeamMembership(id: $0.documentID, data: $0.data()) }
    }

    func fetchMembership(teamId: String, userId: String) async throws -> TeamMembership? {
        let snapshot = try await db.collection("teams").document(teamId).collection("members").document(userId).getDocument()
        guard let data = snapshot.data() else { return nil }
        return TeamMembership(id: snapshot.documentID, data: data)
    }

    func updateMemberPermissions(teamId: String, userId: String, permissions: [String]) async throws {
        try await db.collection("teams").document(teamId).collection("members").document(userId).setData(["permissions": permissions], merge: true)
    }

    func removeMember(teamId: String, userId: String) async throws {
        try await db.collection("teams").document(teamId).collection("members").document(userId).delete()
        try await db.collection("users").document(userId).setData(["teamIds": FieldValue.arrayRemove([teamId])], merge: true)
    }

    func addTeamToUser(userId: String, teamId: String) async throws {
        try await db.collection("users").document(userId).setData(["teamIds": FieldValue.arrayUnion([teamId])], merge: true)
    }

    func followTeam(teamId: String, userId: String, name: String, email: String) async throws {
        try await createMembership(teamId: teamId, userId: userId, role: .follower, name: name, email: email)
        try await addTeamToUser(userId: userId, teamId: teamId)
    }

    /// Loads the effective access for a user against a single team.
    func teamAccess(teamId: String, userId: String?, isAd: Bool) async -> TeamAccess {
        var access = TeamAccess(isAd: isAd)
        guard let userId, !userId.isEmpty else { return access }
        access.membership = try? await fetchMembership(teamId: teamId, userId: userId)

        // Self-heal: a head coach must always have coach membership, otherwise
        // a newly created team would appear without roster/forms/injury access.
        if access.membership == nil,
           let team = try? await fetchTeam(teamId: teamId),
           team.headCoachId == userId {
            _ = try? await FunctionsService.shared.ensureTeamCoachMembership(teamId: teamId)
            access.membership = try? await fetchMembership(teamId: teamId, userId: userId)
        }
        return access
    }

    /// Fetches all users who have followed this school, categorized by role.
    func fetchSchoolFollowers(schoolId: String) async throws -> [[String: Any]] {
        let snapshot = try await db.collection("users")
            .whereField("schoolId", isEqualTo: schoolId)
            .whereField("role", in: ["coach", "staff", "player", "parent", "follower"])
            .getDocuments()
        return snapshot.documents.map { doc in
            var dict = doc.data()
            dict["id"] = doc.documentID
            return dict
        }
    }
}
