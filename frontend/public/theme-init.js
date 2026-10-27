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
