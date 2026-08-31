namespace ShowUpBackend.Models.Entities;

public class UserBlock
{
    public Guid Id { get; set; }
    public Guid BlockerUserId { get; set; }
    public Guid BlockedUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? BlockerUser { get; set; }
    public User? BlockedUser { get; set; }
}
