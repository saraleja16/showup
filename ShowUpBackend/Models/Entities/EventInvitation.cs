namespace ShowUpBackend.Models.Entities;

/// <summary>
/// A host-initiated invitation for a matched connection to join a specific event
/// (optionally a specific formation slot). Unlike EventJoinRequest (requester asks to
/// join, host approves), this flow is initiated by the host and requires the invitee's
/// consent before they're added as a participant.
/// </summary>
public class EventInvitation
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }

    /// <summary>Null when the invitation isn't tied to a specific formation slot.</summary>
    public string? SlotId { get; set; }

    public Guid InviterId { get; set; }
    public Guid InviteeId { get; set; }

    /// <summary>"Pending" / "Accepted" / "Declined".</summary>
    public string Status { get; set; } = "Pending";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }

    public Event Event { get; set; } = null!;
    public User Inviter { get; set; } = null!;
    public User Invitee { get; set; } = null!;
}
