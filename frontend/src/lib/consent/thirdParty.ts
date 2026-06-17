import { browser } from '$app/environment';
import { trackPageView } from '$lib/utils/analytics.js';

const ANALYTICS_ID = 'G-VQ0N792RNT';
const CRISP_WEBSITE_ID = '68cb8ad9-b3c8-43e9-9bac-0634574c7a83';

let analyticsLoaded = false;
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

const initAnalytics = (): void => {
  if (analyticsLoaded) return;
  analyticsLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function (...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  window.gtag('js', new Date());
  window.gtag('config', ANALYTICS_ID, { send_page_view: false });

  loadScript(
    `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`,
    'gtag-js'
  );

  trackPageView(window.location.pathname + window.location.search, document.title);
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

  initAnalytics();
  initCrisp();
};
