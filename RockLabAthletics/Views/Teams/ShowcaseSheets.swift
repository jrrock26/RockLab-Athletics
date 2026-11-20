import SwiftUI
import AVKit
import PhotosUI

struct EditShowcaseSheet: View {
    @Environment(\.dismiss) private var dismiss
    let vm: ShowcaseViewModel
    let entry: RosterEntry

    @State private var height = ""
    @State private var weight = ""
    @State private var graduationYear = ""
    @State private var gpa = ""
    @State private var bio = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Jersey", value: entry.jerseyNumber.isEmpty ? "—" : "#\(entry.jerseyNumber)")
                    LabeledContent("Position", value: entry.position.isEmpty ? "—" : entry.position)
                    TextField("Height", text: $height)
                    TextField("Weight", text: $weight)
                    TextField("Graduation year", text: $graduationYear)
                    TextField("GPA", text: $gpa)
                } header: {
                    Text("Athlete info")
                } footer: {
                    Text("Jersey number and position are managed by your coach and can't be changed here.")
                        .font(.caption)
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
                            await vm.updateShowcase(height: height, weight: weight,
                                                    graduationYear: graduationYear, gpa: gpa, bio: bio)
                            dismiss()
                        }
                    }
                }
            }
            .onAppear {
                if let s = vm.showcase {
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
