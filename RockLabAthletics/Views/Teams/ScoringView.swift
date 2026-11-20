import SwiftUI

/// Opens the correct scoring screen for any sport.
///
/// Every team — regardless of sport — has the same features (roster, forms,
/// injuries, eligibility, volunteer, trips, fundraising, messaging, media,
/// broadcasts, games). The only sport-specific difference is how a game is
/// scored on screen: golf is scored hole-by-hole, every other sport uses the
/// standard live scorer. Keeping that choice here means no call site has to
/// special-case a sport, so a newly created team is never missing anything.
struct ScoringView: View {
    let game: Game
    let teamId: String
    let sportId: String
    let vm: StatsViewModel

    var body: some View {
        if sportId == "golf" {
            GolfScoringView(game: game, teamId: teamId, vm: vm)
        } else {
            LiveScoringView(game: game, teamId: teamId, sportId: sportId, vm: vm)
        }
    }
}
