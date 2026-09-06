/**
 * Syrian Home POS - PWA Installation & Service Worker Registrar
 */

class PWAManager {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.init();
  }

  init() {
    this.checkVersionUpdate();
    this.registerServiceWorker();
    this.listenInstallPrompt();
    this.checkStandaloneMode();
  }

  async checkVersionUpdate() {
    const currentVersion = '2.5.1';
    const lastVersion = localStorage.getItem('pos_installed_version');
    if (lastVersion !== currentVersion) {
      console.log(`Upgrading POS shell from ${lastVersion} to ${currentVersion}...`);
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
          console.log('Cleaned old client caches successfully.');
        } catch (e) {
          console.warn('Could not clear caches:', e);
        }
      }
      localStorage.setItem('pos_installed_version', currentVersion);
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      const doRegister = () => {
        navigator.serviceWorker.register('./sw.js?v=2.5.1')
          .then((reg) => {
            console.log('POS Service Worker registered successfully:', reg.scope);
            // Check for updates immediately
            reg.update().catch(() => {});

            // Auto reload when a new service worker takes over
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              console.log('POS Service Worker updated and claimed clients. Reloading...');
              window.location.reload();
            });
          })
          .catch((err) => {
            console.warn('POS Service Worker registration failed:', err);
          });
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        doRegister();
      } else {
        window.addEventListener('load', doRegister);
      }
    }
  }

  /**
   * Force update POS App: Unregisters all service workers, purges caches, and reloads
   */
  async forceUpdateApp() {
    try {
      window.app?.showLoading(true, 'جاري مسح الكاش وتحديث التطبيق لأحدث إصدار...');
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
      localStorage.setItem('pos_installed_version', '2.4.0');
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname + '?reload=' + Date.now();
      }, 500);
    } catch (e) {
      window.location.reload();
    }
  }

  listenInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent automatic mini-infobar
      e.preventDefault();
      this.deferredPrompt = e;

      // Reveal install buttons
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
      window.app?.showToast('تم تثبيت تطبيق الكاشير بنجاح على جهازك 🎉', 'success');
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
    // 1. If Chrome / Android / Edge install prompt is ready
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        this.deferredPrompt = null;
      }
      return;
    }

    // 2. If iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      this.showIOSInstructions();
      return;
    }

    // 3. Fallback alert / modal
    window.app?.showToast('لتثبيت التطبيق: افتح قائمة المتصفح (⋮) واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".', 'info');
  }

  showIOSInstructions() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full flex flex-col gap-4 shadow-2xl text-center">
        <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 mx-auto flex items-center justify-center font-bold text-xl">
          📲
        </div>
        <h3 class="text-base font-bold text-gray-900 dark:text-white">تثبيت التطبيق على جهازك (iOS)</h3>
        <div class="flex flex-col gap-3 text-xs text-gray-600 dark:text-gray-300 text-right leading-relaxed bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">1</span>
            <span>اضغط على زر <b>المشاركة (Share ⎋)</b> في أسفل المتصفح.</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">2</span>
            <span>مرر لأسفل واختر <b>إضافة إلى الشاشة الرئيسية ➕ (Add to Home Screen)</b>.</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">3</span>
            <span>اضغط على <b>إضافة (Add)</b> في أعلى اليمين.</span>
          </div>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md">
          حسناً، فهمت
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

window.pwaManager = new PWAManager();
