using System.Text.Json;

namespace ShowUpBackend.Models.DTOs;

public class CreateEventRequest
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid CreatorId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public DateTime ScheduledAt { get; set; }
    public string Sport { get; set; } = string.Empty;
    public JsonElement? SportDetails { get; set; }
    public int? VenueId { get; set; }
    /// <summary>
    /// Required for sports that do not derive capacity from SportDetails.
    /// Ignored for tennis and any sport where ISportDefinition.DerivesCapacity is true.
    /// </summary>
    public int? MaxPlayers { get; set; }

    /// <summary>Total booking cost in AUD. Split equally among MaxPlayers when set.</summary>
    public decimal? TotalCost { get; set; }

    /// <summary>Optional required skill: Beginner, Intermediate, or Advanced.</summary>
    public string? RequiredSkillLevel { get; set; }

    /// <summary>
    /// When true, only the creator and their matched connections may see or join this event.
    /// Defaults to false (public).
    /// </summary>
    public bool IsPrivate { get; set; }

    /// <summary>
    /// Optional pre-claims applied to formation slots immediately after event creation.
    /// Only valid for soccer events with a fixed formation (not "custom").
    /// Null or empty for all other sports — fully backward compatible.
    /// </summary>
    public List<InitialClaimRequest>? InitialClaims { get; set; }
}
