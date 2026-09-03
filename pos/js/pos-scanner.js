/**
 * POS Barcode Scanner Controller
 * Integrates:
 * 1. Live Camera Scanning via Html5Qrcode with 1D/2D optimizations
 * 2. Smart Debounce & Cooldown Engine (prevents 500 scans/sec duplicate loop)
 * 3. Hardware Barcode Gun (Keyboard wedge listener)
 * 4. Audio confirmation synthesizer
 */

class POSScanner {
  constructor() {
    this.html5QrCode = null;
    this.isCameraScanning = false;
    this.isCameraStarting = false;
    this.currentCameraId = null;
    this.availableCameras = [];
    this.audioCtx = null;
    this.soundEnabled = true;
    this.isTorchOn = false;
    this.hasTorchCapability = false;
    this.autoCloseAfterScan = false;

    // Cooldown & Debounce Configuration
    this.lastScannedCode = null;
    this.lastScannedTime = 0;
    this.sameCodeCooldownMs = 2200; // 2.2 seconds delay before re-scanning the exact same barcode
    this.globalScanCooldownMs = 800; // 0.8 second pause between any two different scans

    // Hardware Scanner Buffer variables
    this.hardwareBuffer = '';
    this.lastKeyTime = 0;
    this.hardwareScanTimeout = null;

    this.initHardwareListener();
  }

  /* ==================== SOUND SYNTHESIZER ==================== */
  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.audioCtx = new AudioContext();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playSuccessBeep() {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(2800, now + 0.07);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.1);

      if ('vibrate' in navigator) navigator.vibrate([45]);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  playErrorTone() {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.2);

      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    } catch (e) {}
  }

  /* ==================== HARDWARE BARCODE GUN LISTENER ==================== */
  initHardwareListener() {
    window.addEventListener('keydown', (e) => {
      // If user is typing in ANY input or textarea, let the input handle it naturally!
      const activeEl = document.activeElement;
      const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
      const isInput = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;

      if (isInput) return;

      const now = Date.now();
      const diff = now - this.lastKeyTime;
      this.lastKeyTime = now;

      if (e.key === 'Enter') {
        if (this.hardwareBuffer.length >= 2) {
          const barcode = this.hardwareBuffer.trim();
          this.hardwareBuffer = '';
          e.preventDefault();
          this.onDecodedText(barcode, 'hardware_gun');
        }
        this.hardwareBuffer = '';
        return;
      }

      if (e.key.length === 1) {
        if (diff > 120 && this.hardwareBuffer.length > 0) {
          this.hardwareBuffer = '';
        }
        this.hardwareBuffer += e.key;

        clearTimeout(this.hardwareScanTimeout);
        this.hardwareScanTimeout = setTimeout(() => {
          this.hardwareBuffer = '';
        }, 300);
      }
    });
  }

  /* ==================== CAMERA LIVE SCANNER ==================== */
  async openCameraModal() {
    const modal = document.getElementById('camera-scanner-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();

    // Reset feedback banner
    this.updateScanFeedback('', false);

    await this.initCamerasList();
    await this.startCamera();
  }

  closeCameraModal() {
    const modal = document.getElementById('camera-scanner-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    this.stopCamera();
    if (window.inventoryController) {
      window.inventoryController.isScanningToInputField = false;
    }
  }

  async initCamerasList() {
    try {
      if (typeof Html5Qrcode === 'undefined') return;
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        this.availableCameras = devices;
        const select = document.getElementById('pos-camera-select');
        if (select) {
          select.innerHTML = '';
          devices.forEach((cam, index) => {
            const opt = document.createElement('option');
            opt.value = cam.id;
            opt.text = cam.label || `كاميرا ${index + 1}`;
            select.appendChild(opt);
          });
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('خلفية')
          );
          this.currentCameraId = backCam ? backCam.id : devices[0].id;
          select.value = this.currentCameraId;
          select.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.warn("Cameras list error:", e);
    }
  }

  async startCamera() {
    if (this.isCameraStarting) return;
    this.isCameraStarting = true;

    try {
      if (this.isCameraScanning) {
        await this.stopCamera();
      }

      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode("pos-camera-reader", { verbose: false });
      }

      // Configuration optimized for both 1D Barcodes (EAN-13, Code-128) and 2D QR Codes
      const config = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Wide rectangular bounding box suited for horizontal scale barcodes
          const width = Math.floor(Math.min(viewfinderWidth * 0.90, 360));
          const height = Math.floor(Math.min(viewfinderHeight * 0.55, 180));
          return { width, height };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
        config.formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ];
      }

      const cameraConfig = this.currentCameraId ? { deviceId: { exact: this.currentCameraId } } : { facingMode: "environment" };

      await this.html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => {
          this.onDecodedText(decodedText, 'camera');
        },
        () => {}
      );

      this.isCameraScanning = true;
      this.checkTorchSupport();
    } catch (err) {
      console.warn("Camera start primary failed, attempting fallback:", err);
      try {
        if (this.html5QrCode) {
          await this.html5QrCode.start(
            { facingMode: "environment" },
            { fps: 15, qrbox: { width: 280, height: 160 } },
            (decodedText) => this.onDecodedText(decodedText, 'camera'),
            () => {}
          );
          this.isCameraScanning = true;
          return;
        }
      } catch (e) {
        console.error("Camera fallback failed:", e);
      }
      window.app?.showToast('يرجى منح الإذن للوصول إلى الكاميرا في المتصفح.', 'error');
    } finally {
      this.isCameraStarting = false;
    }
  }

  async stopCamera() {
    if (this.html5QrCode && this.isCameraScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (e) {}
      this.isCameraScanning = false;
      this.isTorchOn = false;
    }
  }

  async switchCamera(cameraId) {
    this.currentCameraId = cameraId;
    if (this.isCameraScanning) {
      await this.stopCamera();
      await this.startCamera();
    }
  }

  async flipCamera() {
    if (this.availableCameras.length > 1) {
      const idx = this.availableCameras.findIndex(c => c.id === this.currentCameraId);
      const nextIdx = (idx + 1) % this.availableCameras.length;
      this.currentCameraId = this.availableCameras[nextIdx].id;
      const select = document.getElementById('pos-camera-select');
      if (select) select.value = this.currentCameraId;
      await this.switchCamera(this.currentCameraId);
    }
  }

  async checkTorchSupport() {
    const torchBtn = document.getElementById('pos-btn-torch');
    if (!torchBtn) return;
    try {
      const track = this.html5QrCode?.getRunningTrackCameraCapabilities();
      if (track && track.torchFeature && track.torchFeature().isSupported()) {
        this.hasTorchCapability = true;
        torchBtn.classList.remove('hidden');
      } else {
        this.hasTorchCapability = false;
        torchBtn.classList.add('hidden');
      }
    } catch (e) {
      torchBtn.classList.add('hidden');
    }
  }

  async toggleTorch() {
    if (!this.html5QrCode || !this.isCameraScanning) return;
    try {
      this.isTorchOn = !this.isTorchOn;
      await this.html5QrCode.applyVideoConstraints({
        advanced: [{ torch: this.isTorchOn }]
      });
      const torchBtn = document.getElementById('pos-btn-torch');
      if (torchBtn) {
        if (this.isTorchOn) {
          torchBtn.classList.add('bg-amber-500', 'text-white');
          torchBtn.classList.remove('bg-gray-800', 'text-gray-300');
        } else {
          torchBtn.classList.remove('bg-amber-500', 'text-white');
          torchBtn.classList.add('bg-gray-800', 'text-gray-300');
        }
      }
    } catch (e) {
      console.warn("Torch toggle error:", e);
    }
  }

  /* ==================== SMART DEBOUNCE & SCAN DISPATCH ==================== */
  onDecodedText(decodedText, source = 'camera') {
    const cleanCode = String(decodedText || '').trim();
    if (!cleanCode) return;

    const now = Date.now();
    const elapsedSinceLastScan = now - this.lastScannedTime;

    // 1. Global cooldown: ignore any scan within 800ms
    if (elapsedSinceLastScan < this.globalScanCooldownMs) {
      return;
    }

    // 2. Same-code cooldown: ignore identical barcode within 2.2 seconds
    if (cleanCode === this.lastScannedCode && elapsedSinceLastScan < this.sameCodeCooldownMs) {
      return;
    }

    // Mark current code and timestamp
    this.lastScannedCode = cleanCode;
    this.lastScannedTime = now;

    // Dispatch valid scan
    this.handleScannedBarcode(cleanCode, source);
  }

  handleScannedBarcode(barcode, source = 'scanner') {
    if (!barcode) return;

    // Audio & vibration feedback
    this.playSuccessBeep();

    const parsed = window.BarcodeParser ? window.BarcodeParser.parse(barcode) : {
      isScale: /^20\d{11}$/.test(barcode),
      itemCode: /^20\d{11}$/.test(barcode) ? barcode.slice(2, 7) : barcode,
      weight: /^20\d{11}$/.test(barcode) ? parseFloat((parseInt(barcode.slice(7, 12), 10) / 1000).toFixed(3)) : null
    };

    // Visual feedback in Camera Modal
    const feedbackText = parsed.isScale 
      ? `✅ تم المسح: صنف ميزان (كود: ${parsed.itemCode} • وزن: ${parsed.weight} كجم)`
      : `✅ تم المسح: ${barcode}`;
    this.updateScanFeedback(feedbackText, true);

    // 0. Auto-Detect Invoice Barcode (e.g. INV-14, INV-27, ORD-...) from ANY view
    const upperCode = String(barcode).trim().toUpperCase();
    if (upperCode.startsWith('INV-') || upperCode.startsWith('ORD-')) {
      if (this.autoCloseAfterScan) this.closeCameraModal();
      window.app?.showToast(`تم مسح باركود الفاتورة: ${barcode} 🧾`, 'info');
      window.app?.switchView('returns');
      setTimeout(() => {
        window.returnsController?.searchInvoice(barcode);
      }, 150);
      return;
    }

    // 1. If in returns/refunds mode -> look up invoice
    if (window.app && window.app.currentView === 'returns') {
      if (this.autoCloseAfterScan) this.closeCameraModal();
      window.returnsController?.searchInvoice(barcode);
      return;
    }

    // 2. If scanning directly into the Add/Edit Product input field in inventory
    if (window.inventoryController && window.inventoryController.isScanningToInputField) {
      this.closeCameraModal();
      window.inventoryController.setScannedBarcode(parsed.isScale ? parsed.itemCode : barcode);
      return;
    }

    // 2.5 If in purchases view -> route to purchasesController camera handler
    if (window.app && window.app.currentView === 'expenses' && window.expensesController?.currentMode === 'purchase') {
      if (this.autoCloseAfterScan) this.closeCameraModal();
      window.purchasesController?.handleCameraBarcodeScanned(parsed.isScale ? parsed.itemCode : barcode);
      return;
    }

    // 3. If in inventory search mode
    if (window.app && window.app.currentView === 'inventory') {
      if (this.autoCloseAfterScan) this.closeCameraModal();
      window.inventoryController?.searchProductForAudit(barcode);
    } else {
      // 4. Normal POS sale scanning
      if (window.cart) {
        window.cart.addProductByBarcode(barcode);
      }
      if (this.autoCloseAfterScan) {
        setTimeout(() => this.closeCameraModal(), 400);
      }
    }
  }

  updateScanFeedback(text, isSuccess = true) {
    const feedbackEl = document.getElementById('pos-camera-feedback');
    if (!feedbackEl) return;

    if (!text) {
      feedbackEl.classList.add('hidden');
      feedbackEl.textContent = '';
      return;
    }

    feedbackEl.textContent = text;
    feedbackEl.className = isSuccess 
      ? 'p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold text-center animate-pulse'
      : 'p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 text-xs font-bold text-center';
    feedbackEl.classList.remove('hidden');

    // Auto fade after 2 seconds
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      if (feedbackEl) feedbackEl.classList.add('hidden');
    }, 2000);
  }
}

window.posScanner = new POSScanner();

