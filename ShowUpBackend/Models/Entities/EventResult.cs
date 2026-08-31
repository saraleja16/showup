namespace ShowUpBackend.Models.Entities;

public class EventResult
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;

    public string Sport { get; set; } = string.Empty;

    /// <summary>Sport-specific score payload (JSON).</summary>
    public string ScoreJson { get; set; } = "{}";

    /// <summary>PendingConfirmation | Confirmed | Disputed</summary>
    public string Status { get; set; } = EventResultStatus.PendingConfirmation;

    public Guid SubmittedByUserId { get; set; }
    public DateTime SubmittedAt { get; set; }
    public Guid? ConfirmedByUserId { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public Guid? DisputedByUserId { get; set; }
    public DateTime? DisputedAt { get; set; }

    /// <summary>Optional side labels for display (player/team names derived at read time).</summary>
    public string? SideALabel { get; set; }
    public string? SideBLabel { get; set; }

    public int? ScoreA { get; set; }
    public int? ScoreB { get; set; }
    public int? UnitsWonA { get; set; }
    public int? UnitsWonB { get; set; }

    public string Summary { get; set; } = string.Empty;
}
