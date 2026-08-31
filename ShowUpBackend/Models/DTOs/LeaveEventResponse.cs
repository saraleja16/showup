namespace ShowUpBackend.Models.DTOs;

public class LeaveEventResponse
{
    public Guid EventId { get; set; }
    public Guid UserId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime StatusUpdatedAt { get; set; }
}
