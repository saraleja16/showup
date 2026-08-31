using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public static class AiSearchIntentTypes
{
    public const string Event = "event";
    public const string Game = "game";
    public const string Venue = "venue";
    public const string EventCentre = "eventCentre";

    public static bool IsEventLike(string? intent) =>
        string.IsNullOrWhiteSpace(intent) ||
        intent.Equals(Event, StringComparison.OrdinalIgnoreCase) ||
        intent.Equals(Game, StringComparison.OrdinalIgnoreCase);

    public static bool IsVenueLike(string? intent) =>
        intent is not null &&
        (intent.Equals(Venue, StringComparison.OrdinalIgnoreCase) ||
         intent.Equals(EventCentre, StringComparison.OrdinalIgnoreCase));
}

public class AiSearchEventsRequest
{
    [Required]
    [MaxLength(500)]
    public string Query { get; set; } = string.Empty;
}

/// <summary>Validated structured filters produced from AI (or manual search).</summary>
public class EventSearchFilters
{
    /// <summary>event | game | venue | eventCentre</summary>
    public string IntentType { get; set; } = AiSearchIntentTypes.Event;

    public string? Sport { get; set; }
    public double? RadiusKm { get; set; }
    public DateOnly? Date { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public string? SkillLevel { get; set; }
    public string? LocationQuery { get; set; }

    /// <summary>Set after successful geocoding of LocationQuery.</summary>
    public ResolvedLocationDto? ResolvedLocation { get; set; }

    /// <summary>
    /// When true (geocoded place search), skip substring location text matching —
    /// distance around ResolvedLocation is authoritative.
    /// </summary>
    public bool PreferGeoOverTextLocation { get; set; }
}

public class ResolvedLocationDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }
}

public class InterpretedEventFiltersDto
{
    [JsonPropertyName("intentType")]
    public string? IntentType { get; set; }

    [JsonPropertyName("sport")]
    public string? Sport { get; set; }

    [JsonPropertyName("radiusKm")]
    public double? RadiusKm { get; set; }

    [JsonPropertyName("date")]
    public string? Date { get; set; }

    [JsonPropertyName("startTime")]
    public string? StartTime { get; set; }

    [JsonPropertyName("endTime")]
    public string? EndTime { get; set; }

    [JsonPropertyName("skillLevel")]
    public string? SkillLevel { get; set; }

    [JsonPropertyName("locationQuery")]
    public string? LocationQuery { get; set; }

    [JsonPropertyName("resolvedLocation")]
    public ResolvedLocationDto? ResolvedLocation { get; set; }
}

public class AiSearchEventsResponse
{
    public InterpretedEventFiltersDto InterpretedFilters { get; set; } = new();
    public List<EventDto> Events { get; set; } = [];
    public List<PublicVenueDto> Venues { get; set; } = [];
}

/// <summary>Raw schema shape returned by the AI filter parser.</summary>
public class AiEventSearchFilterPayload
{
    public string? IntentType { get; set; }
    public string? Sport { get; set; }
    public double? RadiusKm { get; set; }
    public string? Date { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public string? SkillLevel { get; set; }
    public string? LocationQuery { get; set; }
}
