namespace ShowUpBackend.Models.DTOs;

public class AuthUserResponse
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateOnly DateOfBirth { get; set; }
    public string Sex { get; set; } = string.Empty;
    public List<string> PreferredSports { get; set; } = [];
    public string? SkillLevel { get; set; }

    /// <summary>False until the user redeems an emailed OTP. Google sign-ins are verified automatically.</summary>
    public bool IsEmailVerified { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>JWT access token for authenticated endpoints (matchmaking, location).</summary>
    public string? AccessToken { get; set; }
}
