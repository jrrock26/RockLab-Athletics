import SwiftUI

struct ChatDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let chat: Chat
    let vm: ChatViewModel
    @State private var draft = ""
    @State private var category: CommCategory = .general
    @State private var reportTarget: Message?
    @State private var showReportConfirm = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(vm.messages) { message in
                            MessageBubble(message: message, isMine: message.senderId == auth.user?.id)
                                .contextMenu {
                                    if message.senderId != auth.user?.id {
                                        Button {
                                            reportTarget = message
                                        } label: {
                                            Label("Report message", systemImage: "exclamationmark.bubble")
                                        }
                                        Button(role: .destructive) {
                                            Task { await block(message.senderId) }
                                        } label: {
                                            Label("Block \(message.senderName)", systemImage: "hand.raised")
                                        }
                                    }
                                    if canModerate {
                                        Button(role: .destructive) {
                                            Task { await hide(message) }
                                        } label: {
                                            Label("Hide message", systemImage: "eye.slash")
                                        }
                                    }
                                }
                        }
                    }
                    .padding()
                }
                .onChange(of: vm.messages.count) { _, _ in
                    if let last = vm.messages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }

            if canPost {
                if chat.type == .commBoard {
                    Picker("Category", selection: $category) {
                        ForEach(CommCategory.allCases) { c in
                            Text(c.displayName).tag(c)
                        }
                    }
                    .pickerStyle(.menu)
                    .padding(.horizontal)
                }
                HStack(spacing: 8) {
                    TextField("Message", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        Task {
                            await vm.sendMessage(
                                chatId: chat.id,
                                senderId: auth.user?.id ?? "",
                                senderName: auth.user?.displayName ?? "User",
                                senderPhotoURL: auth.user?.photoURL ?? "",
                                text: draft,
                                category: chat.type == .commBoard ? category.rawValue : CommCategory.general.rawValue
                            )
                            draft = ""
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding()
            }
        }
        .navigationTitle(chat.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            vm.openChat(chatId: chat.id)
        }
        .onDisappear {
            vm.stopListening()
        }
        .confirmationDialog("Report this message?",
                            isPresented: Binding(get: { reportTarget != nil },
                                                 set: { if !$0 { reportTarget = nil } }),
                            titleVisibility: .visible) {
            Button("Harassment or bullying") { sendReport("harassment") }
            Button("Hate speech") { sendReport("hate_speech") }
            Button("Spam or scam") { sendReport("spam") }
            Button("Inappropriate content") { sendReport("inappropriate") }
            Button("Cancel", role: .cancel) { reportTarget = nil }
        } message: {
            Text("Your athletic director and coach will review it.")
        }
    }

    private func sendReport(_ reason: String) {
        guard let message = reportTarget else { return }
        Task { await report(message, reason: reason) }
    }

    private var canPost: Bool {
        vm.access.canPost(chat.type)
    }

    /// AD or the team's coach can hide reported messages.
    private var canModerate: Bool {
        vm.access.canManageTeam
    }

    private func block(_ senderId: String) async {
        guard !senderId.isEmpty else { return }
        try? await FunctionsService.shared.blockUser(targetUid: senderId)
        vm.openChat(chatId: chat.id)
    }

    private func hide(_ message: Message) async {
        try? await FunctionsService.shared.moderateMessage(chatId: chat.id, messageId: message.id, hide: true)
        vm.openChat(chatId: chat.id)
    }

    private func report(_ message: Message, reason: String) async {
        _ = try? await FunctionsService.shared.reportContent(
            teamId: chat.teamId,
            contentType: "message",
            contentId: message.id,
            reason: reason,
            note: message.text,
            reportedUserId: message.senderId)
        reportTarget = nil
    }
}

struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMine {
                Spacer()
            } else {
                AvatarView(urlString: message.senderPhotoURL)
            }

            VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                if !isMine {
                    Text(message.senderName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Text(message.text)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(isMine ? Color.accentColor : Color.gray.opacity(0.15))
                    .foregroundStyle(isMine ? Color.white : Color.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }

            if !isMine {
                Spacer()
            }
        }
    }
}
