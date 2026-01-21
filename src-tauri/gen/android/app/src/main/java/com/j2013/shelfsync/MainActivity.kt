package com.j2013.shelfsync

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  
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
}
