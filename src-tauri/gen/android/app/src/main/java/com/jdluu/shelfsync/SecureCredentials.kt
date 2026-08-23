package com.jdluu.shelfsync

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Seals and opens OPDS credential payloads with a non-exportable AES/GCM key
 * held inside the Android Keystore. Plaintext never leaves this process and
 * key material never leaves the keystore; callers only exchange base64 blobs.
 *
 * Blob format: "<base64 iv>:<base64 ciphertext+tag>".
 */
object SecureCredentials {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val KEY_SIZE_BITS = 256
    private const val GCM_TAG_BITS = 128

    private fun loadOrCreateKey(alias: String): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_SIZE_BITS)
                .build()
        )
        return generator.generateKey()
    }

    @JvmStatic
    fun encrypt(alias: String, plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, loadOrCreateKey(alias))
        val iv = cipher.iv
        val sealed = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(iv, Base64.NO_WRAP) +
            ":" +
            Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    @JvmStatic
    fun decrypt(alias: String, blob: String): String {
        val parts = blob.split(":")
        if (parts.size != 2) {
            throw IllegalArgumentException("Malformed sealed blob")
        }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val sealed = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, loadOrCreateKey(alias), GCMParameterSpec(GCM_TAG_BITS, iv))
        return String(cipher.doFinal(sealed), Charsets.UTF_8)
    }
}
