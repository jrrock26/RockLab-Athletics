import SwiftUI

/// Direct messages (1:1 conversations).
struct MessagesView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let sportId: String
    let schoolId: String
    @State private var vm = MessagesViewModel()
    @State private var showingNew = false
    @State private var selectedConversation: Conversation?

    var body: some View {
        List {
            if vm.conversations.isEmpty {
                Section {
                    Text("No messages yet. Tap + to message a coach, AD, player, or parent.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Direct messages") {
                    ForEach(vm.conversations) { conv in
                        Button {
                            selectedConversation = conv
                        } label: {
                            Label(conv.otherName(auth.user?.id ?? ""), systemImage: "person.crop.circle")
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
        }
        .navigationTitle("Messages")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingNew = true } label: { Image(systemName: "square.and.pencil") }
                .accessibilityLabel("New message")
            }
        }
        .sheet(isPresented: $showingNew) {
            RecipientPickerSheet(teamId: teamId, schoolId: schoolId) { uid, name in
                Task {
                    if let conv = await vm.startConversation(
                        myUid: auth.user?.id ?? "", myName: auth.user?.displayName ?? "Me",
                        otherUid: uid, otherName: name) {
                        selectedConversation = conv
                    }
                }
            }
        }
        .navigationDestination(item: $selectedConversation) { conv in
            MessageDetailView(conversation: conv, vm: vm)
        }
        .task { await vm.loadConversations(userId: auth.user?.id ?? "") }
    }
}

struct RecipientPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let schoolId: String
    let onSelect: (String, String) -> Void

    @State private var recipients: [Recipient] = []
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List(recipients) { r in
                Button {
                    onSelect(r.id, r.name)
                    dismiss()
                } label: {
                    HStack {
                        Text(r.name).font(.headline)
                        Spacer()
                        Text(r.subtitle).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .foregroundStyle(.primary)
            }
            .overlay {
                if recipients.isEmpty && errorMessage == nil {
                    ProgressView()
                }
            }
            .navigationTitle("New Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            var list: [Recipient] = []
            let members = try await FirestoreService.shared.fetchMemberships(teamId: teamId)
            for m in members where m.userId != auth.user?.id {
                list.append(Recipient(id: m.userId, name: m.name.isEmpty ? m.email : m.name, subtitle: m.role.displayName))
            }
            let schoolUsers = try await FirestoreService.shared.fetchSchoolUsers(schoolId: schoolId)
            for u in schoolUsers where u.role == .ad && u.id != auth.user?.id {
                if !list.contains(where: { $0.id == u.id }) {
                    list.append(Recipient(id: u.id, name: u.displayName.isEmpty ? u.email : u.displayName, subtitle: "Athletic Director"))
                }
            }
            recipients = list.sorted { $0.name < $1.name }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct Recipient: Identifiable {
    let id: String
    let name: String
    let subtitle: String
}

struct MessageDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let conversation: Conversation
    let vm: MessagesViewModel
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(vm.messages) { message in
                            DirectMessageBubble(message: message, isMine: message.senderId == auth.user?.id)
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

            HStack(spacing: 8) {
                TextField("Message", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task {
                        await vm.sendMessage(
                            conversationId: conversation.id,
                            senderId: auth.user?.id ?? "",
                            senderName: auth.user?.displayName ?? "User",
                            senderPhotoURL: auth.user?.photoURL ?? "",
                            text: draft)
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
        .navigationTitle(conversation.otherName(auth.user?.id ?? ""))
        .navigationBarTitleDisplayMode(.inline)
        .task { vm.openConversation(conversation) }
        .onDisappear { vm.stopListening() }
    }
}

struct DirectMessageBubble: View {
    let message: DirectMessage
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

