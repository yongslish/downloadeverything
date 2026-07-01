import { XhsProvider } from './xhs-provider.mjs';
import { YtDlpProvider } from './ytdlp-provider.mjs';

export function createDownloadProviderRegistry(context) {
  const providers = [
    new XhsProvider(context),
    new YtDlpProvider(context),
  ];

  return {
    providers,

    providerFor(job) {
      const provider = providers.find((candidate) => candidate.canHandle(job));
      if (!provider) throw new Error(`暂时没有可处理 ${job.platform} 的下载 Provider。`);
      return provider;
    },

    async download(job) {
      return this.providerFor(job).download(job);
    },

    async engineReady() {
      const ytdlp = providers.find((provider) => provider.id === 'ytdlp');
      return ytdlp ? ytdlp.isReady() : false;
    },

    shutdown() {
      for (const provider of providers) provider.shutdown?.();
    },
  };
}
