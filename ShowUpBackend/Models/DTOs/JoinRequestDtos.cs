using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

// ── Request bodies ────────────────────────────────────────────────────────────

public class CreateJoinRequestRequest
{
    public Guid RequesterId { get; set; }
    public string? SlotId { get; set; }
}

public class WithdrawJoinRequestRequest
{
    public Guid CallerId { get; set; }
}

public class AcceptJoinRequestRequest
{
    public Guid CallerId { get; set; }
}

public class DeclineJoinRequestRequest
{
    public Guid CallerId { get; set; }
}

// ── Response shapes ───────────────────────────────────────────────────────────

/// <summary>Returned by create / withdraw / accept / decline.</summary>
public class JoinRequestResponse
{
    public Guid RequestId { get; set; }
    public Guid EventId { get; set; }
    public Guid RequesterId { get; set; }
    public string? SlotId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
}

/// <summary>One requester inside a slot group on the host list endpoint.</summary>
public class JoinRequestItemDto
{
    public Guid RequestId { get; set; }
    public Guid RequesterId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string ReliabilityTier { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; }
    public bool PreviouslyDeclined { get; set; }
}

/// <summary>
/// One slot group on GET /events/{id}/requests.
/// slotId/team/role are null for legacy events with no position rows.
/// </summary>
public class JoinRequestSlotGroupDto
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SlotId { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Team { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Role { get; set; }

    public List<JoinRequestItemDto> Requests { get; set; } = [];
}
