import netflixLogo from '$lib/assets/netflix_logo.jpg?picture';
import spotifyLogo from '$lib/assets/spotify_logo.png?picture';
import chatgptLogo from '$lib/assets/chatgpt-logo.jpg?picture';
import adobeccLogo from '$lib/assets/adobecc-logo.png?picture';
import youtubeLogo from '$lib/assets/youtube-logo.jpg?picture';
import amazonprimevideoLogo from '$lib/assets/amazonprimevideo-logo.png?picture';
import applemusicLogo from '$lib/assets/applemusic-logo.png?picture';
import appletvLogo from '$lib/assets/appletv-logo.jpg?picture';
import myfitnesspalLogo from '$lib/assets/myfitnesspal-logo.jpg?picture';
import n8nLogo from '$lib/assets/n8n-logo.jpg?picture';
import lovableLogo from '$lib/assets/lovable-logo.webp?picture';
import linkedinLogo from '$lib/assets/linkedin-logo.png?picture';
import notionLogo from '$lib/assets/notion-logo.jpg?picture';
import perplexityLogo from '$lib/assets/perplexity-logo.webp?picture';
import playstationplusLogo from '$lib/assets/playstationplus-logo.jpg?picture';
import hbomaxLogo from '$lib/assets/hbomax-logo.webp?picture';
import miroLogo from '$lib/assets/miro-logo.webp?picture';
import grammarlyLogo from '$lib/assets/grammarly-logo.png?picture';
import googleoneLogo from '$lib/assets/googleone-logo.jpg?picture';
import googleaiLogo from '$lib/assets/googleai-logo.png?picture';
import githubcopilotLogo from '$lib/assets/githubcopilot-logo.jpg?picture';
import geminiLogo from '$lib/assets/gemini-logo.png?picture';
import figmaLogo from '$lib/assets/figma-logo.jpg?picture';
import duolingoLogo from '$lib/assets/duolingo-logo.png?picture';
import disneyplusLogo from '$lib/assets/disneyplus-logo.jpeg?picture';
import discordnitroLogo from '$lib/assets/discordnitro-logo.jpg?picture';
import deezerLogo from '$lib/assets/deezer-logo.webp?picture';
import crunchyrollLogo from '$lib/assets/crunchyroll-logo.jpg?picture';
import courseraLogo from '$lib/assets/coursera-logo.png?picture';
import chatprdLogo from '$lib/assets/chatprd-logo.png?picture';
import capcutLogo from '$lib/assets/capcut-logo.webp?picture';
import canvaLogo from '$lib/assets/canva-logo.webp?picture';
import boltLogo from '$lib/assets/bolt-logo.jpg?picture';
import blinkistLogo from '$lib/assets/blinkist-logo.webp?picture';
import autodeskLogo from '$lib/assets/autodesk-logo.png?picture';
import beautifulLogo from '$lib/assets/beautiful-logo.webp?picture';
import zoomLogo from '$lib/assets/zoom-logo.png?picture';
import xboxgamepassLogo from '$lib/assets/xboxgamepass-logo.jpg?picture';
import webflowLogo from '$lib/assets/webflow-logo.jpg?picture';
import tidalLogo from '$lib/assets/tidal-logo.webp?picture';
import skillshareLogo from '$lib/assets/skillshare-logo.png?picture';
import replitLogo from '$lib/assets/replit-logo.png?picture';
import type { Picture } from 'imagetools-core';

export const logoRegistry = {
  netflix: netflixLogo,
  spotify: spotifyLogo,
  'chatgpt-logo': chatgptLogo,
  'adobecc-logo': adobeccLogo,
  'youtube-logo': youtubeLogo,
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
} as const satisfies Record<string, Picture>;

export type LogoKey = keyof typeof logoRegistry;

export const logoKeys = Object.keys(logoRegistry) as LogoKey[];

const logoAliases: Record<string, LogoKey> = {
  'hbo max': 'hbomax-logo',
  'spotify premium': 'spotify'
};

export const resolveLogoKey = (
  logoKey?: string | null
): Picture | undefined => {
  if (!logoKey) {
    return undefined;
  }
  const normalized = logoKey.trim().toLowerCase();
  return (logoRegistry as Record<string, Picture>)[normalized];
};

export const resolveLogoKeyFromName = (
  serviceName?: string | null
): Picture | undefined => {
  if (!serviceName) {
    return undefined;
  }
  const normalized = serviceName.trim().toLowerCase();
  const alias = logoAliases[normalized] || normalized;
  return resolveLogoKey(alias);
};
