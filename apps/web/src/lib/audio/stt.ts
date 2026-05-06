/**
 * Browser-based STT using Web Speech API
 * Built-in, instant, no model download needed.
 */

let recognition: any = null;
let finalTranscript = "";
let _onPartial: ((text: string) => void) | null = null;
let _onFinal: ((text: string) => void) | null = null;
let _shouldRestart = false;
let _lang = "zh-TW";
let _emptyRestarts = 0;
const MAX_EMPTY_RESTARTS = 3;

function getSpeechRecognition(): any {
  const SR = (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;
  if (!SR) throw new Error("此瀏覽器不支援語音辨識，請使用 Chrome 或 Edge");
  return SR;
}

function createRecognition(): any {
  const SR = getSpeechRecognition();
  const rec = new SR();
  rec.lang = _lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (event: any) => {
    _emptyRestarts = 0; // got results, reset counter
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interim += transcript;
      }
    }
    const display = finalTranscript + interim;
    if (display && _onPartial) {
      _onPartial(display);
    }
  };

  rec.onerror = (event: any) => {
    console.warn("STT | error:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      _shouldRestart = false;
    }
  };

  rec.onend = () => {
    console.log("STT | session ended, shouldRestart:", _shouldRestart, "emptyRestarts:", _emptyRestarts);
    if (_shouldRestart && _emptyRestarts < MAX_EMPTY_RESTARTS) {
      _emptyRestarts++;
      console.log(`STT | 🔄 restarting (${_emptyRestarts}/${MAX_EMPTY_RESTARTS})...`);
      // Recreate instance with delay to avoid rapid loop
      setTimeout(() => {
        if (!_shouldRestart) return;
        recognition = createRecognition();
        try {
          recognition.start();
        } catch {
          console.warn("STT | failed to restart");
        }
      }, 300);
    } else {
      // Deliver final result
      const text = finalTranscript.trim();
      console.log("STT | ✅ Final text:", text);
      recognition = null;
      if (_onFinal) _onFinal(text);
    }
  };

  return rec;
}

/**
 * Start continuous speech recognition.
 * Stays active until stopRecognition() is called.
 */
export function startRecognition(opts: {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  lang?: string;
}): void {
  if (recognition) return;

  _onPartial = opts.onPartial ?? null;
  _onFinal = opts.onFinal ?? null;
  _lang = opts.lang ?? "zh-TW";
  _shouldRestart = true;
  _emptyRestarts = 0;
  finalTranscript = "";

  recognition = createRecognition();
  recognition.start();
  console.log("STT | 🎤 Web Speech recognition started");
}

/**
 * Stop recognition and trigger onFinal callback with collected text.
 */
export function stopRecognition(): void {
  _shouldRestart = false;
  if (recognition) {
    recognition.stop();
    // onend handler will deliver the final text
  }
}

export function isRecognizing(): boolean {
  return recognition !== null;
}


