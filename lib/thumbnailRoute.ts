const EPISODE_THUMBNAIL_TOKEN_RE = /^S(\d+)E(\d+)(?:\.(?:jpg|jpeg|png|webp))?$/i;

export const parseEpisodeThumbnailToken = (episodeToken: string) => {
  const match = EPISODE_THUMBNAIL_TOKEN_RE.exec(episodeToken);
  const season = match?.[1] || null;
  const episode = match?.[2] || null;
  if (!season || !episode) {
    return null;
  }

  return { season, episode };
};

export const buildThumbnailBackdropUrl = (
  requestUrl: URL,
  id: string,
  episodeToken: string,
  configId?: string | null,
) => {
  const parsedEpisode = parseEpisodeThumbnailToken(episodeToken);
  if (!parsedEpisode) {
    return null;
  }

  const backdropId = `${id}:${parsedEpisode.season}:${parsedEpisode.episode}.jpg`;
  const backdropUrl = new URL(requestUrl);
  backdropUrl.pathname = `/backdrop/${backdropId}`;
  backdropUrl.searchParams.set('thumbnail', '1');
  if (configId && !requestUrl.searchParams.has('config')) {
    backdropUrl.searchParams.set('config', configId);
  }

  return {
    backdropId,
    backdropUrl,
    season: parsedEpisode.season,
    episode: parsedEpisode.episode,
  };
};