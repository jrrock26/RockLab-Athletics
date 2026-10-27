import Foundation

/// A sports team at the school.
struct Team: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var sport: String
    var season: Season
    var mascot: String?

    enum Season: String, Codable, CaseIterable, Identifiable {
        case fall, winter, spring, summer

        var id: String { rawValue }
    }
}
