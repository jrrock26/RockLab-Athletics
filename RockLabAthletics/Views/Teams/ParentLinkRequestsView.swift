import SwiftUI

/// AD/coach flow: approve or reject pending parent-link requests for a team.
struct ParentLinkRequestsView: View {
    let teamId: String

    @State private var requests: [[String: Any]] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                Section { ProgressView() }
            } else if requests.isEmpty {
                Section { Text("No pending parent-link requests.").foregroundStyle(.secondary) }
            } else {
                Section("Pending requests") {
                    ForEach(Array(requests.enumerated()), id: \.offset) { _, req in
                        requestRow(req)
                    }
                }
            }
            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Parent Link Requests")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func requestRow(_ req: [String: Any]) -> some View {
        let requestId = req["id"] as? String ?? ""
        let parentName = req["parentName"] as? String ?? "Parent"
        let playerName = req["playerName"] as? String ?? "Player"
        VStack(alignment: .leading, spacing: 6) {
            Text("\(parentName) → \(playerName)").font(.headline)
            HStack {
                Button("Approve") { Task { await approve(requestId) } }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                Button("Reject", role: .destructive) { Task { await reject(requestId) } }
                    .buttonStyle(.bordered)
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            requests = try await FunctionsService.shared.listParentLinkRequests(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func approve(_ id: String) async {
        do {
            _ = try await FunctionsService.shared.approveParentLink(requestId: id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reject(_ id: String) async {
        do {
            _ = try await FunctionsService.shared.rejectParentLink(requestId: id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
