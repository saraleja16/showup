using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.Entities;

public class User
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }

    [JsonIgnore]
    public string PasswordHash { get; set; } = string.Empty;

    public DateOnly DateOfBirth { get; set; }
    public string Sex { get; set; } = string.Empty;
    public string PreferredSports { get; set; } = string.Empty;

    /// <summary>Global skill level: Beginner, Intermediate, or Advanced.</summary>
    public string? SkillLevel { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime? LocationUpdatedAt { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsPrivate { get; set; }

    /// <summary>True once the user has confirmed ownership of their email via an OTP (or signed in with Google).</summary>
    public bool IsEmailVerified { get; set; }

    public DateTime? EmailVerifiedAt { get; set; }

    public string? ExpoPushToken { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
