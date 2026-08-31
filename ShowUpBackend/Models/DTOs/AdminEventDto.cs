using System.Text.Json;

namespace ShowUpBackend.Models.DTOs;

public class AdminEventDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid CreatorId { get; set; }
    public string CreatorUsername { get; set; } = string.Empty;
    public string Sport { get; set; } = string.Empty;
    public JsonElement? SportDetails { get; set; }
    public int? VenueId { get; set; }
    public string? VenueName { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public DateTime ScheduledAt { get; set; }
    public int MaxPlayers { get; set; }
    public int ParticipantCount { get; set; }
    public DateTime CreatedAt { get; set; }
}
