import Foundation

/// A sport offered at a school.
struct Sport: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let emoji: String

    init(id: String, name: String, emoji: String) {
        self.id = id
        self.name = name
        self.emoji = emoji
    }

    /// Firestore-friendly representation.
    var asDictionary: [String: Any] {
        ["id": id, "name": name, "emoji": emoji]
    }

    init?(data: [String: Any]) {
        guard let id = data["id"] as? String, let name = data["name"] as? String else { return nil }
        self.id = id
        self.name = name
        self.emoji = data["emoji"] as? String ?? ""
    }
}

/// The global directory of high school sports an AD can choose from.
enum SportsCatalog {
    static let all: [Sport] = [
        Sport(id: "football", name: "Football", emoji: "🏈"),
        Sport(id: "basketball", name: "Basketball", emoji: "🏀"),
        Sport(id: "baseball", name: "Baseball", emoji: "⚾️"),
        Sport(id: "softball", name: "Softball", emoji: "🥎"),
        Sport(id: "volleyball", name: "Volleyball", emoji: "🏐"),
        Sport(id: "soccer", name: "Soccer", emoji: "⚽️"),
        Sport(id: "cross_country", name: "Cross Country", emoji: "🏃"),
        Sport(id: "track_field", name: "Track & Field", emoji: "🏟️"),
        Sport(id: "wrestling", name: "Wrestling", emoji: "🤼"),
        Sport(id: "swimming", name: "Swimming", emoji: "🏊"),
        Sport(id: "tennis", name: "Tennis", emoji: "🎾"),
        Sport(id: "golf", name: "Golf", emoji: "⛳️"),
        Sport(id: "lacrosse", name: "Lacrosse", emoji: "🥍"),
        Sport(id: "field_hockey", name: "Field Hockey", emoji: "🏑"),
        Sport(id: "ice_hockey", name: "Ice Hockey", emoji: "🏒"),
        Sport(id: "gymnastics", name: "Gymnastics", emoji: "🤸"),
        Sport(id: "cheerleading", name: "Cheerleading", emoji: "📣"),
        Sport(id: "dance", name: "Dance", emoji: "💃"),
        Sport(id: "bowling", name: "Bowling", emoji: "🎳"),
        Sport(id: "water_polo", name: "Water Polo", emoji: "🤽")
    ]
}
