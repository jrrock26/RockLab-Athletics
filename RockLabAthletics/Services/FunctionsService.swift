import Foundation
import FirebaseFunctions

/// Wraps Firebase Callable Cloud Functions.
struct FunctionsService {
    static let shared = FunctionsService()
    private let functions = Functions.functions()
    private init() {}

    /// Calls the server-side `manageUserRole` function.
    func manageUserRole(targetUid: String, action: String, newRole: String? = nil) async throws {
        var data: [String: Any] = ["targetUid": targetUid, "action": action]
        if let newRole { data["newRole"] = newRole }
        _ = try await functions.httpsCallable("manageUserRole").call(data)
    }

    /// Asks the server to generate a full form (title, description, body) from a prompt.
    func generateFormContent(prompt: String, teamId: String) async throws -> (title: String, description: String, body: String, templateId: String) {
        let result = try await functions.httpsCallable("generateFormContent").call(["prompt": prompt, "teamId": teamId])
        guard let data = result.data as? [String: Any],
              let title = data["title"] as? String else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from generateFormContent."])
        }
        return (title,
                data["description"] as? String ?? "",
                data["body"] as? String ?? "",
                data["templateId"] as? String ?? "")
    }

    /// Adds a user to a team and sets their role (coach/AD only).
    func assignTeamRole(teamId: String, targetUid: String, role: String) async throws {
        _ = try await functions.httpsCallable("assignTeamRole").call([
            "teamId": teamId, "targetUid": targetUid, "role": role
        ])
    }

    /// Creates dev test accounts for all roles (AD only).
    func createDevAccounts() async throws -> [String: Any] {
        let result = try await functions.httpsCallable("createDevAccounts").call([:])
        guard let data = result.data as? [String: Any] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from createDevAccounts."])
        }
        return data
    }

    /// Accepts a pending invitation (server-side, bypasses security rules).
    func acceptInvitation(invitationId: String, userId: String, email: String, name: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("acceptInvitation").call([
            "invitationId": invitationId, "userId": userId, "email": email, "name": name
        ])
        guard let data = result.data as? [String: Any] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from acceptInvitation."])
        }
        return data
    }

    /// Rejects a pending invitation.
    func rejectInvitation(invitationId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("rejectInvitation").call(["invitationId": invitationId])
        guard let data = result.data as? [String: Any] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from rejectInvitation."])
        }
        return data
    }

    /// Cancels/deletes a pending invitation (AD or team coach only).
    func deleteInvitation(invitationId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("deleteInvitation").call(["invitationId": invitationId])
        guard let data = result.data as? [String: Any] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from deleteInvitation."])
        }
        return data
    }

    /// Ensures the calling player has a roster entry on the team (self-heal).
    func ensurePlayerRosterEntry(teamId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("ensurePlayerRosterEntry").call(["teamId": teamId])
        guard let data = result.data as? [String: Any] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from ensurePlayerRosterEntry."])
        }
        return data
    }

    /// Parent: sanitized roster (names only) to pick their child.
    func listRosterForLinking(teamId: String) async throws -> [[String: Any]] {
        let result = try await functions.httpsCallable("listRosterForLinking").call(["teamId": teamId])
        guard let data = result.data as? [String: Any],
              let players = data["players"] as? [[String: Any]] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from listRosterForLinking."])
        }
        return players
    }

    /// Parent: request to link to a roster player.
    func requestParentLink(teamId: String, rosterEntryId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("requestParentLink").call([
            "teamId": teamId, "rosterEntryId": rosterEntryId
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// AD/coach: pending parent-link requests for a team.
    func listParentLinkRequests(teamId: String) async throws -> [[String: Any]] {
        let result = try await functions.httpsCallable("listParentLinkRequests").call(["teamId": teamId])
        guard let data = result.data as? [String: Any],
              let requests = data["requests"] as? [[String: Any]] else {
            throw NSError(domain: "FunctionsService", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid response from listParentLinkRequests."])
        }
        return requests
    }

    /// AD/coach: approve a parent-link request.
    func approveParentLink(requestId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("approveParentLink").call(["requestId": requestId])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// AD/coach: reject a parent-link request.
    func rejectParentLink(requestId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("rejectParentLink").call(["requestId": requestId])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Volunteer: atomically sign up for one slot of a shift.
    func volunteerSignUp(teamId: String, shiftId: String, slotIndex: Int, participantUserId: String? = nil) async throws -> [String: Any] {
        var payload: [String: Any] = ["teamId": teamId, "shiftId": shiftId, "slotIndex": slotIndex]
        if let participantUserId { payload["participantUserId"] = participantUserId }
        let result = try await functions.httpsCallable("volunteerSignUp").call(payload)
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Volunteer: cancel a shift sign-up (for yourself or a linked player).
    func volunteerCancelSignUp(teamId: String, shiftId: String, participantUserId: String? = nil) async throws -> [String: Any] {
        var payload: [String: Any] = ["teamId": teamId, "shiftId": shiftId]
        if let participantUserId { payload["participantUserId"] = participantUserId }
        let result = try await functions.httpsCallable("volunteerCancelSignUp").call(payload)
        return (result.data as? [String: Any]) ?? [:]
    }

    // MARK: - Injury status

    /// AD/coach/staff: file an injury report and set the player's status.
    func reportPlayerInjury(teamId: String,
                            rosterEntryId: String,
                            status: String,
                            bodyPart: String,
                            details: String,
                            severity: String,
                            expectedReturn: String) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "teamId": teamId,
            "rosterEntryId": rosterEntryId,
            "status": status,
            "bodyPart": bodyPart,
            "description": details,
            "severity": severity,
            "expectedReturn": expectedReturn,
        ]
        let result = try await functions.httpsCallable("reportPlayerInjury").call(payload)
        return (result.data as? [String: Any]) ?? [:]
    }

    /// AD/coach/staff: clear a player to return to full participation.
    func clearPlayerInjury(teamId: String, rosterEntryId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("clearPlayerInjury").call([
            "teamId": teamId, "rosterEntryId": rosterEntryId
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    // MARK: - Teams

    /// AD: creates a team and sets up the head coach's membership so the new
    /// team has every feature (roster, forms, injuries, volunteer, etc.).
    func createTeam(schoolId: String,
                    sportId: String,
                    sportName: String,
                    level: String,
                    season: String,
                    gender: String,
                    headCoachId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("createTeam").call([
            "schoolId": schoolId,
            "sportId": sportId,
            "sportName": sportName,
            "level": level,
            "season": season,
            "gender": gender,
            "headCoachId": headCoachId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Starts next season's team from an existing one: copies athletes and
    /// guardian contacts, carries coaches/staff over, and deliberately resets
    /// injury state so every athlete must be re-cleared for the new season.
    func rolloverTeam(teamId: String, newSeason: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("rolloverTeam").call([
            "teamId": teamId,
            "newSeason": newSeason,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Moves a player to another team (e.g. Jr High -> JV). Keeps the athlete's
    /// account link and guardian contact, resets injury state, and leaves the
    /// source entry on the old roster marked as promoted.
    func promotePlayer(entryId: String, fromTeamId: String, toTeamId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("promotePlayer").call([
            "entryId": entryId,
            "fromTeamId": fromTeamId,
            "toTeamId": toTeamId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Offers to score a game. Several people may sign up; the coach picks one.
    func signUpForGame(requestId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("signUpForGame").call([
            "requestId": requestId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Coach/AD selection of exactly one scorer for a game. Revokes any others.
    func assignGameStatistician(requestId: String, userId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("assignGameStatistician").call([
            "requestId": requestId,
            "userId": userId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Asks the team for a volunteer to run one game's scoring.
    func requestGameStatistician(gameId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("requestGameStatistician").call([
            "gameId": gameId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Gives a game back. `cancel: true` (coach/AD only) closes the request
    /// instead of reopening it.
    func releaseGameStatistician(requestId: String, cancel: Bool = false) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("releaseGameStatistician").call([
            "requestId": requestId,
            "cancel": cancel,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Sets simple or advanced scoring for a claimed/requested game.
    func setScoringMode(requestId: String, mode: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("setScoringMode").call([
            "requestId": requestId,
            "mode": mode,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Confirms a game's stats against the paper book and writes the career
    /// ledger. Only verified stats count toward career totals and records.
    func verifyGameStats(gameId: String, note: String = "") async throws -> [String: Any] {
        let result = try await functions.httpsCallable("verifyGameStats").call([
            "gameId": gameId,
            "note": note,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Withdraws a game's verified stats so they can be corrected.
    func reopenGameStats(gameId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("reopenGameStats").call([
            "gameId": gameId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Staff override of a guardian's travel plan. Requires a reason and is
    /// audited, because changing where a child goes home needs an accountable
    /// record.
    func setReleasePlanOverride(eventId: String,
                               rosterEntryId: String,
                               homeWith: String,
                               pickupName: String = "",
                               reason: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("setReleasePlanOverride").call([
            "eventId": eventId,
            "rosterEntryId": rosterEntryId,
            "homeWith": homeWith,
            "pickupName": pickupName,
            "reason": reason,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Records the handoff: who released the athlete, to whom, and when. When the
    /// guardian is not on the app (or the network is down) a coach may release on
    /// verbal consent, which must be explicit and noted.
    func confirmRelease(eventId: String,
                        rosterEntryId: String,
                        releasedToType: String,
                        releasedToName: String,
                        note: String = "",
                        verbalConsent: Bool = false,
                        consentNote: String = "") async throws -> [String: Any] {
        let result = try await functions.httpsCallable("confirmRelease").call([
            "eventId": eventId,
            "rosterEntryId": rosterEntryId,
            "releasedToType": releasedToType,
            "releasedToName": releasedToName,
            "note": note,
            "verbalConsent": verbalConsent,
            "consentNote": consentNote,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Corrects a mistaken release. Keeps the original record and stamps the
    /// correction, so the history shows both.
    func reopenRelease(eventId: String, rosterEntryId: String, reason: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("reopenRelease").call([
            "eventId": eventId,
            "rosterEntryId": rosterEntryId,
            "reason": reason,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    // MARK: - Resources

    /// AD-only: adds a permanent bookable asset to the organization.
    func createResource(name: String,
                        type: String,
                        notes: String = "",
                        openMin: Int = 6 * 60,
                        closeMin: Int = 22 * 60) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("createResource").call([
            "name": name, "type": type, "notes": notes,
            "openMin": openMin, "closeMin": closeMin,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    func removeResource(resourceId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("removeResource").call([
            "resourceId": resourceId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Books a resource window. The server rejects overlaps in a transaction,
    /// enforces the resource's open hours, and expands a recurring series.
    func bookResource(resourceId: String,
                      teamId: String,
                      title: String,
                      start: Date,
                      end: Date,
                      weekdays: [Int] = [],
                      weeks: Int = 1,
                      createEvent: Bool = false,
                      eventTitle: String = "") async throws -> [String: Any] {
        let result = try await functions.httpsCallable("bookResource").call([
            "resourceId": resourceId,
            "teamId": teamId,
            "title": title,
            "startMs": start.timeIntervalSince1970 * 1000,
            "endMs": end.timeIntervalSince1970 * 1000,
            // JS getTimezoneOffset() is inverted, so negate it for the server.
            "utcOffsetMinutes": -TimeZone.current.secondsFromGMT() / 60,
            "weekdays": weekdays,
            "weeks": weeks,
            "createEvent": createEvent,
            "eventTitle": eventTitle,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    func cancelResourceBooking(bookingId: String, reason: String = "") async throws -> [String: Any] {
        let result = try await functions.httpsCallable("cancelResourceBooking").call([
            "bookingId": bookingId,
            "reason": reason,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Repairs a missing head-coach membership on an existing team.
    func ensureTeamCoachMembership(teamId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("ensureTeamCoachMembership").call([
            "teamId": teamId
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    // MARK: - Coach-first onboarding (the AD bridge)

    /// A coach starts a team. If they have no school yet, the team is created
    /// **unattached** and carries the school name they typed as a hint. Only an
    /// AD creates a school organization.
    func createCoachTeam(schoolName: String,
                         sportId: String,
                         sportName: String,
                         level: String,
                         season: String,
                         gender: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("createCoachTeam").call([
            "schoolName": schoolName,
            "sportId": sportId,
            "sportName": sportName,
            "level": level,
            "season": season,
            "gender": gender,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// AD: pull a coach-started team into your school. The school's official
    /// name replaces the coach's typed name.
    @discardableResult
    func adoptTeam(teamId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("adoptTeam").call(["teamId": teamId])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// AD: teams started by coaches that are waiting to be adopted.
    func listUnattachedTeams() async throws -> [[String: Any]] {
        let result = try await functions.httpsCallable("listUnattachedTeams").call()
        let data = (result.data as? [String: Any]) ?? [:]
        return (data["teams"] as? [[String: Any]]) ?? []
    }

    // MARK: - Account deletion

    /// Reports whether the signed-in user may delete their account, and why not.
    func previewAccountDeletion() async throws -> [String: Any] {
        let result = try await functions.httpsCallable("previewAccountDeletion").call()
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Permanently deletes the signed-in user's account and detaches their data.
    func deleteMyAccount() async throws {
        _ = try await functions.httpsCallable("deleteMyAccount").call()
    }

    // MARK: - Moderation

    /// Reports a message, photo, or profile for review.
    @discardableResult
    func reportContent(teamId: String,
                       contentType: String,
                       contentId: String,
                       reason: String,
                       note: String = "",
                       reportedUserId: String = "") async throws -> [String: Any] {
        let result = try await functions.httpsCallable("reportContent").call([
            "teamId": teamId,
            "contentType": contentType,
            "contentId": contentId,
            "reason": reason,
            "note": note,
            "reportedUserId": reportedUserId,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    func blockUser(targetUid: String) async throws {
        _ = try await functions.httpsCallable("blockUser").call(["targetUid": targetUid])
    }

    func unblockUser(targetUid: String) async throws {
        _ = try await functions.httpsCallable("unblockUser").call(["targetUid": targetUid])
    }

    /// AD/coach: hide (or unhide) a reported message.
    func moderateMessage(chatId: String, messageId: String, hide: Bool = true) async throws {
        _ = try await functions.httpsCallable("moderateMessage").call([
            "chatId": chatId, "messageId": messageId, "hide": hide,
        ])
    }

    // MARK: - Bulk onboarding

    /// Creates parent invitations in one pass. Returns created/skipped/invalid counts.
    func bulkInviteParents(teamId: String, invites: [[String: String]]) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("bulkInviteParents").call([
            "teamId": teamId,
            "invites": invites,
        ])
        return (result.data as? [String: Any]) ?? [:]
    }

    // MARK: - Entitlements

    /// Reads the school's plan and limits (for UI only — enforcement is server-side).
    func getEntitlement() async throws -> [String: Any] {
        let result = try await functions.httpsCallable("getEntitlement").call()
        return (result.data as? [String: Any]) ?? [:]
    }

    /// Claims video storage before an upload. Throws when over the plan limit.
    @discardableResult
    func consumeVideoQuota(bytes: Int64) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("consumeVideoQuota").call(["bytes": bytes])
        return (result.data as? [String: Any]) ?? [:]
    }

    /// AD: starts a Stripe checkout for a plan (web purchase).
    func createCheckoutSession(plan: String) async throws -> URL? {
        let result = try await functions.httpsCallable("createCheckoutSession").call(["plan": plan])
        let data = (result.data as? [String: Any]) ?? [:]
        guard let raw = data["url"] as? String else { return nil }
        return URL(string: raw)
    }
}
