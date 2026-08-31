namespace ShowUpBackend.Models.DTOs;

public class SavePushTokenRequest
{
    public Guid UserId { get; set; }
    public string Token { get; set; } = string.Empty;
}
