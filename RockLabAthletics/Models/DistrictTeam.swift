import Foundation

/// Another organization's team in the same district.
struct DistrictTeam: Identifiable {
    let id: String
    let teamName: String
    let schoolName: String
    let schoolId: String
}

extension Array {
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0 else { return [self] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}
