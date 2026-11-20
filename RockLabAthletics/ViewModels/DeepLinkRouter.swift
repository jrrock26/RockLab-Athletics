import Foundation
import Observation

/// Holds a pending deep link, set when a push notification is tapped.
@Observable
final class DeepLinkRouter {
    static let shared = DeepLinkRouter()
    var pending: DeepLink?
}
