namespace ShowUpBackend.Models.DTOs;

public class AdminUpdateEventRequest
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime ScheduledAt { get; set; }
    public int MaxPlayers { get; set; }
    public int? VenueId { get; set; }
}
