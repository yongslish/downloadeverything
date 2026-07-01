export function createTranscriptResult({ jobId, source, audio, providerResult }) {
  const segments = Array.isArray(providerResult.segments)
    ? providerResult.segments.map((segment, index) => ({
        index,
        start: Number(segment.start) || 0,
        end: Number(segment.end) || Number(segment.start) || 0,
        speaker: segment.speaker ?? null,
        text: String(segment.text || '').trim(),
        words: Array.isArray(segment.words) ? segment.words : [],
      }))
    : [];

  return {
    schemaVersion: 1,
    jobId,
    source,
    audio: {
      duration: Number(providerResult.duration) || null,
      sampleRate: audio?.sampleRate || null,
      channels: audio?.channels || null,
      codec: audio?.codec || null,
    },
    transcription: {
      provider: providerResult.provider,
      language: providerResult.language || 'auto',
      text: providerResult.text || segments.map((segment) => segment.text).join('\n'),
      segments,
    },
    raw: providerResult.raw || {},
    createdAt: new Date().toISOString(),
  };
}
