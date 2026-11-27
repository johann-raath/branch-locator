// Angular's service worker, with one change: requests to other origins (the map tiles) are left to
// the browser. That keeps its normal HTTP cache in charge of tiles, as the OpenStreetMap tile policy
// asks, and keeps the page's Content-Security-Policy free of a fetch exception for them.
self.addEventListener('fetch', function (event) {
  if (new URL(event.request.url).origin !== self.location.origin) event.stopImmediatePropagation();
});

importScripts('./ngsw-worker.js');
