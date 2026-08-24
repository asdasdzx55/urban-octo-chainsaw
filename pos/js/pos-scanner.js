/**
 * POS Barcode Scanner Controller
 * Integrates:
 * 1. Live Camera Scanning via Html5Qrcode
 * 2. Hardware Barcode Gun (Keyboard wedge listener)
 * 3. POS Audio confirmation synthesizer
 */

class POSScanner {
  constructor() {
    this.html5QrCode = null;
    this.isCameraScanning = false;
    this.currentCameraId = null;
    this.availableCameras = [];
    this.audioCtx = null;
    this.soundEnabled = true;

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
      // Don't capture when typing in text input/textarea
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = tag === 'input' || tag === 'textarea';

      // Barcode scanners type very rapidly (< 35ms between key events)
      const now = Date.now();
      const diff = now - this.lastKeyTime;
      this.lastKeyTime = now;

      if (e.key === 'Enter') {
        if (this.hardwareBuffer.length >= 3) {
          const barcode = this.hardwareBuffer.trim();
          this.hardwareBuffer = '';
          if (!isInput) {
            e.preventDefault();
            this.handleScannedBarcode(barcode, 'hardware_gun');
          }
        }
        this.hardwareBuffer = '';
        return;
      }

      if (e.key.length === 1) {
        if (diff > 120 && this.hardwareBuffer.length > 0) {
          // Reset buffer if delay too long (manual human typing)
          this.hardwareBuffer = '';
        }
        this.hardwareBuffer += e.key;

        // Auto clear after 400ms idle
        clearTimeout(this.hardwareScanTimeout);
        this.hardwareScanTimeout = setTimeout(() => {
          this.hardwareBuffer = '';
        }, 400);
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

  async startCamera() {
    if (this.isCameraStarting) return;
    this.isCameraStarting = true;

    try {
      if (this.isCameraScanning) {
        await this.stopCamera();
      }

      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode("pos-camera-reader");
      }

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      };

      await this.html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          this.handleScannedBarcode(decodedText, 'camera');
        },
        () => {}
      );
      this.isCameraScanning = true;
    } catch (err) {
      console.warn("Camera open error:", err);
      // Fallback: try default camera if facingMode: environment failed
      try {
        if (this.html5QrCode) {
          await this.html5QrCode.start(
            true,
            { fps: 15, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              this.handleScannedBarcode(decodedText, 'camera');
            },
            () => {}
          );
          this.isCameraScanning = true;
          return;
        }
      } catch (e) {
        console.error("Camera fallback error:", e);
      }
      window.app?.showToast('يرجى السماح بصلاحية الكاميرا للمتصفح.', 'error');
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
    }
  }

  /* ==================== DISPATCH BARCODE TO POS ==================== */
  handleScannedBarcode(barcode, source = 'scanner') {
    if (!barcode) return;
    this.playSuccessBeep();

    // 1. If scanning directly into the Add/Edit Product input field
    if (window.inventoryController && window.inventoryController.isScanningToInputField) {
      this.closeCameraModal();
      window.inventoryController.setScannedBarcode(barcode);
      return;
    }

    // 2. If in inventory search mode
    if (window.app && window.app.currentView === 'inventory') {
      this.closeCameraModal();
      window.inventoryController?.searchProductForAudit(barcode);
    } else {
      // 3. Normal POS sale scanning
      if (window.cart) {
        window.cart.addProductByBarcode(barcode);
      }
    }
  }
}

window.posScanner = new POSScanner();
