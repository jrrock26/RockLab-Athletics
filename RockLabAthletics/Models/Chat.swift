import Foundation

enum ChatType: String, Codable, CaseIterable {
    case commBoard, team, staff

    var displayName: String {
        switch self {
        case .commBoard: return "Comm Board"
        case .team: return "Team Chat"
        case .staff: return "Staff Chat"
        }
    }

    var systemImage: String {
        switch self {
        case .commBoard: return "megaphone.fill"
        case .team: return "bubble.left.and.bubble.right.fill"
        case .staff: return "lock.fill"
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

/// A single message in a chat.
struct Message: Identifiable, Codable {
    let id: String
    var chatId: String
    var senderId: String
    var senderName: String
    var text: String
    var createdAt: Date

    init(id: String, chatId: String, senderId: String, senderName: String, text: String, createdAt: Date) {
        self.id = id
        self.chatId = chatId
        self.senderId = senderId
        self.senderName = senderName
        self.text = text
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let text = data["text"] as? String else { return nil }
        self.id = id
        self.chatId = data["chatId"] as? String ?? ""
        self.senderId = data["senderId"] as? String ?? ""
        self.senderName = data["senderName"] as? String ?? ""
        self.text = text
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }
}
