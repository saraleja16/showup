using System.Text.Json;
using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class EventDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid CreatorId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public DateTime ScheduledAt { get; set; }
    public int MaxPlayers { get; set; }
    public int ParticipantCount { get; set; }
    public string Sport { get; set; } = string.Empty;

    /// <summary>Distance from search origin in km when a geo search was applied.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? DistanceKm { get; set; }
    public JsonElement? SportDetails { get; set; }
    public int? VenueId { get; set; }
    public string? VenueName { get; set; }
    public bool IsPrivate { get; set; }

    /// <summary>Total event cost in AUD. Null when free.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public decimal? TotalCost { get; set; }

    /// <summary>Equal split: TotalCost / MaxPlayers. Null when free.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public decimal? CostPerPlayer { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RequiredSkillLevel { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Populated only on event creation when InitialClaims were supplied.
    /// Null on all other responses — use GET /api/events/{id}/positions for live state.
    /// </summary>
    public List<PositionSlotDto>? Positions { get; set; }

    /// <summary>
    /// Caller's participation status for this event. Only present when userId was supplied
    /// on GET /api/events. Null means the caller has no participant row.
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? MyStatus { get; set; }

    /// <summary>
    /// Whether the event has any position rows. Only present when userId was supplied.
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? HasPositions { get; set; }

    /// <summary>
    /// Number of claimed position slots. Only present when userId was supplied and
    /// HasPositions is true. Null when HasPositions is false.
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? ClaimedCount { get; set; }

    /// <summary>
    /// Total pending join requests on this event. Only present when userId is the event's host.
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? PendingRequestCount { get; set; }

    /// <summary>
    /// "pending" when the caller has a Pending join request on this event.
    /// Only present when userId was supplied. Null otherwise.
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? MyRequestStatus { get; set; }

    /// <summary>UTC scheduled end derived from start + durationMinutes.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public DateTime? ScheduledEnd { get; set; }

    /// <summary>Authoritative UTC server time used for status/timing.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public DateTime? ServerNow { get; set; }

    /// <summary>
    /// Upcoming | StartingSoon | Live | Finished | ResultPending | Completed
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LiveStatus { get; set; }

    /// <summary>Alias for LiveStatus — same authoritative shared status.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Status { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? ElapsedSeconds { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? RemainingSeconds { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? SecondsUntilStart { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? PresentCount { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? PendingAttendanceCount { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? AbsentCount { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public EventResultSummaryDto? ResultSummary { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public EventPermissionsDto? Permissions { get; set; }
}
