import SwiftUI

struct SelectSportsView: View {
    @Bindable var vm: OnboardingViewModel
    let onNext: () -> Void

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 12)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(SportsCatalog.all) { sport in
                    let isSelected = vm.selectedSportIds.contains(sport.id)
                    Button {
                        vm.toggleSport(sport.id)
                    } label: {
                        VStack(spacing: 6) {
                            Text(sport.emoji).font(.largeTitle)
                            Text(sport.name)
                                .font(.caption)
                                .fontWeight(isSelected ? .bold : .regular)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity, minHeight: 84)
                        .padding(8)
                        .background(isSelected ? Color.accentColor.opacity(0.15) : Color.gray.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(isSelected ? Color.accentColor : Color.gray.opacity(0.3),
                                        lineWidth: isSelected ? 2 : 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                Text("\(vm.selectedSports.count) sport(s) selected")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Continue", action: onNext)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(vm.selectedSports.isEmpty)
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial)
        }
    }
}
