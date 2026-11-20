import Foundation

/// A 1:1 direct-message thread between two users.
struct Conversation: Identifiable, Codable, Hashable {
    let id: String
    var participantIds: [String]        // two user ids (sorted for a deterministic id)
    var participantNames: [String: String] // uid -> display name
    var createdAt: Date

    init(id: String, participantIds: [String], participantNames: [String: String], createdAt: Date) {
        self.id = id
        self.participantIds = participantIds
        self.participantNames = participantNames
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let participantIds = data["participantIds"] as? [String] else { return nil }
        self.id = id
        self.participantIds = participantIds
        self.participantNames = data["participantNames"] as? [String: String] ?? [:]
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }

    func otherName(_ myUid: String) -> String {
        participantNames.first(where: { $0.key != myUid })?.value ?? "Conversation"
    }
}

/// A single direct message.
struct DirectMessage: Identifiable, Codable, Hashable {
    let id: String
    var conversationId: String
    var senderId: String
    var senderName: String
    var senderPhotoURL: String
    var text: String
    var createdAt: Date

    init(id: String, conversationId: String, senderId: String, senderName: String, senderPhotoURL: String = "", text: String, createdAt: Date) {
        self.id = id
        self.conversationId = conversationId
        self.senderId = senderId
        self.senderName = senderName
        self.senderPhotoURL = senderPhotoURL
        self.text = text
        self.createdAt = createdAt
    }

    init?(id: String, data: [String: Any]) {
        guard let text = data["text"] as? String else { return nil }
        self.id = id
        self.conversationId = data["conversationId"] as? String ?? ""
        self.senderId = data["senderId"] as? String ?? ""
        self.senderName = data["senderName"] as? String ?? ""
        self.senderPhotoURL = data["senderPhotoURL"] as? String ?? ""
        self.text = text
        self.createdAt = Date(timeIntervalSince1970: (data["createdAt"] as? Double) ?? 0)
    }
}
