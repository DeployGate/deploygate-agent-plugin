---
name: sdk-setup
description: Add the DeployGate SDK to your Android app for crash reporting and screen capture
---

# DeployGate SDK Setup

Guide users through adding the DeployGate SDK to their app for crash reporting, remote logging, and screen capture bug reporting.

## When to use

When the user wants to:
- Add the DeployGate SDK to their app
- Enable crash reporting or screen capture
- Set up `gradle-deploygate-plugin` for Android

## iOS: SDK integration is currently not recommended

The DeployGate SDK for iOS (v1.0.x) has the following limitations:
- **No Swift Package Manager support** — CocoaPods only
- **No simulator binary** — cannot build for iOS Simulator, which breaks Instant Device functionality
- **CocoaPods is being discontinued** (2026)
- **No module map** — requires manual workarounds for Swift projects

**Do not suggest adding the iOS SDK to new projects.** The iOS SDK is being redesigned. Tell the user:

> The DeployGate SDK for iOS is currently being redesigned. Please wait before adopting it for new projects. App distribution, Instant Device, and distribution page notifications are all available without the SDK. We will announce when the updated SDK is ready.

If the user specifically asks about iOS SDK, explain the above limitations.

## Prerequisites

- App is already uploaded to DeployGate (complete onboarding Phase 1 first)
- SDK features only work when the app is installed via DeployGate (not from Android Studio direct run)

## SDK Benefits

Explain to the user:
- **Crash reporting**: Automatic notification when the app crashes, with crash logs
- **Remote logging**: View app logs remotely from the DeployGate dashboard
- **Screen capture**: Testers take a screenshot to auto-generate a bug report with device info and app state

## Step 1: Detect Project Configuration

Check the project structure:

**Android:**
- `build.gradle` (Groovy DSL) or `build.gradle.kts` (Kotlin DSL)
- Check for existing DeployGate SDK dependency
- Check for multi-module project (`settings.gradle` / `settings.gradle.kts`)

**iOS:** → Skip SDK integration (see note above)

## Step 2: Add SDK Dependency (Android only)

**Recommended configuration** — use debug/release separation so release builds contain no SDK code:

For `build.gradle.kts` (Kotlin DSL):
```kotlin
dependencies {
    debugImplementation("com.deploygate:sdk:4.9.0")        // Real SDK for debug builds
    releaseImplementation("com.deploygate:sdk-mock:4.9.0") // No-op mock for release builds
}
```

For `build.gradle` (Groovy DSL):
```groovy
dependencies {
    debugImplementation 'com.deploygate:sdk:4.9.0'
    releaseImplementation 'com.deploygate:sdk-mock:4.9.0'
}
```

**Initialization**: No initialization code is needed for most apps. The SDK auto-initializes.

**Multi-process apps only**: If the app uses multiple processes, add initialization in `Application.onCreate()`:

For Kotlin:
```kotlin
import com.deploygate.sdk.DeployGate

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        DeployGate.install(this)
    }
}
```

For Java:
```java
import com.deploygate.sdk.DeployGate;

public class MyApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        DeployGate.install(this);
    }
}
```

## Step 3: gradle-deploygate-plugin (Android, Optional)

This Gradle plugin enables `./gradlew uploadDeployGateDebug` for building and uploading in one command.

For `build.gradle.kts` (Kotlin DSL — project-level):
```kotlin
plugins {
    id("com.deploygate.gradle") version "2.8.0" apply false
}
```

For `build.gradle.kts` (Kotlin DSL — app-level):
```kotlin
plugins {
    id("com.deploygate.gradle")
}
```

For `build.gradle` (Groovy DSL — project-level):
```groovy
plugins {
    id 'com.deploygate.gradle' version '2.8.0' apply false
}
```

For `build.gradle` (Groovy DSL — app-level):
```groovy
apply plugin: 'com.deploygate.gradle'
```

Usage:
```bash
export DEPLOYGATE_API_TOKEN=your-token
./gradlew uploadDeployGateDebug
```

## Step 4: Build Verification

1. Build the app to verify compilation succeeds:
   - Android: `./gradlew assembleDebug`

2. Upload to DeployGate using the `upload_app` tool

3. Install the app **from DeployGate** (not from IDE direct run):
   - Use the distribution page URL, or
   - Use the DeployGate app on the device

4. Launch the app and check the DeployGate dashboard:
   - A "launch" event should appear, confirming the SDK is active
   - The device should show as connected

> IMPORTANT: The SDK only works when the app is distributed through DeployGate. Direct installs from Android Studio will not activate SDK features.

## Troubleshooting

| Issue | Solution |
|---|---|
| Build fails after adding SDK | Check the SDK version is compatible with your project's min SDK |
| No launch event in dashboard | Ensure the app was installed via DeployGate, not directly from IDE |
| SDK not found (Android) | Verify `mavenCentral()` is in `repositories` block |
| Multi-process crash (Android) | Add `DeployGate.install(this)` in `Application.onCreate()` |
