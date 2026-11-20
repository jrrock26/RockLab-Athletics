import SwiftUI

/// Plain-language privacy and data-handling summary shown in Settings.
/// Mirrors DATA-HANDLING.md in the repository.
struct PrivacyView: View {
    var body: some View {
        List {
            Section {
                Text("RockLab Athletics is used by schools to run athletic programs. Most of the data in it belongs to students, so we collect only what a specific athletic workflow needs and show it only to the roles that need it.")
                    .font(.callout)
            }

            Section("What we collect") {
                privacyRow("Account", "Name, email, optional phone, and your role (AD, coach, staff, player, parent, follower).")
                privacyRow("Roster", "Jersey number, position, and grade for student-athletes.")
                privacyRow("Health & safety", "Injury status and reports, emergency contacts, allergies, and medications.")
                privacyRow("Forms", "Your typed e-signature, the date you signed, and any answers on the form.")
                privacyRow("Media", "Photos and game film uploaded to a team.")
                privacyRow("Diagnostics", "Crash reports and anonymous usage counts used to fix bugs.")
            }

            Section("What we never collect") {
                Text("Precise location, advertising identifiers, your contacts, browsing history, or biometrics. There is no advertising or tracking SDK in this app.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Who can see what") {
                privacyRow("Eligibility", "AD, coaches, and staff only — never shown to players, parents, or followers.")
                privacyRow("Injury status", "Visible on the roster so everyone knows a player is out. Detailed reports are staff only.")
                privacyRow("Emergency contacts", "AD, coaches, and staff with permission.")
                privacyRow("Athlete profile", "Edited only by the athlete or their linked parent. Coaches can view but never edit it.")
                privacyRow("Jersey & position", "Managed by coaches. Athletes and parents can view them.")
            }

            Section("Your controls") {
                Text("Delete your account yourself in Settings → Delete Account. Your profile, photo, and sign-in are removed, you leave every team, and you're unlinked from family records. Records your school owns — submitted forms and team history — stay with the school.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let url = URL(string: "https://rocklabathletics.web.app/privacy") {
                    Link("Read the full privacy policy", destination: url)
                        .font(.footnote)
                }
            }

            Section("Third parties") {
                privacyRow("Google Firebase", "Hosts accounts, database, files, notifications, analytics, and crash reports.")
                privacyRow("OpenAI", "Only when a coach asks the app to draft a form. The coach's prompt and school/team name are sent — never student data.")
            }

            Section {
                Text("No data is sold. Analytics and crash reports use an opaque account ID and never include names, emails, phone numbers, or medical details.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Privacy & Data")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func privacyRow(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(detail).font(.caption).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}
