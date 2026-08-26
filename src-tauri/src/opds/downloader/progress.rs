pub type ProgressCallback = Box<dyn Fn(u64, Option<u64>) + Send + Sync>;

pub(crate) fn emit_progress(
    progress_callback: &Option<ProgressCallback>,
    received: u64,
    total_bytes: Option<u64>,
) {
    if let Some(cb) = progress_callback {
        cb(received, total_bytes);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn emit_progress_invokes_callback_when_present() {
        let log: Arc<Mutex<Vec<(u64, Option<u64>)>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = log.clone();
        let callback: Option<ProgressCallback> = Some(Box::new(move |received, total| {
            sink.lock().unwrap().push((received, total));
        }));

        emit_progress(&callback, 0, Some(100));
        emit_progress(&callback, 50, Some(100));

        assert_eq!(*log.lock().unwrap(), vec![(0, Some(100)), (50, Some(100))]);
    }

    #[test]
    fn emit_progress_without_callback_is_noop() {
        let callback: Option<ProgressCallback> = None;
        emit_progress(&callback, 1, None);
    }
}
