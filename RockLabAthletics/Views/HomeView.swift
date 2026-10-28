import SwiftUI

struct HomeView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = HomeViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ZStack {
                        Image("Background")
                            .resizable()
                            .scaledToFill()
                            .frame(height: 200)
                            .clipped()
                            .overlay(Color.white.opacity(0.35))
                        Image("Logo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 100, height: 100)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(spacing: 16) {
                        summaryCard(title: "Teams", value: "\(vm.teamCount)", systemImage: "person.3.fill", tint: .blue)
                        summaryCard(title: "Players", value: "\(vm.playerCount)", systemImage: "person.fill", tint: .green)
                        summaryCard(title: "Upcoming Games", value: "\(vm.upcomingGameCount)", systemImage: "calendar", tint: .orange)
                    }
                    .padding()
                }
            }
            .navigationTitle("RockLab Athletics")
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.load(schoolId: schoolId)
                }
            }
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
                Text(title).font(.headline)
                Text(value).font(.subheadline).foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
    }
}


#Preview {
    HomeView()
}
