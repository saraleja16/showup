using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class UpdateSportsResponse
{
    [JsonPropertyName("sports")]
    public List<string> Sports { get; set; } = [];
}
