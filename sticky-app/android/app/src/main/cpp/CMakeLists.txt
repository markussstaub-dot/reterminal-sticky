# whisper.cpp als kleine JNI-Bibliothek für die Sticky-App (nur arm64, Fold6 = Snapdragon 8 Gen 3).
# Der whisper.cpp-Quellcode liegt außerhalb von OneDrive: %LOCALAPPDATA%\sticky-whisper\whisper.cpp
# (git clone --depth 1 https://github.com/ggml-org/whisper.cpp), übergeben von app/build.gradle als WHISPER_DIR.
cmake_minimum_required(VERSION 3.22)
project(sticky_whisper C CXX)

# Auch im Debug-Build der App optimiert übersetzen, sonst ist die Erkennung um ein Vielfaches langsamer
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
add_compile_options(-O3)

set(BUILD_SHARED_LIBS      OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(WHISPER_ALL_WARNINGS   OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE            OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP            OFF CACHE BOOL "" FORCE)   # ggml-eigener Thread-Pool, keine libomp.so nötig
set(GGML_CPU_ARM_ARCH "armv8.2-a+fp16+dotprod" CACHE STRING "" FORCE)

add_subdirectory(${WHISPER_DIR} whisper_build)

add_library(sticky_whisper SHARED whisper_jni.c)
target_link_libraries(sticky_whisper whisper log)
