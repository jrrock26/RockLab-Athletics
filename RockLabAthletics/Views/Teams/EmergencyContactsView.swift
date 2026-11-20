import SwiftUI

/// Emergency contact list — player, parent, and phone.
/// Visible only to AD, coaches, and staff granted the permission.
struct EmergencyContactsView: View {
    let teamId: String
    let sportId: String

    @State private var roster: [RosterEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                Section { ProgressView() }
            } else if roster.isEmpty {
                Section { Text("No players on the roster yet.").foregroundStyle(.secondary) }
            } else {
                ForEach(roster) { entry in
                    Section(entry.playerName) {
                        if entry.parentName.isEmpty && entry.parentPhone.isEmpty {
                            Text("No parent / emergency contact linked yet.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else {
                            LabeledContent("Parent", value: entry.parentName.isEmpty ? "—" : entry.parentName)
                            LabeledContent("Phone", value: entry.parentPhone.isEmpty ? "—" : entry.parentPhone)
                            if !entry.parentPhone.isEmpty, let tel = telURL(entry.parentPhone) {
                                Link(destination: tel) {
                                    Label("Call \(entry.parentName.isEmpty ? "parent" : entry.parentName)", systemImage: "phone.fill")
                                }
                            }
                        }
                    }
                }
            }
            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Emergency Contacts")
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
            roster = try await FirestoreService.shared.fetchRoster(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func telURL(_ phone: String) -> URL? {
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        guard !digits.isEmpty else { return nil }
        return URL(string: "tel://\(digits)")
    }
}
