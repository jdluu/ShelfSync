package com.jdluu.shelfsync

/**
 * Bridge that hands the Rust runtime the JavaVM handle and the
 * SecureCredentials class reference it needs for JNI calls. Called once from
 * MainActivity.onCreate before any credential command can run.
 */
object ShelfSyncBridge {
    init {
        // The Rust library is normally already loaded by the Tauri plugin;
        // loading again in the same class loader is a no-op.
        runCatching { System.loadLibrary("shelfsync") }
    }

    @JvmStatic
    external fun nativeInit(cipherClass: Class<*>)
}
