namespace ShowUpBackend.Models.DTOs;

public class RegisterUserRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public DateOnly DateOfBirth { get; set; }
    public string Sex { get; set; } = string.Empty;
    public List<string> PreferredSports { get; set; } = [];
}
