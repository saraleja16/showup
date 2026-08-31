namespace ShowUpBackend.Models.Entities;

public class EventPosition
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }

    /// <summary>Stable template key from the formation definition, e.g. "a_mid_2".</summary>
    public string SlotId { get; set; } = string.Empty;

    public string Team { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public float X { get; set; }
    public float Y { get; set; }

    /// <summary>"open" or "claimed".</summary>
    public string Status { get; set; } = "open";

    /// <summary>Set when a registered user claims the slot.</summary>
    public Guid? ClaimedByUserId { get; set; }

    /// <summary>Display name for friend pre-claims (no account required).</summary>
    public string? ClaimedByName { get; set; }

    public DateTimeOffset? ClaimedAt { get; set; }

    public Event Event { get; set; } = null!;
    public User? ClaimedByUser { get; set; }
}
