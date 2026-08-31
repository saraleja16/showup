namespace ShowUpBackend.Configuration;

public class GoogleMapsOptions
{
    public const string SectionName = "GoogleMaps";

    /// <summary>Loaded from GOOGLE_MAPS_API_KEY. Server-side only.</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Default bias region for geocoding (ISO 3166-1 alpha-2).</summary>
    public string Region { get; set; } = "au";
}
