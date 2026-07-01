const form = document.querySelector('#download-form');
const urlInput = document.querySelector('#url');
const presetInput = document.querySelector('#preset');
const submitButton = form.querySelector('button[type="submit"]');
const taskCard = document.querySelector('#task-card');
const platformEl = document.querySelector('#task-platform');
const statusEl = document.querySelector('#task-status');
const progressEl = document.querySelector('#task-progress');
const progressBar = document.querySelector('#progress-bar');
const noteEl = document.querySelector('#task-note');
const downloadLink = document.querySelector('#download-link');
const cancelButton = document.querySelector('#cancel-button');
const engineState = document.querySelector('#engine-state');
const xhsCookieInput = document.querySelector('#xhs-cookie');
const transcriptionForm = document.querySelector('#transcription-form');
const transcriptionFileInput = document.querySelector('#transcription-file');
const transcriptionProviderInput = document.querySelector('#transcription-provider');
const transcriptionLanguageInput = document.querySelector('#transcription-language');
const transcribeButton = document.querySelector('#transcribe-button');
const dropZone = document.querySelector('#drop-zone');
const dropTitle = document.querySelector('#drop-title');
const dropSubtitle = document.querySelector('#drop-subtitle');
const transcriptionCard = document.querySelector('#transcription-card');
const transcriptionProviderLabel = document.querySelector('#transcription-provider-label');
const transcriptionStatus = document.querySelector('#transcription-status');
const transcriptionProgress = document.querySelector('#transcription-progress');
const transcriptionProgressBar = document.querySelector('#transcription-progress-bar');
const transcriptionNote = document.querySelector('#transcription-note');
const transcriptionCancelButton = document.querySelector('#transcription-cancel-button');
const transcriptionResult = document.querySelector('#transcription-result');
const transcriptText = document.querySelector('#transcript-text');
const copyTranscriptButton = document.querySelector('#copy-transcript-button');
const exportTxt = document.querySelector('#export-txt');
const exportSrt = document.querySelector('#export-srt');
const exportVtt = document.querySelector('#export-vtt');
const exportJson = document.querySelector('#export-json');
const xunfeiAppIdInput = document.querySelector('#xunfei-app-id');
const xunfeiApiKeyInput = document.querySelector('#xunfei-api-key');
const xunfeiApiSecretInput = document.querySelector('#xunfei-api-secret');
const xunfeiSecretKeyInput = document.querySelector('#xunfei-secret-key');
const xunfeiSecretInputs = [xunfeiAppIdInput, xunfeiApiKeyInput, xunfeiApiSecretInput, xunfeiSecretKeyInput];

let currentJobId = null;
let pollTimer = null;
let currentTranscriptionId = null;
let transcriptionPollTimer = null;
const xunfeiSecretStorageKey = 'download-everything:xunfei-secrets:v1';

const providerLabels = {
  fake: 'Fake ASR',
  'xunfei-ifasr-llm': '讯飞大模型',
  'xunfei-lfasr': '讯飞转写',
};

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  urlInput.disabled = isBusy;
  presetInput.disabled = isBusy;
  xhsCookieInput.disabled = isBusy;
  submitButton.querySelector('span').textContent = isBusy ? '正在准备' : '开始下载';
}

function showTask() {
  taskCard.classList.remove('is-hidden');
  taskCard.classList.remove('is-error', 'is-ready');
  downloadLink.classList.add('is-hidden');
  cancelButton.hidden = false;
}

function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

function stopTranscriptionPolling() {
  clearTimeout(transcriptionPollTimer);
  transcriptionPollTimer = null;
}

function readStoredXunfeiSecrets() {
  try {
    return JSON.parse(localStorage.getItem(xunfeiSecretStorageKey) || '{}');
  } catch {
    return {};
  }
}

function saveXunfeiSecrets() {
  const payload = {
    appId: xunfeiAppIdInput.value.trim(),
    apiKey: xunfeiApiKeyInput.value.trim(),
    apiSecret: xunfeiApiSecretInput.value.trim(),
    secretKey: xunfeiSecretKeyInput.value.trim(),
  };
  try {
    localStorage.setItem(xunfeiSecretStorageKey, JSON.stringify(payload));
  } catch {
    // Private browsing may block localStorage. The current request can still use the fields.
  }
}

function restoreXunfeiSecrets() {
  const payload = readStoredXunfeiSecrets();
  xunfeiAppIdInput.value = payload.appId || '';
  xunfeiApiKeyInput.value = payload.apiKey || '';
  xunfeiApiSecretInput.value = payload.apiSecret || '';
  xunfeiSecretKeyInput.value = payload.secretKey || '';
}

function getProviderConfig(provider) {
  if (provider === 'xunfei-ifasr-llm') {
    return {
      appId: xunfeiAppIdInput.value.trim(),
      apiKey: xunfeiApiKeyInput.value.trim(),
      apiSecret: xunfeiApiSecretInput.value.trim(),
    };
  }
  if (provider === 'xunfei-lfasr') {
    return {
      appId: xunfeiAppIdInput.value.trim(),
      secretKey: xunfeiSecretKeyInput.value.trim(),
    };
  }
  return null;
}

function transcriptionProviderHint(provider) {
  if (provider === 'xunfei-ifasr-llm') {
    return '讯飞大模型会真实识别音频；免费额度内适合先跑面试复盘。';
  }
  if (provider === 'xunfei-lfasr') {
    return '讯飞会真实识别音频；长音频需要等待服务端排队返回。';
  }
  return 'Fake ASR 只用于验证链路，不代表真实识别效果。';
}

function renderJob(job) {
  platformEl.textContent = job.platform;
  statusEl.textContent = job.status === 'queued' ? '在队列里安静等候中…' : job.message;
  const progress = Number.isFinite(job.progress) ? Math.round(job.progress) : 0;
  progressEl.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  noteEl.textContent = job.status === 'ready'
    ? '文件会下载到你现在正在使用的设备。'
    : job.status === 'failed'
      ? '没关系，确认链接公开有效后，再试一次。'
      : '这个过程可能需要一点点时间。';

  if (job.status === 'ready') {
    taskCard.classList.add('is-ready');
    downloadLink.href = `/api/jobs/${job.id}/download`;
    downloadLink.classList.remove('is-hidden');
    cancelButton.hidden = true;
    setBusy(false);
    stopPolling();
  }

  if (job.status === 'failed') {
    taskCard.classList.add('is-error');
    cancelButton.hidden = true;
    setBusy(false);
    stopPolling();
  }
}

async function pollJob() {
  if (!currentJobId) return;
  try {
    const response = await fetch(`/api/jobs/${currentJobId}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '任务已经过期。');
    renderJob(payload);
    if (payload.status === 'queued' || payload.status === 'processing') {
      pollTimer = setTimeout(pollJob, 1200);
    }
  } catch (error) {
    taskCard.classList.add('is-error');
    statusEl.textContent = error instanceof Error ? error.message : '暂时无法取得任务状态。';
    noteEl.textContent = '刷新页面后可以重新开始。';
    cancelButton.hidden = true;
    setBusy(false);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  stopPolling();
  showTask();
  currentJobId = null;
  platformEl.textContent = '识别中';
  statusEl.textContent = '正在理解这个链接…';
  progressEl.textContent = '0%';
  progressBar.style.width = '2%';
  noteEl.textContent = '只会处理公开、非 DRM 的内容。';
  setBusy(true);

  try {
    const requestBody = { url: urlInput.value.trim(), preset: presetInput.value };
    if (xhsCookieInput.value.trim()) requestBody.xhsCookie = xhsCookieInput.value.trim();
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '暂时无法创建下载任务。');
    currentJobId = payload.id;
    renderJob(payload);
    pollTimer = setTimeout(pollJob, 450);
  } catch (error) {
    taskCard.classList.add('is-error');
    statusEl.textContent = error instanceof Error ? error.message : '暂时无法创建下载任务。';
    noteEl.textContent = '检查链接后，随时可以再试一次。';
    cancelButton.hidden = true;
    setBusy(false);
  }
});

cancelButton.addEventListener('click', async () => {
  if (!currentJobId) return;
  cancelButton.disabled = true;
  try {
    await fetch(`/api/jobs/${currentJobId}`, { method: 'DELETE' });
    stopPolling();
    taskCard.classList.add('is-error');
    statusEl.textContent = '这个任务已经取消。';
    noteEl.textContent = '留白也很好。准备好时，再从一个链接开始。';
    cancelButton.hidden = true;
  } finally {
    setBusy(false);
    cancelButton.disabled = false;
  }
});

function setTranscriptionBusy(isBusy) {
  transcribeButton.disabled = isBusy;
  transcriptionFileInput.disabled = isBusy;
  transcriptionProviderInput.disabled = isBusy;
  transcriptionLanguageInput.disabled = isBusy;
  for (const input of xunfeiSecretInputs) input.disabled = isBusy;
  transcribeButton.querySelector('span').textContent = isBusy ? '正在准备' : '开始转文字';
}

function showTranscriptionTask() {
  transcriptionCard.classList.remove('is-hidden');
  transcriptionCard.classList.remove('is-error', 'is-ready');
  transcriptionResult.classList.add('is-hidden');
  transcriptionCancelButton.hidden = false;
}

function setExportLinks(job) {
  exportTxt.href = job.exports?.txt || '#';
  exportSrt.href = job.exports?.srt || '#';
  exportVtt.href = job.exports?.vtt || '#';
  exportJson.href = job.exports?.json || '#';
}

async function loadTranscriptionResult(job) {
  const response = await fetch(`/api/transcriptions/${job.id}/result`, { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '暂时无法读取转写结果。');
  transcriptText.value = result.transcription?.text || '';
  setExportLinks(job);
  transcriptionResult.classList.remove('is-hidden');
}

async function renderTranscriptionJob(job) {
  transcriptionProviderLabel.textContent = providerLabels[job.provider] || job.provider || 'fake';
  transcriptionStatus.textContent = job.status === 'queued' ? '转写任务在队列里等候…' : job.message;
  const progress = Number.isFinite(job.progress) ? Math.round(job.progress) : 0;
  transcriptionProgress.textContent = `${progress}%`;
  transcriptionProgressBar.style.width = `${progress}%`;
  transcriptionNote.textContent = job.status === 'ready'
    ? '结果已暂存 30 分钟，可以复制或导出。'
    : job.status === 'failed'
      ? '这次没有转写完成，可以换一个更短的文件再试。'
      : transcriptionProviderHint(job.provider);

  if (job.status === 'ready') {
    transcriptionCard.classList.add('is-ready');
    transcriptionCancelButton.hidden = true;
    setTranscriptionBusy(false);
    stopTranscriptionPolling();
    await loadTranscriptionResult(job);
  }

  if (job.status === 'failed') {
    transcriptionCard.classList.add('is-error');
    transcriptionCancelButton.hidden = true;
    setTranscriptionBusy(false);
    stopTranscriptionPolling();
  }
}

async function pollTranscriptionJob() {
  if (!currentTranscriptionId) return;
  try {
    const response = await fetch(`/api/transcriptions/${currentTranscriptionId}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '转写任务已经过期。');
    await renderTranscriptionJob(payload);
    if (payload.status === 'queued' || payload.status === 'processing') {
      transcriptionPollTimer = setTimeout(pollTranscriptionJob, 900);
    }
  } catch (error) {
    transcriptionCard.classList.add('is-error');
    transcriptionStatus.textContent = error instanceof Error ? error.message : '暂时无法取得转写状态。';
    transcriptionNote.textContent = '刷新页面后可以重新开始。';
    transcriptionCancelButton.hidden = true;
    setTranscriptionBusy(false);
  }
}

function updateSelectedFile(file) {
  if (!file) {
    dropTitle.textContent = '把视频或音频拖到这里';
    dropSubtitle.textContent = '支持 mp4 / mov / mp3 / m4a / wav，当前上限 500 MB。';
    return;
  }
  dropTitle.textContent = file.name;
  dropSubtitle.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · 准备转写`;
}

transcriptionFileInput.addEventListener('change', () => {
  updateSelectedFile(transcriptionFileInput.files?.[0]);
});

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
  });
}

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  transcriptionFileInput.files = transfer.files;
  updateSelectedFile(file);
});

transcriptionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  stopTranscriptionPolling();
  showTranscriptionTask();
  currentTranscriptionId = null;
  transcriptionProviderLabel.textContent = providerLabels[transcriptionProviderInput.value] || transcriptionProviderInput.value;
  transcriptionStatus.textContent = '正在上传并准备转写…';
  transcriptionProgress.textContent = '0%';
  transcriptionProgressBar.style.width = '2%';
  transcriptionNote.textContent = transcriptionProviderHint(transcriptionProviderInput.value);
  transcriptText.value = '';
  setTranscriptionBusy(true);

  try {
    const file = transcriptionFileInput.files?.[0];
    if (!file) throw new Error('请先选择一个视频或音频文件。');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider', transcriptionProviderInput.value);
    formData.append('language', transcriptionLanguageInput.value);
    const providerConfig = getProviderConfig(transcriptionProviderInput.value);
    if (providerConfig && Object.values(providerConfig).some(Boolean)) {
      saveXunfeiSecrets();
      formData.append('providerConfig', JSON.stringify(providerConfig));
    }

    const response = await fetch('/api/transcriptions/upload', {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '暂时无法创建转写任务。');
    currentTranscriptionId = payload.id;
    await renderTranscriptionJob(payload);
    transcriptionPollTimer = setTimeout(pollTranscriptionJob, 450);
  } catch (error) {
    transcriptionCard.classList.add('is-error');
    transcriptionStatus.textContent = error instanceof Error ? error.message : '暂时无法创建转写任务。';
    transcriptionNote.textContent = '检查文件格式后，随时可以再试一次。';
    transcriptionCancelButton.hidden = true;
    setTranscriptionBusy(false);
  }
});

transcriptionCancelButton.addEventListener('click', async () => {
  if (!currentTranscriptionId) return;
  transcriptionCancelButton.disabled = true;
  try {
    await fetch(`/api/transcriptions/${currentTranscriptionId}`, { method: 'DELETE' });
    stopTranscriptionPolling();
    transcriptionCard.classList.add('is-error');
    transcriptionStatus.textContent = '这个转写任务已经取消。';
    transcriptionNote.textContent = '临时文件已经清理。准备好时，再从一个文件开始。';
    transcriptionCancelButton.hidden = true;
  } finally {
    setTranscriptionBusy(false);
    transcriptionCancelButton.disabled = false;
  }
});

copyTranscriptButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(transcriptText.value);
  copyTranscriptButton.textContent = '已复制';
  setTimeout(() => {
    copyTranscriptButton.textContent = '复制全文';
  }, 1200);
});

restoreXunfeiSecrets();
for (const input of xunfeiSecretInputs) input.addEventListener('change', saveXunfeiSecrets);

async function checkEngine() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const health = await response.json();
    const providers = health.transcription?.providers || [];
    const xunfeiLlm = providers.find?.((provider) => provider.id === 'xunfei-ifasr-llm');
    const xunfeiStandard = providers.find?.((provider) => provider.id === 'xunfei-lfasr');
    if (xunfeiLlm?.configured) transcriptionProviderInput.value = 'xunfei-ifasr-llm';
    else if (xunfeiStandard?.configured) transcriptionProviderInput.value = 'xunfei-lfasr';
    const transcriptionState = xunfeiLlm?.configured
      ? '讯飞大模型已配置'
      : xunfeiStandard?.configured
        ? '讯飞标准版已配置'
        : '讯飞转写待配置';
    engineState.textContent = health.engineReady ? `下载引擎已准备好 · ${transcriptionState}` : '首次使用：请运行 npm run setup';
    engineState.classList.toggle('engine-warning', !health.engineReady);
  } catch {
    engineState.textContent = '服务正在离线。';
    engineState.classList.add('engine-warning');
  }
}

checkEngine();
