using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

/// <summary>
/// Google Geocoding API — never invents coordinates; returns null when unresolved.
/// </summary>
public class GoogleGeocodingService : IGeocodingService
{
    private readonly GoogleMapsOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GoogleGeocodingService> _logger;

    public GoogleGeocodingService(
        IOptions<GoogleMapsOptions> options,
        IHttpClientFactory httpClientFactory,
        ILogger<GoogleGeocodingService> logger)
    {
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<GeocodedLocation?> GeocodeAsync(
        string locationQuery,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(locationQuery))
            return null;

        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            _logger.LogWarning("GOOGLE_MAPS_API_KEY is blank; cannot geocode");
            return null;
        }

        var client = _httpClientFactory.CreateClient("GoogleGeocoding");
        var region = string.IsNullOrWhiteSpace(_options.Region) ? "au" : _options.Region.Trim();
        var url =
            "https://maps.googleapis.com/maps/api/geocode/json" +
            $"?address={Uri.EscapeDataString(locationQuery.Trim())}" +
            $"&region={Uri.EscapeDataString(region)}" +
            $"&key={Uri.EscapeDataString(_options.ApiKey)}";

        try
        {
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Geocoding HTTP {Status}", (int)response.StatusCode);
                return null;
            }

            var payload = await response.Content.ReadFromJsonAsync<GoogleGeocodeResponse>(cancellationToken);
            if (payload is null ||
                !string.Equals(payload.Status, "OK", StringComparison.OrdinalIgnoreCase) ||
                payload.Results is null ||
                payload.Results.Count == 0)
            {
                _logger.LogInformation("Geocoding unresolved for query (status={Status})", payload?.Status);
                return null;
            }

            var first = payload.Results[0];
            var loc = first.Geometry?.Location;
            if (loc is null)
                return null;

            var name = string.IsNullOrWhiteSpace(first.FormattedAddress)
                ? locationQuery.Trim()
                : first.FormattedAddress.Trim();

            return new GeocodedLocation(name, loc.Lat, loc.Lng);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Geocoding timed out");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Geocoding failed");
            return null;
        }
    }

    private sealed class GoogleGeocodeResponse
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("results")]
        public List<GoogleGeocodeResult>? Results { get; set; }
    }

    private sealed class GoogleGeocodeResult
    {
        [JsonPropertyName("formatted_address")]
        public string? FormattedAddress { get; set; }

        [JsonPropertyName("geometry")]
        public GoogleGeometry? Geometry { get; set; }
    }

    private sealed class GoogleGeometry
    {
        [JsonPropertyName("location")]
        public GoogleLatLng? Location { get; set; }
    }

    private sealed class GoogleLatLng
    {
        [JsonPropertyName("lat")]
        public double Lat { get; set; }

        [JsonPropertyName("lng")]
        public double Lng { get; set; }
    }
}
