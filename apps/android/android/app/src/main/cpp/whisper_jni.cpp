// JNI bridge between WhisperPlugin.java and whisper.cpp: load the model,
// transcribe 16 kHz mono audio, and hand the timed segments back as JSON.
#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <cstdio>
#include <string>
#include <thread>

#include "whisper.h"

#define LOG_TAG "LaamacutWhisper"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

namespace {

struct ProgressTarget {
    JNIEnv *env;
    jobject plugin;
    jmethodID method;
};

void on_progress(whisper_context *, whisper_state *, int progress, void *user_data) {
    auto *target = static_cast<ProgressTarget *>(user_data);
    target->env->CallVoidMethod(target->plugin, target->method, progress);
}

void append_json_string(std::string &out, const char *text) {
    out += '"';
    for (const char *c = text; *c; ++c) {
        switch (*c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(*c) < 0x20) {
                    char escaped[8];
                    snprintf(escaped, sizeof escaped, "\\u%04x", *c);
                    out += escaped;
                } else {
                    out += *c;
                }
        }
    }
    out += '"';
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_laamacut_app_WhisperPlugin_nativeInit(JNIEnv *env, jclass, jstring model_path) {
    const char *path = env->GetStringUTFChars(model_path, nullptr);
    whisper_context_params params = whisper_context_default_params();
    params.use_gpu = false;
    whisper_context *context = whisper_init_from_file_with_params(path, params);
    env->ReleaseStringUTFChars(model_path, path);
    return reinterpret_cast<jlong>(context);
}

extern "C" JNIEXPORT void JNICALL
Java_com_laamacut_app_WhisperPlugin_nativeFree(JNIEnv *, jclass, jlong context) {
    whisper_free(reinterpret_cast<whisper_context *>(context));
}

/**
 * Returns {"text": "...", "chunks": [{"text": "...", "start": s, "end": s}]},
 * the same shape the web worker gives, or null if whisper failed.
 */
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_laamacut_app_WhisperPlugin_nativeTranscribe(
    JNIEnv *env, jobject plugin, jlong handle, jfloatArray samples, jstring language, jboolean translate) {
    auto *context = reinterpret_cast<whisper_context *>(handle);
    const char *lang = env->GetStringUTFChars(language, nullptr);
    std::string lang_code = lang[0] ? lang : "auto";
    env->ReleaseStringUTFChars(language, lang);

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.translate = translate;
    params.language = lang_code.c_str();
    params.no_context = true;
    params.suppress_blank = true;
    // Leave a core free so the editor stays responsive.
    params.n_threads = std::max(1, std::min(4, static_cast<int>(std::thread::hardware_concurrency()) - 1));

    jclass plugin_class = env->GetObjectClass(plugin);
    ProgressTarget target{env, plugin, env->GetMethodID(plugin_class, "onNativeProgress", "(I)V")};
    params.progress_callback = on_progress;
    params.progress_callback_user_data = &target;

    jsize count = env->GetArrayLength(samples);
    jfloat *audio = env->GetFloatArrayElements(samples, nullptr);
    LOGI("transcribing %d samples on %d threads", count, params.n_threads);
    int status = whisper_full(context, params, audio, count);
    env->ReleaseFloatArrayElements(samples, audio, JNI_ABORT);
    if (status != 0) return nullptr;

    std::string text;
    std::string chunks;
    int segments = whisper_full_n_segments(context);
    for (int i = 0; i < segments; ++i) {
        const char *segment = whisper_full_get_segment_text(context, i);
        text += segment;
        if (i > 0) chunks += ',';
        // Segment times are in hundredths of a second.
        char times[64];
        snprintf(times, sizeof times, ",\"start\":%.2f,\"end\":%.2f}",
                 whisper_full_get_segment_t0(context, i) / 100.0,
                 whisper_full_get_segment_t1(context, i) / 100.0);
        chunks += "{\"text\":";
        append_json_string(chunks, segment);
        chunks += times;
    }
    std::string json = "{\"text\":";
    append_json_string(json, text.c_str());
    json += ",\"chunks\":[" + chunks + "]}";
    // Raw UTF-8 bytes: Whisper can split a character across tokens, which
    // NewStringUTF would reject; Java decodes these leniently.
    jbyteArray bytes = env->NewByteArray(static_cast<jsize>(json.size()));
    env->SetByteArrayRegion(bytes, 0, static_cast<jsize>(json.size()), reinterpret_cast<const jbyte *>(json.data()));
    return bytes;
}
