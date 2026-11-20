import Foundation

/// Medical and safety forms required before participation.
enum FormLibraryMedical {
    static let all: [FormDocumentTemplate] = [
        FormDocumentTemplate(
            id: "concussion",
            title: "Concussion Information & Acknowledgment",
            category: "Medical & Safety",
            summary: "Annual concussion education and acknowledgment required before participation.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. PURPOSE AND NOTICE", blocks: [
                    "This form is provided annually, before the first practice, to every student-athlete and his or her parent/guardian in accordance with state concussion safety legislation and the school district's concussion management policy. Please read this information carefully. Your signature acknowledges receipt and understanding of this information.",
                    "A concussion is a type of traumatic brain injury caused by a bump, blow, or jolt to the head or body that causes the brain to move rapidly back and forth inside the skull. Concussions can occur in any sport, in practice or in competition, with or without loss of consciousness.",
                ]),
                FormDocSection(heading: "2. SIGNS OBSERVED BY COACHES, OFFICIALS, OR PARENTS", blocks: [
                    "• Appears dazed or stunned, or is confused about an assignment or position",
                    "• Forgets plays, is unsure of the game, score, or opponent, or is confused about instructions",
                    "• Moves clumsily, appears off balance, or has slowed reaction time",
                    "• Answers questions slowly, repeats the same questions, or is easily distracted",
                    "• Loses consciousness, even briefly",
                    "• Exhibits mood, behavior, or personality changes that are not typical",
                    "• Cannot recall events prior to or after a hit or fall",
                ]),
                FormDocSection(heading: "3. SYMPTOMS REPORTED BY THE STUDENT-ATHLETE", blocks: [
                    "• Headache or a feeling of pressure in the head",
                    "• Nausea or vomiting",
                    "• Balance problems, dizziness, or light-headedness",
                    "• Double or blurry vision, or sensitivity to light or noise",
                    "• Feeling sluggish, hazy, foggy, or groggy",
                    "• Concentration or memory problems, or feeling not right",
                    "• Sadness, irritability, nervousness, or anxiety",
                    "• Trouble falling asleep, or sleeping more or less than usual",
                ]),
                FormDocSection(heading: "4. REMOVAL AND RETURN-TO-PLAY PROTOCOL", blocks: [
                    "• Any student-athlete suspected of sustaining a concussion shall be removed from practice or competition immediately. When in doubt, sit them out.",
                    "• Under no circumstances may a student-athlete return to play on the same day as a suspected concussion, regardless of how quickly symptoms resolve.",
                    "• A student-athlete removed from play may not return to any practice, conditioning, or competition until evaluated and cleared in writing by a licensed health care provider trained in the evaluation and management of concussion.",
                    "• The school follows a graduated return-to-learn and return-to-play progression. Each step requires a minimum of 24 hours and the athlete must remain symptom-free before advancing.",
                    "• An athlete who is not medically cleared remains ineligible for all athletic participation and may not be present in uniform at contests.",
                    "• The athletic trainer, school nurse, coaches, and administrators will share information necessary to implement this protocol, consistent with applicable privacy laws.",
                ]),
                FormDocSection(heading: "5. ACKNOWLEDGMENT", blocks: [
                    "• I have received, read, and understand the concussion information contained in this document.",
                    "• I understand that a concussion is a serious injury and that concussions occur without loss of consciousness.",
                    "• I understand that the student-athlete must immediately report any symptoms to a coach, athletic trainer, or school nurse and must not attempt to tough it out.",
                    "• I understand that concealing symptoms or providing false information may result in serious harm and disciplinary action, including removal from the team.",
                    "• I authorize school personnel to remove the student-athlete from participation when a concussion is suspected.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "sca",
            title: "Sudden Cardiac Arrest Awareness & Acknowledgment",
            category: "Medical & Safety",
            summary: "Sudden cardiac arrest risk factors, warning signs, and required acknowledgment.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. NOTICE TO STUDENT-ATHLETE AND PARENT/GUARDIAN", blocks: [
                    "Sudden cardiac arrest (SCA) is one of the leading causes of death in young athletes during exercise. SCA occurs when the heart unexpectedly stops beating, usually because of an undetected structural or electrical abnormality. SCA is not a heart attack; it is an electrical malfunction that requires immediate bystander CPR and defibrillation.",
                ]),
                FormDocSection(heading: "2. WARNING SIGNS AND RISK FACTORS", blocks: [
                    "• Fainting, passing out, or seizure-like activity during or immediately after exercise",
                    "• Unexplained shortness of breath, fatigue, or chest pain during exercise",
                    "• A racing heart, palpitations, or a sensation of fluttering in the chest",
                    "• Dizziness or light-headedness out of proportion to the activity",
                    "• Family history of sudden cardiac death, heart failure, or a pacemaker/defibrillator before age 50",
                    "• A known heart murmur, high blood pressure, or prior diagnosis of a heart condition",
                ]),
                FormDocSection(heading: "3. EMERGENCY ACTION PLAN", blocks: [
                    "• Any athlete exhibiting the warning signs above will be removed from activity immediately and evaluated by trained medical personnel.",
                    "• If an athlete collapses and is unresponsive or not breathing normally, emergency medical services will be activated and an automated external defibrillator (AED) will be applied as soon as it is available.",
                    "• Coaches and staff are trained in CPR and AED use, and each venue has a written emergency action plan identifying the location of the AED.",
                    "• An athlete who has experienced an SCA-related event may not return to participation until cleared in writing by a cardiologist or the athlete's treating physician.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I have received, read, and understand the information provided regarding sudden cardiac arrest.",
                    "• I have been given the opportunity to ask questions and to disclose any family history or known cardiac condition.",
                    "• I understand that participation in athletics carries an inherent risk of serious injury or death, including sudden cardiac arrest.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "heat",
            title: "Heat Illness & Hydration Awareness",
            category: "Medical & Safety",
            summary: "Recognition, prevention, and emergency response for exertional heat illness.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. PURPOSE", blocks: [
                    "Exertional heat illness is a preventable condition that ranges from heat cramps to exertional heat stroke, a life-threatening medical emergency. This document explains how the school prevents, recognizes, and treats heat illness during practices and contests.",
                ]),
                FormDocSection(heading: "2. LEVELS OF HEAT ILLNESS", blocks: [
                    "• Heat cramps: painful muscle spasms in the legs or abdomen; treat with rest, stretching, and fluids containing electrolytes.",
                    "• Heat syncope: fainting or dizziness after exertion; move to a cool area, elevate the legs, and rehydrate.",
                    "• Heat exhaustion: heavy sweating, weakness, cool or clammy skin, nausea, headache, or vomiting; remove from activity, cool actively, and monitor.",
                    "• Exertional heat stroke: core temperature above 104°F, confusion, agitation, collapse, or loss of consciousness. This is a medical emergency — call 911 and begin cold-water immersion immediately.",
                ]),
                FormDocSection(heading: "3. PREVENTION", blocks: [
                    "• A structured acclimatization period of at least 14 days at the start of the season, with progressive increases in intensity and equipment.",
                    "• Mandatory rest breaks and unlimited access to water; athletes are never denied water as discipline.",
                    "• Practices are modified or moved based on heat index, wet-bulb globe temperature, and state association guidelines.",
                    "• Athletes should arrive hydrated, drink before and during activity, and weigh in and out of practice when indicated.",
                    "• Certain medications, illnesses, and prior heat illness increase risk and must be disclosed to the athletic trainer.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I have received, read, and understand the heat illness information provided above.",
                    "• I understand that I must report symptoms of heat illness to a coach or athletic trainer immediately.",
                    "• I understand that returning to activity after heat illness may require written medical clearance.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "physical",
            title: "Pre-Participation Physical Examination",
            category: "Medical & Safety",
            summary: "Medical history, physical exam, and provider clearance to participate.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. INSTRUCTIONS", blocks: [
                    "This form must be completed before the student-athlete may try out, practice, or compete. The medical history portion is to be completed by the student-athlete and parent/guardian and reviewed with the examining provider. The physical examination must be performed by a physician, nurse practitioner, or physician assistant licensed to practice medicine. The completed form is valid for twelve (12) months from the date of examination unless state law or school policy provides otherwise.",
                ]),
                FormDocSection(heading: "2. STUDENT-ATHLETE INFORMATION", blocks: [
                    "Name: ____________________________________   Date of Birth: ______________   Grade: ______",
                    "School: __________________________________   Sport(s): ______________________",
                    "Home Address: _____________________________________________________________",
                    "Parent/Guardian: __________________________   Phone: ________________________",
                    "Emergency Contact: ________________________   Phone: ________________________",
                ]),
                FormDocSection(heading: "3. MEDICAL HISTORY (answer YES or NO)", blocks: [
                    "• Has the athlete ever been hospitalized, had surgery, or been evaluated in an emergency department?",
                    "• Does the athlete have asthma, exercise-induced bronchospasm, or difficulty breathing during exercise?",
                    "• Has the athlete ever been diagnosed with a concussion, or had a head injury requiring evaluation?",
                    "• Does the athlete have a history of heat illness, dehydration, or sickle cell trait?",
                    "• Has the athlete ever fainted, passed out, or had a seizure during or after exercise?",
                    "• Does the athlete have chest pain, a heart murmur, high blood pressure, or a heart condition?",
                    "• Is there a family history of sudden death, heart disease, or a pacemaker before age 50?",
                    "• Does the athlete have any allergies to medication, food, insects, or latex? List them.",
                    "• Does the athlete take any prescription or over-the-counter medication or supplement?",
                    "• Has the athlete ever had a fracture, dislocation, or injury requiring rehabilitation?",
                    "• Does the athlete wear glasses, contacts, a hearing aid, or dental appliances?",
                    "• Does the athlete have only one kidney, one eye, or any other paired organ?",
                ]),
                FormDocSection(heading: "4. PHYSICAL EXAMINATION (provider completes)", blocks: [
                    "Height: ______   Weight: ______   Blood Pressure: ______ / ______   Pulse: ______",
                    "Vision: Right 20/____   Left 20/____   Corrected: Yes / No",
                    "HEENT: ____   Cardiovascular: ____   Lungs: ____   Abdomen: ____",
                    "Genitourinary: ____   Musculoskeletal: ____   Neurological: ____   Skin: ____",
                    "Exam findings and recommendations: ________________________________________________",
                ]),
                FormDocSection(heading: "5. CLEARANCE STATUS (provider completes)", blocks: [
                    "____ Cleared without restriction for all sports.",
                    "____ Cleared with recommendation for further evaluation or restriction (specify).",
                    "____ Not cleared for participation at this time.",
                    "Recommendations / restrictions: _____________________________________________________",
                ]),
                FormDocSection(heading: "6. PARENT/GUARDIAN CONSENT", blocks: [
                    "I certify that the medical history above is accurate and complete to the best of my knowledge. I understand that withholding information could endanger the athlete. I consent to the examination and to the release of the clearance status to the school's athletic department.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "medicalHistory",
            title: "Athlete Medical & Emergency Information",
            category: "Medical & Safety",
            summary: "Current conditions, allergies, medications, and emergency contacts on file.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. STUDENT-ATHLETE", blocks: [
                    "Name: ____________________________________   Date of Birth: ______________   Grade: ______",
                    "Primary Care Physician: ____________________   Phone: ________________________",
                    "Preferred Hospital: _______________________   Insurance Carrier: ______________",
                ]),
                FormDocSection(heading: "2. MEDICAL CONDITIONS AND ALLERGIES", blocks: [
                    "• Known medical conditions (asthma, diabetes, seizures, heart condition, sickle cell trait, etc.):",
                    "  _____________________________________________________________________________",
                    "• Allergies (medication, food, insect stings, latex):",
                    "  _____________________________________________________________________________",
                    "• Current medications, including inhalers, EpiPen, insulin, and supplements:",
                    "  _____________________________________________________________________________",
                    "• Assistive devices or accommodations (braces, hearing aid, glasses/contacts, etc.):",
                    "  _____________________________________________________________________________",
                ]),
                FormDocSection(heading: "3. EMERGENCY CONTACTS", blocks: [
                    "Primary contact: ____________________________  Relationship: ____________  Phone: ______________",
                    "Secondary contact: __________________________  Relationship: ____________  Phone: ______________",
                    "Physician to notify: ________________________  Phone: ________________________",
                ]),
                FormDocSection(heading: "4. AUTHORIZATION", blocks: [
                    "I authorize school personnel to contact the individuals listed above and to share the information on this form with coaches, athletic trainers, school nurses, and emergency responders as necessary to protect the health and safety of the student-athlete.",
                    "I understand that it is my responsibility to notify the school's athletic department in writing of any change to the information on this form.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "emergency",
            title: "Emergency Medical Authorization",
            category: "Medical & Safety",
            summary: "Consent to treat and transport in the event a parent cannot be reached.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. AUTHORIZATION TO CONSENT TO TREATMENT", blocks: [
                    "In the event of injury or sudden illness to the student-athlete named below, and in the event that I cannot be reached within a reasonable time, I authorize the school, its coaches, athletic trainers, and designated representatives to consent to and obtain emergency medical, surgical, or hospital care for the student-athlete from any licensed physician, dentist, hospital, or emergency medical service.",
                ]),
                FormDocSection(heading: "2. TRANSPORTATION", blocks: [
                    "I authorize the transportation of the student-athlete by ambulance, emergency medical service, or other appropriate means to a medical facility for treatment.",
                    "I understand that every reasonable effort will be made to contact me before treatment is rendered, except where delay would endanger the health of the student-athlete.",
                ]),
                FormDocSection(heading: "3. FINANCIAL RESPONSIBILITY", blocks: [
                    "I understand that I am responsible for all costs incurred as a result of treatment, transportation, or hospitalization and that the school district does not provide medical or health insurance coverage. Any school-sponsored insurance is secondary and excess to my own coverage.",
                ]),
                FormDocSection(heading: "4. ACKNOWLEDGMENT", blocks: [
                    "• I have read and understand this authorization, and I sign it voluntarily.",
                    "• This authorization remains in effect for the current school year unless revoked by me in writing.",
                    "• I understand that a copy of this form will be provided to me upon request.",
                ]),
            ]
        ),

        FormDocumentTemplate(
            id: "insurance",
            title: "Proof of Medical Insurance",
            category: "Medical & Safety",
            summary: "Verification of primary medical coverage required for participation.",
            requiresParentSignature: true,
            sections: [
                FormDocSection(heading: "1. COVERAGE REQUIREMENT", blocks: [
                    "Students participating in interscholastic athletics are required to have primary medical insurance coverage. School-sponsored accident insurance, where offered, is secondary and excess to the family's existing coverage and is not a substitute for primary medical insurance.",
                ]),
                FormDocSection(heading: "2. POLICY INFORMATION", blocks: [
                    "Insurance carrier: ____________________________________________________________",
                    "Policy holder: ______________________________  Relationship to athlete: ____________",
                    "Policy number: _____________________________  Group number: ____________________",
                    "Effective date: ______________  Member services phone: ________________________",
                    "Primary or secondary coverage: ________________  Name on card: __________________",
                ]),
                FormDocSection(heading: "3. ACKNOWLEDGMENT", blocks: [
                    "• I certify that the information above is accurate and that primary medical coverage is in force.",
                    "• I agree to notify the school's athletic department immediately if coverage lapses or changes.",
                    "• I understand that failure to maintain coverage may affect my child's eligibility per school policy.",
                ]),
            ]
        ),
    ]
}
