// Register service worker and check PWA installability
if ('serviceWorker' in navigator) {
  // Register immediately, don't wait for load (better for Android)
  navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .then((registration) => {
      console.log('Service Worker registered:', registration.scope);
      
      // Check if there's an update waiting
      if (registration.waiting) {
        console.log('Service Worker update waiting');
      }
      
      // Check if there's an installing worker
      if (registration.installing) {
        console.log('Service Worker installing...');
        registration.installing.addEventListener('statechange', function() {
          console.log('Service Worker state:', this.state);
        });
      }
      
      // Wait for service worker to be ready
      return navigator.serviceWorker.ready;
    })
    .then((registration) => {
      console.log('Service Worker ready, state:', registration.active?.state);
      
      // Check if page is controlled (critical for Android Chrome)
      if (navigator.serviceWorker.controller) {
        console.log('✓ Page is controlled by service worker');
      } else {
        console.warn('✗ Page is NOT controlled by service worker');
        console.warn('Android Chrome requires the page to be controlled for install prompt');
        console.warn('Try reloading the page once more');
      }
      
      // Check manifest
      return fetch('/public/manifest.json').then(r => {
        if (!r.ok) throw new Error('Manifest fetch failed: ' + r.status);
        return r.json();
      });
    })
    .then((manifest) => {
      console.log('✓ Manifest loaded:', manifest);
      console.log('Icons:', manifest.icons?.length || 0);
      
      // Verify icons are accessible (Android Chrome checks this)
      const iconChecks = manifest.icons.map(icon => {
        return fetch(icon.src)
          .then(r => {
            if (r.ok) {
              console.log('✓ Icon accessible:', icon.src);
              return true;
            } else {
              console.error('✗ Icon NOT accessible:', icon.src, r.status);
              return false;
            }
          })
          .catch(err => {
            console.error('✗ Icon fetch error:', icon.src, err);
            return false;
          });
      });
      
      return Promise.all(iconChecks);
    })
    .then((iconResults) => {
      const allIconsOk = iconResults.every(r => r === true);
      if (allIconsOk) {
        console.log('✓ All icons accessible');
      } else {
        console.warn('✗ Some icons are not accessible');
      }
    })
    .catch((error) => {
      console.error('✗ Service Worker setup failed:', error);
    });
}

// Listen for beforeinstallprompt event (PWA install prompt)
// This is the key event that Android Chrome fires when installable
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('🎉 beforeinstallprompt event fired - PWA can be installed!');
  console.log('Platform:', navigator.platform);
  console.log('User Agent:', navigator.userAgent);
  e.preventDefault();
  deferredPrompt = e;
  
  // Store for potential manual install button
  window.deferredPrompt = deferredPrompt;
  
  // Log installability criteria
  console.log('Install prompt available - all criteria met!');
});

// Check if app is already installed
if ('getInstalledRelatedApps' in navigator) {
  navigator.getInstalledRelatedApps().then(apps => {
    if (apps.length > 0) {
      console.log('App is already installed:', apps);
    } else {
      console.log('App is not installed yet');
    }
  });
}

// Android-specific: Check if we're on Android and log installability status
const isAndroid = /Android/i.test(navigator.userAgent);
if (isAndroid) {
  console.log('📱 Android detected - checking installability...');
  
  // After a short delay, check installability
  setTimeout(() => {
    if (!window.deferredPrompt) {
      console.warn('⚠️ No install prompt available on Android');
      console.warn('Common issues:');
      console.warn('1. Service worker not controlling the page (reload once)');
      console.warn('2. Manifest or icons not accessible');
      console.warn('3. Not served over HTTPS');
      console.warn('4. User needs to interact with the site more');
    }
  }, 2000);
}
