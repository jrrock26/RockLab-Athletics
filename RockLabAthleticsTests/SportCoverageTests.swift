import XCTest
@testable import RockLabAthletics

/// "Every sport gets the same system": no sport may be a second-class citizen.
final class SportCoverageTests: XCTestCase {

    func testEveryCatalogSportHasAUsableDefinition() {
        for sport in SportsCatalog.all {
            let def = SportDefinitions.definition(for: sport.id)
            XCTAssertEqual(def.sportId, sport.id)
            XCTAssertFalse(def.stats.isEmpty, "\(sport.name) has no stats — it would be unusable in scoring/showcase")
            XCTAssertFalse(def.scoreButtons.isEmpty, "\(sport.name) has no score buttons")
            XCTAssertFalse(def.scoreUnit.isEmpty, "\(sport.name) has no score unit")
        }
    }

    func testEverySportHasAUniqueId() {
        let ids = SportsCatalog.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
    }

    func testSportIdsAreStableSlugs() {
        for sport in SportsCatalog.all {
            XCTAssertEqual(sport.id, sport.id.lowercased())
            XCTAssertFalse(sport.id.contains(" "), "\(sport.id) must be a slug for rules and storage paths")
        }
    }

    func testTimedSportsHaveClockConfig() {
        let timed = ["football", "basketball", "soccer", "lacrosse", "field_hockey", "ice_hockey", "water_polo"]
        for sportId in timed {
            let clock = SportDefinitions.clock(for: sportId)
            XCTAssertNotNil(clock, "\(sportId) should have a game clock")
            XCTAssertFalse(clock!.periods.isEmpty)
            XCTAssertGreaterThan(clock!.minutesPerPeriod, 0)
        }
    }

    func testUntimedSportsHaveNoClock() {
        for sportId in ["golf", "cross_country", "bowling", "wrestling"] {
            XCTAssertNil(SportDefinitions.clock(for: sportId),
                         "\(sportId) should not force a game clock")
        }
    }

    func testUnknownSportFallsBackSafely() {
        let def = SportDefinitions.definition(for: "quidditch")
        XCTAssertFalse(def.stats.isEmpty, "Unknown sports must still render a usable definition")
        XCTAssertFalse(def.scoreButtons.isEmpty)
    }

    func testPositionsAreOnlyForTeamFieldSports() {
        // Individual sports may legitimately have no fixed positions...
        XCTAssertTrue(SportDefinitions.definition(for: "cross_country").positions.isEmpty)
        // ...but field sports should define them.
        XCTAssertFalse(SportDefinitions.definition(for: "football").positions.isEmpty)
        XCTAssertFalse(SportDefinitions.definition(for: "soccer").positions.isEmpty)
    }
}
