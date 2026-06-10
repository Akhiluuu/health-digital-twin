#!/bin/bash
set -e

SDK_DIR="$HOME/android-sdk"
TMP_ZIP="/tmp/cmdline-tools.zip"

echo "=== Creating Android SDK Directory ==="
mkdir -p "$SDK_DIR/cmdline-tools"

echo "=== Downloading Android SDK Command Line Tools ==="
wget -O "$TMP_ZIP" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

echo "=== Extracting Command Line Tools ==="
unzip -q "$TMP_ZIP" -d "$SDK_DIR/cmdline-tools"
mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
rm -f "$TMP_ZIP"

echo "=== Accepting Android SDK Licenses ==="
yes | "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" --licenses --sdk_root="$SDK_DIR"

echo "=== Installing Platform Tools, Build Tools 36.0.0, and Platform API 35 ==="
"$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK_DIR" \
    "platform-tools" \
    "build-tools;36.0.0" \
    "platforms;android-35"

echo "=== Configuring local.properties for VitalHealth ==="
PROPERTIES_FILE="/home/akhilreddy/health-digital-twin/VitalHealth/android/local.properties"
mkdir -p "$(dirname "$PROPERTIES_FILE")"
echo "sdk.dir=$SDK_DIR" > "$PROPERTIES_FILE"

echo "=== Android SDK Setup Complete! ==="
