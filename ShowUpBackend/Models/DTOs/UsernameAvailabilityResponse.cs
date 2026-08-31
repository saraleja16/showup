namespace ShowUpBackend.Models.DTOs;

public class UsernameAvailabilityResponse
{
    public string Username { get; set; } = string.Empty;
    public bool Available { get; set; }
}
