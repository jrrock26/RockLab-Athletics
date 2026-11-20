import Foundation
import Observation
import FirebaseFirestore

/// Drives direct messages (1:1 conversations).
@Observable
final class MessagesViewModel {
    var conversations: [Conversation] = []
    var messages: [DirectMessage] = []
    var errorMessage: String?

    private var listener: ListenerRegistration?

    func loadConversations(userId: String) async {
        do {
            conversations = try await FirestoreService.shared.fetchMyConversations(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func startConversation(myUid: String, myName: String, otherUid: String, otherName: String) async -> Conversation? {
        do {
            let conv = try await FirestoreService.shared.fetchOrCreateConversation(
                myUid: myUid, myName: myName, otherUid: otherUid, otherName: otherName)
            if !conversations.contains(where: { $0.id == conv.id }) {
                conversations.append(conv)
            }
            return conv
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func openConversation(_ conv: Conversation) {
        stopListening()
        listener = FirestoreService.shared.listenToDirectMessages(conversationId: conv.id) { [weak self] messages in
            Task { @MainActor in self?.messages = messages }
        }
    }

    func stopListening() {
        listener?.remove()
        listener = nil
        messages = []
    }

    func sendMessage(conversationId: String, senderId: String, senderName: String, senderPhotoURL: String = "", text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try await FirestoreService.shared.sendDirectMessage(
                conversationId: conversationId, senderId: senderId, senderName: senderName, senderPhotoURL: senderPhotoURL, text: trimmed)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
