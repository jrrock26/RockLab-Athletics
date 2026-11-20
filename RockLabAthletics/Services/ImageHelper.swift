import UIKit

/// Compresses images and converts to/from data and base64.
enum ImageHelper {
    static func compressedData(_ image: UIImage, maxDimension: CGFloat, quality: CGFloat) -> Data? {
        let scale = min(1.0, maxDimension / max(image.size.width, image.size.height))
        let newSize = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        return resized.jpegData(compressionQuality: quality)
    }

    static func compressedBase64(_ image: UIImage, maxDimension: CGFloat, quality: CGFloat) -> String? {
        compressedData(image, maxDimension: maxDimension, quality: quality)?.base64EncodedString()
    }

    static func image(fromBase64 base64: String) -> UIImage? {
        guard !base64.isEmpty, let data = Data(base64Encoded: base64) else { return nil }
        return UIImage(data: data)
    }
}
