import SwiftUI
import PhotosUI

/// A compact auto-advancing slideshow of a team's photos.
struct TeamMediaStrip: View {
    let media: [TeamMedia]
    @State private var index = 0
    private let timer = Timer.publish(every: 3, on: .main, in: .common).autoconnect()

    var body: some View {
        if !media.isEmpty {
            TabView(selection: $index) {
                ForEach(Array(media.enumerated()), id: \.element.id) { i, item in
                    if let url = URL(string: item.imageURL) {
                        AsyncImage(url: url) { image in
                            image
                                .resizable()
                                .scaledToFill()
                        } placeholder: {
                            Color.gray.opacity(0.2)
                        }
                        .frame(height: 160)
                        .clipped()
                        .overlay(alignment: .bottomLeading) {
                            if !item.caption.isEmpty {
                                Text(item.caption)
                                    .font(.caption)
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                                    .padding(8)
                            }
                        }
                        .tag(i)
                    }
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .automatic))
            .frame(height: 160)
            .onReceive(timer) { _ in
                guard !media.isEmpty else { return }
                withAnimation { index = (index + 1) % media.count }
            }
        }
    }
}

struct AddMediaSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let onAdded: () -> Void

    @State private var item: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var caption = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Photo") {
                    PhotosPicker(selection: $item, matching: .images) {
                        if let data = imageData, let img = UIImage(data: data) {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 200)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        } else {
                            Label("Choose photo", systemImage: "photo")
                        }
                    }
                    .onChange(of: item) { _, newItem in
                        Task {
                            if let data = try? await newItem?.loadTransferable(type: Data.self),
                               let image = UIImage(data: data) {
                                imageData = ImageHelper.compressedData(image, maxDimension: 1024, quality: 0.6)
                            }
                        }
                    }
                    TextField("Caption (optional)", text: $caption)
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Add Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await add() } }
                        .disabled(imageData == nil || isWorking)
                }
            }
        }
    }

    private func add() async {
        guard let imageData else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let path = "teams/\(teamId)/media/\(UUID().uuidString).jpg"
            let url = try await StorageService.shared.uploadImage(imageData, path: path)
            try await FirestoreService.shared.addTeamMedia(
                teamId: teamId, imageURL: url, caption: caption,
                addedByName: auth.user?.displayName ?? "Staff")
            onAdded()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
