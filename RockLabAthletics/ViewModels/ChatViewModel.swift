import Foundation
import Observation
import FirebaseFirestore

/// Drives the communication suite (comm board, team chat, staff chat).
@Observable
final class ChatViewModel {
    var teams: [Team] = []
    var selectedTeamId = ""
    var chats: [Chat] = []
    var messages: [Message] = []
    var errorMessage: String?

    private var listener: ListenerRegistration?

    func loadTeams(schoolId: String) async {
        do {
            teams = try await FirestoreService.shared.fetchTeams(schoolId: schoolId)
            if selectedTeamId.isEmpty, let first = teams.first {
                selectedTeamId = first.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadChats(teamId: String) async {
        selectedTeamId = teamId
        do {
            chats = try await FirestoreService.shared.ensureDefaultChats(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func openChat(chatId: String) {
        stopListening()
        listener = FirestoreService.shared.listenToMessages(chatId: chatId) { [weak self] messages in
            Task { @MainActor in
                self?.messages = messages
            }
        }
    }

    func stopListening() {
        listener?.remove()
        listener = nil
        messages = []
    }

    func sendMessage(chatId: String, senderId: String, senderName: String, text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try await FirestoreService.shared.sendMessage(
                chatId: chatId, senderId: senderId, senderName: senderName, text: trimmed)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
