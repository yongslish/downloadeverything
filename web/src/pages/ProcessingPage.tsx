import { useParams } from 'react-router-dom';
import { PixelShell } from '../components/PixelShell';

// Full PR-01/…/PR-05 layout is future work; this stub reads :id so the route
// type-checks and lets HP-01 navigate here after ▶ go.
export function ProcessingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PixelShell active="start" brandLabel="processing...">
      <div style={{ padding: 22, fontSize: 12 }}>
        job id: <code>{id}</code>
      </div>
    </PixelShell>
  );
}
