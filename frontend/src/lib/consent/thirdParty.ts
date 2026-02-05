import { browser } from '$app/environment';
import { get } from 'svelte/store';
import {
  consentStore,
  hasAnalyticsConsent,
  hasMarketingConsent
} from '$lib/stores/consent.js';
import { trackPageView } from '$lib/utils/analytics.js';

const ANALYTICS_ID = 'G-VQ0N792RNT';
const TIKTOK_PIXEL_ID = 'D62CLGJC77U8OPSUBNLG';
const CRISP_WEBSITE_ID = '68cb8ad9-b3c8-43e9-9bac-0634574c7a83';

let analyticsLoaded = false;
let marketingLoaded = false;
let supportLoaded = false;
let analyticsScheduled = false;
let marketingScheduled = false;
let supportScheduled = false;

const deferAfterLoad = (fn: () => void): void => {
  if (!browser) return;
  const schedule = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => fn(), { timeout: 3000 });
    } else {
      setTimeout(fn, 1500);
    }
  };

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
};

const scheduleAnalytics = (): void => {
  if (analyticsLoaded || analyticsScheduled) return;
  analyticsScheduled = true;
  deferAfterLoad(() => {
    analyticsScheduled = false;
    if (!hasAnalyticsConsent()) return;
    initAnalytics();
  });
};

const scheduleMarketing = (): void => {
  if (marketingLoaded || marketingScheduled) return;
  marketingScheduled = true;
  deferAfterLoad(() => {
    marketingScheduled = false;
    if (!hasMarketingConsent()) return;
    initTikTokPixel();
  });
};

const scheduleSupport = (): void => {
  if (supportLoaded || supportScheduled) return;
  supportScheduled = true;
  deferAfterLoad(() => {
    supportScheduled = false;
    initCrisp();
  });
};

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

const initTikTokPixel = (): void => {
  if (marketingLoaded) return;
  marketingLoaded = true;

  const w = window as typeof window & { ttq?: any; TiktokAnalyticsObject?: string };
  const t = 'ttq';
  w.TiktokAnalyticsObject = t;
  const ttq = (w.ttq = w.ttq || []);
  ttq.methods = [
    'page',
    'track',
    'identify',
    'instances',
    'debug',
    'on',
    'off',
    'once',
    'ready',
    'alias',
    'group',
    'enableCookie',
    'disableCookie',
    'holdConsent',
    'revokeConsent',
    'grantConsent'
  ];
  ttq.setAndDefer = function (t: any, e: string) {
    t[e] = function () {
      t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
    };
  };
  for (let i = 0; i < ttq.methods.length; i++) {
    ttq.setAndDefer(ttq, ttq.methods[i]);
  }
  ttq.instance = function (t: string) {
    const e = ttq._i[t] || [];
    for (let n = 0; n < ttq.methods.length; n++) {
      ttq.setAndDefer(e, ttq.methods[n]);
    }
    return e;
  };
  ttq.load = function (e: string, n?: Record<string, unknown>) {
    const r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i || {};
    ttq._i[e] = [];
    ttq._i[e]._u = r;
    ttq._t = ttq._t || {};
    ttq._t[e] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[e] = n || {};
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.async = true;
    s.src = `${r}?sdkid=${e}&lib=${t}`;
    const f = document.getElementsByTagName('script')[0];
    f.parentNode?.insertBefore(s, f);
  };

  ttq.load(TIKTOK_PIXEL_ID);
  ttq.page();
};

const initCrisp = (): void => {
  if (supportLoaded) return;
  supportLoaded = true;

  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
  loadScript('https://client.crisp.chat/l.js', 'crisp-chat');
};

const applyConsent = (): void => {
  if (!browser) return;
  if (hasAnalyticsConsent()) {
    scheduleAnalytics();
  }
  if (hasMarketingConsent()) {
    scheduleMarketing();
  }
};

export const initConsentSideEffects = (): void => {
  if (!browser) return;
  scheduleSupport();
  const current = get(consentStore);
  if (current) {
    applyConsent();
  }
  consentStore.subscribe(state => {
    if (!state) return;
    applyConsent();
  });
};
