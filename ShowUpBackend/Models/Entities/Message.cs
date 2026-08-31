namespace ShowUpBackend.Models.Entities;

/// <summary>
/// A single chat message exchanged between two matched users. Scoped to a Connection —
/// only the two users on that Connection may read or write messages on it.
/// </summary>
public class Message
{
    public Guid Id { get; set; }
    public Guid ConnectionId { get; set; }
    public Guid SenderId { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }

    public Connection Connection { get; set; } = null!;
    public User Sender { get; set; } = null!;
}
