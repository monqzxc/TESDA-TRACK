// Sets the theme before the first paint, so the page never flashes the wrong one. index.html loads this file as
// a blocking script in <head>, before the stylesheets and the app. It is a file rather than an inline script so
// that the Content Security Policy can allow scripts from 'self' only, with no hash to keep up to date.
//
// THEME_KEY in src/lib/storage.ts must match the key below. ThemeProvider takes over once the app has loaded.
;(function () {
  var choice = null
  try {
    choice = window.localStorage.getItem('tesda-track.theme')
  } catch (e) {
    // Private windows and blocked site data: follow the device.
  }
  var dark =
    choice === 'dark' ||
    (choice !== 'light' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  var theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
})()

// If the app's script fails to download, show the "can't load" message at once instead of after the delay in
// app-fallback.css. A failed <script> fires 'error' on the element only, so listen in the capture phase.
window.addEventListener(
  'error',
  function (event) {
    var el = event.target
    if (el && el.tagName === 'SCRIPT' && el.type === 'module') {
      var box = document.querySelector('.app-fallback-delayed')
      if (box) box.className += ' app-fallback-now'
    }
  },
  true,
)
