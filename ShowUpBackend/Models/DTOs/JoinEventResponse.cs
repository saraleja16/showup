namespace ShowUpBackend.Models.DTOs;

public class JoinEventResponse
{
    public Guid EventId { get; set; }
    public Guid UserId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
}
