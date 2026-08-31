using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IProfilePortfolioService
{
    Task<ProfileStatsDto> GetStatsAsync(Guid userId, DateTime? utcNow = null);

    Task<ProfilePortfolioResponse?> GetPortfolioAsync(
        Guid userId,
        int playedLimit = 20,
        int hostedLimit = 20,
        int upcomingLimit = 20);

    Task<(PortfolioGamesPageResponse? Page, string? Error, int StatusCode)> GetGamesAsync(
        Guid userId,
        string type,
        int page = 1,
        int pageSize = 20);
}
