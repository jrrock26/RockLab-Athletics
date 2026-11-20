import XCTest
@testable import RockLabAthletics

/// Protects the data that gets written to Firestore and the access rules that
/// decide who may edit an athlete's profile.
final class ModelAndAccessTests: XCTestCase {

    private func clip(_ id: String, external: Bool = false) -> ReelClip {
        ReelClip(id: id,
                 videoId: "v1",
                 videoTitle: "Week 4 film",
                 videoURL: "https://example.com/v1.mp4",
                 isExternal: external,
                 startSeconds: 12.5,
                 endSeconds: 19,
                 playerId: "r1",
                 playerName: "Jordan Blake",
                 jersey: "24",
                 action: "Strip-sack",
                 playTag: "Defense")
    }

    // MARK: Highlight reel persistence

    func testReelRoundTripsThroughFirestoreDictionary() {
        let reel = HighlightReel(id: "reel1",
                                 teamId: "t1",
                                 title: "Week 4",
                                 homeTeam: "Rockwall",
                                 awayTeam: "Central",
                                 gameDate: Date(timeIntervalSince1970: 1_760_000_000),
                                 teamColorHex: "#D62828",
                                 clips: [clip("c1"), clip("c2", external: true)],
                                 createdByName: "Coach")
        let decoded = HighlightReel(id: "reel1", data: reel.dictionary)
        XCTAssertNotNil(decoded)
        XCTAssertEqual(decoded?.clips.count, 2)
        XCTAssertEqual(decoded?.teamColorHex, "#D62828")
        XCTAssertEqual(decoded?.homeTeam, "Rockwall")
        XCTAssertEqual(decoded?.clips.last?.isExternal, true)
        XCTAssertEqual(decoded?.durationSeconds, reel.durationSeconds)
    }

    func testClipClockFormatting() {
        XCTAssertEqual(ReelClip.clock(0), "0:00")
        XCTAssertEqual(ReelClip.clock(75), "1:15")
        XCTAssertEqual(ReelClip.clock(3671), "61:11")
    }

    func testReelRejectsDocumentWithoutTeam() {
        XCTAssertNil(HighlightReel(id: "x", data: ["title": "no team"]))
    }

    // MARK: Injury state

    func testInjuryStatusClearedSemantics() {
        XCTAssertTrue(InjuryStatus.healthy.isCleared)
        XCTAssertFalse(InjuryStatus.injured.isCleared)
        XCTAssertFalse(InjuryStatus.limited.isCleared)
    }

    func testRosterEntryDefaultsToHealthy() {
        let entry = RosterEntry(id: "e1", teamId: "t1", playerName: "P",
                                jerseyNumber: "7", position: "QB")
        XCTAssertEqual(entry.injuryStatus, .healthy)
        XCTAssertFalse(entry.isInjured)
    }

    func testRosterEntryDecodesInjuryFields() {
        let entry = RosterEntry(id: "e1", data: [
            "playerName": "P",
            "injuryStatus": "injured",
            "injuryBodyPart": "Right ankle",
            "injuryNote": "Rolled in practice",
        ])
        XCTAssertEqual(entry?.injuryStatus, .injured)
        XCTAssertEqual(entry?.injuryBodyPart, "Right ankle")
        XCTAssertTrue(entry?.isInjured ?? false)
    }

    // MARK: Showcase ownership rules

    func testAthleteCanEditOwnShowcase() {
        let access = TeamAccess(membership: nil, isAd: false)
        let entry = RosterEntry(id: "e1", teamId: "t1", playerName: "P",
                                jerseyNumber: "7", position: "QB", userId: "player-uid")
        XCTAssertTrue(access.canEditShowcase(for: entry, userId: "player-uid", linkedPlayerIds: []))
    }

    func testLinkedParentCanEditShowcase() {
        let access = TeamAccess(membership: nil, isAd: false)
        let entry = RosterEntry(id: "e1", teamId: "t1", playerName: "P",
                                jerseyNumber: "7", position: "QB", userId: "player-uid")
        XCTAssertTrue(access.canEditShowcase(for: entry, userId: "parent-uid",
                                             linkedPlayerIds: ["player-uid"]))
    }

    func testCoachAndAdCannotEditShowcase() {
        let coach = TeamAccess(membership: TeamMembership(id: "c", teamId: "t1", userId: "coach-uid",
                                                          role: .coach, name: "C", email: ""), isAd: false)
        let ad = TeamAccess(membership: nil, isAd: true)
        let entry = RosterEntry(id: "e1", teamId: "t1", playerName: "P",
                                jerseyNumber: "7", position: "QB", userId: "player-uid")
        XCTAssertFalse(coach.canEditShowcase(for: entry, userId: "coach-uid", linkedPlayerIds: []))
        XCTAssertFalse(ad.canEditShowcase(for: entry, userId: "ad-uid", linkedPlayerIds: []))
    }

    func testUnlinkedParentCannotEditShowcase() {
        let access = TeamAccess(membership: nil, isAd: false)
        let entry = RosterEntry(id: "e1", teamId: "t1", playerName: "P",
                                jerseyNumber: "7", position: "QB", userId: "player-uid")
        XCTAssertFalse(access.canEditShowcase(for: entry, userId: "stranger-uid", linkedPlayerIds: []))
    }

    // MARK: Coach → AD bridge (unattached teams)

    private func makeTeam(_ data: [String: Any]) -> Team? {
        var merged = data
        merged["sportName"] = merged["sportName"] ?? "Football"
        return Team(id: "t1", data: merged)
    }

    func testCoachTeamStartsUnattachedWithNoSchool() {
        let team = makeTeam(["schoolNameHint": "Rockwall High", "adoptionStatus": "unattached"])
        XCTAssertEqual(team?.schoolId, "")
        XCTAssertTrue(team?.isUnattached ?? false)
        XCTAssertEqual(team?.schoolNameHint, "Rockwall High")
    }

    func testLegacyTeamWithSchoolIsAdopted() {
        let team = makeTeam(["schoolId": "school-1"])
        XCTAssertEqual(team?.schoolId, "school-1")
        XCTAssertFalse(team?.isUnattached ?? true, "Existing teams with a school must stay attached")
    }

    func testAdoptionReplacesCoachNameWithOfficialSchoolName() {
        let team = makeTeam(["schoolId": "school-1", "schoolNameHint": "rockwall hs"])
        let school = School(id: "school-1",
                            name: "Rockwall High School",
                            mascot: "Hawks",
                            adUserId: "ad-uid",
                            activeSports: [])
        XCTAssertEqual(team?.displaySchoolName(school: school), "Rockwall High School",
                       "The AD's official school name must win over the coach's typed hint")
    }

    func testUnattachedTeamShowsCoachHint() {
        let team = makeTeam(["schoolNameHint": "Rockwall High"])
        XCTAssertEqual(team?.displaySchoolName(school: nil), "Rockwall High")
        XCTAssertEqual(makeTeam([:])?.displaySchoolName(school: nil), "Independent team")
    }

    func testTeamTitleFormatting() {
        let team = makeTeam(["sportName": "Basketball", "level": "JV"])
        XCTAssertEqual(team?.title, "Basketball JV")
    }

    // MARK: Dev account exemption

    func testDevAccountsAreExemptFromVerification() {
        XCTAssertTrue(AuthService.isDevEmail("coach@rocklabathletics.com"))
        XCTAssertTrue(AuthService.isDevEmail("COACH@ROCKLABATHLETICS.COM"))
        XCTAssertFalse(AuthService.isDevEmail("parent@gmail.com"))
        XCTAssertFalse(AuthService.isDevEmail(nil))
        XCTAssertFalse(AuthService.isDevEmail("not-an-email"))
    }
}
