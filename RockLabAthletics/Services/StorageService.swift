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

    func uploadFile(from url: URL, path: String, contentType: String) async throws -> String {
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        let ref = storage.reference().child(path)
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        _ = try await ref.putFileAsync(from: url, metadata: metadata)
        return try await ref.downloadURL().absoluteString
    }

    func delete(path: String) async throws {
        try await storage.reference().child(path).delete()
    }
}
