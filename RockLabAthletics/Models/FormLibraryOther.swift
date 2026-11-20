import Foundation

/// Fundraising and program-support forms.
enum FormLibraryOther {
    static let all: [FormDocumentTemplate] = [
        FormDocumentTemplate(
            id: "fundraiser",
            title: "Fundraiser Participation Agreement",
            category: "Fundraising",
            summary: "Campaign expectations, handling of funds, deadlines, and opt-out option.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. CAMPAIGN DETAILS", blocks: [
                    "Campaign: __________________________________  Start date: ____________________",
                    "Orders/funds due: __________________________  Distribution date: ______________",
                    "Team goal per athlete: $___________________  Contact: ______________________",
                ]),
                FormDocSection(heading: "2. PARTICIPATION EXPECTATIONS", blocks: [
                    "• The student-athlete and family agree to participate in good faith in the fundraising campaign described above.",
                    "• All order forms, payments, and funds collected must be turned in by the stated deadline.",
                    "• Checks should be made payable as directed by the team; cash must be submitted in a sealed envelope with a completed tally sheet.",
                    "• The student-athlete and family are responsible for delivering products to customers in the condition received.",
                    "• Prizes and incentives are awarded only after all funds are collected and reconciled.",
                ]),
                FormDocSection(heading: "3. HANDLING OF FUNDS", blocks: [
                    "All funds collected are the property of the team's authorized booster organization or the school activity account and must be handled in accordance with school district policy. Families may not deduct expenses, fees, or personal costs from collected funds.",
                ]),
                FormDocSection(heading: "4. OPT-OUT / BUYOUT", blocks: [
                    "A family may opt out of door-to-door sales by paying the designated buyout amount, where offered by the team. The buyout amount, if any, is: $______________________. Opting out does not exempt the family from other team obligations.",
                ]),
                FormDocSection(heading: "5. ACKNOWLEDGMENT", blocks: [
                    "• I have read and understand the terms of this fundraiser and agree to the participation expectations.",
                    "• I understand the deadlines and that all funds must be submitted by the due date.",
                    "• I understand that participation in the fundraiser supports the team and is subject to school district policy.",
                ]),
            ]
        ),
    ]
}
