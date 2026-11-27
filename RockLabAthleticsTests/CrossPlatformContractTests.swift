import XCTest
@testable import RockLabAthletics

/// Pins the values that must be identical on both clients.
///
/// Every assertion here has a mirror in `web/lib/portal.test.mjs`. They exist
/// because the two clients drifted in exactly these places: a role spelled two
/// ways, an RSVP document id each side invented for itself, and a calendar that
/// disagreed with the security rules.
final class CrossPlatformContractTests: XCTestCase {

    // MARK: - RSVP identity

    func testRSVPIdCarriesTheAthlete() {
        XCTAssertEqual(
            FirestoreService.rsvpDocumentId(userId: "uid1", athleteEntryId: "entry9"),
            "uid1__entry9"
        )
    }

    func testRSVPIdFallsBackToTheAccount() {
        XCTAssertEqual(FirestoreService.rsvpDocumentId(userId: "uid1", athleteEntryId: nil), "uid1")
        XCTAssertEqual(FirestoreService.rsvpDocumentId(userId: "uid1", athleteEntryId: ""), "uid1")
    }

    // MARK: - Role vocabulary

    func testLegacyFamilyRoleDecodesAsParent() {
        XCTAssertEqual(UserRole.parse("family"), .parent)
        XCTAssertEqual(UserRole.parse(" PARENT "), .parent)
        XCTAssertEqual(UserRole.parse("follower"), .follower)
        XCTAssertNil(UserRole.parse("nonsense"))
    }

    /// A guardian must be a team member, not a follower. `isParent` reads the
    /// membership role, so this is the difference between a parent seeing their
    /// child's practice and seeing nothing.
    func testGuardianMembershipGrantsParentAccess() {
        let access = TeamAccess(
            membership: TeamMembership(id: "u1", teamId: "t1", userId: "u1",
                                       role: .parent, name: "P", email: "p@example.com"),
            isAd: false
        )
        XCTAssertTrue(access.isParent)
        XCTAssertFalse(access.isFollower)
        XCTAssertTrue(access.canSee(.parent), "the parent channel must admit parents")
        XCTAssertTrue(access.canSeeAllEvents)
    }

    func testFollowerMembershipDoesNotGrantParentAccess() {
        let access = TeamAccess(
            membership: TeamMembership(id: "u2", teamId: "t1", userId: "u2",
                                       role: .follower, name: "F", email: "f@example.com"),
            isAd: false
        )
        XCTAssertFalse(access.isParent)
        XCTAssertFalse(access.canSee(.parent))
    }

    // MARK: - Roster guardianship

    func testRosterEntryDecodesGuardianLink() {
        let entry = RosterEntry(id: "e1", data: [
            "playerName": "A Player",
            "guardianUserIds": ["u1", "u2"],
        ])
        XCTAssertEqual(entry?.guardianUserIds, ["u1", "u2"])
    }

    func testRosterEntryDefaultsGuardiansToEmpty() {
        let entry = RosterEntry(id: "e1", data: ["playerName": "A Player"])
        XCTAssertEqual(entry?.guardianUserIds, [])
    }

    /// Documents written by `approveTeamJoin` carry only `role`; the document id is
    /// the uid. Dropping them made members disappear from the member list.
    func testJoinRequestMembershipDecodesWithoutTeamOrUserFields() {
        let membership = TeamMembership(id: "u9", data: ["role": "parent"])
        XCTAssertEqual(membership?.role, .parent)
        XCTAssertEqual(membership?.userId, "u9")
    }

    // MARK: - Event vocabulary

    /// `web/lib/portal.mjs` hard-codes five event types. Adding a case to
    /// `EventType` without updating the web is what makes a schedule item vanish
    /// for one client only, so the count is pinned deliberately.
    func testEventTypeVocabularyMatchesTheWebContract() {
        XCTAssertEqual(EventType.allCases.count, 5)
        XCTAssertTrue(EventType.allCases.contains(.practice),
                      "practice must exist: it is the type the old follower rules withheld")
    }
}
