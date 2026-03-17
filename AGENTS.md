# NeuronApp - React Native CLI

## Project Setup

This is a React Native CLI project (not Expo). It was converted from Expo to run directly in Android Studio.

## Opening in Android Studio

1. Open Android Studio
2. Go to `File` → `Open`
3. Select `/Users/noamaan/neuron/NeuronApp` (the root folder)
4. Wait for Gradle sync to complete
5. Click "Run" → "Run 'app'" or press Shift + F10

## Building (Terminal)

### Android
```bash
cd android
./gradlew assembleDebug
```

### Install APK
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Dependencies
- react-native 0.84.1
- firebase
- @react-native-google-signin/google-signin
- @react-native-async-storage/async-storage
- zustand
- react-hook-form
- @hookform/resolvers
- zod
- @react-navigation/native
- @react-navigation/native-stack

## Configuration
- Package name: com.neuron
- google-services.json is in android/app/
