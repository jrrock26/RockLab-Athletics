import SwiftUI

/// Lets a user without a school follow a school. Search by zip code or
/// school name; results filter live as you type.
struct DiscoverSchoolsView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var query = ""
    @State private var allSchools: [School] = []
    @State private var isFollowing = false
    @State private var errorMessage: String?
    @State private var showingCreate = false
    @State private var showingCoachSetup = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Follow your school to see teams, schedules, and messages. Search by zip code or school name.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Section {
                        Label("Search for a school to get started", systemImage: "magnifyingglass")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Results") {
                        if filteredSchools.isEmpty {
                            Text("No schools match your search.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(filteredSchools) { school in
                                schoolRow(school)
                            }
                        }
                    }
                }

                if auth.user?.role == .ad {
                    Section {
                        Button("Create your school") { showingCreate = true }
                    } footer: {
                        Text("Only athletic directors should create a school.")
                    }
                }

                if auth.user?.role == .coach, auth.user?.schoolId == nil {
                    Section {
                        Button {
                            showingCoachSetup = true
                        } label: {
                            Label("Start your team", systemImage: "person.badge.plus")
                        }
                    } footer: {
                        Text("Can't find your school? Start your team anyway — we'll create your school and your athletic director can claim it later.")
                            .font(.caption)
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Find Your School")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Zip code or school name")
            .fullScreenCover(isPresented: $showingCreate) {
                OnboardingFlowView()
            }
            .sheet(isPresented: $showingCoachSetup) {
                CoachTeamSetupView {
                    Task { await load() }
                }
            }
            .task { await load() }
        }
    }

    /// Live-filtered schools as the user types.
    private var filteredSchools: [School] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return allSchools.filter {
            $0.name.lowercased().contains(q) ||
            $0.zipCode.lowercased().contains(q) ||
            $0.district.lowercased().contains(q)
        }
        .sorted { $0.name < $1.name }
    }

    private func schoolRow(_ school: School) -> some View {
        Button {
            Task { await follow(school) }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(school.name).font(.headline)
                    if !school.mascot.isEmpty {
                        Text(school.mascot).font(.caption).foregroundStyle(.secondary)
                    }
                    Text("\(school.zipCode) · \(school.district)").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if isFollowing {
                    ProgressView()
                } else {
                    Image(systemName: "plus.circle")
                        .foregroundStyle(.tint)
                }
            }
        }
        .foregroundStyle(.primary)
    }

    private func load() async {
        do {
            allSchools = try await FirestoreService.shared.fetchSchools()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func follow(_ school: School) async {
        isFollowing = true
        defer { isFollowing = false }
        guard let uid = auth.user?.id else { return }
        do {
            try await FirestoreService.shared.followSchool(userId: uid, schoolId: school.id)
            await auth.refreshUser()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
