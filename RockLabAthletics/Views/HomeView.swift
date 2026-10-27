import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ZStack {
                // Background image with a soft white "watermark" overlay
                Image("Background")
                    .resizable()
                    .scaledToFill()
                    .ignoresSafeArea()
                    .overlay(Color.white.opacity(0.65))

                ScrollView {
                    VStack(spacing: 24) {
                        // Brand logo
                        Image("Logo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 140, height: 140)
                            .clipShape(RoundedRectangle(cornerRadius: 24))
                            .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                            .padding(.top, 8)

                        VStack(spacing: 16) {
                            summaryCard(title: "Teams", value: "0", systemImage: "person.3.fill", tint: .blue)
                            summaryCard(title: "Players", value: "0", systemImage: "person.fill", tint: .green)
                            summaryCard(title: "Upcoming Games", value: "0", systemImage: "calendar", tint: .orange)
                        }
                    }
                    .padding()
                }
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
        .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
    }
}

#Preview {
    HomeView()
}
