import { ConfiguratorProvider } from '@/lib/configuratorProvider';
import { getConfiguratorEnvAccessKeys } from '@/lib/configuratorEnvAccessKeys';

export const dynamic = 'force-dynamic';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfiguratorProvider envAccessKeys={getConfiguratorEnvAccessKeys()}>
      {children}
    </ConfiguratorProvider>
  );
}
