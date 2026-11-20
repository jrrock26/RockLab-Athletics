import Foundation

/// An athletic director from another organization (for cross-org scheduling).
struct ADContact: Identifiable {
    let id: String          // userId
    let name: String
    let email: String
    let schoolName: String
    let zipCode: String
    let district: String
    let districtKey: String
}
