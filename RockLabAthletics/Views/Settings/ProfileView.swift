import SwiftUI
import PhotosUI

/// The signed-in user's personal profile.
struct ProfileView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var teams: [Team] = []
    @State private var linkedNames: [String] = []
    @State private var showingEditName = false
    @State private var showingEditPhone = false
    @State private var showingEditLogo = false
    @State private var showingEditPhoto = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    if let urlString = auth.user?.photoURL, !urlString.isEmpty, let url = URL(string: urlString) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.accentColor.opacity(0.3)
                        }
                        .frame(width: 60, height: 60)
                        .clipShape(Circle())
                    } else {
                        Text(initials)
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                            .frame(width: 60, height: 60)
                            .background(Color.accentColor, in: Circle())
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(displayName).font(.title3.bold())
                        Text(auth.user?.email ?? "")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(auth.user?.role.displayName ?? "")
                            .font(.caption.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.accentColor.opacity(0.15), in: Capsule())
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                Button { showingEditPhoto = true } label: {
                    Label("Change profile photo", systemImage: "photo")
                }
            }

            Section("My Teams") {
                if teams.isEmpty {
                    Text("You're not on a team yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(teams) { team in
                        NavigationLink { TeamDetailView(team: team) } label: {
                            Text("\(team.sportName) \(team.level)").font(.headline)
                        }
                    }
                }
            }

            if auth.user?.role == .parent, !linkedNames.isEmpty {
                Section("Linked players") {
                    ForEach(linkedNames, id: \.self) { name in
                        Text(name)
                    }
                }
            }

            if auth.user?.role == .ad, auth.school != nil {
                Section("School") {
                    Button { showingEditLogo = true } label: {
                        Label("School logo", systemImage: "photo")
                    }
                }
            }

            Section {
                Button("Edit name") { showingEditName = true }
            }

            Section("Emergency contact") {
                LabeledContent("Phone", value: (auth.user?.phone.isEmpty == false) ? (auth.user?.phone ?? "") : "Not set")
                Button("Edit phone number") { showingEditPhone = true }
            }
        }
        .navigationTitle("My Profile")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingEditName) {
            EditNameSheet()
        }
        .sheet(isPresented: $showingEditPhone) {
            EditPhoneSheet()
        }
        .sheet(isPresented: $showingEditPhoto) {
            EditPhotoSheet()
        }
        .sheet(isPresented: $showingEditLogo) {
            EditSchoolLogoSheet()
        }
        .task { await load() }
    }

    private var displayName: String {
        let n = auth.user?.displayName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return n.isEmpty ? "Unnamed" : n
    }

    private var initials: String {
        let parts = displayName.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters)
    }

    private func load() async {
        guard let schoolId = auth.user?.schoolId else { return }
        let all = (try? await FirestoreService.shared.fetchTeams(schoolId: schoolId)) ?? []
        let ids = auth.user?.teamIds ?? []
        teams = all.filter { ids.contains($0.id) }

        if auth.user?.role == .parent {
            var names: [String] = []
            for id in auth.user?.linkedPlayerIds ?? [] {
                if let u = try? await FirestoreService.shared.fetchUser(id: id) {
                    names.append(u.displayName.isEmpty ? u.email : u.displayName)
                }
            }
            linkedNames = names
        }
    }
}

struct EditNameSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    @State private var name = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Display name", text: $name)
            }
            .navigationTitle("Edit Name")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                }
            }
            .onAppear { name = auth.user?.displayName ?? "" }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        guard let uid = auth.user?.id else { return }
        do {
            try await FirestoreService.shared.updateDisplayName(
                userId: uid, name: name.trimmingCharacters(in: .whitespacesAndNewlines))
            await auth.refreshUser()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Lets an AD upload or change the school logo after onboarding.
struct EditSchoolLogoSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    @State private var item: PhotosPickerItem?
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let urlString = auth.school?.logoURL, !urlString.isEmpty, let url = URL(string: urlString) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Color.gray.opacity(0.2)
                        }
                        .frame(height: 160)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Label("No logo yet", systemImage: "photo")
                            .foregroundStyle(.secondary)
                    }

                    PhotosPicker(selection: $item, matching: .images) {
                        Label(isWorking ? "Uploading…" : "Choose logo", systemImage: "photo.badge.plus")
                    }
                    .disabled(isWorking)
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("School Logo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .onChange(of: item) { _, newItem in
                Task { await upload(newItem) }
            }
        }
    }

    private func upload(_ newItem: PhotosPickerItem?) async {
        guard let newItem, let schoolId = auth.school?.id else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            guard let data = try? await newItem.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let compressed = ImageHelper.compressedData(image, maxDimension: 512, quality: 0.7) else {
                errorMessage = "Could not load that image."
                return
            }
            let url = try await StorageService.shared.uploadImage(compressed, path: "schools/\(schoolId)/logo.jpg")
            try await FirestoreService.shared.updateSchoolLogo(schoolId: schoolId, logoURL: url)
            await auth.loadSchool()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Lets any signed-in user upload/change their own personal profile photo.
struct EditPhotoSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    @State private var item: PhotosPickerItem?
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let urlString = auth.user?.photoURL, !urlString.isEmpty, let url = URL(string: urlString) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.accentColor.opacity(0.3)
                        }
                        .frame(width: 120, height: 120)
                        .clipShape(Circle())
                        .frame(maxWidth: .infinity)
                    } else {
                        Label("No photo yet", systemImage: "person.crop.circle")
                            .foregroundStyle(.secondary)
                    }

                    PhotosPicker(selection: $item, matching: .images) {
                        Label(isWorking ? "Uploading…" : "Choose photo", systemImage: "photo.badge.plus")
                    }
                    .disabled(isWorking)
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Profile Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .onChange(of: item) { _, newItem in
                Task { await upload(newItem) }
            }
        }
    }

    private func upload(_ newItem: PhotosPickerItem?) async {
        guard let newItem, let userId = auth.user?.id else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            guard let data = try? await newItem.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let compressed = ImageHelper.compressedData(image, maxDimension: 512, quality: 0.7) else {
                errorMessage = "Could not load that image."
                return
            }
            let url = try await StorageService.shared.uploadImage(compressed, path: "users/\(userId)/photo.jpg")
            try await FirestoreService.shared.updateUserPhoto(userId: userId, photoURL: url)
            await auth.refreshUser()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Lets a signed-in user set/update their phone number (used for emergency contacts).
struct EditPhoneSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    @State private var phone = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Phone number") {
                    TextField("Phone number", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Phone Number")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isWorking)
                }
            }
            .onAppear { phone = auth.user?.phone ?? "" }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        guard let uid = auth.user?.id else { return }
        do {
            try await FirestoreService.shared.updateUserPhone(
                userId: uid, phone: phone.trimmingCharacters(in: .whitespacesAndNewlines))
            await auth.refreshUser()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

