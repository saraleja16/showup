namespace ShowUpBackend.Models.Entities;

/// <summary>
/// Mutual match connection. UserAId is always the lexicographically smaller Guid
/// so each pair has a single unique row.
/// </summary>
public class Connection
{
    public Guid Id { get; set; }
    public Guid UserAId { get; set; }
    public Guid UserBId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? UserA { get; set; }
    public User? UserB { get; set; }

    public static (Guid A, Guid B) CanonicalPair(Guid user1, Guid user2)
        => user1.CompareTo(user2) <= 0 ? (user1, user2) : (user2, user1);
}
