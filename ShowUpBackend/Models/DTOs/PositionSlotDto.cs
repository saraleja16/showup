namespace ShowUpBackend.Models.DTOs;

public class PositionSlotDto
{
    public string SlotId { get; set; } = string.Empty;
    public string Team { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public float X { get; set; }
    public float Y { get; set; }
    public string Status { get; set; } = "open";
    public Guid? ClaimedByUserId { get; set; }
    public string? ClaimedByDisplayName { get; set; }
    public DateTimeOffset? ClaimedAt { get; set; }

    /// <summary>Number of Pending requests on this slot. Only present when callerId was supplied.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public int? PendingRequestCount { get; set; }

    /// <summary>True when the caller has a Pending request on this slot. Only present when callerId was supplied.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public bool? IsMyPendingRequest { get; set; }

    /// <summary>The caller's own Pending requestId on this slot. Populated only when isMyPendingRequest is true.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Guid? RequestId { get; set; }
}
