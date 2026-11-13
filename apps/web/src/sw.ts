/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

/**
 * Cache policy
 * - Precached: the app shell (html/css/icons/main bundle) so the static screens load offline.
 * - Cache-first: Google Fonts.
 * - Everything else (Ethereum RPC, Zama relayer/KMS, wallet providers, any non-GET) is NOT routed here,
 *   so it always goes to the network. Nothing secret or decrypted is ever put in Cache Storage.
 */
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'fonts' }),
)

// Updates are applied only when the user accepts (never mid-transaction).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()
