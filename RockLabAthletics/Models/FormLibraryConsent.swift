import Foundation

/// Release, waiver, and privacy forms.
enum FormLibraryConsent {
    static let all: [FormDocumentTemplate] = [
        FormDocumentTemplate(
            id: "risk",
            title: "Assumption of Risk & Release of Liability",
            category: "Consent & Releases",
            summary: "Acknowledgment of inherent risks and release of liability.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. VOLUNTARY PARTICIPATION", blocks: [
                    "I voluntarily permit the student-athlete named on this form to participate in the athletic program identified above, including tryouts, practices, conditioning sessions, contests, and team travel. I understand that participation is voluntary and that the student-athlete may withdraw at any time.",
                ]),
                FormDocSection(heading: "2. INHERENT RISKS", blocks: [
                    "I understand that participation in athletics involves inherent and significant risks that cannot be eliminated regardless of the care taken by the school, its coaches, or its staff. These risks include, but are not limited to:",
                    "• Sprains, strains, fractures, dislocations, and other orthopedic injuries",
                    "• Concussion and other head injuries, including permanent brain injury",
                    "• Heat illness, dehydration, and cardiac events, including sudden cardiac arrest",
                    "• Injuries resulting in temporary or permanent paralysis or death",
                    "• Injuries arising from contact with equipment, other participants, and playing surfaces",
                    "• Injuries arising during transportation to and from team activities",
                ]),
                FormDocSection(heading: "3. ACKNOWLEDGMENT AND RELEASE", blocks: [
                    "I understand that the school provides qualified coaching and appropriate supervision but does not guarantee the student-athlete's safety. Knowing the risks described above, I voluntarily assume all such risks on behalf of the student-athlete.",
                    "To the fullest extent permitted by law, I release, waive, and hold harmless the school district, its board, administrators, coaches, employees, and volunteers from any and all claims for injury or damages arising out of the student-athlete's participation, except claims arising from gross negligence or willful misconduct.",
                ]),
                FormDocSection(heading: "4. INSURANCE ACKNOWLEDGMENT", blocks: [
                    "I understand that the school district does not provide medical, health, or accident insurance for student-athletes and that I am responsible for securing and maintaining medical coverage for the student-athlete.",
                ]),
                FormDocSection(heading: "5. SIGNATURES", blocks: [
                    "I have read this document in its entirety, understand its terms, and sign it freely and voluntarily.",
                    "Student-Athlete Signature: ______________________________   Date: ____________",
                    "Parent/Guardian Signature: _____________________________   Date: ____________",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "media",
            title: "Media & Broadcast Release",
            category: "Consent & Releases",
            summary: "Consent to use photographs, video, and likeness in team media.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. GRANT OF PERMISSION", blocks: [
                    "I grant the school, its athletic department, and its authorized representatives permission to photograph, record, and otherwise capture the image, voice, and likeness of the student-athlete named on this form in connection with participation in school athletics.",
                ]),
                FormDocSection(heading: "2. PERMITTED USES", blocks: [
                    "• Team and school websites, social media accounts, and mobile applications",
                    "• Game programs, yearbooks, newsletters, and press releases",
                    "• Livestream or recorded broadcasts of contests",
                    "• Promotional and fundraising materials for the athletic program",
                    "• Local news media coverage of contests and team activities",
                ]),
                FormDocSection(heading: "3. TERMS", blocks: [
                    "• No compensation will be paid to the student-athlete or family for the use of these materials.",
                    "• Images and recordings may be used without identifying the student-athlete by name unless consent for identification has been separately provided.",
                    "• This release is voluntary. Refusing to sign will not affect the student-athlete's ability to participate, though it may limit the school's use of the student's image.",
                    "• This consent may be revoked at any time in writing. Revocation applies prospectively and does not require removal of materials already published.",
                ]),
                FormDocSection(heading: "4. NOTICE", blocks: [
                    "If you do not wish the student-athlete to appear in team or school media, you must notify the athletic director in writing. The student-athlete may still be photographed or recorded as part of routine news coverage of a public event, which the school does not control.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "ferpa",
            title: "Authorization to Release Education Records (FERPA)",
            category: "Consent & Releases",
            summary: "Authorization to share academic and eligibility records with athletic staff.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. AUTHORIZATION", blocks: [
                    "Under the Family Educational Rights and Privacy Act (FERPA), 20 U.S.C. § 1232g, I authorize the school to disclose the education records described below to the school's athletic director, coaches, and athletic trainers, and to the state high school association as required for eligibility determinations.",
                ]),
                FormDocSection(heading: "2. RECORDS TO BE RELEASED", blocks: [
                    "• Academic transcripts, grade reports, and progress reports",
                    "• Attendance records and enrollment status",
                    "• Disciplinary records relevant to eligibility",
                    "• Proof of residency and transfer documentation",
                    "• Physical examination and medical clearance status",
                ]),
                FormDocSection(heading: "3. PURPOSE AND LIMITS", blocks: [
                    "The records will be used solely to determine and monitor athletic eligibility and to protect the health and safety of the student-athlete. Records will not be redisclosed to any other party without further written consent, except as permitted or required by law.",
                    "This authorization is voluntary. A student-athlete may still participate in some capacities without it, but eligibility determinations may be delayed.",
                ]),
                FormDocSection(heading: "4. DURATION AND REVOCATION", blocks: [
                    "This authorization expires one (1) year from the date of signature, or when the student graduates or withdraws, whichever occurs first. I may revoke it at any time by written notice to the school registrar; revocation does not affect disclosures already made in reliance on this form.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "impact",
            title: "Baseline Concussion Testing Consent",
            category: "Consent & Releases",
            summary: "Consent to administer and store baseline neurocognitive testing results.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. PURPOSE OF BASELINE TESTING", blocks: [
                    "Baseline neurocognitive testing measures an athlete's normal brain function before an injury. If a concussion is later suspected, the baseline results are compared with post-injury testing to assist a licensed health care provider in making return-to-learn and return-to-play decisions.",
                ]),
                FormDocSection(heading: "2. WHAT TO EXPECT", blocks: [
                    "• Testing is typically completed on a computer or tablet and takes approximately 25 to 30 minutes.",
                    "• The test measures memory, attention, reaction time, and processing speed.",
                    "• Testing is not painful and does not involve radiation, needles, or medication.",
                    "• Valid results require a quiet setting and the athlete's best effort; results may be invalidated if the athlete does not try their best.",
                ]),
                FormDocSection(heading: "3. CONSENT", blocks: [
                    "• I consent to the administration of baseline neurocognitive testing to the student-athlete.",
                    "• I consent to the secure storage of the results by the school's athletic training staff.",
                    "• I consent to the release of results to licensed health care providers treating the student-athlete for a suspected concussion.",
                    "• I understand that baseline testing is a screening tool only and is not a diagnosis, a clearance, or a substitute for medical evaluation.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I understand that participation in baseline testing is voluntary and is not required to participate in athletics.",
                    "• I understand that declining baseline testing will not prevent the student-athlete from being evaluated after a suspected concussion.",
                ]),
            ]
        ),
    ]
}
