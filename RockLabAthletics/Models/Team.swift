import Foundation

/// A specific team (a school's sport instance at a given level/season).
struct Team: Identifiable, Codable {
    let id: String
    var schoolId: String
    var sportId: String
    var sportName: String
    var level: String
    var season: String
    var gender: String
    var headCoachId: String
    var joinCode: String

    init(
        id: String,
        schoolId: String,
        sportId: String,
        sportName: String,
        level: String,
        season: String,
        gender: String,
        headCoachId: String,
        joinCode: String
    ) {
        self.id = id
        self.schoolId = schoolId
        self.sportId = sportId
        self.sportName = sportName
        self.level = level
        self.season = season
        self.gender = gender
        self.headCoachId = headCoachId
        self.joinCode = joinCode
    }

    init?(id: String, data: [String: Any]) {
        guard let schoolId = data["schoolId"] as? String,
              let sportName = data["sportName"] as? String else { return nil }
        self.id = id
        self.schoolId = schoolId
        self.sportId = data["sportId"] as? String ?? ""
        self.sportName = sportName
        self.level = data["level"] as? String ?? "Varsity"
        self.season = data["season"] as? String ?? ""
        self.gender = data["gender"] as? String ?? ""
        self.headCoachId = data["headCoachId"] as? String ?? ""
        self.joinCode = data["joinCode"] as? String ?? ""
    }
}


