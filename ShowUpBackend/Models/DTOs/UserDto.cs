namespace ShowUpBackend.Models.DTOs;

public class UserDto
{
    public Guid Id { get; set; }
    public string FirebaseUid { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
