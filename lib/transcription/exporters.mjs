function pad2(value) {
  return String(Math.floor(value)).padStart(2, '0');
}

function srtTime(seconds) {
  const ms = Math.round((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, '0')}`;
}

function vttTime(seconds) {
  return srtTime(seconds).replace(',', '.');
}

export function transcriptToTxt(result) {
  return `${result.transcription.text.trim()}\n`;
}

export function transcriptToSrt(result) {
  return result.transcription.segments.map((segment, index) => [
    String(index + 1),
    `${srtTime(segment.start)} --> ${srtTime(segment.end)}`,
    segment.text,
    '',
  ].join('\n')).join('\n');
}

export function transcriptToVtt(result) {
  const body = result.transcription.segments.map((segment) => [
    `${vttTime(segment.start)} --> ${vttTime(segment.end)}`,
    segment.text,
    '',
  ].join('\n')).join('\n');
  return `WEBVTT\n\n${body}`;
}

export function transcriptToJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}
