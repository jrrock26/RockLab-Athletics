import SwiftUI

/// A directory of athletic directors across all organizations, with DM.
/// Supports filtering by district (defaults to the logged-in AD's district),
/// zip code, and school name search.
struct ADDirectoryView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = MessagesViewModel()
    @State private var contacts: [ADContact] = []
    @State private var searchText = ""
    @State private var selected: Conversation?
    @State private var filter: DirectoryFilter = .sameDistrict

    enum DirectoryFilter: String, CaseIterable, Identifiable {
        case sameDistrict = "Same District"
        case all = "All Districts"
        case zipCode = "Zip Code"
        case schoolName = "School Name"

        var id: String { rawValue }
    }

    @State private var customZipCode = ""

    var body: some View {
        List(filtered) { contact in
            Button {
                Task {
                    if let conv = await vm.startConversation(
                        myUid: auth.user?.id ?? "", myName: auth.user?.displayName ?? "Me",
                        otherUid: contact.id, otherName: contact.name) {
                        selected = conv
                    }
                }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(contact.name).font(.headline)
                        Text("\(contact.schoolName.isEmpty ? contact.email : "\(contact.schoolName) · \(contact.district.isEmpty ? contact.zipCode : contact.district)")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "envelope")
                        .foregroundStyle(.tint)
                }
            }
            .foregroundStyle(.primary)
        }
        .navigationTitle("AD Directory")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Name or school")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Picker("Filter", selection: $filter) {
                    ForEach(DirectoryFilter.allCases) { f in
                        Text(f.rawValue).tag(f)
                    }
                }
                .pickerStyle(.menu)
            }
            if filter == .zipCode {
                ToolbarItem(placement: .bottomBar) {
                    TextField("Zip code", text: $customZipCode)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 120)
                }
            }
        }
        .navigationDestination(item: $selected) { conv in
            MessageDetailView(conversation: conv, vm: vm)
        }
        .task { await load() }
    }

    private var filtered: [ADContact] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let myDistrictKey = auth.school?.districtKey ?? ""

        return contacts.filter { contact in
            // District filter
            switch filter {
            case .sameDistrict:
                guard !myDistrictKey.isEmpty, contact.districtKey == myDistrictKey else { return false }
            case .zipCode:
                let z = customZipCode.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !z.isEmpty, contact.zipCode.lowercased().contains(z.lowercased()) else { return false }
            case .schoolName:
                guard !q.isEmpty, contact.schoolName.lowercased().contains(q) else { return false }
            case .all:
                break
            }

            // Search text (applies to name/school when not already using schoolName filter)
            if !q.isEmpty, filter != .schoolName {
                guard contact.name.lowercased().contains(q) || contact.schoolName.lowercased().contains(q) else { return false }
            }

            return true
        }
        .sorted { $0.schoolName < $1.schoolName }
    }

    private func load() async {
        contacts = (try? await FirestoreService.shared.fetchADDirectory()) ?? []
    }
}
