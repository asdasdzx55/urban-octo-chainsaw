/**
 * Syrian Home POS - Security & Authentication Controller (v2.5.4)
 * يتيح قفل الكاشير بكلمة مرور الأدمن الرسمية مع دعم المزامنة السحابية والعمل دون إنترنت
 */

class PosAuthController {
  constructor() {
    this.sessionKey = 'syrian_pos_session_v1';
    this.offlineHashKey = 'syrian_pos_admin_hash_v1';
    this.isAuthenticated = false;
    this.currentUser = null;
  }

  async init() {
    const session = this.getSession();
    const overlay = document.getElementById('pos-auth-overlay');

    if (session && session.authenticated) {
      this.isAuthenticated = true;
      this.currentUser = session.user || 'admin';
      if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
      }
      this.updateHeaderUserInfo();
    } else {
      this.showLockScreen();
    }

    this.setupListeners();
  }

  getSession() {
    try {
      // Check localStorage first so login survives page reload / F5, fallback to sessionStorage
      const raw = localStorage.getItem(this.sessionKey) || sessionStorage.getItem(this.sessionKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.authenticated) {
        // Keep both in sync
        try { sessionStorage.setItem(this.sessionKey, raw); } catch(e) {}
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  showLockScreen() {
    this.isAuthenticated = false;
    const overlay = document.getElementById('pos-auth-overlay');
    if (overlay) {
      overlay.classList.remove('hidden', 'opacity-0');
      overlay.classList.add('flex');
      const passInput = document.getElementById('pos-auth-password');
      if (passInput) {
        passInput.value = '';
        setTimeout(() => passInput.focus(), 100);
      }
      const errBox = document.getElementById('pos-auth-error');
      if (errBox) errBox.classList.add('hidden');
    }
  }

  lockScreen() {
    localStorage.removeItem(this.sessionKey);
    sessionStorage.removeItem(this.sessionKey);
    this.showLockScreen();
    if (window.app?.closeDrawerMenu) {
      window.app.closeDrawerMenu();
    }
  }

  setupListeners() {
    const form = document.getElementById('pos-auth-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    const passInput = document.getElementById('pos-auth-password');
    if (passInput) {
      passInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleLogin();
        }
      });
    }
  }

  async handleLogin() {
    const passInput = document.getElementById('pos-auth-password');
    const errBox = document.getElementById('pos-auth-error');
    const submitBtn = document.getElementById('pos-auth-submit-btn');
    const password = passInput ? passInput.value.trim() : '';

    if (!password) {
      if (errBox) {
        errBox.textContent = 'يرجى إدخال كلمة المرور أولاً!';
        errBox.classList.remove('hidden');
      }
      return;
    }

    if (errBox) errBox.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">🔄</span> جاري التحقق...';
    }

    try {
      let isVerified = false;
      let userName = 'admin';

      // 1. التحقق عبر السيرفر وقاعدة البيانات المباشرة
      if (window.api && typeof window.api.verifyAdminPassword === 'function') {
        try {
          const res = await window.api.verifyAdminPassword(password);
          if (res && res.success) {
            isVerified = true;
            userName = res.username || 'admin';
            // حفظ الهاش محلياً للطوارئ في حالة انقطاع النت
            const hash = await this.hashPassword(password);
            localStorage.setItem(this.offlineHashKey, hash);
          } else if (res && res.error) {
            this.showError(res.error);
          }
        } catch (netErr) {
          console.warn('[POS Auth] Server check failed, trying offline fallback...', netErr);
        }
      }

      // 2. فحص أوفلاين إذا تعذر الاتصال بالسيرفر
      if (!isVerified) {
        const localHash = localStorage.getItem(this.offlineHashKey);
        const inputHash = await this.hashPassword(password);

        if (localHash && localHash === inputHash) {
          isVerified = true;
          userName = 'admin (أوفلاين)';
        } else if (password === '1234' || password === 'admin123') {
          // الباسورد الافتراضي المعتمد لنظام الديسكتوب
          isVerified = true;
          userName = 'admin';
          localStorage.setItem(this.offlineHashKey, inputHash);
        }
      }

      if (isVerified) {
        this.isAuthenticated = true;
        this.currentUser = userName;
        const sessionData = JSON.stringify({
          authenticated: true,
          user: userName,
          time: new Date().toISOString()
        });
        localStorage.setItem(this.sessionKey, sessionData);
        sessionStorage.setItem(this.sessionKey, sessionData);

        const overlay = document.getElementById('pos-auth-overlay');
        if (overlay) {
          overlay.classList.add('opacity-0');
          setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex', 'opacity-0');
          }, 250);
        }

        this.updateHeaderUserInfo();

        // تشغيل صوت خفيف أو تنبيه ترحيبي
        if (window.soundManager?.play) {
          window.soundManager.play('beep');
        }
      } else {
        this.showError('كلمة المرور غير صحيحة! يرجى إدخال كلمة مرور الأدمن.');
      }
    } catch (err) {
      console.error('[POS Auth] Error during login:', err);
      this.showError('حدث خطأ أثناء فحص كلمة المرور.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>دخول الكاشير</span> <i data-lucide="log-in" class="w-4 h-4 mr-1"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  showError(msg) {
    const errBox = document.getElementById('pos-auth-error');
    if (errBox) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    }
    const passInput = document.getElementById('pos-auth-password');
    if (passInput) {
      passInput.classList.add('border-rose-500', 'animate-shake');
      setTimeout(() => {
        passInput.classList.remove('border-rose-500', 'animate-shake');
        passInput.focus();
        passInput.select();
      }, 600);
    }
  }

  async hashPassword(str) {
    if (window.crypto && window.crypto.subtle) {
      const buf = new TextEncoder().encode(str);
      const hashBuf = await window.crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback بسيط إذا لم يتوفر Web Crypto
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  togglePasswordVisibility() {
    const input = document.getElementById('pos-auth-password');
    const icon = document.getElementById('pos-auth-eye-icon');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  numpadClick(val) {
    const input = document.getElementById('pos-auth-password');
    if (!input) return;
    if (val === 'clear') {
      input.value = '';
    } else if (val === 'backspace') {
      input.value = input.value.slice(0, -1);
    } else {
      input.value += val;
    }
    input.focus();
  }

  updateHeaderUserInfo() {
    const userBadge = document.getElementById('header-user-badge');
    if (userBadge) {
      userBadge.textContent = this.currentUser ? `👤 ${this.currentUser}` : '👤 كاشير';
    }
  }
}

// إنشاء النسخة العامة للمتحكم
window.posAuth = new PosAuthController();
document.addEventListener('DOMContentLoaded', () => {
  window.posAuth.init();
});
