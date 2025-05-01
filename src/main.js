import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';

const API_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzQ1ODUyMzQ2LCJzdWIiOiIzYjNjZWVjNy1iNWY2LTQxNDUtOTZiYy0wYWE3ZDJkNDJjOGZ-U1RBR0lOR343NDlkNThlYy1hMDFkLTQwYzgtYTAyYi1mZmVjMjJmYzU0YWEifQ.HBMfpeAj-jddS_0D7t1ZS6WO_bHFBGRgC4VZLw8sBlU';
const LENS_GROUP_ID = 'f01d35c1-cfc6-4960-b3c9-de2ce373053a';
const LENS_ID = '5023539e-5104-4286-85a6-936c2ad2d911';

async function startCameraKit() {
  const cameraKit = await bootstrapCameraKit({ apiToken: API_TOKEN });
  const session = await cameraKit.createSession();

  session.events.addEventListener('error', (event) => {
    console.error('CameraKit Error:', event.detail);
  });

  // 📱 Динамическое разрешение камеры
  const isMobile = window.innerWidth < 768;
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: isMobile ? 720 : 1920 },
      height: { ideal: isMobile ? 1280 : 1080 },
      facingMode: 'user'
    },
    audio: false
  });

  const cameraSource = createMediaStreamSource(mediaStream, {
    transform: Transform2D.MirrorX,
    cameraType: 'user',
  });
  await session.setSource(cameraSource);

  const canvasContainer = document.getElementById('canvas-container');
  canvasContainer.innerHTML = '';
  const liveCanvas = session.output.live;

  // ✅ Без scale, просто 100% экрана
  const aspectRatio = mediaStream.getVideoTracks()[0].getSettings().width / mediaStream.getVideoTracks()[0].getSettings().height;
  const isPortrait = window.innerHeight > window.innerWidth;
  
  if (isPortrait) {
    liveCanvas.style.width = '100vw';
    liveCanvas.style.height = (100 / aspectRatio) + 'vw';
  } else {
    liveCanvas.style.height = '100vh';
    liveCanvas.style.width = (100 * aspectRatio) + 'vh';
  }
  liveCanvas.style.transform = 'none';
  liveCanvas.style.transformOrigin = 'top left';

  canvasContainer.appendChild(liveCanvas);

  const lens = await cameraKit.lensRepository.loadLens(LENS_ID, LENS_GROUP_ID);
  if (lens) await session.applyLens(lens);
  await session.play();

  // === Кнопка захвата: фото/видео ===
  const captureBtn = document.getElementById('capture-btn');

  let mediaRecorder = null;
  let recordedChunks = [];
  let pressTimer = null;
  let recordingStarted = false;

  const takePhoto = () => {
    const image = liveCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = image;
    a.download = 'snap-photo.png';
    a.click();
  };

  const startRecording = () => {
    const canvasStream = liveCanvas.captureStream(30);
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
    recordedChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'snap-video.webm';
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    captureBtn.classList.add('recording');
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      captureBtn.classList.remove('recording');
    }
  };

  function startPress() {
    pressTimer = setTimeout(() => {
      recordingStarted = true;
      startRecording();
    }, 300);
  }

  function endPress() {
    clearTimeout(pressTimer);
    if (recordingStarted) {
      stopRecording();
      recordingStarted = false;
    } else {
      takePhoto();
    }
  }

  // 🎯 События мыши
  captureBtn.addEventListener('mousedown', startPress);
  captureBtn.addEventListener('mouseup', endPress);
  captureBtn.addEventListener('mouseleave', () => clearTimeout(pressTimer));

  // 📱 События касания (тач)
  captureBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startPress();
  }, { passive: false });

  captureBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    endPress();
  }, { passive: false });

  captureBtn.addEventListener('touchcancel', () => clearTimeout(pressTimer));
}

startCameraKit().catch(console.error);