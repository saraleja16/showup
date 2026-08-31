using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IProfileService
{
    Task<ProfileDto?> GetProfileAsync(Guid userId);
    Task<ProfilePortfolioResponse?> GetPortfolioAsync(Guid userId);
    Task<(PortfolioGamesPageResponse? Page, string? Error, int StatusCode)> GetGamesAsync(
        Guid userId, string type, int page = 1, int pageSize = 20);
    Task<(ProfileDto? Profile, string? Error, int StatusCode)> UpdateProfileAsync(Guid userId, UpdateProfileRequest request);
    Task<(string? AvatarUrl, string? Error, int StatusCode)> UpdateAvatarAsync(Guid userId, IFormFile file);
    Task<(bool Success, string? Error, int StatusCode)> DeleteAvatarAsync(Guid userId);
    Task<(List<string>? Sports, string? Error, int StatusCode)> UpdateSportsAsync(Guid userId, UpdateSportsRequest request);
}
