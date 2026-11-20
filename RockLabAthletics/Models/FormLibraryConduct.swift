import Foundation

/// Eligibility, conduct, and policy acknowledgment forms.
enum FormLibraryConduct {
    static let all: [FormDocumentTemplate] = [
        FormDocumentTemplate(
            id: "code",
            title: "Student-Athlete & Parent Code of Conduct",
            category: "Eligibility & Conduct",
            summary: "Behavioral expectations, sportsmanship standards, and consequences.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. PURPOSE", blocks: [
                    "Participation in interscholastic athletics is a privilege, not a right. Student-athletes represent their school, their community, and their teammates at all times. This Code of Conduct establishes the standards of behavior expected of every student-athlete and the consequences for violations.",
                ]),
                FormDocSection(heading: "2. STANDARDS OF CONDUCT", blocks: [
                    "• Treat teammates, opponents, officials, coaches, and spectators with respect at all times.",
                    "• Demonstrate good sportsmanship before, during, and after competition; never taunt, bait, or use profanity.",
                    "• Respect the decisions of officials and accept victory and defeat with dignity.",
                    "• Attend all practices, team meetings, and contests punctually; notify the coach in advance of any absence.",
                    "• Maintain academic eligibility and complete all assigned schoolwork.",
                    "• Follow all team, school, and district rules, including travel, curfew, and locker room policies.",
                    "• Refrain from hazing, bullying, harassment, and all forms of retaliation.",
                    "• Refrain from the use of alcohol, tobacco, vaping products, cannabis, and illegal or performance-enhancing substances.",
                    "• Use social media responsibly; never post content that disparages teammates, opponents, coaches, or the school.",
                    "• Care for and return all issued equipment and uniforms in the condition required by the team.",
                ]),
                FormDocSection(heading: "3. VIOLATIONS AND CONSEQUENCES", blocks: [
                    "• Violations may result in a verbal or written warning, loss of playing time, suspension from one or more contests, removal from a leadership position, or removal from the team.",
                    "• Violations involving hazing, harassment, violence, weapons, or controlled substances may result in immediate removal and referral to school administration and law enforcement.",
                    "• Consequences may be imposed by the coach and, where applicable, by the school administration under the student code of conduct.",
                    "• Any student-athlete charged with or convicted of a criminal offense may be suspended pending resolution.",
                ]),
                FormDocSection(heading: "4. DUE PROCESS AND APPEAL", blocks: [
                    "A student-athlete and parent/guardian may request a meeting with the athletic director to discuss an alleged violation within five (5) school days. The athletic director's determination may be appealed in writing to the principal or designee, whose decision is final under school policy.",
                ]),
                FormDocSection(heading: "5. ACKNOWLEDGMENT", blocks: [
                    "• I have read, understand, and agree to abide by this Code of Conduct and all school and district athletic policies.",
                    "• I understand that violation of this Code may result in disciplinary action, including suspension or removal from the team.",
                    "• I understand that participation in athletics is a privilege that may be revoked.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "handbook",
            title: "Athletic Handbook Acknowledgment",
            category: "Eligibility & Conduct",
            summary: "Receipt and acknowledgment of the athletic participation handbook.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. RECEIPT OF HANDBOOK", blocks: [
                    "The student-athlete and parent/guardian acknowledge receipt of the school's athletic participation handbook, which describes eligibility requirements, tryout and team selection procedures, attendance rules, practice and contest expectations, travel policies, lettering criteria, awards, the chain of command for concerns, and disciplinary procedures.",
                ]),
                FormDocSection(heading: "2. ELIGIBILITY", blocks: [
                    "• Eligibility is determined by state association rules and school policy, including academic standing, residency, age, and transfer requirements.",
                    "• The student-athlete must be enrolled, in good standing, and passing the minimum course load required by the state association.",
                    "• Eligibility may be lost for disciplinary reasons, attendance violations, or academic standards, and may be restored only as permitted by policy.",
                ]),
                FormDocSection(heading: "3. COMMUNICATION AND CHAIN OF COMMAND", blocks: [
                    "• Concerns about playing time, strategy, or team decisions should first be directed to the head coach at an appropriate time, not during or immediately after a contest.",
                    "• Unresolved concerns may be directed to the athletic director and then to the principal.",
                    "• Parents should not approach coaches or student-athletes in a confrontational manner before, during, or after contests.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I have received and reviewed the athletic handbook and had the opportunity to ask questions.",
                    "• I understand that the handbook may be updated and that I am responsible for reviewing revisions.",
                    "• I agree to follow the procedures described in the handbook.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "hazing",
            title: "Anti-Hazing & Anti-Bullying Acknowledgment",
            category: "Eligibility & Conduct",
            summary: "Prohibition of hazing, bullying, harassment, and retaliation.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. POLICY STATEMENT", blocks: [
                    "Hazing, bullying, harassment, and intimidation have no place in this athletic program. The school prohibits any act, on or off campus, that endangers the mental or physical health or safety of a student, or that intentionally humiliates or degrades a student for the purpose of initiation, admission into, affiliation with, or continued membership in a team or group.",
                ]),
                FormDocSection(heading: "2. DEFINITIONS", blocks: [
                    "• Hazing: any act that endangers a student's physical or mental health or safety, or that shames or degrades a student, regardless of the student's willingness to participate.",
                    "• Bullying: repeated unwanted behavior intended to harm, intimidate, or humiliate another person, including physical, verbal, social, and written acts.",
                    "• Cyberbullying: bullying that occurs through electronic means, including text, social media, gaming platforms, and group chats.",
                    "• Harassment: unwelcome conduct based on race, color, religion, sex, national origin, disability, or other protected characteristic.",
                    "• Retaliation: any adverse action taken against a person for reporting or participating in an investigation.",
                ]),
                FormDocSection(heading: "3. REPORTING AND INVESTIGATION", blocks: [
                    "• Any student who experiences or witnesses hazing, bullying, or harassment must report it to a coach, athletic director, counselor, or administrator.",
                    "• Reports may be made anonymously where school policy allows.",
                    "• The school will investigate all reports promptly and will take reasonable steps to protect the reporting student from retaliation.",
                    "• Retaliation against a person who reports or cooperates in an investigation is itself a violation and will result in discipline.",
                ]),
                FormDocSection(heading: "4. CONSEQUENCES", blocks: [
                    "Violations may result in suspension from participation, removal from the team, school disciplinary action, and referral to law enforcement where required by law. Team captains and upperclassmen are expected to model and enforce this policy.",
                ]),
                FormDocSection(heading: "5. ACKNOWLEDGMENT", blocks: [
                    "• I have read and understand this policy and the definitions above.",
                    "• I will not participate in, encourage, or remain silent about hazing, bullying, or harassment.",
                    "• I understand how to report a concern and that retaliation is prohibited.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "substance",
            title: "Substance Use & Opioid Awareness Acknowledgment",
            category: "Eligibility & Conduct",
            summary: "Alcohol, tobacco, cannabis, opioid, and performance-enhancing drug policy.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. PROHIBITED SUBSTANCES", blocks: [
                    "The use, possession, purchase, sale, or distribution of alcohol, tobacco, vaping and e-cigarette products, cannabis in any form, inhalants, controlled substances, or performance-enhancing substances is prohibited for student-athletes on school property, at school-sponsored events, and while representing the school.",
                ]),
                FormDocSection(heading: "2. OPIOID RISK NOTICE", blocks: [
                    "Opioids are highly addictive medications used to treat severe pain. Even when prescribed by a physician, opioids carry a serious risk of dependence, overdose, and death. Student-athletes should never take a prescription medication that was not prescribed to them. Parents should secure all prescription medications, dispose of unused opioids through an authorized take-back program, and discuss the risks of opioid use with their child.",
                    "If a student-athlete is prescribed an opioid following an injury, the family should notify the school's athletic trainer so that return-to-play and rehabilitation can be coordinated safely.",
                ]),
                FormDocSection(heading: "3. PERFORMANCE-ENHANCING SUBSTANCES", blocks: [
                    "The use of anabolic steroids, growth hormones, and other substances banned by the state association is prohibited. Student-athletes must disclose all dietary supplements to the athletic trainer; supplements are not regulated for purity or safety and may contain banned substances.",
                ]),
                FormDocSection(heading: "4. CONSEQUENCES", blocks: [
                    "• A first violation may result in suspension from contests and required participation in a counseling or education program.",
                    "• A second violation may result in removal from the team for the remainder of the season.",
                    "• Violations may also be referred to school administration and, where required, law enforcement.",
                    "• The school may require a substance-use assessment before an athlete is permitted to return.",
                ]),
                FormDocSection(heading: "5. ACKNOWLEDGMENT", blocks: [
                    "• I have read and understand the substance use policy and the opioid risk notice.",
                    "• I understand that I must disclose all medications and supplements to the athletic trainer.",
                    "• I understand the consequences of a violation of this policy.",
                ]),
            ]
        ),
    ]
}
