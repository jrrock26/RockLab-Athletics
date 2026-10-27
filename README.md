# RockLab Athletics

A high-school sports team management app built with SwiftUI.

## Status

Early scaffold — the project structure and placeholder UI are in place.
Feature work (rosters, schedules, attendance, stats, messaging) and Firebase
backend integration come next.

## Requirements

- Xcode 16+ (built with Xcode 27)
- iOS 17.0+
- macOS (to run Xcode)

## Getting Started

1. Clone the repo:
   `git clone https://github.com/jrrock26/RockLab-Athletics.git`
2. Open `RockLabAthletics.xcodeproj` in Xcode.
3. Select the `RockLabAthletics` scheme and an iOS simulator, then Run.

## Project Structure

- `RockLabAthletics/RockLabAthleticsApp.swift` — app entry point
- `RockLabAthletics/ContentView.swift` — root tab navigation
- `RockLabAthletics/Models/` — data models (`Team`, `Player`, …)
- `RockLabAthletics/Views/` — SwiftUI views, organized by feature
- `RockLabAthletics/Services/` — future API / Firebase services
- `RockLabAthletics/ViewModels/` — future view models
- `RockLabAthletics/Assets.xcassets` — app icon & color assets

## Roadmap

- [ ] Firebase project + `GoogleService-Info.plist`
- [ ] Authentication (coach / player / athletic director sign-in)
- [ ] Teams & rosters
- [ ] Schedules & games
- [ ] Attendance tracking
- [ ] Stats
- [ ] Messaging
- [ ] App Store Connect signing & release

## Secrets

Never commit these:

- `*.p8` (App Store Connect API key)
- `.env` / `.env.*`
- Service-account JSON
