package com.jdluu.shelfsync

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
    private var multicastLock: WifiManager.MulticastLock? = null
  
  private val requestPermissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions()
  ) { permissions ->
    permissions.entries.forEach {
      val granted = it.value
      if (!granted) {
        // Permission denied - log or show message
        android.util.Log.w("ShelfSync", "Permission ${it.key} denied")
      }
    }
  }
  
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Request storage permissions at startup
    requestStoragePermissions()
  }
  
  override fun onResume() {
    super.onResume()
    // Re-check permissions when app resumes
    if (!hasStoragePermissions()) {
      requestStoragePermissions()
    }
  }

  /**
   * Acquires a MulticastLock to allow mDNS discovery.
   * Called from Rust via JNI.
   */
  fun setMulticastLock(enabled: Boolean) {
      val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      if (enabled) {
          if (multicastLock == null || !multicastLock!!.isHeld) {
              multicastLock = wifiManager.createMulticastLock("ShelfSync::mDNS").apply {
                  setReferenceCounted(true)
                  acquire()
              }
              android.util.Log.i("ShelfSync", "MulticastLock acquired")
          }
      } else {
          multicastLock?.let {
              if (it.isHeld) {
                  it.release()
                  android.util.Log.i("ShelfSync", "MulticastLock released")
              }
          }
          multicastLock = null
      }
  }

  /**
   * Starts or stops the HostForegroundService.
   * Called from Rust via JNI.
   */
  fun setHostingService(enabled: Boolean) {
      val intent = Intent(this, HostForegroundService::class.java)
      if (enabled) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
              startForegroundService(intent)
          } else {
              startService(intent)
          }
          android.util.Log.i("ShelfSync", "HostForegroundService started")
      } else {
          stopService(intent)
          android.util.Log.i("ShelfSync", "HostForegroundService stopped")
      }
  }
  
  private fun hasStoragePermissions(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Android 13+
      ContextCompat.checkSelfPermission(
        this, Manifest.permission.READ_MEDIA_IMAGES
      ) == PackageManager.PERMISSION_GRANTED
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Android 10-12
      ContextCompat.checkSelfPermission(
        this, Manifest.permission.READ_EXTERNAL_STORAGE
      ) == PackageManager.PERMISSION_GRANTED
    } else {
      // Android 9 and below
      ContextCompat.checkSelfPermission(
        this, Manifest.permission.WRITE_EXTERNAL_STORAGE
      ) == PackageManager.PERMISSION_GRANTED
    }
  }
  
  private fun requestStoragePermissions() {
    if (hasStoragePermissions()) {
      return // Already granted
    }
    
    val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Android 13+
      arrayOf(
        Manifest.permission.READ_MEDIA_IMAGES,
        Manifest.permission.READ_MEDIA_VIDEO,
        Manifest.permission.READ_MEDIA_AUDIO
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Android 10-12
      arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    } else {
      // Android 9 and below
      arrayOf(
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE
      )
    }
    
    requestPermissionLauncher.launch(permissions)
  }

  /**
   * Schedules a periodic background worker to search for ShelfSync hosts.
   * Called from Rust via JNI.
   */
  fun setupAutoSync(enabled: Boolean) {
      val workManager = androidx.work.WorkManager.getInstance(applicationContext)
      if (enabled) {
          val constraints = androidx.work.Constraints.Builder()
              .setRequiredNetworkType(androidx.work.NetworkType.UNMETERED)
              .build()

          val syncRequest = androidx.work.PeriodicWorkRequestBuilder<SyncWorker>(15, java.util.concurrent.TimeUnit.MINUTES)
              .setConstraints(constraints)
              .build()

          workManager.enqueueUniquePeriodicWork(
              "ShelfSync_AutoSync",
              androidx.work.ExistingPeriodicWorkPolicy.UPDATE,
              syncRequest
          )
          android.util.Log.i("ShelfSync", "AutoSync WorkManager scheduled")
      } else {
          workManager.cancelUniqueWork("ShelfSync_AutoSync")
          android.util.Log.i("ShelfSync", "AutoSync WorkManager cancelled")
      }
  }
}
