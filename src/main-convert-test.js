import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';

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

  let recordingTimeout;

  const startRecording = () => {
    const stream = liveCanvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recordedChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      clearTimeout(recordingTimeout);
      const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });
      const mp4Blob = await convertWebmToMp4(webmBlob);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(mp4Blob);
      a.download = 'snap-video.mp4';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    mediaRecorder.start();
    recordingTimeout = setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    }, 15000);

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
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
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
  initializeCameraKit().catch(console.error);
});
