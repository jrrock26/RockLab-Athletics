import SwiftUI

/// A position entry field: a Picker of the sport's positions, or a free-text
/// field when the sport has no defined positions.
struct PositionField: View {
    let positions: [String]
    @Binding var selection: String

    var body: some View {
        if positions.isEmpty {
            TextField("Position", text: $selection)
        } else {
            Picker("Position", selection: $selection) {
                Text("—").tag("")
                ForEach(positions, id: \.self) { position in
                    Text(position).tag(position)
                }
            }
        }
    }
}
