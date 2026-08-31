using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class UpdateAvatarResponse
{
    [JsonPropertyName("avatarUrl")]
    public string AvatarUrl { get; set; } = string.Empty;
}
