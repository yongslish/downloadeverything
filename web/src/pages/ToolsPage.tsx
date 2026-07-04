import { PixelShell } from '../components/PixelShell';

export function ToolsPage() {
  return (
    <PixelShell active="tools" brandLabel="tools">
      <div style={{ padding: 22, fontSize: 12 }}>
        Tools placeholder — legacy downloader is at{' '}
        <a href="/legacy/" target="_blank" rel="noreferrer">/legacy/</a>{' '}
        until this page absorbs it.
      </div>
    </PixelShell>
  );
}
