using System.Net.Http;
using Jellyfin.Plugin.Xrdb.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Providers;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Xrdb;

/// <summary>
/// Offers XRDB renders in Jellyfin's own image picker, so artwork arrives by
/// URL and nothing is written into the media library.
/// </summary>
public class XrdbImageProvider : IRemoteImageProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<XrdbImageProvider> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="XrdbImageProvider"/> class.
    /// </summary>
    /// <param name="httpClientFactory">Factory for the outbound HTTP client.</param>
    /// <param name="logger">Logger.</param>
    public XrdbImageProvider(IHttpClientFactory httpClientFactory, ILogger<XrdbImageProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public string Name => "XRDB";

    private static PluginConfiguration? Config => Plugin.Instance?.Configuration;

    /// <inheritdoc />
    public bool Supports(BaseItem item)
    {
        // Only films and series have an id XRDB can render from, and the
        // provider is inert until someone has pointed it at an instance.
        return (item is Movie || item is Series)
               && !string.IsNullOrWhiteSpace(Config?.ServerUrl);
    }

    /// <inheritdoc />
    public IEnumerable<ImageType> GetSupportedImages(BaseItem item)
    {
        var config = Config;
        if (config is null)
        {
            yield break;
        }

        if (config.EnablePosters)
        {
            yield return ImageType.Primary;
        }

        if (config.EnableBackdrops)
        {
            yield return ImageType.Backdrop;
        }

        if (config.EnableLogos)
        {
            yield return ImageType.Logo;
        }
    }

    /// <inheritdoc />
    public Task<IEnumerable<RemoteImageInfo>> GetImages(BaseItem item, CancellationToken cancellationToken)
    {
        var config = Config;
        var images = new List<RemoteImageInfo>();
        if (config is null || string.IsNullOrWhiteSpace(config.ServerUrl))
        {
            return Task.FromResult<IEnumerable<RemoteImageInfo>>(images);
        }

        var mediaId = ResolveMediaId(item);
        if (mediaId is null)
        {
            _logger.LogDebug("No IMDb or TMDB id on {Name}; XRDB has nothing to render from", item.Name);
            return Task.FromResult<IEnumerable<RemoteImageInfo>>(images);
        }

        var contentType = item is Series ? "series" : "movie";

        if (config.EnablePosters)
        {
            images.Add(Build(config, ImageType.Primary, "poster", mediaId, contentType));
        }

        if (config.EnableBackdrops)
        {
            images.Add(Build(config, ImageType.Backdrop, "backdrop", mediaId, contentType));
        }

        if (config.EnableLogos)
        {
            images.Add(Build(config, ImageType.Logo, "logo", mediaId, contentType));
        }

        return Task.FromResult<IEnumerable<RemoteImageInfo>>(images);
    }

    /// <inheritdoc />
    public Task<HttpResponseMessage> GetImageResponse(string url, CancellationToken cancellationToken)
    {
        return _httpClientFactory.CreateClient(NamedClient.Default)
            .GetAsync(new Uri(url), cancellationToken);
    }

    private RemoteImageInfo Build(PluginConfiguration config, ImageType type, string surface, string mediaId, string contentType)
    {
        return new RemoteImageInfo
        {
            ProviderName = Name,
            Type = type,
            Url = BuildUrl(config, surface, mediaId, contentType),
        };
    }

    /// <summary>
    /// Builds a render URL. Exposed for testing.
    /// </summary>
    /// <param name="config">Plugin configuration.</param>
    /// <param name="surface">Artwork surface: poster, backdrop or logo.</param>
    /// <param name="mediaId">IMDb tt-id or TMDB numeric id.</param>
    /// <param name="contentType">movie or series.</param>
    /// <returns>The absolute URL of the render.</returns>
    internal static string BuildUrl(PluginConfiguration config, string surface, string mediaId, string contentType)
    {
        var baseUrl = config.ServerUrl.TrimEnd('/');
        var query = new List<string> { "type=" + Uri.EscapeDataString(contentType) };

        if (!string.IsNullOrWhiteSpace(config.Profile))
        {
            query.Add("config=" + Uri.EscapeDataString(config.Profile));
        }

        // Jellyfin fetches server-side, so a key cannot travel as a header.
        if (!string.IsNullOrWhiteSpace(config.ApiKey))
        {
            query.Add("key=" + Uri.EscapeDataString(config.ApiKey));
        }

        return baseUrl + "/" + surface + "/" + Uri.EscapeDataString(mediaId) + "?" + string.Join("&", query);
    }

    /// <summary>
    /// Reads the id XRDB can render from. IMDb is preferred because every
    /// rating source keys off it; a TMDB id has to be resolved first.
    /// </summary>
    /// <param name="item">The Jellyfin item.</param>
    /// <returns>The id, or null when the item carries neither.</returns>
    internal static string? ResolveMediaId(BaseItem item)
    {
        if (item.TryGetProviderId(MetadataProvider.Imdb, out var imdb) && !string.IsNullOrWhiteSpace(imdb))
        {
            return imdb;
        }

        if (item.TryGetProviderId(MetadataProvider.Tmdb, out var tmdb) && !string.IsNullOrWhiteSpace(tmdb))
        {
            return tmdb;
        }

        return null;
    }
}
