<script lang="ts">
  import type { Picture, Source } from 'imagetools-core';

  export let image: Picture;
  export let alt = '';
  export let sizes: string | undefined;
  export let imgClass = '';
  export let pictureClass = '';
  export let loading: 'lazy' | 'eager' | undefined = undefined;
  export let decoding: 'async' | 'sync' | 'auto' | undefined = 'async';
  export let fetchpriority: 'high' | 'low' | 'auto' | undefined = undefined;

  const buildSrcset = (sources: Source[]): string =>
    sources.map(source => `${source.src} ${source.w}w`).join(', ');
</script>

<picture class={pictureClass}>
  {#each Object.entries(image.sources) as [format, sources]}
    <source
      type={`image/${format}`}
      srcset={buildSrcset(sources)}
      sizes={sizes}
    />
  {/each}
  <img
    src={image.img.src}
    width={image.img.w}
    height={image.img.h}
    alt={alt}
    class={imgClass}
    loading={loading}
    decoding={decoding}
    fetchpriority={fetchpriority}
  />
</picture>
