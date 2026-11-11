// JNI-Brücke zu whisper.cpp für app.sticky.zwilling.Spracherkennung
#include <jni.h>
#include <stdlib.h>
#include <string.h>
#include <android/log.h>
#include <time.h>
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

// Notbremse: whisper fragt das regelmäßig ab; true = abbrechen
static int64_t frist_ms = 0;
static int64_t jetzt_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}
static bool abbrechen(void* u) { return frist_ms && jetzt_ms() > frist_ms; }

JNIEXPORT jstring JNICALL
Java_app_sticky_zwilling_Spracherkennung_nativeErkennen(JNIEnv* env, jclass cls, jlong ctxPtr, jfloatArray samples,
                                                        jint threads, jstring sprache, jint audioCtx, jstring hinweis) {
    struct whisper_context* ctx = (struct whisper_context*)(intptr_t)ctxPtr;
    if (!ctx) return (*env)->NewStringUTF(env, "");
    jsize n = (*env)->GetArrayLength(env, samples);
    jfloat* daten = (*env)->GetFloatArrayElements(env, samples, NULL);
    const char* lang = (*env)->GetStringUTFChars(env, sprache, NULL);
    const char* prompt = hinweis ? (*env)->GetStringUTFChars(env, hinweis, NULL) : NULL;

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
    // Wortliste (Eigennamen wie Bexbach, Microlino, Bubble Log) als Vorgabe für den Decoder
    if (prompt && prompt[0]) wp.initial_prompt = prompt;
    // Gegen Endlosschleifen beim Dekodieren (11.11.2026: 1,9-s-Diktat hing minutenlang bei 355 % CPU):
    // keine Wiederholung mit höherer Temperatur, Wortzahl passend zur Länge begrenzen, nach 15 s abbrechen
    wp.temperature_inc = 0.0f;
    wp.max_tokens = 16 + (int)(n / 16000.0f * 8.0f);
    wp.no_context = true;
    frist_ms = jetzt_ms() + 15000;
    wp.abort_callback = abbrechen;
    wp.abort_callback_user_data = NULL;

    int rc = whisper_full(ctx, wp, daten, n);
    frist_ms = 0;
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
    if (prompt) (*env)->ReleaseStringUTFChars(env, hinweis, prompt);
    jstring out = (*env)->NewStringUTF(env, text ? text : "");
    free(text);
    return out;
}

JNIEXPORT jstring JNICALL
Java_app_sticky_zwilling_Spracherkennung_nativeSystem(JNIEnv* env, jclass cls) {
    return (*env)->NewStringUTF(env, whisper_print_system_info());
}
