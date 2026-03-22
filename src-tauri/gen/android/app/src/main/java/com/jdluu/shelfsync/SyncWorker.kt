package com.jdluu.shelfsync

import android.content.Context
import android.content.Intent
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class SyncWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager

    override suspend fun doWork(): Result {
        Log.i("ShelfSyncWorker", "Starting background discovery...")
        
        try {
            val serviceFound = discoverHost()
            if (serviceFound) {
                Log.i("ShelfSyncWorker", "Host found in background, posting notification.")
                showSyncNotification()
            } else {
                Log.i("ShelfSyncWorker", "No host found.")
            }
            return Result.success()
        } catch (e: Exception) {
            Log.e("ShelfSyncWorker", "Error during background sync: ${e.message}")
            return Result.retry()
        }
    }

    private fun showSyncNotification() {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channelId = "ShelfSync_AutoSync"
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "Background Synchronization",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("auto_sync", true)
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            context, 0, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val notification = androidx.core.app.NotificationCompat.Builder(context, channelId)
            .setContentTitle("ShelfSync Host Discovered")
            .setContentText("Tap to synchronize your library progress.")
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(7788, notification)
    }

    private suspend fun discoverHost(): Boolean = suspendCancellableCoroutine { continuation ->
        var resolved = false
        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {}

            override fun onServiceFound(service: NsdServiceInfo) {
                if (service.serviceName.contains("ShelfSync")) {
                    if (!resolved) {
                        resolved = true
                        nsdManager.stopServiceDiscovery(this)
                        continuation.resume(true)
                    }
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {}
            override fun onDiscoveryStopped(serviceType: String) {
                if (!resolved && continuation.isActive) {
                    continuation.resume(false)
                }
            }
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                if (continuation.isActive) continuation.resume(false)
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }

        nsdManager.discoverServices(
            "_http._tcp.",
            NsdManager.PROTOCOL_DNS_SD,
            discoveryListener
        )

        // Timeout after 10 seconds
        continuation.invokeOnCancellation {
            try {
                nsdManager.stopServiceDiscovery(discoveryListener)
            } catch (e: Exception) {}
        }
    }
}
