import XCTest
@testable import RockLabAthletics

/// The eligibility "fits audit": proves a player is only ineligible for
/// reasons the coach/AD actually caused (an issued form, or an injury).
final class EligibilityEngineTests: XCTestCase {

    // MARK: Builders

    private func form(_ id: String,
                      _ title: String,
                      published: Bool = true,
                      parentSignature: Bool = false,
                      dueDate: Date? = nil) -> TeamForm {
        TeamForm(id: id,
                 teamId: "team1",
                 title: title,
                 description: "",
                 dueDate: dueDate,
                 published: published,
                 fields: [],
                 requiresParentSignature: parentSignature)
    }

    private func submission(_ formId: String,
                            status: FormStatus = .submitted,
                            signedAt: Date? = Date(),
                            parentSignedBy: String = "",
                            entryId: String = "entry1") -> FormSubmission {
        FormSubmission(id: entryId,
                       formId: formId,
                       rosterEntryId: entryId,
                       playerName: "Test Player",
                       status: status,
                       signedByName: "Test Player",
                       signedAt: signedAt,
                       submittedBy: "uid1",
                       responses: [:],
                       requiresParentSignature: !parentSignedBy.isEmpty,
                       parentSignedByName: parentSignedBy)
    }

    private func evaluate(_ forms: [TeamForm],
                          _ subs: [String: FormSubmission] = [:],
                          injury: InjuryStatus = .healthy,
                          now: Date = Date()) -> EligibilityStatus {
        EligibilityEngine.evaluate(publishedForms: forms, submissions: subs, injury: injury, now: now)
    }

    // MARK: The core promise

    func testNoIssuedFormsMeansEligible() {
        XCTAssertEqual(evaluate([]), .eligible, "A team that has issued nothing must not block anyone.")
    }

    func testDraftFormsDoNotAffectEligibility() {
        let draft = form("f1", "Physical", published: false)
        XCTAssertEqual(evaluate([draft]), .eligible, "Unpublished/draft forms are not issued and must not gate play.")
    }

    func testIssuedButUnsignedIsIneligibleAndNamesTheForm() {
        let physical = form("f1", "Physical")
        let status = evaluate([physical])
        XCTAssertEqual(status, .ineligible(missingForms: ["Physical"]))
        XCTAssertFalse(status.isEligible)
    }

    func testSignedFormIsEligible() {
        let physical = form("f1", "Physical")
        XCTAssertEqual(evaluate([physical], ["f1": submission("f1")]), .eligible)
    }

    // MARK: Injury coupling

    func testInjuryMakesPlayerNotCleared() {
        XCTAssertEqual(evaluate([], injury: .injured), .injured)
        XCTAssertFalse(EligibilityStatus.injured.isEligible)
    }

    func testLimitedParticipationStaysEligible() {
        XCTAssertEqual(evaluate([], injury: .limited), .eligible,
                       "A modified/limited athlete is still cleared to play.")
    }

    func testMissingFormTakesPrecedenceOverInjury() {
        let physical = form("f1", "Physical")
        XCTAssertEqual(evaluate([physical], injury: .injured),
                       .ineligible(missingForms: ["Physical"]),
                       "Paperwork gaps are reported before injury so staff see the blocker.")
    }
}

extension EligibilityEngineTests {

    // MARK: Signatures, expiry, deadlines

    func testParentSignatureRequiredButMissingIsIneligible() {
        let consent = form("c1", "Concussion", parentSignature: true)
        XCTAssertEqual(evaluate([consent], ["c1": submission("c1")]),
                       .ineligible(missingForms: ["Concussion"]),
                       "A form needing a guardian co-sign is not complete until it is signed.")
    }

    func testParentSignedFormIsEligible() {
        let consent = form("c1", "Concussion", parentSignature: true)
        XCTAssertEqual(evaluate([consent], ["c1": submission("c1", parentSignedBy: "Parent")]), .eligible)
    }

    func testExpiredSubmissionIsIneligible() {
        let physical = form("f1", "Physical")
        XCTAssertEqual(evaluate([physical], ["f1": submission("f1", status: .expired)]),
                       .ineligible(missingForms: ["Physical"]))
    }

    func testMissingStatusIsIneligible() {
        let physical = form("f1", "Physical")
        XCTAssertEqual(evaluate([physical], ["f1": submission("f1", status: .missing)]),
                       .ineligible(missingForms: ["Physical"]))
    }

    func testOverdueUnsignedIsIneligible() {
        let past = Date().addingTimeInterval(-86_400)
        let physical = form("f1", "Physical", dueDate: past)
        XCTAssertEqual(evaluate([physical], ["f1": submission("f1", signedAt: nil)]),
                       .ineligible(missingForms: ["Physical"]))
    }

    func testApprovedSubmissionIsEligible() {
        let physical = form("f1", "Physical")
        XCTAssertEqual(evaluate([physical], ["f1": submission("f1", status: .approved)]), .eligible)
    }

    // MARK: Multiple forms

    func testMultipleFormsOnlyReportsTheMissingOne() {
        let physical = form("f1", "Physical")
        let code = form("f2", "Code of Conduct")
        let status = evaluate([physical, code], ["f1": submission("f1")])
        XCTAssertEqual(status, .ineligible(missingForms: ["Code of Conduct"]))
        XCTAssertEqual(status.missingForms, ["Code of Conduct"])
    }

    func testAllFormsSignedIsEligible() {
        let physical = form("f1", "Physical")
        let code = form("f2", "Code of Conduct")
        let consent = form("f3", "Concussion", parentSignature: true)
        let subs = [
            "f1": submission("f1"),
            "f2": submission("f2"),
            "f3": submission("f3", parentSignedBy: "Parent"),
        ]
        XCTAssertEqual(evaluate([physical, code, consent], subs), .eligible)
    }

    func testEligibleStatusFlags() {
        XCTAssertTrue(EligibilityStatus.eligible.isEligible)
        XCTAssertFalse(EligibilityStatus.injured.isEligible)
        XCTAssertFalse(EligibilityStatus.ineligible(missingForms: ["X"]).isEligible)
        XCTAssertEqual(EligibilityStatus.eligible.label, "Eligible")
        XCTAssertEqual(EligibilityStatus.injured.label, "Injured")
        XCTAssertEqual(EligibilityStatus.ineligible(missingForms: ["X"]).label, "Ineligible")
        XCTAssertEqual(EligibilityStatus.ineligible(missingForms: ["A", "B"]).missingForms, ["A", "B"])
        XCTAssertTrue(EligibilityStatus.eligible.missingForms.isEmpty)
    }
}

