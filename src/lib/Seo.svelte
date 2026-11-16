<script lang="ts">
  let { title, description, canonical, image, imageAlt, type = 'website' }: {
    title: string;
    description: string;
    canonical: string;
    image: string;
    imageAlt: string;
    type?: 'website' | 'video.movie';
  } = $props();
  const imageType = $derived(new URL(image).pathname.endsWith('.png') ? 'image/png' : 'image/jpeg');
</script>

<svelte:head>
  <title>{title} | Fuori programma</title>
  <meta name="description" content={description} />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content={type} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={image} />
  <meta property="og:image:secure_url" content={image} />
  <meta property="og:image:type" content={imageType} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={imageAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
  <meta name="twitter:image:alt" content={imageAlt} />
</svelte:head>
