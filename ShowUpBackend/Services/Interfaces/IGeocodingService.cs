namespace ShowUpBackend.Services.Interfaces;

public sealed record GeocodedLocation(
    string Name,
    double Latitude,
    double Longitude);

public interface IGeocodingService
{
    /// <summary>
    /// Resolves a place name to real coordinates via the configured geocoding provider.
    /// Returns null when not found or the provider is unavailable.
    /// </summary>
    Task<GeocodedLocation?> GeocodeAsync(string locationQuery, CancellationToken cancellationToken = default);
}
