import netflixLogo from '$lib/assets/netflix_logo.jpg';
import spotifyLogo from '$lib/assets/spotify_logo.png';
import chatgptLogo from '$lib/assets/chatgpt-logo.jpg';
import adobeccLogo from '$lib/assets/adobecc-logo.png';
import youtubepremiumLogo from '$lib/assets/youtubepremium-logo.png';
import amazonprimevideoLogo from '$lib/assets/amazonprimevideo-logo.png';
import applemusicLogo from '$lib/assets/applemusic-logo.png';
import appletvLogo from '$lib/assets/appletv-logo.jpg';
import myfitnesspalLogo from '$lib/assets/myfitnesspal-logo.jpg';
import n8nLogo from '$lib/assets/n8n-logo.jpg';
import lovableLogo from '$lib/assets/lovable-logo.webp';
import linkedinLogo from '$lib/assets/linkedin-logo.png';
import notionLogo from '$lib/assets/notion-logo.jpg';
import perplexityLogo from '$lib/assets/perplexity-logo.webp';
import playstationplusLogo from '$lib/assets/playstationplus-logo.jpg';
import hbomaxLogo from '$lib/assets/hbomax-logo.webp';
import miroLogo from '$lib/assets/miro-logo.webp';
import grammarlyLogo from '$lib/assets/grammarly-logo.png';
import googleoneLogo from '$lib/assets/googleone-logo.jpg';
import googleaiLogo from '$lib/assets/googleai-logo.png';
import githubcopilotLogo from '$lib/assets/githubcopilot-logo.jpg';
import geminiLogo from '$lib/assets/gemini-logo.png';
import figmaLogo from '$lib/assets/figma-logo.jpg';
import duolingoLogo from '$lib/assets/duolingo-logo.png';
import disneyplusLogo from '$lib/assets/disneyplus-logo.jpeg';
import discordnitroLogo from '$lib/assets/discordnitro-logo.jpg';
import deezerLogo from '$lib/assets/deezer-logo.webp';
import crunchyrollLogo from '$lib/assets/crunchyroll-logo.jpg';
import courseraLogo from '$lib/assets/coursera-logo.png';
import chatprdLogo from '$lib/assets/chatprd-logo.png';
import capcutLogo from '$lib/assets/capcut-logo.webp';
import canvaLogo from '$lib/assets/canva-logo.webp';
import boltLogo from '$lib/assets/bolt-logo.jpg';
import blinkistLogo from '$lib/assets/blinkist-logo.webp';
import autodeskLogo from '$lib/assets/autodesk-logo.png';
import beautifulLogo from '$lib/assets/beautiful-logo.webp';
import zoomLogo from '$lib/assets/zoom-logo.png';
import xboxgamepassLogo from '$lib/assets/xboxgamepass-logo.jpg';
import webflowLogo from '$lib/assets/webflow-logo.jpg';
import tidalLogo from '$lib/assets/tidal-logo.webp';
import skillshareLogo from '$lib/assets/skillshare-logo.png';
import replitLogo from '$lib/assets/replit-logo.png';

export const logoRegistry = {
  netflix: netflixLogo,
  spotify: spotifyLogo,
  'chatgpt-logo': chatgptLogo,
  'adobecc-logo': adobeccLogo,
  'youtubepremium-logo': youtubepremiumLogo,
  'amazonprimevideo-logo': amazonprimevideoLogo,
  'applemusic-logo': applemusicLogo,
  'appletv-logo': appletvLogo,
  'myfitnesspal-logo': myfitnesspalLogo,
  'n8n-logo': n8nLogo,
  'lovable-logo': lovableLogo,
  'linkedin-logo': linkedinLogo,
  'notion-logo': notionLogo,
  'perplexity-logo': perplexityLogo,
  'playstationplus-logo': playstationplusLogo,
  'hbomax-logo': hbomaxLogo,
  'miro-logo': miroLogo,
  'grammarly-logo': grammarlyLogo,
  'googleone-logo': googleoneLogo,
  'googleai-logo': googleaiLogo,
  'githubcopilot-logo': githubcopilotLogo,
  'gemini-logo': geminiLogo,
  'figma-logo': figmaLogo,
  'duolingo-logo': duolingoLogo,
  'disneyplus-logo': disneyplusLogo,
  'discordnitro-logo': discordnitroLogo,
  'deezer-logo': deezerLogo,
  'crunchyroll-logo': crunchyrollLogo,
  'coursera-logo': courseraLogo,
  'chatprd-logo': chatprdLogo,
  'capcut-logo': capcutLogo,
  'canva-logo': canvaLogo,
  'bolt-logo': boltLogo,
  'blinkist-logo': blinkistLogo,
  'autodesk-logo': autodeskLogo,
  'beautiful-logo': beautifulLogo,
  'zoom-logo': zoomLogo,
  'xboxgamepass-logo': xboxgamepassLogo,
  'webflow-logo': webflowLogo,
  'tidal-logo': tidalLogo,
  'skillshare-logo': skillshareLogo,
  'replit-logo': replitLogo
} as const;

export type LogoKey = keyof typeof logoRegistry;

export const logoKeys = Object.keys(logoRegistry) as LogoKey[];

const logoAliases: Record<string, LogoKey> = {
  'hbo max': 'hbomax-logo',
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
