import XCTest
@testable import RockLabAthletics

/// Guards the forms catalog: every form must be a real, renderable document
/// and every sport must be able to use it.
final class FormLibraryTests: XCTestCase {

    func testCatalogHasTwentyStandardForms() {
        XCTAssertEqual(FormLibrary.all.count, 20)
    }

    func testTemplateIdsAreUnique() {
        let ids = FormLibrary.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "Duplicate template ids would break matching and rendering.")
    }

    func testEveryTemplateHasSectionsAndContent() {
        for template in FormLibrary.all {
            XCTAssertFalse(template.title.isEmpty, "\(template.id) has no title")
            XCTAssertFalse(template.summary.isEmpty, "\(template.id) has no summary")
            XCTAssertFalse(template.sections.isEmpty, "\(template.id) has no sections")

            let blockCount = template.sections.reduce(0) { $0 + $1.blocks.count }
            XCTAssertGreaterThan(blockCount, 5, "\(template.id) looks like a stub, not a real form")
        }
    }

    func testEveryCategoryIsPopulatedAndKnown() {
        for category in FormLibrary.categories {
            XCTAssertFalse(FormLibrary.templates(in: category).isEmpty,
                           "Category \(category) is empty")
        }
        for template in FormLibrary.all {
            XCTAssertTrue(FormLibrary.categories.contains(template.category),
                          "\(template.id) uses an unknown category")
        }
    }

    func testRenderIncludesSchoolTeamAndTitle() {
        guard let concussion = FormLibrary.template(id: "concussion") else {
            return XCTFail("concussion template missing")
        }
        let text = FormLibrary.render(concussion,
                                      schoolName: "Rockwall High School",
                                      teamName: "Football Varsity",
                                      season: "2026")
        XCTAssertTrue(text.contains("ROCKWALL HIGH SCHOOL"))
        XCTAssertTrue(text.contains("Football Varsity"))
        XCTAssertTrue(text.contains("CONCUSSION"))
        XCTAssertTrue(text.contains("## "), "Renderer needs section markers to typeset the page")
    }

    func testConcussionFormContainsSafetyLanguage() {
        guard let concussion = FormLibrary.template(id: "concussion") else {
            return XCTFail("concussion template missing")
        }
        let text = FormLibrary.render(concussion, schoolName: "S", teamName: "T").lowercased()
        XCTAssertTrue(text.contains("return"), "must discuss return to play")
        XCTAssertTrue(text.contains("cleared"), "must require written clearance")
        XCTAssertTrue(text.contains("removed"), "must require immediate removal from play")
    }

    func testMatchingResolvesCommonCoachPrompts() {
        XCTAssertEqual(FormLibrary.match("concussion protocol")?.id, "concussion")
        XCTAssertEqual(FormLibrary.match("sports physical")?.id, "physical")
        XCTAssertEqual(FormLibrary.match("uniform handout")?.id, "uniform")
        XCTAssertEqual(FormLibrary.match("code of conduct")?.id, "code")
        // Specific phrases must beat generic ones.
        XCTAssertEqual(FormLibrary.match("emergency contact form")?.id, "medicalHistory")
        XCTAssertEqual(FormLibrary.match("consent to treat")?.id, "emergency")
        XCTAssertEqual(FormLibrary.match("media consent form")?.id, "media")
        XCTAssertEqual(FormLibrary.match("overnight travel")?.id, "travel")
    }

    func testFormTemplateCatalogBridgesLibrary() {
        XCTAssertEqual(FormTemplateCatalog.all.count, FormLibrary.all.count)
        let body = FormTemplateCatalog.body(id: "media", schoolName: "S", teamName: "T")
        XCTAssertNotNil(body)
        XCTAssertTrue(body!.contains("MEDIA"))
    }

    func testBlankLineDetection() {
        XCTAssertTrue(FormDocumentParser.isBlankLine("Name: ______________________"))
        XCTAssertFalse(FormDocumentParser.isBlankLine("A normal sentence."))
    }

    func testDocumentParserSplitsHeaderAndSections() {
        let doc = FormLibrary.render(
            FormLibrary.template(id: "code")!,
            schoolName: "Test High",
            teamName: "Soccer Varsity")
        let parts = FormDocumentParser.split(doc)
        XCTAssertEqual(parts.header.first, "TEST HIGH")
        XCTAssertTrue(parts.content.hasPrefix("## "))

        let blocks = FormDocumentParser.blocks(from: parts.content)
        XCTAssertFalse(blocks.isEmpty)
        XCTAssertTrue(blocks.contains { if case .heading = $0 { return true }; return false })
    }
}
