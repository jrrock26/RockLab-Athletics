import Foundation

/// One section of a form document.
struct FormDocSection {
    let heading: String
    let blocks: [String]   // lines; a leading "• " renders as a bullet
}

/// A full, real-world high-school athletic form.
struct FormDocumentTemplate: Identifiable {
    let id: String
    let title: String
    let category: String
    let summary: String
    let requiresParentSignature: Bool
    let sections: [FormDocSection]
}

/// Library of standard high-school athletic forms with real verbiage.
///
/// Bodies are plain text with two lightweight markers so the document
/// renderer can typeset them like a printed page:
///   `## HEADING`  — a numbered/lettered section heading
///   `• ...`       — a bulleted list item
enum FormLibrary {

    static let categories: [String] = [
        "Medical & Safety",
        "Eligibility & Conduct",
        "Equipment & Participation",
        "Consent & Releases",
        "Trips & Activities",
        "Fundraising",
    ]

    static var all: [FormDocumentTemplate] {
        FormLibraryMedical.all
            + FormLibraryConduct.all
            + FormLibraryEquipment.all
            + FormLibraryConsent.all
            + FormLibraryTrips.all
            + FormLibraryOther.all
    }

    static func templates(in category: String) -> [FormDocumentTemplate] {
        all.filter { $0.category == category }
    }

    static func template(id: String) -> FormDocumentTemplate? {
        all.first { $0.id == id }
    }

    // MARK: - Rendering

    /// Composes the full document text, populated with school/team data.
    static func render(_ template: FormDocumentTemplate,
                       schoolName: String,
                       teamName: String,
                       season: String = "") -> String {
        let school = schoolName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "HIGH SCHOOL" : schoolName.uppercased()
        var out: [String] = []
        out.append(school)
        if !teamName.isEmpty {
            out.append(season.isEmpty ? teamName : "\(teamName)  •  \(season)")
        }
        out.append(template.title.uppercased())
        out.append(String(repeating: "─", count: 46))
        for section in template.sections {
            out.append("")
            out.append("## " + section.heading)
            out.append(contentsOf: section.blocks)
        }
        return out.joined(separator: "\n")
    }

    // MARK: - Matching

    private static let aliases: [String: [String]] = [
        "concussion": ["concussion", "head injury", "tbi", "bell rung", "return to play"],
        "sca": ["sudden cardiac", "cardiac arrest", "heart", "aed"],
        "heat": ["heat illness", "heat stroke", "hydration", "exertional heat", "heat exhaustion"],
        "physical": ["physical", "ppe", "pre-participation", "sports physical", "exam"],
        "medicalHistory": ["medical history", "health history", "medical information", "emergency contact", "emergency information", "medical form"],
        "emergency": ["emergency", "consent to treat", "medical authorization"],
        "insurance": ["insurance", "coverage", "policy"],
        "code": ["code of conduct", "conduct", "sportsmanship", "behavior"],
        "handbook": ["handbook", "acknowledgment", "rules"],
        "uniform": ["uniform", "equipment", "issuance", "jersey"],
        "risk": ["waiver", "release", "assumption of risk", "liability"],
        "media": ["media", "photo", "likeness", "broadcast", "video"],
        "travel": ["travel", "overnight", "trip", "hotel"],
        "transport": ["transportation", "bus", "ride", "driving"],
        "permission": ["permission", "slip", "field trip", "activity"],
        "hazing": ["hazing", "bullying", "harassment", "cyberbullying"],
        "substance": ["substance", "alcohol", "drug", "opioid", "vaping", "tobacco"],
        "ferpa": ["ferpa", "records", "release of information", "privacy"],
        "fundraiser": ["fundrais", "fundraising", "donation"],
        "impact": ["impact", "baseline", "neurocognitive", "cognitive testing"],
    ]

    static func match(_ prompt: String) -> FormDocumentTemplate? {
        let p = prompt.lowercased()
        // Ranking (highest wins):
        //   1. longest matched phrase (template id or alias)  — strongest signal
        //   2. phrase score
        //   3. title-word score                              — weak signal / tie-break
        // This makes "emergency contact form" resolve to the medical-info form
        // instead of the shorter "emergency" keyword, while still matching
        // prompts that only echo the title (e.g. "consent").
        var best: (template: FormDocumentTemplate, phraseLen: Int, phraseScore: Int, tokenScore: Int)?

        for template in all {
            var phraseLen = 0
            var phraseScore = 0
            var tokenScore = 0

            if p.contains(template.id.lowercased()) {
                phraseScore += 6
                phraseLen = max(phraseLen, template.id.count)
            }
            for kw in aliases[template.id] ?? [] where p.contains(kw) {
                phraseScore += 4 + min(kw.count, 24) / 4
                phraseLen = max(phraseLen, kw.count)
            }
            for word in template.title.lowercased().split(whereSeparator: { !$0.isLetter })
            where word.count > 3 && p.contains(word) {
                tokenScore += 2
            }

            guard phraseLen > 0 || tokenScore > 0 else { continue }

            guard let current = best else {
                best = (template, phraseLen, phraseScore, tokenScore)
                continue
            }
            if phraseLen != current.phraseLen {
                if phraseLen > current.phraseLen { best = (template, phraseLen, phraseScore, tokenScore) }
            } else if phraseScore != current.phraseScore {
                if phraseScore > current.phraseScore { best = (template, phraseLen, phraseScore, tokenScore) }
            } else if tokenScore > current.tokenScore {
                best = (template, phraseLen, phraseScore, tokenScore)
            }
        }
        return best?.template
    }
}
