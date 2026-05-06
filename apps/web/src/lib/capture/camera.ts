/**
 * Camera capture for vision features
 */

let videoStream: MediaStream | null = null;
let videoElement: HTMLVideoElement | null = null;

export async function openCamera(
  video: HTMLVideoElement,
  facingMode: "user" | "environment" = "user",
): Promise<MediaStream> {
  videoStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  video.srcObject = videoStream;
  videoElement = video;
  await video.play();
  return videoStream;
}

export function closeCamera(): void {
  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop());
    videoStream = null;
  }
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }
}

export function isCameraOpen(): boolean {
  return videoStream !== null;
}

/**
 * Capture current frame as base64 JPEG
 */
export function captureFrame(quality = 0.85): string | null {
  if (!videoElement) return null;

  const canvas = document.createElement("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(videoElement, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);

  // Remove "data:image/jpeg;base64," prefix
  return dataUrl.split(",")[1] || null;
}

/**
 * Capture and return as Blob
 */
export function captureFrameBlob(quality = 0.85): Promise<Blob | null> {
  if (!videoElement) return Promise.resolve(null);

  const canvas = document.createElement("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  ctx.drawImage(videoElement, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}
