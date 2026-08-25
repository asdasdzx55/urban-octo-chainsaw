/**
 * Scanner Controller
 * Powered by Html5Qrcode for real-time live video and image file decoding.
 */

class ScannerController {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.currentCameraId = null;
    this.availableCameras = [];
    this.isTorchOn = false;
    this.hasTorchCapability = false;
    this.lastScannedText = null;
    this.lastScannedTime = 0;
    this.scanDelayMs = 2000; // 2 seconds delay to avoid immediate duplicates in continuous mode
    this.continuousMode = true;
    this.facingMode = "environment"; // default to back camera on mobile
  }

  async initCameras() {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        this.availableCameras = devices;
        const cameraSelect = document.getElementById('camera-select');
        if (cameraSelect) {
          cameraSelect.innerHTML = '';
          devices.forEach((cam, index) => {
            const opt = document.createElement('option');
            opt.value = cam.id;
            opt.text = cam.label || `كاميرا ${index + 1}`;
            cameraSelect.appendChild(opt);
          });
          // Prefer environment/back camera
          const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') || d.label.toLowerCase().includes('خلفية'));
          this.currentCameraId = backCam ? backCam.id : devices[0].id;
          cameraSelect.value = this.currentCameraId;
        }
        return true;
      } else {
        console.warn("No cameras found");
        return false;
      }
    } catch (err) {
      console.warn("Camera enumeration error:", err);
      return false;
    }
  }

  async startLiveScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;

    if (this.isScanning) {
      await this.stopLiveScanner();
    }

    this.html5QrCode = new Html5Qrcode("reader");

    const config = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        // Dynamic adaptive scanning box
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxEdge = Math.floor(minEdge * 0.75);
        return {
          width: qrboxEdge,
          height: qrboxEdge
        };
      },
      aspectRatio: 1.0,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.PDF_417,
        Html5QrcodeSupportedFormats.ITF
      ]
    };

    const cameraConfig = this.currentCameraId ? { deviceId: { exact: this.currentCameraId } } : { facingMode: this.facingMode };

    try {
      document.getElementById('scanner-loading')?.classList.remove('hidden');
      document.getElementById('scanner-placeholder')?.classList.add('hidden');
      document.getElementById('laser-guide')?.classList.remove('hidden');

      await this.html5QrCode.start(
        cameraConfig,
        config,
        (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
        (errorMessage) => {
          // Ignored per frame to avoid spam
        }
      );

      this.isScanning = true;
      document.getElementById('scanner-loading')?.classList.add('hidden');
      document.getElementById('btn-toggle-scan')?.classList.add('btn-running');
      this.updateScannerStatusText('scanning');

      // Check for torch capability
      this.checkTorchSupport();

    } catch (err) {
      console.error("Unable to start scanning:", err);
      this.isScanning = false;
      document.getElementById('scanner-loading')?.classList.add('hidden');
      document.getElementById('scanner-placeholder')?.classList.remove('hidden');
      document.getElementById('laser-guide')?.classList.add('hidden');
      window.app?.showToast(window.app?.t('camera_permission_denied') || 'تعذر تشغيل الكاميرا. يرجى التحقق من أذونات الكاميرا.', 'error');
    }
  }

  async stopLiveScanner() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (e) {
        console.warn("Stop scanner error:", e);
      }
      this.isScanning = false;
      this.isTorchOn = false;
      this.updateTorchUI();
      document.getElementById('laser-guide')?.classList.add('hidden');
      document.getElementById('scanner-placeholder')?.classList.remove('hidden');
      this.updateScannerStatusText('paused');
    }
  }

  async toggleLiveScanner() {
    if (this.isScanning) {
      await this.stopLiveScanner();
    } else {
      await this.startLiveScanner();
    }
  }

  async switchCamera(cameraId) {
    this.currentCameraId = cameraId;
    if (this.isScanning) {
      await this.stopLiveScanner();
      await this.startLiveScanner();
    }
  }

  async flipCamera() {
    if (this.availableCameras.length > 1) {
      const currentIndex = this.availableCameras.findIndex(c => c.id === this.currentCameraId);
      const nextIndex = (currentIndex + 1) % this.availableCameras.length;
      this.currentCameraId = this.availableCameras[nextIndex].id;
      const select = document.getElementById('camera-select');
      if (select) select.value = this.currentCameraId;
      await this.switchCamera(this.currentCameraId);
    } else {
      this.facingMode = this.facingMode === "environment" ? "user" : "environment";
      if (this.isScanning) {
        await this.stopLiveScanner();
        await this.startLiveScanner();
      }
    }
  }

  async checkTorchSupport() {
    const torchBtn = document.getElementById('btn-torch');
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
    if (!this.html5QrCode || !this.isScanning) return;
    try {
      this.isTorchOn = !this.isTorchOn;
      await this.html5QrCode.applyVideoConstraints({
        advanced: [{ torch: this.isTorchOn }]
      });
      this.updateTorchUI();
    } catch (err) {
      console.warn("Failed to toggle torch", err);
    }
  }

  updateTorchUI() {
    const torchBtn = document.getElementById('btn-torch');
    if (!torchBtn) return;
    if (this.isTorchOn) {
      torchBtn.classList.add('bg-amber-500', 'text-white');
      torchBtn.classList.remove('bg-gray-800/80', 'text-gray-300');
    } else {
      torchBtn.classList.remove('bg-amber-500', 'text-white');
      torchBtn.classList.add('bg-gray-800/80', 'text-gray-300');
    }
  }

  updateScannerStatusText(status) {
    const badge = document.getElementById('scanner-status-badge');
    if (!badge) return;
    if (status === 'scanning') {
      badge.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse mr-1.5 ml-1.5"></span> ${window.app?.t('status_active') || 'جاري المسح المباشر...'}`;
      badge.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
    } else {
      badge.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-gray-400 mr-1.5 ml-1.5"></span> ${window.app?.t('status_paused') || 'المسح متوقف'}`;
      badge.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20";
    }
  }

  onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    // Prevent rapid-fire accidental double scans
    if ((now - this.lastScannedTime) < 800) {
      return;
    }
    // Prevent duplicated rapid fire scans of the same code
    if (decodedText === this.lastScannedText && (now - this.lastScannedTime) < this.scanDelayMs) {
      return;
    }

    this.lastScannedText = decodedText;
    this.lastScannedTime = now;

    // Trigger audio & vibration feedback
    window.soundController?.playSuccessBeep();

    // Format detection
    const formatName = decodedResult?.result?.format?.formatName || 'QR_CODE';

    // Dispatch to global app state
    if (window.app) {
      window.app.handleScanResult(decodedText, formatName, 'camera');
    }

    // If single scan mode, pause scanner
    if (!this.continuousMode) {
      this.stopLiveScanner();
    }
  }

  /**
   * Scan barcode from an Image File or Blob
   */
  async scanImageFile(file) {
    if (!file) return;

    const fileReader = new Html5Qrcode("image-temp-reader", { verbose: false });
    const previewContainer = document.getElementById('image-scan-preview');
    const previewImg = document.getElementById('preview-image-element');

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg && previewContainer) {
        previewImg.src = e.target.result;
        previewContainer.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);

    try {
      window.app?.showLoading(true, window.app?.t('decoding_image') || 'جاري تحليل الصورة واستخراج الكود...');
      
      const decodedResult = await fileReader.scanFileV2(file, true);
      window.app?.showLoading(false);

      if (decodedResult && decodedResult.decodedText) {
        window.soundController?.playSuccessBeep();
        const formatName = decodedResult.result?.format?.formatName || 'UNKNOWN';
        window.app?.handleScanResult(decodedResult.decodedText, formatName, 'file');
        window.app?.showToast(window.app?.t('scan_success') || 'تم استخراج الكود بنجاح!', 'success');
      } else {
        throw new Error("No barcode detected");
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.soundController?.playErrorTone();
      window.app?.showToast(window.app?.t('no_barcode_found') || 'لم يتم العثور على باركود واضح في هذه الصورة. يرجى تجربة صورة ذات إضاءة أفضل.', 'error');
    } finally {
      try {
        fileReader.clear();
      } catch (e) {}
    }
  }
}

window.scannerController = new ScannerController();
