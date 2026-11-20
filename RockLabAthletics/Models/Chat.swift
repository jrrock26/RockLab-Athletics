import Foundation

enum ChatType: String, Codable, CaseIterable {
    case commBoard, team, staff, parent

    var displayName: String {
        switch self {
        case .commBoard: return "Comm Board"
        case .team: return "Team Chat"
        case .staff: return "Staff Chat"
        case .parent: return "Parent Chat"
        }
    }

    var systemImage: String {
        switch self {
        case .commBoard: return "megaphone.fill"
        case .team: return "bubble.left.and.bubble.right.fill"
        case .staff: return "lock.fill"
        case .parent: return "person.2.fill"
        }
    }
}

/// A chat channel within a team.
struct Chat: Identifiable, Codable {
    let id: String
    var teamId: String
    var type: ChatType
    var title: String

    init(id: String, teamId: String, type: ChatType, title: String) {
        self.id = id
        self.teamId = teamId
        self.type = type
        self.title = title
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let typeRaw = data["type"] as? String,
              let type = ChatType(rawValue: typeRaw),
              let title = data["title"] as? String else { return nil }
        self.id = id
        self.teamId = teamId
        self.type = type
        self.title = title
    }
}

/// Category for a comm-board announcement (controls follower visibility).
enum CommCategory: String, Codable, CaseIterable, Identifiable {
    case general, liveGame, gameday, fundraiser

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .general: return "General"
        case .liveGame: return "Live Game"
        case .gameday: return "Gameday"
        case .fundraiser: return "Fundraiser"
        }
    }

    /// Categories followers are allowed to see on the comm board.
    static let followerVisible: [String] = [liveGame.rawValue, gameday.rawValue, fundraiser.rawValue]
}

/// A single message in a chat.
struct Message: Identifiable, Codable {
    let id: String
    var chatId: String
    var senderId: String
    var senderName: String
    var senderPhotoURL: String
    var text: String
    var category: String
    var createdAt: Date

    init(id: String, chatId: String, senderId: String, senderName: String, senderPhotoURL: String = "", text: String, category: String = CommCategory.general.rawValue, createdAt: Date) {
        self.id = id
        self.chatId = chatId
        self.senderId = senderId
        self.senderName = senderName
        self.senderPhotoURL = senderPhotoURL
        self.text = text
        self.category = category
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let text = data["text"] as? String else { return nil }
        self.id = id
        self.chatId = data["chatId"] as? String ?? ""
        self.senderId = data["senderId"] as? String ?? ""
        self.senderName = data["senderName"] as? String ?? ""
        self.senderPhotoURL = data["senderPhotoURL"] as? String ?? ""
        self.text = text
        self.category = data["category"] as? String ?? CommCategory.general.rawValue
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }
}
