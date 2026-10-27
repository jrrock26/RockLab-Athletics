import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    summaryCard(title: "Teams", value: "0", systemImage: "person.3.fill", tint: .blue)
                    summaryCard(title: "Players", value: "0", systemImage: "person.fill", tint: .green)
                    summaryCard(title: "Upcoming Games", value: "0", systemImage: "calendar", tint: .orange)
                }
                .padding()
            }
            .navigationTitle("RockLab Athletics")
        }
    }

    private func summaryCard(title: String, value: String, systemImage: String, tint: Color) -> some View {
        HStack {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                Text(value)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
    }
}

#Preview {
    HomeView()
}
