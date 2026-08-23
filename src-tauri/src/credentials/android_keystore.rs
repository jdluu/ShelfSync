//! Android Keystore bridge for OPDS credential sealing.
//!
//! The AES/GCM key lives inside the Android Keystore and is never exported.
//! Sealing and opening run in `SecureCredentials.kt`; Rust only exchanges
//! opaque base64 blobs over JNI. Error values never contain plaintext
//! secrets because every JNI failure maps onto an opaque error variant.
//!
//! Startup contract: `MainActivity.onCreate` calls
//! `ShelfSyncBridge.nativeInit(SecureCredentials::class.java)` which resolves
//! to [`Java_com_jdluu_shelfsync_ShelfSyncBridge_nativeInit`] below. That
//! captures the `JavaVM` plus a global reference to the cipher class so later
//! command invocations can attach from any worker thread.

use super::{CredentialCipher, CredentialStoreError, SealedSecret};
use jni::objects::{GlobalRef, JClass, JString};
use jni::{JNIEnv, JavaVM};
use std::sync::OnceLock;

const KEY_ALIAS: &str = "shelfsync_opds_credentials";
const BLOB_SEPARATOR: char = ':';
const CIPHER_CLASS_SIG: &str = "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;";

static JAVA_VM: OnceLock<JavaVM> = OnceLock::new();
static CIPHER_CLASS: OnceLock<GlobalRef> = OnceLock::new();

/// JNI entry point invoked by `ShelfSyncBridge.nativeInit`.
#[no_mangle]
pub extern "system" fn Java_com_jdluu_shelfsync_ShelfSyncBridge_nativeInit<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
    cipher_class: jni::objects::JObject<'local>,
) {
    if JAVA_VM.get().is_none() {
        match env.get_java_vm() {
            Ok(vm) => {
                let _ = JAVA_VM.set(vm);
            }
            Err(_) => return,
        }
    }
    if CIPHER_CLASS.get().is_none() {
        if let Ok(global) = env.new_global_ref(&cipher_class) {
            let _ = CIPHER_CLASS.set(global);
        }
    }
}

fn with_attached_env<T>(
    work: impl FnOnce(&mut JNIEnv, &GlobalRef) -> Result<T, CredentialStoreError>,
) -> Result<T, CredentialStoreError> {
    let vm = JAVA_VM.get().ok_or(CredentialStoreError::NotReady)?;
    let class = CIPHER_CLASS.get().ok_or(CredentialStoreError::NotReady)?;
    let mut guard = vm
        .attach_current_thread()
        .map_err(|_| CredentialStoreError::Cipher)?;
    let env: &mut JNIEnv = &mut guard;
    let output = work(env, class)?;
    // Never leave a pending Java exception behind for the next caller.
    if env.exception_check().unwrap_or(false) {
        env.exception_clear()
            .map_err(|_| CredentialStoreError::Cipher)?;
    }
    Ok(output)
}

fn call_cipher_method(
    env: &mut JNIEnv,
    class: &GlobalRef,
    method: &str,
    alias_value: &str,
    payload: &str,
) -> Result<String, CredentialStoreError> {
    let alias = env
        .new_string(alias_value)
        .map_err(|_| CredentialStoreError::Cipher)?;
    let value = env
        .new_string(payload)
        .map_err(|_| CredentialStoreError::Cipher)?;

    let result = env.call_static_method(
        class,
        method,
        CIPHER_CLASS_SIG,
        &[(&alias).into(), (&value).into()],
    );
    let returned = match result {
        Ok(value) => value,
        Err(_) => {
            env.exception_clear().ok();
            return Err(CredentialStoreError::Cipher);
        }
    };

    let object = returned.l().map_err(|_| CredentialStoreError::Cipher)?;
    let string: JString = object.into();
    let owned = env
        .get_string(&string)
        .map_err(|_| CredentialStoreError::Cipher)?;
    Ok(owned.to_string_lossy().into_owned())
}

/// Cipher implementation backed by the non-exportable Android Keystore key.
pub struct AndroidKeystoreCipher {
    alias: String,
}

impl AndroidKeystoreCipher {
    pub fn connect() -> Result<Self, CredentialStoreError> {
        Ok(AndroidKeystoreCipher {
            alias: KEY_ALIAS.to_string(),
        })
    }

    pub fn is_bridge_ready() -> bool {
        JAVA_VM.get().is_some() && CIPHER_CLASS.get().is_some()
    }
}

impl CredentialCipher for AndroidKeystoreCipher {
    fn seal(&self, plaintext: &str) -> Result<SealedSecret, CredentialStoreError> {
        with_attached_env(|env, class| {
            let blob = call_cipher_method(env, class, "encrypt", &self.alias, plaintext)?;
            let (nonce_b64, ciphertext_b64) = blob
                .split_once(BLOB_SEPARATOR)
                .ok_or(CredentialStoreError::Corrupt)?;
            Ok(SealedSecret {
                nonce_b64: nonce_b64.to_string(),
                ciphertext_b64: ciphertext_b64.to_string(),
            })
        })
    }

    fn open(&self, sealed: &SealedSecret) -> Result<String, CredentialStoreError> {
        with_attached_env(|env, class| {
            let blob = format!(
                "{}{BLOB_SEPARATOR}{}",
                sealed.nonce_b64, sealed.ciphertext_b64
            );
            // Decrypt failures (missing keystore entry, tampered blob) surface
            // as a generic cipher error so no secret material can be inferred
            // from error strings.
            match call_cipher_method(env, class, "decrypt", &self.alias, &blob) {
                Ok(plaintext) => Ok(plaintext),
                Err(CredentialStoreError::Cipher) => Err(CredentialStoreError::Cipher),
                Err(other) => Err(other),
            }
        })
    }
}
