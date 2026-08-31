using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IAiSearchService
{
    /// <summary>
    /// Converts a natural-language event search into structured filters.
    /// Does not query the database. Returns an error message when unavailable.
    /// </summary>
    Task<(EventSearchFilters? Filters, string? Error)> ParseEventSearchQueryAsync(
        string query,
        CancellationToken cancellationToken = default);
}
