import SwiftUI

struct EditShowcaseSheet: View {
    @Environment(\.dismiss) private var dismiss
    let vm: ShowcaseViewModel
    let entry: RosterEntry

    @State private var position = ""
    @State private var height = ""
    @State private var weight = ""
    @State private var graduationYear = ""
    @State private var gpa = ""
    @State private var bio = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Athlete info") {
                    TextField("Position", text: $position)
                    TextField("Height", text: $height)
                    TextField("Weight", text: $weight)
                    TextField("Graduation year", text: $graduationYear)
                    TextField("GPA", text: $gpa)
                }
                Section("Bio") {
                    TextEditor(text: $bio)
                        .frame(minHeight: 120)
                }
            }
            .navigationTitle("Edit Showcase")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await vm.updateShowcase(position: position, height: height, weight: weight,
                                                    graduationYear: graduationYear, gpa: gpa, bio: bio)
                            dismiss()
                        }
                    }
                }
            }
            .onAppear {
                if let s = vm.showcase {
                    position = s.position
                    height = s.height
                    weight = s.weight
                    graduationYear = s.graduationYear
                    gpa = s.gpa
                    bio = s.bio
                }
            }
        }
    }
}

struct AddHighlightSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: ShowcaseViewModel
    let showcaseId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Highlight") {
                    TextField("Title", text: $vm.newHighlightTitle)
                    TextField("Video URL", text: $vm.newHighlightURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    TextField("Description", text: $vm.newHighlightDescription)
                }
            }
            .navigationTitle("Add Highlight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addHighlight(showcaseId: showcaseId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newHighlightTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
