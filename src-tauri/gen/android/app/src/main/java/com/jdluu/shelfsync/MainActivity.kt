package com.jdluu.shelfsync

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Hand the Rust runtime the JavaVM plus SecureCredentials class reference
    // so OPDS credentials can be sealed with an Android Keystore key. Runs
    // before the webview issues any credential command.
    ShelfSyncBridge.nativeInit(SecureCredentials::class.java)
  }
}
