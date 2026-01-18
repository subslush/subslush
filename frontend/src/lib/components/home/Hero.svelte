<script lang="ts">
  import pandaHero from '$lib/assets/pandabearny.webp';
  import netflixNY from '$lib/assets/netflixny.jpg';
  import spotifyNY from '$lib/assets/spotifyny.jpg';
  import chatgptNY from '$lib/assets/chatgptny.jpg';

  const heroCards = [
    {
      title: 'Netflix Premium',
      description:
        'Stream endless hits, originals, and movies anytime, anywhere — entertainment without limits',
      badge: 'Save up to 75%',
      background: netflixNY,
      link: 'https://www.subslush.com/browse/products/netflix'
    },
    {
      title: 'Spotify Premium',
      description:
        'Ad-free music, offline listening, unlimited skips, and richer sound — your soundtrack, your way',
      badge: 'Save up to 65%',
      background: spotifyNY,
      link: 'https://www.subslush.com/browse/products/spotify'
    },
    {
      title: 'ChatGPT',
      description:
        'Get faster answers, advanced AI tools, and priority access — smarter help, every time',
      badge: 'Save up to 70%',
      background: chatgptNY,
      link: 'https://www.subslush.com/browse/products/chatgpt'
    }
  ];

</script>

<section id="hero-section" class="relative overflow-hidden py-12 md:py-16">
  <img
    src={pandaHero}
    alt="Panda celebrating the New Year"
    class="absolute inset-0 h-full w-full object-cover blur-sm brightness-90 opacity-90 pointer-events-none"
    loading="lazy"
  />
  <div class="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70 pointer-events-none"></div>

  <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mt-2">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
            {#each heroCards as card}
          <article
            class="relative h-[380px] min-h-[380px] overflow-hidden rounded-2xl shadow-lg border-4 text-gray-900 border-white/70"
          >
            {#if card.background}
              <div class="absolute inset-0 bg-cover bg-center" style={`background-image: url(${card.background});`}></div>
            {/if}
            <a
              href={card.link}
              class="relative flex h-full flex-col justify-between gap-4 p-6 transition-transform hover:translate-y-[-2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-2xl"
            >
              <div class="flex items-start gap-3">
                <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-gradient-to-r from-cyan-50 to-pink-50 text-cyan-700">
                  {card.badge}
                </span>
              </div>

              <div class="hero-card-body space-y-2 rounded-xl bg-black/40 backdrop-blur-sm p-4">
                <h2 class="text-xl font-bold leading-tight text-white">
                  {card.title}
                </h2>
                <p class="hero-card-description text-sm leading-relaxed text-white">
                  {card.description}
                </p>
              </div>
            </a>
          </article>
        {/each}
      </div>

    </div>
  </div>
</section>

<style>
  .hero-card-body {
    min-height: 132px;
  }

  .hero-card-description {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    line-clamp: 3;
    overflow: hidden;
  }
</style>
