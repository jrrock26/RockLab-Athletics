import SwiftUI

/// A sport's gender split (Boys / Girls / Coed).
struct SportGendersView: View {
    let schoolId: String
    let sport: Sport

    private let genders = ["Boys", "Girls", "Coed"]

    var body: some View {
        List(genders, id: \.self) { gender in
            NavigationLink {
                SportTeamsView(schoolId: schoolId, sport: sport, gender: gender)
            } label: {
                Label(gender, systemImage: systemImage(for: gender))
            }
        }
        .navigationTitle("\(sport.name)")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func systemImage(for gender: String) -> String {
        switch gender {
        case "Boys": return "figure.stand"
        case "Girls": return "figure.dance"
        default: return "person.2"
        }
    }
}
