import { useEffect } from 'react';
import Router from 'next/router';
import '../styles/globals.css';

/// A static export gives every page its own chunk file, and a deploy replaces those files.
/// A tab that was open when a new build shipped therefore asks for a chunk that no longer
/// exists. Hosting answered that request with index.html and a 200 (the catch-all rewrite,
/// removed from firebase.json), the browser failed to parse HTML as JavaScript, and the
/// click did nothing — the page only appeared after a manual reload.
///
/// The router reports the failure, so do the reload for the user and keep the address they
/// asked for. A guard stops this from becoming a reload loop if a chunk is genuinely gone.
function recover(url) {
  try {
    const KEY = 'rocklab:route-recovery';
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10_000) return;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Private mode or storage disabled: recover anyway, the guard is a nicety.
  }
  window.location.assign(url || window.location.href);
}

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const onRouteError = (_err, url) => recover(url);

    // Prefetch failures never surface as route errors — they surface as uncaught chunk
    // errors — but the next click would fail the same way, so recover now.
    const onWindowError = (event) => {
      const message = String((event && event.message) || '');
      if (/ChunkLoadError|Loading chunk \S+ failed|Unexpected token '<'/i.test(message)) {
        recover();
      }
    };

    Router.events.on('routeChangeError', onRouteError);
    window.addEventListener('error', onWindowError);
    return () => {
      Router.events.off('routeChangeError', onRouteError);
      window.removeEventListener('error', onWindowError);
    };
  }, []);

  return <Component {...pageProps} />;
}
