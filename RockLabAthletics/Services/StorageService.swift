import Foundation
import FirebaseStorage

/// Uploads media to Firebase Storage and returns public download URLs.
struct StorageService {
    static let shared = StorageService()
    private let storage = Storage.storage()

    func uploadImage(_ data: Data, path: String) async throws -> String {
        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"
        let ref = storage.reference().child(path)
        _ = try await ref.putDataAsync(data, metadata: metadata)
        return try await ref.downloadURL().absoluteString
    }

    func uploadData(_ data: Data, path: String, contentType: String) async throws -> String {
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        let ref = storage.reference().child(path)
        _ = try await ref.putDataAsync(data, metadata: metadata)
        return try await ref.downloadURL().absoluteString
    }

    /// Uploads a file, optionally reporting progress as a 0…1 fraction.
    ///
    /// Progress is not cosmetic here: game film can be several gigabytes, and an
    /// upload with no feedback looks like a frozen app, so people kill it halfway.
    func uploadFile(from url: URL,
                    path: String,
                    contentType: String,
                    onProgress: ((Double) -> Void)? = nil) async throws -> String {
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        let ref = storage.reference().child(path)
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        _ = try await ref.putFileAsync(from: url, metadata: metadata) { progress in
            guard let progress, progress.totalUnitCount > 0 else { return }
            onProgress?(Double(progress.completedUnitCount) / Double(progress.totalUnitCount))
        }
        return try await ref.downloadURL().absoluteString
    }

    func delete(path: String) async throws {
        try await storage.reference().child(path).delete()
    }
}
