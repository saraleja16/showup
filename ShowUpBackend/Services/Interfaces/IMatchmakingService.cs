using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IMatchmakingService
{
    Task<(MatchCandidatesResponse? Response, string? Error, int StatusCode)> GetCandidatesAsync(
        Guid currentUserId,
        double latitude,
        double longitude,
        double? radiusKm,
        string? sportId,
        int? pageSize,
        string? cursor,
        CancellationToken cancellationToken = default);

    Task<(MatchActionResponse? Response, string? Error, int StatusCode)> ConnectAsync(
        Guid currentUserId,
        Guid candidateUserId,
        CancellationToken cancellationToken = default);

    Task<(MatchActionResponse? Response, string? Error, int StatusCode)> SkipAsync(
        Guid currentUserId,
        Guid candidateUserId,
        CancellationToken cancellationToken = default);

    Task<(bool Success, string? Error, int StatusCode)> UpdateMyLocationAsync(
        Guid currentUserId,
        UpdateLocationRequest request,
        CancellationToken cancellationToken = default);

    Task<(bool Success, string? Error, int StatusCode)> UpdateMySkillLevelAsync(
        Guid currentUserId,
        UpdateSkillLevelRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Discovery: free-text search by display name / username, independent of the
    /// sport/skill/distance filters used by GetCandidatesAsync. Lets a user find and
    /// selectively match with a specific person instead of swiping the algorithmic deck.
    /// </summary>
    Task<(UserSearchResponse? Response, string? Error, int StatusCode)> SearchUsersAsync(
        Guid currentUserId,
        string query,
        int? pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>Lists the caller's mutual matches (Connections), newest first.</summary>
    Task<(List<ConnectionDto>? Connections, string? Error, int StatusCode)> GetConnectionsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Unmatches — deletes the Connection and both directional MatchDecisions so the pair
    /// starts fresh (can be re-discovered and re-matched later). Cascades to delete their
    /// chat messages via the Connection FK.
    /// </summary>
    Task<(bool Success, string? Error, int StatusCode)> UnmatchAsync(
        Guid currentUserId,
        Guid connectionId,
        CancellationToken cancellationToken = default);

    Task<(MatchRequestListResponse? Response, string? Error, int StatusCode)> GetSentRequestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    Task<(MatchRequestListResponse? Response, string? Error, int StatusCode)> GetIncomingRequestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    /// <summary>Requests the current user rejected (recipient Skip after incoming Connect).</summary>
    Task<(MatchRequestListResponse? Response, string? Error, int StatusCode)> GetRejectedRequestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    Task<(MatchRequestCountsDto? Counts, string? Error, int StatusCode)> GetRequestCountsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> AcceptRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default);

    Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> RejectRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default);

    Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> CancelRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Recipient removes their Skip so a still-pending sender Connect becomes Incoming again.
    /// </summary>
    Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> ReopenRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default);
}
