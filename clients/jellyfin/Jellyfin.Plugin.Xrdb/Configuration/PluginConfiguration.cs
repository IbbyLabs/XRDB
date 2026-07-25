using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Xrdb.Configuration;

/// <summary>
/// Settings for the XRDB image provider.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the base URL of the XRDB instance, without a trailing slash.
    /// </summary>
    public string ServerUrl { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the saved profile alias or id whose look artwork takes.
    /// Empty uses the instance defaults.
    /// </summary>
    public string Profile { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the instance API key, for a server that sets XRDB_API_KEY.
    /// Jellyfin fetches server-side and cannot send a header, so it rides in
    /// the query string as the render route allows.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether posters are offered.
    /// </summary>
    public bool EnablePosters { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether backdrops are offered.
    /// </summary>
    public bool EnableBackdrops { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether logos are offered.
    /// </summary>
    public bool EnableLogos { get; set; } = true;
}
