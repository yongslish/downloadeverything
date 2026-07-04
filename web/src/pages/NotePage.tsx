import { useParams } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PixelShell active="start" brandLabel="save file">
      <div style={{ padding: 22, fontSize: 12 }}>
        note id: <code>{id}</code>
      </div>
    </PixelShell>
  );
}
