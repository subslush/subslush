<script lang="ts">
  import heroPromoImage from '$lib/assets/hero_20260227.png?picture';
  import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
  import { trackSelectItem } from '$lib/utils/analytics.js';

  const handleHeroCtaClick = (itemId: string, itemName: string, index: number) => {
    trackSelectItem('Hero', [
      {
        item_id: itemId,
        item_name: itemName,
        item_category: 'Homepage Hero',
        item_list_name: 'Hero',
        index
      }
    ]);
  };
</script>

<section id="hero-section" class="py-10 md:py-12">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <article class="hero-card" aria-label="Featured premium subscription offer">
      <div class="hero-card-surface">
        <div class="hero-media" aria-hidden="true">
          <ResponsiveImage
            image={heroPromoImage}
            alt="Premium subscriptions showcase"
            sizes="(min-width: 1280px) 1180px, (min-width: 1024px) calc(100vw - 6rem), calc(100vw - 2rem)"
            pictureClass="absolute inset-0 block h-full w-full pointer-events-none"
            imgClass="h-full w-full object-cover"
            loading="eager"
            fetchpriority="high"
            decoding="async"
          />
        </div>

        <div class="hero-overlay" aria-hidden="true"></div>

        <div class="hero-content">
          <h1 class="hero-headline">Premium subscriptions. Up to 90% off.</h1>
          <div class="hero-actions">
            <a
              href="/browse"
              class="hero-primary-cta"
              on:click={() =>
                handleHeroCtaClick('hero-browse-subscriptions', 'Browse subscriptions', 1)}
            >
              Browse subscriptions
            </a>
            <a
              href="/help"
              class="hero-secondary-cta"
              on:click={() => handleHeroCtaClick('hero-how-it-works', 'How it works', 2)}
            >
              How it works
            </a>
          </div>
        </div>
      </div>
    </article>
  </div>
</section>

<style>
  .hero-card {
    position: relative;
    min-height: 362px;
    height: 362px;
    --hero-card-skew: -6.5deg;
    --hero-card-counter-skew: 6.5deg;
    --hero-card-media-scale: 1;
  }

  .hero-card-surface {
    position: relative;
    height: 100%;
    border-radius: 1.2rem;
    background-color: #020617;
    overflow: hidden;
    transform: skewX(var(--hero-card-skew));
    box-shadow: 0 24px 44px rgba(2, 6, 23, 0.24);
  }

  .hero-media {
    position: absolute;
    inset: 0;
    z-index: 0;
    transform: scale(var(--hero-card-media-scale));
    transform-origin: center;
  }

  .hero-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(
      99deg,
      rgba(2, 6, 23, 0.88) 0%,
      rgba(2, 6, 23, 0.74) 34%,
      rgba(2, 6, 23, 0.28) 64%,
      rgba(2, 6, 23, 0.1) 100%
    );
  }

  .hero-content {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.45rem;
    max-width: 35rem;
    padding: 2.45rem 2.9rem;
    color: #ffffff;
    transform: skewX(var(--hero-card-counter-skew));
  }

  .hero-headline {
    margin: 0;
    max-width: 21ch;
    font-size: clamp(1.75rem, 2.9vw, 2.62rem);
    line-height: 1.1;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .hero-primary-cta,
  .hero-secondary-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.625rem;
    border-radius: 0.7rem;
    padding: 0.625rem 1.15rem;
    font-size: 0.95rem;
    line-height: 1.1;
    font-weight: 700;
    text-decoration: none;
    transition: transform 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
  }

  .hero-primary-cta {
    color: #020617;
    background-color: #ffffff;
    box-shadow: 0 10px 20px rgba(2, 6, 23, 0.26);
  }

  .hero-primary-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 26px rgba(2, 6, 23, 0.3);
  }

  .hero-secondary-cta {
    color: #ffffff;
    background-color: rgba(15, 23, 42, 0.52);
    border: 1px solid rgba(255, 255, 255, 0.4);
  }

  .hero-secondary-cta:hover {
    transform: translateY(-1px);
    background-color: rgba(15, 23, 42, 0.7);
  }

  .hero-primary-cta:focus-visible,
  .hero-secondary-cta:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.45);
  }

  @media (max-width: 1024px) {
    .hero-card {
      min-height: 336px;
      height: 336px;
      --hero-card-skew: -5deg;
      --hero-card-counter-skew: 5deg;
      --hero-card-media-scale: 1;
    }

    .hero-card-surface {
      border-radius: 1rem;
    }

    .hero-content {
      max-width: 31rem;
      padding: 2.1rem 2.1rem;
    }
  }

  @media (max-width: 640px) {
    .hero-card {
      min-height: 300px;
      height: 300px;
      --hero-card-skew: -3.6deg;
      --hero-card-counter-skew: 3.6deg;
      --hero-card-media-scale: 1;
    }

    .hero-content {
      gap: 1.05rem;
      max-width: 18rem;
      padding: 1.6rem 1.35rem;
    }

    .hero-headline {
      font-size: 1.56rem;
      line-height: 1.14;
      max-width: 13.5ch;
    }

    .hero-primary-cta,
    .hero-secondary-cta {
      min-height: 2.36rem;
      padding: 0.5rem 0.92rem;
      font-size: 0.88rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-primary-cta,
    .hero-secondary-cta {
      transition: none;
    }
  }
</style>
