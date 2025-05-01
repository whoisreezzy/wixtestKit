import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';

const API_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzQ1ODUyMzQ2LCJzdWIiOiIzYjNjZWVjNy1iNWY2LTQxNDUtOTZiYy0wYWE3ZDJkNDJjOGZ-U1RBR0lOR343NDlkNThlYy1hMDFkLTQwYzgtYTAyYi1mZmVjMjJmYzU0YWEifQ.HBMfpeAj-jddS_0D7t1ZS6WO_bHFBGRgC4VZLw8sBlU';
const LENS_GROUP_ID = 'f01d35c1-cfc6-4960-b3c9-de2ce373053a';
const LENS_ID = '5023539e-5104-4286-85a6-936c2ad2d911';

let facingMode = 'user';
let session, liveCanvas;

const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

if (!isMobile) {
  document.getElementById('switch-camera-btn')?.style.setProperty('display', 'none');
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
    audio: false
  });

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
    tempCanvas.getContext('2d').drawImage(liveCanvas, 0, 0);
    const image = tempCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = image; a.download = 'snap-photo.png'; a.click();
  };

  const startRecording = () => {
    const stream = liveCanvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recordedChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data) };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'snap-video.webm'; a.click();
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
});

initializeCameraKit().catch(console.error);