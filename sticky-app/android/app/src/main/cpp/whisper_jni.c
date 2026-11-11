// JNI-Brücke zu whisper.cpp für app.sticky.zwilling.Spracherkennung
#include <jni.h>
#include <stdlib.h>
#include <string.h>
#include <android/log.h>
#include "whisper.h"

#define TAG "StickyWhisper"
#define LOG(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)

JNIEXPORT jlong JNICALL
Java_app_sticky_zwilling_Spracherkennung_nativeLaden(JNIEnv* env, jclass cls, jstring pfad) {
    const char* p = (*env)->GetStringUTFChars(env, pfad, NULL);
    struct whisper_context_params cp = whisper_context_default_params();
    cp.use_gpu = false;
    struct whisper_context* ctx = whisper_init_from_file_with_params(p, cp);
    LOG("Modell %s geladen: %p", p, ctx);
    (*env)->ReleaseStringUTFChars(env, pfad, p);
    return (jlong)(intptr_t)ctx;
}

JNIEXPORT void JNICALL
Java_app_sticky_zwilling_Spracherkennung_nativeFreigeben(JNIEnv* env, jclass cls, jlong ctx) {
    if (ctx) whisper_free((struct whisper_context*)(intptr_t)ctx);
}

JNIEXPORT jstring JNICALL
Java_app_sticky_zwilling_Spracherkennung_nativeErkennen(JNIEnv* env, jclass cls, jlong ctxPtr, jfloatArray samples,
                                                        jint threads, jstring sprache, jint audioCtx) {
    struct whisper_context* ctx = (struct whisper_context*)(intptr_t)ctxPtr;
    if (!ctx) return (*env)->NewStringUTF(env, "");
    jsize n = (*env)->GetArrayLength(env, samples);
    jfloat* daten = (*env)->GetFloatArrayElements(env, samples, NULL);
    const char* lang = (*env)->GetStringUTFChars(env, sprache, NULL);

    struct whisper_full_params wp = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wp.n_threads = threads;
    wp.language = lang;
    wp.translate = false;
    wp.no_timestamps = true;
    wp.print_progress = false;
    wp.print_realtime = false;
    wp.print_special = false;
    wp.print_timestamps = false;
    wp.suppress_blank = true;
    wp.single_segment = false;
    // Kurze Aufnahmen: Encoder-Fenster auf die Audiolänge kürzen statt immer 30 s (50 Frames je Sekunde)
    if (audioCtx > 0) wp.audio_ctx = audioCtx;

    int rc = whisper_full(ctx, wp, daten, n);
    (*env)->ReleaseFloatArrayElements(env, samples, daten, JNI_ABORT);

    char* text = NULL;
    size_t len = 0;
    if (rc == 0) {
        int segs = whisper_full_n_segments(ctx);
        for (int i = 0; i < segs; i++) {
            const char* s = whisper_full_get_segment_text(ctx, i);
            size_t l = strlen(s);
            text = realloc(text, len + l + 1);
            memcpy(text + len, s, l);
            len += l;
            text[len] = 0;
        }
    } else {
        LOG("whisper_full Fehler %d", rc);
    }
    (*env)->ReleaseStringUTFChars(env, sprache, lang);
    jstring out = (*env)->NewStringUTF(env, text ? text : "");
    free(text);
    return out;
}

JNIEXPORT jstring JNICALL
Java_app_sticky_zwilling_Spracherkennung_nativeSystem(JNIEnv* env, jclass cls) {
    return (*env)->NewStringUTF(env, whisper_print_system_info());
}
