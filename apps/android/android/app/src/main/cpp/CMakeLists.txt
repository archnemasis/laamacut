# Native auto captions: whisper.cpp (fetched by scripts/fetch-caption-model.mjs)
# plus a small JNI bridge for WhisperPlugin.java. Built twice for 64-bit phones,
# like whisper.cpp's own Android example: a baseline library, and one using the
# half-precision and dot-product instructions newer phones have, which
# WhisperPlugin picks when the CPU says it supports them.
cmake_minimum_required(VERSION 3.10)
project(laamacut_whisper)

set(CMAKE_CXX_STANDARD 17)
set(WHISPER ${CMAKE_SOURCE_DIR}/whisper.cpp)

set(SOURCES
    ${CMAKE_SOURCE_DIR}/whisper_jni.cpp
    ${WHISPER}/src/whisper.cpp
    ${WHISPER}/ggml/src/ggml.c
    ${WHISPER}/ggml/src/ggml-alloc.c
    ${WHISPER}/ggml/src/ggml-backend.cpp
    ${WHISPER}/ggml/src/ggml-backend-reg.cpp
    ${WHISPER}/ggml/src/ggml-quants.c
    ${WHISPER}/ggml/src/ggml-threading.cpp
    ${WHISPER}/ggml/src/ggml-cpu/ggml-cpu.c
    ${WHISPER}/ggml/src/ggml-cpu/ggml-cpu.cpp
    ${WHISPER}/ggml/src/ggml-cpu/ggml-cpu-aarch64.cpp
    ${WHISPER}/ggml/src/ggml-cpu/ggml-cpu-hbm.cpp
    ${WHISPER}/ggml/src/ggml-cpu/ggml-cpu-quants.c
    ${WHISPER}/ggml/src/ggml-cpu/ggml-cpu-traits.cpp
)

find_library(LOG_LIB log)

function(build_library name)
    add_library(${name} SHARED ${SOURCES})
    target_include_directories(${name} PRIVATE
        ${WHISPER}/include
        ${WHISPER}/src
        ${WHISPER}/ggml/include
        ${WHISPER}/ggml/src
        ${WHISPER}/ggml/src/ggml-cpu
    )
    target_compile_definitions(${name} PRIVATE GGML_USE_CPU)
    target_compile_options(${name} PRIVATE -O3 -fvisibility=hidden -fvisibility-inlines-hidden -ffunction-sections -fdata-sections ${ARGN})
    target_link_options(${name} PRIVATE -Wl,--gc-sections -Wl,--exclude-libs,ALL)
    target_link_libraries(${name} ${LOG_LIB} android)
endfunction()

build_library(laamacut_whisper)
if (${ANDROID_ABI} STREQUAL "arm64-v8a")
    build_library(laamacut_whisper_fp16 -march=armv8.2-a+fp16+dotprod)
endif()
