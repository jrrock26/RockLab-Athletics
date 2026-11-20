import Foundation

/// Travel, transportation, and activity permission forms.
enum FormLibraryTrips {
    static let all: [FormDocumentTemplate] = [
        FormDocumentTemplate(
            id: "travel",
            title: "Team Travel & Overnight Trip Consent",
            category: "Trips & Activities",
            summary: "Supervision, itinerary, conduct, and consent to travel with the team.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. TRIP INFORMATION", blocks: [
                    "Destination: _______________________________  Dates: ______________ to ______________",
                    "Departure time/place: ______________________  Return time/place: ____________________",
                    "Mode of transportation: ____________________  Overnight lodging: ____________________",
                    "Estimated cost to family: $______________    Sponsor/coach in charge: ______________",
                ]),
                FormDocSection(heading: "2. SUPERVISION AND ITINERARY", blocks: [
                    "• The team will travel as a group and will remain under the supervision of the coaching staff for the duration of the trip.",
                    "• A detailed itinerary, including lodging assignments and contact information, will be provided to parents/guardians before departure.",
                    "• Curfew, room assignment, and check-in rules will be enforced. Student-athletes may not leave the group or the lodging facility without permission from a coach.",
                    "• Coaches will maintain a roster and will account for every student-athlete at each transition and at curfew.",
                ]),
                FormDocSection(heading: "3. TRANSPORTATION", blocks: [
                    "• Transportation will be provided by school-owned vehicles, a district-contracted carrier, or another approved method.",
                    "• Student-athletes may not drive personal vehicles to or from a team trip without written parent/guardian permission and coach approval.",
                    "• Student-athletes are expected to follow all safety rules, including seat belt use and the instructions of the driver.",
                ]),
                FormDocSection(heading: "4. CONDUCT AND MEDICATION", blocks: [
                    "• All school and team conduct rules apply during travel, including prohibitions on alcohol, tobacco, vaping, and controlled substances.",
                    "• Student-athletes may self-administer approved medication, including inhalers and EpiPens, and must inform the coach of any medication brought on the trip.",
                    "• Any violation of the code of conduct during travel may result in return travel at the family's expense and further discipline.",
                ]),
                FormDocSection(heading: "5. CONSENT", blocks: [
                    "I grant permission for the student-athlete to travel with the team as described above, and I consent to the supervision, conduct, and emergency procedures described in this form. I understand that I will be contacted in the event of a serious injury or illness.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "transport",
            title: "Transportation Authorization",
            category: "Trips & Activities",
            summary: "Permission to ride school transportation and release for alternate transport.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. SCHOOL-PROVIDED TRANSPORTATION", blocks: [
                    "I authorize the student-athlete named on this form to ride school-provided transportation, including school buses, activity buses, district-contracted carriers, and coach-driven vehicles, to and from practices, contests, and team activities.",
                ]),
                FormDocSection(heading: "2. ALTERNATE TRANSPORTATION", blocks: [
                    "School policy generally requires student-athletes to travel to and from contests with the team. If an exception is requested, the parent/guardian must provide written notice to the coach and athletic director in advance.",
                    "• A student-athlete may be released to a parent/guardian at the conclusion of an event with coach approval.",
                    "• A student-athlete may ride with another adult only with written parent/guardian permission identifying the driver.",
                    "• A student-athlete who drives a personal vehicle does so at the family's own risk and only with written parent/guardian permission and coach approval.",
                ]),
                FormDocSection(heading: "3. RELEASE", blocks: [
                    "I understand that when the student-athlete is transported by a method other than school-provided transportation, the school district's supervision ends at the point of release. I assume all risks associated with alternate transportation.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I have read and understand this transportation authorization.",
                    "• I understand that I must provide written notice for any exception to team travel.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "permission",
            title: "Parent Permission Slip",
            category: "Trips & Activities",
            summary: "Permission for a specific team activity, with medical and conduct consent.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. ACTIVITY DETAILS", blocks: [
                    "Activity: ___________________________________  Date(s): ______________________",
                    "Location: __________________________________  Departure: ____________________",
                    "Return: ___________________________________  Cost to family: $________________",
                    "Sponsor/coach: ____________________________  Contact phone: __________________",
                    "Description of activity: __________________________________________________________",
                ]),
                FormDocSection(heading: "2. PERMISSION", blocks: [
                    "I grant permission for the student-athlete named on this form to participate in the activity described above, including travel to and from the activity under the supervision of school personnel.",
                ]),
                FormDocSection(heading: "3. MEDICAL CONSENT", blocks: [
                    "In the event of injury or illness during this activity, I authorize school personnel to obtain emergency medical treatment for the student-athlete if I cannot be reached, including transportation to a medical facility by ambulance or emergency medical service.",
                    "Medical conditions, allergies, or medications school staff should know about: ____________________",
                ]),
                FormDocSection(heading: "4. CONDUCT", blocks: [
                    "The student-athlete is expected to follow all school and team rules during this activity. I understand that violations may result in removal from the activity, return travel at the family's expense, and further discipline.",
                ]),
                FormDocSection(heading: "5. ACKNOWLEDGMENT", blocks: [
                    "• I have read and understand this permission slip and sign it voluntarily.",
                    "• I understand that I am responsible for any costs described above.",
                ]),
            ]
        ),
    ]
}
