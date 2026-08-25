/**
 * Syrian Home Hub - PWA Installation & Service Worker Registrar
 */

class PWAManager {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.init();
  }

  init() {
    this.registerServiceWorker();
    this.listenInstallPrompt();
    this.checkStandaloneMode();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('Hub Service Worker registered:', reg.scope);
          })
          .catch((err) => {
            console.warn('Hub Service Worker error:', err);
          });
      });
    }
  }

  listenInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      document.querySelectorAll('.btn-pwa-install').forEach(btn => {
        btn.classList.remove('hidden');
        btn.style.display = 'inline-flex';
      });
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isInstalled = true;
      document.querySelectorAll('.btn-pwa-install').forEach(btn => {
        btn.classList.add('hidden');
        btn.style.display = 'none';
      });
    });
  }

  checkStandaloneMode() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      this.isInstalled = true;
      document.querySelectorAll('.btn-pwa-install').forEach(btn => {
        btn.classList.add('hidden');
        btn.style.display = 'none';
      });
    }
  }

  async promptInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        this.deferredPrompt = null;
      }
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      this.showIOSInstructions();
      return;
    }

    window.app?.showToast ? window.app.showToast('افتح قائمة المتصفح (⋮) واختر "تثبيت التطبيق" أو "إضافة للشاشة الرئيسية"', 'info') : alert('افتح قائمة المتصفح واضغط "تثبيت التطبيق"');
  }

  showIOSInstructions() {
    alert('لتثبيت التطبيق على الآيفون: اضغط على زر المشاركة (Share) في أسفل المتصفح ثم اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen)');
  }
}

window.pwaManager = new PWAManager();
