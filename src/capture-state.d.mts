export interface CaptureResult {
  text: string | null;
  source: string;
  clipboard_status: string;
  clipboard_restored: boolean | null;
}

export function capturedSourceText(capture: CaptureResult): string;
export function captureNotice(capture: CaptureResult): string;
