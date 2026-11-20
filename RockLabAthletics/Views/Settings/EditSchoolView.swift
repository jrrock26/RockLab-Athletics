import SwiftUI
import PhotosUI

/// Lets an AD edit their school's profile (name, mascot, zip, district, logo).
struct EditSchoolView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    @State private var name = ""
    @State private var mascot = ""
    @State private var zipCode = ""
    @State private var district = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var showingLogoPicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section("School profile") {
                    TextField("School name", text: $name)
                    TextField("Mascot (optional)", text: $mascot)
                    TextField("Zip code", text: $zipCode)
                        .keyboardType(.numberPad)
                    TextField("District / Association", text: $district)
                }

                Section("School logo") {
                    if let urlString = auth.school?.logoURL, !urlString.isEmpty, let url = URL(string: urlString) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Color.gray.opacity(0.2)
                        }
                        .frame(height: 120)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    Button {
                        showingLogoPicker = true
                    } label: {
                        Label("Upload logo", systemImage: "photo.badge.plus")
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Edit School")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                }
            }
            .onAppear {
                name = auth.school?.name ?? ""
                mascot = auth.school?.mascot ?? ""
                zipCode = auth.school?.zipCode ?? ""
                district = auth.school?.district ?? ""
            }
            .sheet(isPresented: $showingLogoPicker) {
                EditSchoolLogoSheet()
            }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        guard let schoolId = auth.school?.id else { return }
        do {
            try await FirestoreService.shared.updateSchool(
                schoolId: schoolId,
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                mascot: mascot.trimmingCharacters(in: .whitespacesAndNewlines),
                zipCode: zipCode.trimmingCharacters(in: .whitespacesAndNewlines),
                district: district.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            await auth.loadSchool()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func setLogo(_ url: String) async {
        guard let schoolId = auth.school?.id else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await FirestoreService.shared.updateSchoolLogo(schoolId: schoolId, logoURL: url)
            await auth.loadSchool()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
