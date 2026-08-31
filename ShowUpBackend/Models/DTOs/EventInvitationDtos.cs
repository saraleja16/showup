using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class CreateEventInvitationRequest
{
    [JsonPropertyName("inviteeId")]
    public Guid InviteeId { get; set; }

    [JsonPropertyName("slotId")]
    public string? SlotId { get; set; }
}

public class EventInvitationDto
{
    [JsonPropertyName("invitationId")]
    public Guid InvitationId { get; set; }

    [JsonPropertyName("eventId")]
    public Guid EventId { get; set; }

    [JsonPropertyName("eventTitle")]
    public string EventTitle { get; set; } = string.Empty;

    [JsonPropertyName("sport")]
    public string Sport { get; set; } = string.Empty;

    [JsonPropertyName("scheduledAt")]
    public DateTime ScheduledAt { get; set; }

    [JsonPropertyName("venueName")]
    public string? VenueName { get; set; }

    [JsonPropertyName("slotId")]
    public string? SlotId { get; set; }

    [JsonPropertyName("slotRole")]
    public string? SlotRole { get; set; }

    [JsonPropertyName("inviterId")]
    public Guid InviterId { get; set; }

    [JsonPropertyName("inviterDisplayName")]
    public string InviterDisplayName { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}
