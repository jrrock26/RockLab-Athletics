import SwiftUI

struct LinkParentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let teamId: String
    let entry: RosterEntry

    @State private var parentName = ""
    @State private var parentEmail = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Parent / guardian") {
                    TextField("Name", text: $parentName)
                    TextField("Email", text: $parentEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Link Parent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            do {
                                try await FirestoreService.shared.updateRosterEntryParent(
                                    teamId: teamId, entryId: entry.id,
                                    parentEmail: parentEmail, parentName: parentName)
                                dismiss()
                            } catch {
                                errorMessage = error.localizedDescription
                            }
                        }
                    }
                    .disabled(parentEmail.isEmpty || isWorking)
                }
            }
            .onAppear {
                parentName = entry.parentName
                parentEmail = entry.parentEmail
            }
        }
    }
}
