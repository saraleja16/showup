namespace ShowUpBackend.Models.Entities;

public class EventJoinRequest
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }

    /// <summary>Null for legacy events with no position rows.</summary>
    public string? SlotId { get; set; }

    public Guid RequesterId { get; set; }

    /// <summary>"Pending" / "Accepted" / "Declined" / "Withdrawn" / "Expired".</summary>
    public string Status { get; set; } = "Pending";

    public DateTime CreatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }

    /// <summary>Host id on manual accept/decline; null for auto-decline, expiry, withdrawal.</summary>
    public Guid? ResolvedBy { get; set; }

    public Event Event { get; set; } = null!;
    public User Requester { get; set; } = null!;
}
