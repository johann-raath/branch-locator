// Sets the theme before first paint so dark mode doesn't flash white.
// Kept as a separate file (not inline) so the Content-Security-Policy can use script-src 'self'.
(function () {
  var p;
  try { p = localStorage.getItem('theme'); } catch (e) {}
  var t = p;
  if (p === 'auto') {
    var h = new Date().getHours();
    t = h >= 6 && h < 18 ? 'light' : 'dark';
  } else if (p !== 'light' && p !== 'dark') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
})();
