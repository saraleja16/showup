namespace ShowUpBackend.Models.Entities;

public class Event
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid CreatorId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public DateTime ScheduledAt { get; set; }
    public int MaxPlayers { get; set; }
    public string Sport { get; set; } = string.Empty;
    public string? SportDetails { get; set; }
    public int? VenueId { get; set; }
    public Venue? Venue { get; set; }

    /// <summary>
    /// When true, only the creator and users who have a mutual Connection (match) with the
    /// creator may see or request to join this event. Public listing / join-requests are
    /// filtered accordingly — see EventService and JoinRequestService.
    /// </summary>
    public bool IsPrivate { get; set; }

    /// <summary>Total booking/event cost in AUD. Null or 0 = free.</summary>
    public decimal? TotalCost { get; set; }

    /// <summary>Optional required skill: Beginner, Intermediate, or Advanced.</summary>
    public string? RequiredSkillLevel { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReminderSentAt { get; set; }
    public DateTime? FinalizedAt { get; set; }

    /// <summary>When participants were prompted to submit a scored result after the event ended.</summary>
    public DateTime? ResultPromptSentAt { get; set; }
}
