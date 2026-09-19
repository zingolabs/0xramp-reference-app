use std::pin::Pin;
use std::sync::LazyLock;
use std::task::{Context, Poll};

use tokio::runtime::{Builder, Runtime};
use tokio::task::{JoinError, JoinHandle};

use crate::WalletError;

const WORKER_THREAD_NAME: &str = "zingo-wallet";

static RUNTIME: LazyLock<std::io::Result<Runtime>> = LazyLock::new(|| {
    Builder::new_multi_thread()
        .enable_all()
        .thread_name(WORKER_THREAD_NAME)
        .build()
});

fn runtime() -> Result<&'static Runtime, WalletError> {
    RUNTIME
        .as_ref()
        .map_err(|failure| WalletError::internal(failure))
}

pub(crate) struct AbortOnDrop<T>(JoinHandle<T>);

impl<T> AbortOnDrop<T> {
    pub(crate) fn is_finished(&self) -> bool {
        self.0.is_finished()
    }
}

impl<T> Drop for AbortOnDrop<T> {
    fn drop(&mut self) {
        self.0.abort();
    }
}

impl<T> Future for AbortOnDrop<T> {
    type Output = Result<T, JoinError>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        Pin::new(&mut self.0).poll(cx)
    }
}

pub(crate) fn spawn_guarded<F>(task: F) -> Result<AbortOnDrop<F::Output>, WalletError>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    Ok(AbortOnDrop(runtime()?.spawn(task)))
}

pub(crate) async fn read<T, F>(work: F) -> Result<T, WalletError>
where
    F: Future<Output = Result<T, WalletError>> + Send + 'static,
    T: Send + 'static,
{
    joined(spawn_guarded(work)?.await)
}

pub(crate) async fn write<T, F>(work: F) -> Result<T, WalletError>
where
    F: Future<Output = Result<T, WalletError>> + Send + 'static,
    T: Send + 'static,
{
    joined(runtime()?.spawn(work).await)
}

fn joined<T>(outcome: Result<Result<T, WalletError>, JoinError>) -> Result<T, WalletError> {
    outcome.unwrap_or_else(|failure| Err(WalletError::internal(&failure)))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    use super::*;

    const HELD: Duration = Duration::from_millis(50);
    const SETTLED: Duration = Duration::from_millis(200);

    async fn finishes_after_hold(finished: Arc<AtomicBool>) -> Result<(), WalletError> {
        tokio::time::sleep(HELD).await;
        finished.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn explode() -> WalletError {
        panic!("scan exploded")
    }

    async fn poll_once_then_drop(work: impl Future) {
        let mut work = std::pin::pin!(work);
        std::future::poll_fn(|cx| {
            let _pending = work.as_mut().poll(cx);
            Poll::Ready(())
        })
        .await;
    }

    #[tokio::test]
    async fn work_runs_on_the_named_workers() {
        let name = read(async { Ok(std::thread::current().name().map(str::to_owned)) }).await;
        assert_eq!(name.ok().flatten().as_deref(), Some(WORKER_THREAD_NAME));
    }

    #[tokio::test]
    async fn a_panic_on_the_runtime_is_an_internal_error() {
        let outcome: Result<(), WalletError> = read(async { Err(explode()) }).await;
        let failure = outcome.expect_err("the panic surfaces");
        assert_eq!(failure.code(), "ERR_INTERNAL");
        assert!(
            failure.reason().contains("scan exploded"),
            "{}",
            failure.reason()
        );
    }

    #[tokio::test]
    async fn a_dropped_read_aborts_and_a_dropped_write_completes() {
        let read_finished = Arc::new(AtomicBool::new(false));
        poll_once_then_drop(read(finishes_after_hold(read_finished.clone()))).await;

        let write_finished = Arc::new(AtomicBool::new(false));
        poll_once_then_drop(write(finishes_after_hold(write_finished.clone()))).await;

        tokio::time::sleep(SETTLED).await;
        assert!(
            !read_finished.load(Ordering::SeqCst),
            "the read was aborted"
        );
        assert!(
            write_finished.load(Ordering::SeqCst),
            "the write ran to completion"
        );
    }
}
