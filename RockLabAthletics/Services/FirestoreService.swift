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

    /// Ensures the three default channels (comm board, team chat, staff chat)
    /// exist for a team and returns all of its channels.
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
                let ref = db.collection("chats").document()
                let title = type.displayName
                let data: [String: Any] = [
                    "teamId": teamId,
                    "type": type.rawValue,
                    "title": title,
                    "createdAt": FieldValue.serverTimestamp()
                ]
                try await ref.setData(data)
                result.append(Chat(id: ref.documentID, teamId: teamId, type: type, title: title))
            }
        }
        return result
    }

    func sendMessage(chatId: String, senderId: String, senderName: String, text: String) async throws {
        let ref = db.collection("chats").document(chatId).collection("messages").document()
        try await ref.setData([
            "chatId": chatId,
            "senderId": senderId,
            "senderName": senderName,
            "text": text,
            "createdAt": Date().timeIntervalSince1970
        ])
    }

    func listenToMessages(chatId: String, onChange: @escaping ([Message]) -> Void) -> ListenerRegistration {
        db.collection("chats").document(chatId).collection("messages")
            .order(by: "createdAt")
            .addSnapshotListener { snapshot, _ in
                let messages = (snapshot?.documents ?? []).compactMap { Message(id: $0.documentID, data: $0.data()) }
                onChange(messages)
            }
    }

    // MARK: - Games & stats

    func createGame(teamId: String, opponent: String, isHome: Bool, date: Date) async throws -> String {
        let ref = db.collection("games").document()
        let data: [String: Any] = [
            "teamId": teamId,
            "opponent": opponent,
            "isHome": isHome,
            "date": date.timeIntervalSince1970,
            "status": GameStatus.upcoming.rawValue,
            "teamScore": 0,
            "opponentScore": 0,
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

    func incrementStat(gameId: String, rosterEntryId: String, playerName: String, stat: BasketballStat, delta: Int) async throws {
        let ref = db.collection("games").document(gameId).collection("stats").document(rosterEntryId)
        try await ref.setData([
            "gameId": gameId,
            "rosterEntryId": rosterEntryId,
            "playerName": playerName,
            stat.rawValue: FieldValue.increment(Int64(delta))
        ], merge: true)
    }

    func fetchStats(gameId: String) async throws -> [String: [String: Int]] {
        let snapshot = try await db.collection("games").document(gameId).collection("stats").getDocuments()
        var result: [String: [String: Int]] = [:]
        for doc in snapshot.documents {
            let data = doc.data()
            var stats: [String: Int] = [:]
            for stat in BasketballStat.allCases {
                stats[stat.rawValue] = (data[stat.rawValue] as? Int) ?? 0
            }
            result[doc.documentID] = stats
        }
        return result
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
}
