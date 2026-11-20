import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Records a video using the device camera (UIImagePickerController).
struct VideoCameraPicker: UIViewControllerRepresentable {
    var onPicked: (URL?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.movie.identifier]
        picker.videoQuality = .typeMedium
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPicked: onPicked) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPicked: (URL?) -> Void
        init(onPicked: @escaping (URL?) -> Void) { self.onPicked = onPicked }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPicked(info[.mediaURL] as? URL)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onPicked(nil)
        }
    }
}
