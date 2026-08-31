using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class AttendanceResponse
{
    [JsonPropertyName("eventId")]
    public Guid EventId { get; set; }

    [JsonPropertyName("attended")]
    public int Attended { get; set; }

    [JsonPropertyName("noShows")]
    public int NoShows { get; set; }
}
