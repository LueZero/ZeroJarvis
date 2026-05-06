/**
 * Screen capture API
 * - Desktop (Tauri): native screenshot via Rust command (no user prompt)
 * - Web (browser): getDisplayMedia fallback (shows permission dialog)
 */

/** Check if running inside Tauri */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Capture the screen and return base64 JPEG string (no data URI prefix).
 * Returns null if capture fails or user cancels.
 */
export async function captureScreen(): Promise<string | null> {
  if (isTauri()) {
    return captureViaTauri();
  }
  return captureViaDisplayMedia();
}

/** Tauri native screenshot */
async function captureViaTauri(): Promise<string | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const base64: string = await invoke("capture_screen");
    return base64;
  } catch (err) {
    console.error("Tauri screenshot failed:", err);
    return null;
  }
}

/** Browser getDisplayMedia fallback */
async function captureViaDisplayMedia(): Promise<string | null> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" } as any,
      audio: false,
    });

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const width = settings.width || 1920;
    const height = settings.height || 1080;

    // Create video element to grab a frame
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // Wait one frame for the video to render
    await new Promise((r) => requestAnimationFrame(r));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, width, height);

    // Stop stream immediately after capture
    stream.getTracks().forEach((t) => t.stop());
    stream = null;

    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  } catch (err: any) {
    // User cancelled the picker or permission denied
    if (err?.name === "NotAllowedError") {
      console.log("Screen capture cancelled by user");
    } else {
      console.error("Screen capture failed:", err);
    }
    return null;
  } finally {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
  }
}
