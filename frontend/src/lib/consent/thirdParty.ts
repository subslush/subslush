import { browser } from '$app/environment';

const CRISP_WEBSITE_ID = '68cb8ad9-b3c8-43e9-9bac-0634574c7a83';

let supportLoaded = false;
let thirdPartyTrackingBound = false;

const loadScript = (src: string, id: string): void => {
  if (!browser) return;
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
};

const initCrisp = (): void => {
  if (supportLoaded) return;
  supportLoaded = true;

  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
  window.$crisp.push(['do', 'chat:show']);
  loadScript('https://client.crisp.chat/l.js', 'crisp-chat');
};

export const openCrispChat = (): void => {
  if (!browser) return;
  initCrisp();
  const crisp = (window.$crisp = window.$crisp || []);
  crisp.push(['do', 'chat:show']);
  crisp.push(['do', 'chat:open']);
};

export const initThirdPartyTracking = (): void => {
  if (!browser) return;
  if (thirdPartyTrackingBound) return;
  thirdPartyTrackingBound = true;

  initCrisp();
};
