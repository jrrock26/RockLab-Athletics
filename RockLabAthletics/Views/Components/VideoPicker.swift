import SwiftUI
import UIKit

/// Picks or records a video and hands back a local file URL.
struct VideoPicker: UIViewControllerRepresentable {
    enum Source { case camera, library }

    let source: Source
    @Binding var isPresented: Bool
    let onPicked: (URL) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        picker.mediaTypes = ["public.movie"]
        picker.videoQuality = .typeHigh
        if source == .camera, UIImagePickerController.isSourceTypeAvailable(.camera) {
            picker.sourceType = .camera
            picker.cameraCaptureMode = .video
        } else {
            picker.sourceType = .photoLibrary
        }
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: VideoPicker

        init(_ parent: VideoPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let url = info[.mediaURL] as? URL {
                // Copy into our temp directory so the file survives the picker.
                let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString + "." + ext)
                try? FileManager.default.removeItem(at: dest)
                if (try? FileManager.default.copyItem(at: url, to: dest)) != nil {
                    parent.onPicked(dest)
                }
            }
            parent.isPresented = false
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.isPresented = false
        }
    }
}
