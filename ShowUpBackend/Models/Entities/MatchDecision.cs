namespace ShowUpBackend.Models.Entities;

public class MatchDecision
{
    public Guid Id { get; set; }
    public Guid FromUserId { get; set; }
    public Guid ToUserId { get; set; }
    public MatchDecisionType Decision { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? FromUser { get; set; }
    public User? ToUser { get; set; }
}
