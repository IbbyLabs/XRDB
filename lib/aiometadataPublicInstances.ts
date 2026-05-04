export const AIOMETADATA_PUBLIC_INSTANCES = [
  {
    id: 'aiometadata-midnight',
    name: 'AIOMetadata (Midnight)',
    baseUrl: 'https://aiometadatafortheweebs.midnightignite.me',
  },
  {
    id: 'aiometadata-kuu',
    name: 'AIOMetadata (Kuu)',
    baseUrl: 'https://aiometadata.stremio.ru',
  },
  {
    id: 'aiometadata-viren',
    name: 'AIOMetadata (Viren)',
    baseUrl: 'https://aiometadata.viren070.me',
  },
  {
    id: 'aiometadata-yeb',
    name: 'AIOMetadata (Yeb)',
    baseUrl: 'https://aiometadata.fortheweak.cloud',
  },
  {
    id: 'aiometadata-yeb-nhyira-dev',
    name: 'AIOMetadata (Nhyira)',
    baseUrl: 'https://aiometadatafortheweak.nhyira.dev',
  },
  {
    id: 'aiometadata-elfhosted',
    name: 'AIOMetadata (ElfHosted)',
    baseUrl: 'https://aiometadata.elfhosted.com',
  },
  {
    id: 'aiometadata-omni',
    name: 'AIOMetadata (Omni)',
    baseUrl: 'https://aiometadata.12312023.xyz',
  },
  {
    id: 'aiometadata-atbp',
    name: 'AIOMetadata (ATBP)',
    baseUrl: 'https://aiomd.atbphosting.com',
  },
  {
    id: 'aiometadata-wizaardd',
    name: 'AIOMetadata (Wizaardd)',
    baseUrl: 'https://aiometadata.forthewizards.uk/configure/',
  },
] as const;

export const AIOMETADATA_PUBLIC_BASE_URLS = new Set(
  AIOMETADATA_PUBLIC_INSTANCES.map((instance) => instance.baseUrl.toLowerCase()),
);

export const DEFAULT_AIOMETADATA_PUBLIC_INSTANCE = AIOMETADATA_PUBLIC_INSTANCES.find(
  (instance) => instance.id === 'aiometadata-elfhosted',
)?.baseUrl ?? AIOMETADATA_PUBLIC_INSTANCES[0].baseUrl;