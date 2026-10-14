/**
 * Loads the app again from the server. After a part of the app fails to download (a lost connection, or a new
 * release replacing the old files) or fails to show, a fresh start is the way back. Its own module so tests can
 * replace it.
 */
export function reloadPage(): void {
  window.location.reload()
}
