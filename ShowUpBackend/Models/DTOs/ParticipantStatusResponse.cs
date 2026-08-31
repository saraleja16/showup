namespace ShowUpBackend.Models.DTOs;

public class ParticipantStatusResponse
{
    public Guid UserId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime? StatusUpdatedAt { get; set; }
}
