import Foundation
import Observation
import FirebaseFirestore

/// Drives the communication suite (comm board, team chat, staff chat).
@Observable
final class ChatViewModel {
    var teams: [Team] = []
    var selectedTeamId = ""
    var chats: [Chat] = []
    var access = TeamAccess()
    var messages: [Message] = []
    var errorMessage: String?

    private var listener: ListenerRegistration?

    /// Channels the current user is allowed to see for the selected team.
    var visibleChats: [Chat] { chats.filter { access.canSee($0.type) } }

    func loadTeams(schoolId: String, userTeamIds: [String]? = nil) async {
        do {
            var all = try await FirestoreService.shared.fetchTeams(schoolId: schoolId)
            if let ids = userTeamIds {
                all = all.filter { ids.contains($0.id) }
            }
            teams = all
            if selectedTeamId.isEmpty, let first = teams.first {
                selectedTeamId = first.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadChats(teamId: String, access: TeamAccess) async {
        selectedTeamId = teamId
        self.access = access
        do {
            if access.canManageTeam {
                chats = try await FirestoreService.shared.ensureDefaultChats(teamId: teamId)
            } else {
                let types = ChatType.allCases.filter { access.canSee($0) }
                chats = try await FirestoreService.shared.fetchChats(teamId: teamId, types: types)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func openChat(chatId: String) {
        stopListening()
        let chat = chats.first { $0.id == chatId }
        let categories: [String]? = (chat?.type == .commBoard && access.isFollower) ? CommCategory.followerVisible : nil
        listener = FirestoreService.shared.listenToMessages(chatId: chatId, categories: categories) { [weak self] messages in
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

    func sendMessage(chatId: String, senderId: String, senderName: String, senderPhotoURL: String = "", text: String, category: String = CommCategory.general.rawValue) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try await FirestoreService.shared.sendMessage(
                chatId: chatId, senderId: senderId, senderName: senderName, senderPhotoURL: senderPhotoURL, text: trimmed, category: category)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
