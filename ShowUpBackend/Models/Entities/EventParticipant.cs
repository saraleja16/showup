namespace ShowUpBackend.Models.Entities;

public class EventParticipant
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public Guid UserId { get; set; }
    public DateTime JoinedAt { get; set; }
    public ParticipationStatus Status { get; set; } = ParticipationStatus.Registered;
    public DateTime? StatusUpdatedAt { get; set; }

    /// <summary>AutomaticLocation | HostManual | ParticipantManual. Null until attendance is verified.</summary>
    public string? VerificationMethod { get; set; }

    public Guid? VerifiedByUserId { get; set; }
    public double? DistanceMeters { get; set; }

    public Event Event { get; set; } = null!;
    public User User { get; set; } = null!;
}
