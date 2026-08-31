using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Helpers;

public static class UserMapper
{
    public static AuthUserResponse ToAuthResponse(User user)
    {
        return new AuthUserResponse
        {
            Id = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            DisplayName = user.DisplayName,
            Username = user.Username,
            Email = user.Email,
            AvatarUrl = user.AvatarUrl,
            DateOfBirth = user.DateOfBirth,
            Sex = user.Sex,
            PreferredSports = ParsePreferredSports(user.PreferredSports),
            SkillLevel = user.SkillLevel,
            IsEmailVerified = user.IsEmailVerified,
            CreatedAt = user.CreatedAt
        };
    }

    public static string SerializePreferredSports(IEnumerable<string> sports)
    {
        return string.Join(',', sports.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim().ToLowerInvariant()));
    }

    public static List<string> ParsePreferredSports(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        return value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(s => s.ToLowerInvariant())
                    .ToList();
    }
}
