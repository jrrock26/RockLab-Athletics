import Foundation

/// Equipment and uniform issuance agreements.
enum FormLibraryEquipment {
    static let all: [FormDocumentTemplate] = [
        FormDocumentTemplate(
            id: "uniform",
            title: "Uniform & Equipment Issuance Agreement",
            category: "Equipment & Participation",
            summary: "Issued items, care requirements, return deadlines, and replacement fees.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. ISSUED ITEMS", blocks: [
                    "The student-athlete acknowledges receipt of the following team-issued items. Each item remains the property of the school and must be returned at the end of the season or upon request.",
                    "Item / Size / Number / Condition / Replacement Cost",
                    "1. ______________________  ______  ______  ____________  $__________",
                    "2. ______________________  ______  ______  ____________  $__________",
                    "3. ______________________  ______  ______  ____________  $__________",
                    "4. ______________________  ______  ______  ____________  $__________",
                ]),
                FormDocSection(heading: "2. CARE AND USE", blocks: [
                    "• Items are to be used only for school-sanctioned practices, contests, and team functions.",
                    "• Items must be kept clean, stored properly, and not altered, cut, or defaced.",
                    "• Items may not be loaned, sold, or transferred to another person.",
                    "• The student-athlete is responsible for the item from the date of issue until it is returned.",
                ]),
                FormDocSection(heading: "3. RETURN AND FEES", blocks: [
                    "• All issued items must be returned within ten (10) school days of the end of the season, or immediately upon leaving the team.",
                    "• Items must be returned clean and in the condition in which they were issued, normal wear excepted.",
                    "• The student-athlete and parent/guardian agree to pay the replacement cost for any lost, stolen, or damaged item beyond normal wear.",
                    "• Unreturned items or unpaid fees may result in the withholding of the student's participation in future seasons, honors, and school-sponsored activities as permitted by school policy.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I have received the items listed above and accept responsibility for their care and return.",
                    "• I understand the return deadline and that I am financially responsible for lost, stolen, or damaged equipment.",
                    "• I understand that failure to return items may affect eligibility for future participation.",
                ]),
            ]
        ),
    ]
}
