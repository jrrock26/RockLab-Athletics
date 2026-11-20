import SwiftUI

/// Team followers (role: follower) — kept separate from the managed members list.
struct FollowersView: View {
    let teamId: String
    let sportId: String

    @State private var followers: [TeamMembership] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                Section { ProgressView() }
            } else if followers.isEmpty {
                Section { Text("No followers yet.").foregroundStyle(.secondary) }
            } else {
                Section("Followers (\(followers.count))") {
                    ForEach(followers) { follower in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(follower.name.isEmpty ? follower.email : follower.name)
                                .font(.headline)
                            if !follower.email.isEmpty {
                                Text(follower.email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Followers")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let all = try await FirestoreService.shared.fetchMemberships(teamId: teamId)
            followers = all
                .filter { $0.role == .follower }
                .sorted { ($0.name.isEmpty ? $0.email : $0.name) < ($1.name.isEmpty ? $1.email : $1.name) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
