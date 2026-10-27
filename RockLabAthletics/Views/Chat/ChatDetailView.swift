import SwiftUI

struct ChatDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let chat: Chat
    let vm: ChatViewModel
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(vm.messages) { message in
                            MessageBubble(message: message, isMine: message.senderId == auth.user?.id)
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
                HStack(spacing: 8) {
                    TextField("Message", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        Task {
                            await vm.sendMessage(
                                chatId: chat.id,
                                senderId: auth.user?.id ?? "",
                                senderName: auth.user?.displayName ?? "User",
                                text: draft
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
    }

    private var canPost: Bool {
        switch chat.type {
        case .commBoard, .staff:
            let role = auth.user?.role
            return role == .ad || role == .coach || role == .staff
        case .team:
            return true
        }
    }
}

struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
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
        .frame(maxWidth: .infinity, alignment: isMine ? .trailing : .leading)
    }
}
