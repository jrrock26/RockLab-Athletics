import SwiftUI

/// A team's live broadcasts — coaches post an external stream link
/// (Hudl Live, NFHS Network, YouTube…); viewers tap to watch externally.
struct BroadcastsView: View {
    let teamId: String
    @Environment(AuthViewModel.self) private var auth
    @Environment(\.openURL) private var openURL
    @State private var broadcasts: [Broadcast] = []
    @State private var showingCreate = false
    @State private var access = TeamAccess()

    var body: some View {
        List {
            if broadcasts.isEmpty {
                Section {
                    Text("No broadcasts yet.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Broadcasts") {
                    ForEach(broadcasts) { b in
                        Button {
                            if let url = b.watchURL { openURL(url) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(b.title).font(.headline)
                                        if b.isLive {
                                            Text("LIVE")
                                                .font(.caption2.bold())
                                                .foregroundStyle(.white)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(Color.red, in: Capsule())
                                        }
                                    }
                                    if !b.createdByName.isEmpty {
                                        Text("By \(b.createdByName)").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                if b.isLive {
                                    Label("Watch", systemImage: "arrow.up.right.square")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.red)
                                } else {
                                    Image(systemName: "arrow.up.right.square")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .foregroundStyle(.primary)
                        .contextMenu {
                            if access.canManageTeam {
                                Button(b.isLive ? "End broadcast" : "Mark as live") {
                                    Task {
                                        try? await FirestoreService.shared.setBroadcastLive(id: b.id, isLive: !b.isLive)
                                        await load()
                                    }
                                }
                                Button("Delete", role: .destructive) {
                                    Task {
                                        try? await FirestoreService.shared.removeBroadcast(id: b.id)
                                        await load()
                                    }
                                }
                            }
                        }
                    }
                    .onDelete(perform: delete)
                    .deleteDisabled(!access.canManageTeam)
                }
            }
        }
        .navigationTitle("Broadcasts")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if access.canManageTeam {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add broadcast")
                }
            }
        }
        .sheet(isPresented: $showingCreate) {
            CreateBroadcastSheet(teamId: teamId) { Task { await load() } }
        }
        .task {
            await load()
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
    }

    private func load() async {
        let all = (try? await FirestoreService.shared.fetchBroadcasts(teamId: teamId)) ?? []
        broadcasts = all.sorted {
            if $0.isLive != $1.isLive { return $0.isLive }
            return $0.createdAt > $1.createdAt
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            Task { try? await FirestoreService.shared.removeBroadcast(id: broadcasts[index].id) }
        }
        broadcasts.remove(atOffsets: offsets)
    }
}

struct CreateBroadcastSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let onCreated: () -> Void

    @State private var title = ""
    @State private var urlInput = ""
    @State private var games: [Game] = []
    @State private var selectedGameId: String?
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Broadcast") {
                    TextField("Title", text: $title)
                    TextField("Live stream link (Hudl, NFHS, YouTube…)", text: $urlInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }
                if !games.isEmpty {
                    Section("Game (optional)") {
                        Picker("Game", selection: $selectedGameId) {
                            Text("None").tag(String?.none)
                            ForEach(games) { g in
                                Text("\(g.opponent) — \(g.date.formatted(date: .abbreviated, time: .shortened))").tag(Optional(g.id))
                            }
                        }
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Broadcast")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                }
            }
            .task { games = (try? await FirestoreService.shared.fetchGames(teamId: teamId)) ?? [] }
        }
    }

    private func create() async {
        let trimmed = urlInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            errorMessage = "Enter a valid http(s) link to the live stream."
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await FirestoreService.shared.createBroadcast(
                teamId: teamId,
                gameId: selectedGameId,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                url: trimmed,
                createdByName: auth.user?.displayName ?? "Staff")
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
