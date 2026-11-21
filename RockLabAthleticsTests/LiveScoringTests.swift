import XCTest
@testable import RockLabAthletics

/// Protects the live-scoring contract the spectator view depends on.
///
/// The scorer writes a remaining time plus the moment the clock started; every
/// other device derives the current reading. If this arithmetic is wrong the
/// audience sees a clock that is confidently wrong, which is worse than no clock.
final class LiveScoringTests: XCTestCase {

    private func game(
        status: GameStatus = .live,
        teamScore: Int = 0,
        opponentScore: Int = 0,
        period: Int = 0,
        clockSeconds: Int = 480,
        running: Bool = false,
        startedAt: Date? = nil,
        sets: [[String: Int]] = []
    ) -> Game {
        Game(id: "g1", teamId: "t1", opponent: "Central", isHome: true,
             date: Date(timeIntervalSince1970: 1_800_000_000), status: status,
             teamScore: teamScore, opponentScore: opponentScore,
             period: period, clockSeconds: clockSeconds,
             clockRunning: running, clockStartedAt: startedAt, sets: sets)
    }

    // MARK: Live clock

    func testPausedClockIgnoresWallClockTime() {
        // A stopped clock must read the stored value no matter how long it has
        // been stopped. This is exactly the bug the spectator view would have
        // shipped with.
        let g = game(clockSeconds: 312, running: false)
        let later = Date().addingTimeInterval(3600)
        XCTAssertEqual(g.liveClockSeconds(now: later), 312)
    }

    func testRunningClockCountsDownFromStart() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        let g = game(clockSeconds: 480, running: true, startedAt: start)

        XCTAssertEqual(g.liveClockSeconds(now: start), 480)
        XCTAssertEqual(g.liveClockSeconds(now: start.addingTimeInterval(1)), 479)
        XCTAssertEqual(g.liveClockSeconds(now: start.addingTimeInterval(60)), 420)
    }

    func testRunningClockNeverGoesNegative() {
        // A device whose clock is behind must not render "-3:-12" on a scoreboard.
        let start = Date(timeIntervalSince1970: 1_000_000)
        let g = game(clockSeconds: 10, running: true, startedAt: start)
        XCTAssertEqual(g.liveClockSeconds(now: start.addingTimeInterval(60)), 0)
    }

    func testRunningClockWithoutStartTimeFallsBackToStoredValue() {
        // A half-written document (running true, no start time) should show the
        // stored value rather than count down from 1970.
        let g = game(clockSeconds: 240, running: true, startedAt: nil)
        XCTAssertEqual(g.liveClockSeconds(now: Date()), 240)
    }

    // MARK: Sets

    func testSetsWonAndLostAreCountedPerSet() {
        let g = game(sets: [
            ["us": 25, "them": 20],
            ["us": 22, "them": 25],
            ["us": 25, "them": 23],
        ])
        XCTAssertEqual(g.setsWon, 2)
        XCTAssertEqual(g.setsLost, 1)
    }

    // MARK: Plays

    func testErrorCreditsTheOpponent() {
        // The honest record: a player's error is logged against that player but the
        // point belongs to the other side. Getting this backwards would hand the
        // audience the wrong score without anyone noticing.
        let error = ScoringAction(key: "error", name: "Error", points: 1,
                                  statKey: "errors", awardsOpponent: true)
        let player = RosterEntry(id: "r1", teamId: "t1", playerName: "Ava Reyes",
                                 jerseyNumber: "12", position: "OH")
        let play = GamePlay(action: error, entry: player, period: 1, clockSeconds: 300)

        XCTAssertFalse(play.isOurs)
        XCTAssertEqual(play.side, "them")
        XCTAssertEqual(play.playerName, "Ava Reyes")
        XCTAssertEqual(play.statKey, "errors")
        XCTAssertEqual(play.points, 1)
    }

    func testKillCreditsUsAndCarriesTheStat() {
        let kill = ScoringAction(key: "kill", name: "Kill", points: 1, statKey: "kills")
        let player = RosterEntry(id: "r1", teamId: "t1", playerName: "Ava Reyes",
                                 jerseyNumber: "12", position: "OH")
        let play = GamePlay(action: kill, entry: player, period: 2, clockSeconds: 45)

        XCTAssertTrue(play.isOurs)
        XCTAssertEqual(play.side, "us")
        XCTAssertEqual(play.statKey, "kills")
    }

    func testPlaySurvivesTheFirestoreRoundTrip() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let play = GamePlay(period: 3, clockSeconds: 121, side: "them",
                            actionKey: "three", actionName: "Three", points: 3,
                            rosterEntryId: "r9", playerName: "Sam Cole",
                            statKey: "points", createdAt: start)

        let restored = GamePlay(data: play.asDictionary, id: play.id)
        XCTAssertNotNil(restored)
        XCTAssertEqual(restored?.points, 3)
        XCTAssertEqual(restored?.statKey, "points")
        XCTAssertEqual(restored?.playerName, "Sam Cole")
        XCTAssertEqual(restored?.side, "them")
        XCTAssertEqual(restored?.createdAt.timeIntervalSince1970 ?? 0,
                       start.timeIntervalSince1970, accuracy: 0.001)
    }

    func testPlayWithoutStatKeyOmitsTheField() {
        // Simple-mode volunteers log plays without crediting stats. Writing a nil
        // statKey would leave an undo trying to decrement a column that was never
        // created.
        let play = GamePlay(period: 0, clockSeconds: 10, side: "us",
                            actionKey: "two", actionName: "Two", points: 2)
        XCTAssertNil(play.asDictionary["statKey"])
    }

    // MARK: Overtime

    func testOvertimePeriodsAreLabelledAfterRegulation() {
        let basketball = SportDefinitions.clock(for: "basketball")!
        XCTAssertEqual(basketball.label(forPeriod: 0), "Q1")
        XCTAssertEqual(basketball.label(forPeriod: 3), "Q4")
        XCTAssertEqual(basketball.label(forPeriod: 4), "OT1")
        XCTAssertEqual(basketball.label(forPeriod: 5), "OT2")
        XCTAssertTrue(basketball.isOvertime(4))
        XCTAssertFalse(basketball.isOvertime(3))
    }

    func testOvertimeUsesItsOwnLength() {
        var clock = SportDefinitions.clock(for: "basketball")!
        clock.overtimeMinutes = 4
        XCTAssertEqual(clock.seconds(forPeriod: 3), clock.minutesPerPeriod * 60)
        XCTAssertEqual(clock.seconds(forPeriod: 4), 240)
    }
}
