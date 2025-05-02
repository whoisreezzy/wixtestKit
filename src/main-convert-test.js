import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';

let timerEl;
let timerInterval;
let flashBtn, screenFlash, flashOn = false, supportsTorch = false;
// Load ffmpeg.wasm via CDN if not already loaded
async function loadFFmpegScript() {
  if (window.FFmpeg && typeof FFmpeg.createFFmpeg === 'function') return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ffmpeg script'));
    document.head.appendChild(script);
  });
}

const API_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzQ1ODUyMzQ2LCJzdWIiOiIzYjNjZWVjNy1iNWY2LTQxNDUtOTZiYy0wYWE3ZDJkNDJjOGZ-U1RBR0lOR343NDlkNThlYy1hMDFkLTQwYzgtYTAyYi1mZmVjMjJmYzU0YWEifQ.HBMfpeAj-jddS_0D7t1ZS6WO_bHFBGRgC4VZLw8sBlU';
const LENS_GROUP_ID = 'f01d35c1-cfc6-4960-b3c9-de2ce373053a';
const LENS_ID = '5023539e-5104-4286-85a6-936c2ad2d911';

let facingMode = 'user';
let session, liveCanvas;
let originalMediaStream;

const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isMobile) {
  document.getElementById('switch-camera-btn')?.style.setProperty('display', 'block');
}

async function initializeCameraKit() {
  const cameraKit = await bootstrapCameraKit({ apiToken: API_TOKEN });
  session = await cameraKit.createSession();
  session.events.addEventListener('error', e => console.error('CameraKit Error:', e.detail));

  await startCamera();

  const lens = await cameraKit.lensRepository.loadLens(LENS_ID, LENS_GROUP_ID);
  if (lens) await session.applyLens(lens);
  await session.play();

  setupCaptureLogic();
}

async function startCamera() {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      facingMode
    },
    audio: true
  });
  originalMediaStream = mediaStream;

  // Определяем поддержку физической вспышки и показываем кнопку
  const videoTrack = mediaStream.getVideoTracks()[0];
  const capabilities = videoTrack.getCapabilities();
  supportsTorch = !!capabilities.torch;
  flashBtn.style.display = 'block';
  flashBtn.style.background = flashOn ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.6)';

  const cameraSource = createMediaStreamSource(mediaStream, {
    transform: facingMode === 'user' ? Transform2D.MirrorX : Transform2D.None,
    cameraType: facingMode
  });

  await session.setSource(cameraSource);

  const canvasContainer = document.getElementById('canvas-container');
  canvasContainer.innerHTML = '';
  liveCanvas = session.output.live;
  liveCanvas.style.width = '100vw';
  liveCanvas.style.height = '100vh';
  liveCanvas.style.transform = 'none';
  canvasContainer.appendChild(liveCanvas);
}

function setupCaptureLogic() {
  const captureBtn = document.getElementById('capture-btn');
  let mediaRecorder, recordedChunks = [], pressTimer, recordingStarted = false;

  const takePhoto = () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = liveCanvas.width;
    tempCanvas.height = liveCanvas.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(liveCanvas, 0, 0);

    // Записываем JPEG с качеством 0.8 вместо PNG
    tempCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'snap-photo.jpg';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.8);
  };

  let recordingTimeout;

  const startRecording = () => {
    const canvasStream = liveCanvas.captureStream(30);
    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...originalMediaStream.getAudioTracks()
    ]);
    mediaRecorder = new MediaRecorder(mixedStream, {
      mimeType: 'video/webm; codecs=vp8',
      videoBitsPerSecond: 3000000,
      audioBitsPerSecond: 96000  
    });
    recordedChunks = [];

    // Показать таймер в формате “0s”…“15s”
    let seconds = 0;
    timerEl.textContent = `${seconds}`;
    timerEl.style.display = 'block';
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = `${seconds}`;
      if (seconds >= 15) {
        clearInterval(timerInterval);
        timerEl.style.display = 'none';
        stopRecording();
      }
    }, 1000);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      clearTimeout(recordingTimeout);
      captureBtn.classList.remove('recording');
      recordingStarted = false;

      // Hide and clear the timer
      clearInterval(timerInterval);
      timerEl.style.display = 'none';

      const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });
      const mp4Blob = await convertWebmToMp4(webmBlob);
      const url = URL.createObjectURL(mp4Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whoisreezzy.mp4';
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    // Авто-стоп через 15 секунд, включая сброс UI и флагов
    recordingTimeout = setTimeout(() => {
      stopRecording();
    }, 15000);

    captureBtn.classList.add('recording');
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      captureBtn.classList.remove('recording');
      recordingStarted = false;
      clearTimeout(recordingTimeout);

      // Hide and clear the timer
      clearInterval(timerInterval);
      timerEl.style.display = 'none';
    }
  };

  const startPress = () => pressTimer = setTimeout(() => { recordingStarted = true; startRecording() }, 300);
  const endPress = () => {
    clearTimeout(pressTimer);
    if (recordingStarted) { stopRecording(); recordingStarted = false } else takePhoto();
  };

  captureBtn.addEventListener('mousedown', startPress);
  captureBtn.addEventListener('mouseup', endPress);
  captureBtn.addEventListener('mouseleave', () => clearTimeout(pressTimer));
  captureBtn.addEventListener('touchstart', e => { e.preventDefault(); startPress() }, { passive: false });
  captureBtn.addEventListener('touchend', e => { e.preventDefault(); endPress() }, { passive: false });
  captureBtn.addEventListener('touchcancel', () => clearTimeout(pressTimer));
}

document.getElementById('switch-camera-btn')?.addEventListener('click', async () => {
  facingMode = (facingMode === 'user') ? 'environment' : 'user';
  await startCamera();

  // Сброс состояния вспышки при смене камеры
  flashOn = false;
  flashBtn.style.background = 'rgba(255,255,255,0.6)';
  screenFlash.style.display = 'none';
  if (supportsTorch) {
    try {
      await originalMediaStream.getVideoTracks()[0]
        .applyConstraints({ advanced: [{ torch: false }] });
    } catch (e) {
      console.warn('Не удалось сбросить torch при смене камеры:', e);
    }
  }
});

async function convertWebmToMp4(webmBlob) {
  // ensure ffmpeg is loaded
  await loadFFmpegScript();
  const ffmpeg = FFmpeg.createFFmpeg({ log: true });
  await ffmpeg.load();

  // write webm data
  const webmData = await webmBlob.arrayBuffer();
  ffmpeg.FS('writeFile', 'input.webm', new Uint8Array(webmData));

  // convert to mp4
  await ffmpeg.run(
    '-i', 'input.webm',
    '-r', '30',     
    '-c:v', 'libx264',
    '-crf', '26',        
    '-preset', 'ultrafast',
    '-c:a', 'aac',
    '-b:a', '96k',  
    'output.mp4'
  );

  // read result
  const mp4Data = ffmpeg.FS('readFile', 'output.mp4');
  return new Blob([mp4Data.buffer], { type: 'video/mp4' });
}


// Wait for the ffmpeg script to load, then initialize CameraKit
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadFFmpegScript();
  } catch (e) {
    console.error('FFmpeg load error:', e);
  }
  timerEl = document.getElementById('record-timer');
  // Инициализация кнопок
  flashBtn     = document.getElementById('flash-btn');
  screenFlash  = document.getElementById('screen-flash');
  const painterBtn = document.getElementById('painter-btn');

  // Инициализируем CameraKit
  initializeCameraKit().catch(console.error);

  // Показываем кнопку шаринга фото, если доступен Web Share API
  const sharePhotoBtn = document.getElementById('share-photo-btn');
  console.log('navigator.share support:', !!navigator.share);
  if (navigator.share) {
    sharePhotoBtn.style.display = 'block';
    sharePhotoBtn.addEventListener('click', async () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = liveCanvas.width;
      tempCanvas.height = liveCanvas.height;
      tempCanvas.getContext('2d').drawImage(liveCanvas, 0, 0);

      tempCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'snap-photo.jpg', { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
          } catch (err) {
            console.error('Ошибка Web Share для фото:', err);
          }
        } else {
          console.warn('Шэринг файлов не поддерживается этим браузером.');
        }
      }, 'image/jpeg', 0.8);
    });
  }

  // Обработчик кнопки вспышки/подсветки
  flashBtn.addEventListener('click', async () => {
    flashOn = !flashOn;
    // Обновляем индикатор кнопки (opacity)
    flashBtn.style.background = flashOn ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.6)';

    if (supportsTorch) {
      // Включаем/выключаем физическую вспышку
      try {
        await originalMediaStream.getVideoTracks()[0]
          .applyConstraints({ advanced: [{ torch: flashOn }] });
      } catch (e) {
        console.warn('Не удалось переключить torch:', e);
      }
    } else {
      // Фallback – экранная подсветка
      screenFlash.style.display = flashOn ? 'block' : 'none';
    }
  });

  // Показываем и обрабатываем кнопку художника
  painterBtn.style.display = 'block';
  painterBtn.addEventListener('click', () => {
    window.open('https://whoisreezzy.com', '_blank');
  });
});