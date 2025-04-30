import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';

const API_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzQ1ODUyMzQ2LCJzdWIiOiIzYjNjZWVjNy1iNWY2LTQxNDUtOTZiYy0wYWE3ZDJkNDJjOGZ-U1RBR0lOR343NDlkNThlYy1hMDFkLTQwYzgtYTAyYi1mZmVjMjJmYzU0YWEifQ.HBMfpeAj-jddS_0D7t1ZS6WO_bHFBGRgC4VZLw8sBlU';
const LENS_GROUP_ID = 'f01d35c1-cfc6-4960-b3c9-de2ce373053a';
const LENS_ID = '5023539e-5104-4286-85a6-936c2ad2d911';

let mediaRecorder = null;
let recordedChunks = [];

async function startCameraKit() {
  const cameraKit = await bootstrapCameraKit({ apiToken: API_TOKEN });
  const session = await cameraKit.createSession();

  const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  const cameraSource = createMediaStreamSource(mediaStream, {
    transform: Transform2D.MirrorX,
    cameraType: 'user',
  });
  await session.setSource(cameraSource);

  const canvasContainer = document.getElementById('canvas-container');
  canvasContainer.innerHTML = '';
  const liveCanvas = session.output.live;
  canvasContainer.appendChild(liveCanvas);

  const lens = await cameraKit.lensRepository.loadLens(LENS_ID, LENS_GROUP_ID);
  if (lens) {
    await session.applyLens(lens);
  }

  await session.play();

  const captureBtn = document.getElementById('capture-btn');

  // 📸 Снимок
  const takePhoto = () => {
    const image = liveCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = image;
    a.download = 'snap-photo.png';
    a.click();
  };

  // 🎥 Видео
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

  let pressTimer = null;
  let recordingStarted = false;

  captureBtn.addEventListener('mousedown', () => {
    pressTimer = setTimeout(() => {
      recordingStarted = true;
      startRecording();
    }, 300);
  });

  captureBtn.addEventListener('mouseup', () => {
    clearTimeout(pressTimer);
    if (recordingStarted) {
      stopRecording();
      recordingStarted = false;
    } else {
      takePhoto();
    }
  });

  captureBtn.addEventListener('mouseleave', () => {
    if (recordingStarted) {
      stopRecording();
      recordingStarted = false;
    } else {
      clearTimeout(pressTimer);
    }
  });
}

startCameraKit().catch(console.error);