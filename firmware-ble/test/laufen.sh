#!/usr/bin/env bash
# rechner.h testen: mit dem NDK für arm64 bauen und auf dem angesteckten Android-Handy laufen lassen (Git-Bash).
# Es gibt auf dem PC keinen C-Compiler; das Handy rechnet dafür genauso wie der ESP32 (double, IEEE 754).
set -e
NDK="$LOCALAPPDATA/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/bin"
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
AUS="$(mktemp -d)/rechner_test"
cd "$(dirname "$0")"
"$NDK/aarch64-linux-android34-clang++.cmd" -O1 -static-libstdc++ -o "$AUS" rechner_test.cpp
export MSYS_NO_PATHCONV=1
"$ADB" push "$(cygpath -w "$AUS")" /data/local/tmp/rechner_test > /dev/null
"$ADB" shell "chmod 755 /data/local/tmp/rechner_test && /data/local/tmp/rechner_test"
