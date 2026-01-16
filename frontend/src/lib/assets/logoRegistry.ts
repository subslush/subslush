import netflixLogo from '$lib/assets/netflix_logo.jpg';
import spotifyLogo from '$lib/assets/spotify_logo.png';
import tradingviewLogo from '$lib/assets/tradingviewlogo.svg';
import hboLogo from '$lib/assets/hbologo.svg';

export const logoRegistry = {
  netflix: netflixLogo,
  spotify: spotifyLogo,
  tradingview: tradingviewLogo,
  hbo: hboLogo
} as const;

export type LogoKey = keyof typeof logoRegistry;

export const logoKeys = Object.keys(logoRegistry) as LogoKey[];

const logoAliases: Record<string, LogoKey> = {
  'hbo max': 'hbo',
  'spotify premium': 'spotify'
};

export const resolveLogoKey = (logoKey?: string | null): string | undefined => {
  if (!logoKey) {
    return undefined;
  }
  const normalized = logoKey.trim().toLowerCase();
  return (logoRegistry as Record<string, string>)[normalized];
};

export const resolveLogoKeyFromName = (
  serviceName?: string | null
): string | undefined => {
  if (!serviceName) {
    return undefined;
  }
  const normalized = serviceName.trim().toLowerCase();
  const alias = logoAliases[normalized] || normalized;
  return resolveLogoKey(alias);
};
