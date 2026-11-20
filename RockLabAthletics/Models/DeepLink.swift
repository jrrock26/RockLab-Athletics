import Foundation

/// A route triggered by tapping a push notification.
struct DeepLink: Identifiable, Equatable {
    enum Target: Equatable {
        case liveGame(teamId: String, gameId: String, sportId: String, opponent: String, teamScore: Int, opponentScore: Int, isHome: Bool)
        case liveBroadcast(url: String)
    }

    let id = UUID()
    let target: Target

    /// Parses a FCM `data` payload (string key/values) from the notification.
    static func parse(userInfo: [AnyHashable: Any]) -> DeepLink? {
        guard let type = userInfo["type"] as? String else { return nil }
        switch type {
        case "liveGame":
            guard let teamId = userInfo["teamId"] as? String,
                  let gameId = userInfo["gameId"] as? String else { return nil }
            let sportId = userInfo["sportId"] as? String ?? ""
            let opponent = userInfo["opponent"] as? String ?? "Opponent"
            let teamScore = Int(userInfo["teamScore"] as? String ?? "0") ?? 0
            let opponentScore = Int(userInfo["opponentScore"] as? String ?? "0") ?? 0
            let isHome = (userInfo["isHome"] as? String) == "true"
            return DeepLink(target: .liveGame(
                teamId: teamId, gameId: gameId, sportId: sportId, opponent: opponent,
                teamScore: teamScore, opponentScore: opponentScore, isHome: isHome))
        case "liveBroadcast":
            guard let url = userInfo["url"] as? String, !url.isEmpty else { return nil }
            return DeepLink(target: .liveBroadcast(url: url))
        default:
            return nil
        }
    }
}
