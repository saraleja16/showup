using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Services.Matchmaking;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

public class MatchmakingService : IMatchmakingService
{
    private readonly AppDbContext _context;
    private readonly IReliabilityService _reliabilityService;
    private readonly INotificationService _notificationService;
    private readonly MatchmakingOptions _options;

    public MatchmakingService(
        AppDbContext context,
        IReliabilityService reliabilityService,
        INotificationService notificationService,
        IOptions<MatchmakingOptions> options)
    {
        _context = context;
        _reliabilityService = reliabilityService;
        _notificationService = notificationService;
        _options = options.Value;
    }

    public async Task<(MatchCandidatesResponse? Response, string? Error, int StatusCode)> GetCandidatesAsync(
        Guid currentUserId,
        double latitude,
        double longitude,
        double? radiusKm,
        string? sportId,
        int? pageSize,
        string? cursor,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidCoordinate(latitude, longitude))
            return (null, "Invalid latitude or longitude", StatusCodes.Status400BadRequest);

        var user = await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);
        if (user is null)
            return (null, "User not found", StatusCodes.Status404NotFound);

        if (!user.IsActive)
            return (null, "Account is not active", StatusCodes.Status403Forbidden);

        var mySports = UserMapper.ParsePreferredSports(user.PreferredSports)
            .Where(SportCatalog.IsEnabled)
            .ToList();
        if (mySports.Count == 0)
            return (null, "Preferred sports are required for matchmaking", StatusCodes.Status400BadRequest);

        if (!SkillLevels.IsValid(user.SkillLevel))
            return (null, "Skill level is required for matchmaking", StatusCodes.Status400BadRequest);

        var mySkill = SkillLevels.Normalize(user.SkillLevel!);

        if (!string.IsNullOrWhiteSpace(sportId))
        {
            sportId = sportId.Trim().ToLowerInvariant();
            if (!SportCatalog.IsEnabled(sportId))
                return (null, $"Unknown sport: {sportId}", StatusCodes.Status400BadRequest);
            if (!mySports.Contains(sportId))
                return (null, "sportId must be one of your preferred sports", StatusCodes.Status400BadRequest);
            mySports = [sportId];
        }

        var radius = Math.Clamp(
            radiusKm ?? _options.MaximumDistanceKm,
            0.1,
            _options.AbsoluteMaximumDistanceKm);

        var size = Math.Clamp(
            pageSize ?? _options.DefaultPageSize,
            1,
            _options.AbsoluteMaximumPageSize);

        ParseCursor(cursor, out var cursorScore, out var cursorUserId);

        var myReliability = await _reliabilityService.GetScoreAsync(currentUserId, cancellationToken);

        var (minLat, maxLat, minLng, maxLng) = GeoDistance.BoundingBox(latitude, longitude, radius);

        var excludedIds = await GetExcludedUserIdsAsync(currentUserId, cancellationToken);

        var pendingOutgoing = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Connect)
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken);
        var pendingSet = pendingOutgoing.ToHashSet();

        // Bounding-box prefilter in DB; Haversine + ranking in process for the filtered set.
        var fetchCap = Math.Min(size * Math.Max(_options.CandidateFetchMultiplier, 3) + 50, 500);

        var rawCandidates = await _context.Users.AsNoTracking()
            .Where(u =>
                u.Id != currentUserId &&
                u.IsActive &&
                !u.IsPrivate &&
                u.Latitude != null &&
                u.Longitude != null &&
                u.SkillLevel != null &&
                u.PreferredSports != "" &&
                u.Latitude >= minLat && u.Latitude <= maxLat &&
                u.Longitude >= minLng && u.Longitude <= maxLng &&
                !excludedIds.Contains(u.Id))
            .OrderBy(u => u.Id)
            .Take(fetchCap)
            .Select(u => new
            {
                u.Id,
                u.DisplayName,
                u.AvatarUrl,
                u.PreferredSports,
                u.SkillLevel,
                Latitude = u.Latitude!.Value,
                Longitude = u.Longitude!.Value
            })
            .ToListAsync(cancellationToken);

        var reliabilityScores = await _reliabilityService.GetScoresAsync(
            rawCandidates.Select(c => c.Id), cancellationToken);

        var ranked = new List<(MatchCandidateDto Dto, double Score)>();

        foreach (var c in rawCandidates)
        {
            if (!SkillLevels.IsValid(c.SkillLevel)) continue;
            var candidateSkill = SkillLevels.Normalize(c.SkillLevel!);

            var candidateSports = UserMapper.ParsePreferredSports(c.PreferredSports)
                .Where(SportCatalog.IsEnabled)
                .ToList();
            var shared = mySports.Intersect(candidateSports, StringComparer.OrdinalIgnoreCase).ToList();
            if (shared.Count == 0) continue;

            var distance = GeoDistance.HaversineKm(latitude, longitude, c.Latitude, c.Longitude);
            if (distance > radius) continue;

            var sportScore = MatchScoreCalculator.SportScore(shared.Count, mySports.Count);
            var skillScore = MatchScoreCalculator.SkillScore(mySkill, candidateSkill, _options);
            if (skillScore is null) continue;

            var candReliability = reliabilityScores.TryGetValue(c.Id, out var rs) ? rs : ReliabilityCalculator.DefaultScore;
            var reliabilityScore = MatchScoreCalculator.ReliabilityScore(myReliability, candReliability, _options);
            if (reliabilityScore is null) continue;

            var distanceScore = MatchScoreCalculator.DistanceScore(distance, radius);
            var total = MatchScoreCalculator.Combine(
                sportScore, skillScore.Value, reliabilityScore.Value, distanceScore, _options);

            // Cursor: emit only items after (score, userId) in descending score / ascending id order.
            if (cursorScore.HasValue && cursorUserId.HasValue)
            {
                if (total > cursorScore.Value) continue;
                if (Math.Abs(total - cursorScore.Value) < 1e-9 && c.Id.CompareTo(cursorUserId.Value) <= 0)
                    continue;
            }

            ranked.Add((new MatchCandidateDto
            {
                UserId = c.Id,
                DisplayName = c.DisplayName,
                ProfileImageUrl = c.AvatarUrl,
                ReliabilityScore = candReliability,
                SkillLevel = candidateSkill,
                SharedSports = shared,
                PrimarySharedSport = shared[0],
                ApproximateDistanceKm = GeoDistance.RoundApproximate(distance),
                IsConnectionPending = pendingSet.Contains(c.Id)
            }, total));
        }

        var page = ranked
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Dto.UserId)
            .Take(size)
            .ToList();

        string? nextCursor = null;
        if (page.Count == size)
        {
            var last = page[^1];
            nextCursor = EncodeCursor(last.Score, last.Dto.UserId);
        }

        return (new MatchCandidatesResponse
        {
            Items = page.Select(x => x.Dto).ToList(),
            NextCursor = nextCursor,
            PageSize = size
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchActionResponse? Response, string? Error, int StatusCode)> ConnectAsync(
        Guid currentUserId,
        Guid candidateUserId,
        CancellationToken cancellationToken = default)
    {
        if (currentUserId == candidateUserId)
            return (null, "Cannot connect with yourself", StatusCodes.Status400BadRequest);

        var candidate = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == candidateUserId, cancellationToken);
        if (candidate is null || !candidate.IsActive || candidate.IsPrivate)
            return (null, "Candidate not available", StatusCodes.Status404NotFound);

        if (await IsBlockedEitherWayAsync(currentUserId, candidateUserId, cancellationToken))
            return (null, "Candidate not available", StatusCodes.Status404NotFound);

        var (a, b) = Connection.CanonicalPair(currentUserId, candidateUserId);
        var existingConnection = await _context.Connections
            .FirstOrDefaultAsync(c => c.UserAId == a && c.UserBId == b, cancellationToken);

        if (existingConnection is not null)
        {
            var decision = await UpsertDecisionAsync(currentUserId, candidateUserId, MatchDecisionType.Connect, cancellationToken);
            return (new MatchActionResponse
            {
                Success = true,
                IsMutualMatch = true,
                ConnectionId = existingConnection.Id,
                RequestId = decision.Id
            }, null, StatusCodes.Status200OK);
        }

        var prior = await _context.MatchDecisions.AsNoTracking()
            .FirstOrDefaultAsync(d => d.FromUserId == currentUserId && d.ToUserId == candidateUserId, cancellationToken);
        var wasAlreadyConnect = prior is { Decision: MatchDecisionType.Connect };

        var myDecision = await UpsertDecisionAsync(currentUserId, candidateUserId, MatchDecisionType.Connect, cancellationToken);

        var reverse = await _context.MatchDecisions
            .AsNoTracking()
            .FirstOrDefaultAsync(d =>
                d.FromUserId == candidateUserId &&
                d.ToUserId == currentUserId &&
                d.Decision == MatchDecisionType.Connect, cancellationToken);

        if (reverse is null)
        {
            if (!wasAlreadyConnect)
            {
                var meUser = await _context.Users.AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);
                await _notificationService.SendPushNotificationToUserAsync(
                    candidateUserId,
                    "Connection request",
                    $"{meUser?.DisplayName ?? "Someone"} sent you a connection request.",
                    "match_request",
                    data: new { requestId = myDecision.Id, userId = currentUserId });
            }

            return (new MatchActionResponse
            {
                Success = true,
                IsMutualMatch = false,
                ConnectionId = null,
                RequestId = myDecision.Id
            }, null, StatusCodes.Status200OK);
        }

        var connection = new Connection
        {
            Id = Guid.NewGuid(),
            UserAId = a,
            UserBId = b,
            CreatedAt = DateTime.UtcNow
        };
        _context.Connections.Add(connection);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Concurrent mutual connect — re-read existing row.
            var raced = await _context.Connections
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.UserAId == a && c.UserBId == b, cancellationToken);
            if (raced is null) throw;
            return (new MatchActionResponse
            {
                Success = true,
                IsMutualMatch = true,
                ConnectionId = raced.Id,
                RequestId = myDecision.Id
            }, null, StatusCodes.Status200OK);
        }

        var me = await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);

        await _notificationService.SendPushNotificationToUserAsync(
            candidateUserId,
            "Request accepted",
            $"{me?.DisplayName ?? "Someone"} accepted your request.",
            "match_request_accepted",
            data: new { connectionId = connection.Id, userId = currentUserId, requestId = reverse.Id });

        await _notificationService.SendPushNotificationToUserAsync(
            currentUserId,
            "It's a match",
            $"You and {candidate.DisplayName} are now connected",
            "match",
            data: new { connectionId = connection.Id, userId = candidateUserId });

        return (new MatchActionResponse
        {
            Success = true,
            IsMutualMatch = true,
            ConnectionId = connection.Id,
            RequestId = myDecision.Id
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchActionResponse? Response, string? Error, int StatusCode)> SkipAsync(
        Guid currentUserId,
        Guid candidateUserId,
        CancellationToken cancellationToken = default)
    {
        if (currentUserId == candidateUserId)
            return (null, "Cannot skip yourself", StatusCodes.Status400BadRequest);

        var exists = await _context.Users.AsNoTracking()
            .AnyAsync(u => u.Id == candidateUserId, cancellationToken);
        if (!exists)
            return (null, "Candidate not found", StatusCodes.Status404NotFound);

        await UpsertDecisionAsync(currentUserId, candidateUserId, MatchDecisionType.Skip, cancellationToken);

        return (new MatchActionResponse
        {
            Success = true,
            IsMutualMatch = false,
            ConnectionId = null
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> UpdateMyLocationAsync(
        Guid currentUserId,
        UpdateLocationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidCoordinate(request.Latitude, request.Longitude))
            return (false, "Invalid latitude or longitude", StatusCodes.Status400BadRequest);

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);
        if (user is null)
            return (false, "User not found", StatusCodes.Status404NotFound);

        user.Latitude = request.Latitude;
        user.Longitude = request.Longitude;
        user.LocationUpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);
        return (true, null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> UpdateMySkillLevelAsync(
        Guid currentUserId,
        UpdateSkillLevelRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!SkillLevels.IsValid(request.SkillLevel))
            return (false, "skillLevel must be Beginner, Intermediate, or Advanced", StatusCodes.Status400BadRequest);

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);
        if (user is null)
            return (false, "User not found", StatusCodes.Status404NotFound);

        user.SkillLevel = SkillLevels.Normalize(request.SkillLevel);
        await _context.SaveChangesAsync(cancellationToken);
        return (true, null, StatusCodes.Status200OK);
    }

    public async Task<(UserSearchResponse? Response, string? Error, int StatusCode)> SearchUsersAsync(
        Guid currentUserId,
        string query,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        var trimmed = (query ?? string.Empty).Trim();
        if (trimmed.Length < 2)
            return (null, "Search query must be at least 2 characters", StatusCodes.Status400BadRequest);

        var size = Math.Clamp(pageSize ?? 20, 1, 50);
        var pattern = $"%{trimmed}%";

        var blockedIds = await _context.UserBlocks.AsNoTracking()
            .Where(b => b.BlockerUserId == currentUserId || b.BlockedUserId == currentUserId)
            .Select(b => b.BlockerUserId == currentUserId ? b.BlockedUserId : b.BlockerUserId)
            .ToListAsync(cancellationToken);

        var matches = await _context.Users.AsNoTracking()
            .Where(u =>
                u.Id != currentUserId &&
                u.IsActive &&
                !u.IsPrivate &&
                !blockedIds.Contains(u.Id) &&
                (EF.Functions.ILike(u.DisplayName, pattern) || EF.Functions.ILike(u.Username, pattern)))
            .OrderBy(u => u.DisplayName)
            .Take(size)
            .Select(u => new { u.Id, u.DisplayName, u.Username, u.AvatarUrl, u.SkillLevel })
            .ToListAsync(cancellationToken);

        if (matches.Count == 0)
            return (new UserSearchResponse { Items = [] }, null, StatusCodes.Status200OK);

        var matchIds = matches.Select(m => m.Id).ToList();

        var connectedIds = (await _context.Connections.AsNoTracking()
            .Where(c => (c.UserAId == currentUserId && matchIds.Contains(c.UserBId)) ||
                        (c.UserBId == currentUserId && matchIds.Contains(c.UserAId)))
            .Select(c => c.UserAId == currentUserId ? c.UserBId : c.UserAId)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var pendingIds = (await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Connect &&
                        matchIds.Contains(d.ToUserId))
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var items = matches.Select(u => new UserSearchResultDto
        {
            UserId = u.Id,
            DisplayName = u.DisplayName,
            Username = u.Username,
            ProfileImageUrl = u.AvatarUrl,
            SkillLevel = u.SkillLevel,
            IsConnected = connectedIds.Contains(u.Id),
            IsConnectionPending = pendingIds.Contains(u.Id)
        }).ToList();

        return (new UserSearchResponse { Items = items }, null, StatusCodes.Status200OK);
    }

    public async Task<(List<ConnectionDto>? Connections, string? Error, int StatusCode)> GetConnectionsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default)
    {
        var connections = await _context.Connections.AsNoTracking()
            .Where(c => c.UserAId == currentUserId || c.UserBId == currentUserId)
            .Select(c => new
            {
                c.Id,
                c.CreatedAt,
                OtherUserId = c.UserAId == currentUserId ? c.UserBId : c.UserAId
            })
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(cancellationToken);

        if (connections.Count == 0)
            return ([], null, StatusCodes.Status200OK);

        var otherUserIds = connections.Select(c => c.OtherUserId).ToList();
        var otherUsers = await _context.Users.AsNoTracking()
            .Where(u => otherUserIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl, u.SkillLevel })
            .ToDictionaryAsync(u => u.Id, cancellationToken);

        var result = connections.Select(c =>
        {
            var other = otherUsers.GetValueOrDefault(c.OtherUserId);
            return new ConnectionDto
            {
                ConnectionId = c.Id,
                UserId = c.OtherUserId,
                DisplayName = other?.DisplayName ?? "Unknown player",
                ProfileImageUrl = other?.AvatarUrl,
                SkillLevel = other?.SkillLevel,
                ConnectedAt = c.CreatedAt
            };
        }).ToList();

        return (result, null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> UnmatchAsync(
        Guid currentUserId,
        Guid connectionId,
        CancellationToken cancellationToken = default)
    {
        var connection = await _context.Connections
            .FirstOrDefaultAsync(c => c.Id == connectionId, cancellationToken);

        if (connection is null ||
            (connection.UserAId != currentUserId && connection.UserBId != currentUserId))
            return (false, "Connection not found", StatusCodes.Status404NotFound);

        var otherUserId = connection.UserAId == currentUserId ? connection.UserBId : connection.UserAId;

        // Deleting the Connection cascades to delete their chat Messages.
        _context.Connections.Remove(connection);

        // Also clear both directional decisions so the pair can be re-discovered and
        // re-matched later instead of staying permanently excluded/pending.
        var decisions = await _context.MatchDecisions
            .Where(d =>
                (d.FromUserId == currentUserId && d.ToUserId == otherUserId) ||
                (d.FromUserId == otherUserId && d.ToUserId == currentUserId))
            .ToListAsync(cancellationToken);
        _context.MatchDecisions.RemoveRange(decisions);

        await _context.SaveChangesAsync(cancellationToken);

        return (true, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestListResponse? Response, string? Error, int StatusCode)> GetSentRequestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default)
    {
        var connectedIds = await GetConnectedOtherUserIdsAsync(currentUserId, cancellationToken);
        var connectedSet = connectedIds.ToHashSet();

        // Hide outgoing Connect when the recipient rejected (Skip toward sender).
        var rejectedByThem = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.ToUserId == currentUserId && d.Decision == MatchDecisionType.Skip)
            .Select(d => d.FromUserId)
            .ToListAsync(cancellationToken);
        var rejectedByThemSet = rejectedByThem.ToHashSet();

        var decisions = await _context.MatchDecisions.AsNoTracking()
            .Where(d =>
                d.FromUserId == currentUserId &&
                d.Decision == MatchDecisionType.Connect &&
                !connectedSet.Contains(d.ToUserId) &&
                !rejectedByThemSet.Contains(d.ToUserId))
            .OrderByDescending(d => d.UpdatedAt)
            .ToListAsync(cancellationToken);

        var items = await MapRequestDtosAsync(decisions, otherUserIdSelector: d => d.ToUserId, MatchRequestStatus.Pending, cancellationToken);
        return (new MatchRequestListResponse { Items = items, Count = items.Count }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestListResponse? Response, string? Error, int StatusCode)> GetIncomingRequestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default)
    {
        var connectedIds = await GetConnectedOtherUserIdsAsync(currentUserId, cancellationToken);
        var mySkipIds = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Skip)
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken);
        var skipSet = mySkipIds.ToHashSet();

        var decisions = await _context.MatchDecisions.AsNoTracking()
            .Where(d =>
                d.ToUserId == currentUserId &&
                d.Decision == MatchDecisionType.Connect &&
                !connectedIds.Contains(d.FromUserId))
            .OrderByDescending(d => d.UpdatedAt)
            .ToListAsync(cancellationToken);

        decisions = decisions.Where(d => !skipSet.Contains(d.FromUserId)).ToList();
        var items = await MapRequestDtosAsync(decisions, otherUserIdSelector: d => d.FromUserId, MatchRequestStatus.Pending, cancellationToken);
        return (new MatchRequestListResponse { Items = items, Count = items.Count }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestListResponse? Response, string? Error, int StatusCode)> GetRejectedRequestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default)
    {
        // Requests I rejected: sender still has Connect → me, and I have Skip → sender.
        var connectedIds = await GetConnectedOtherUserIdsAsync(currentUserId, cancellationToken);
        var mySkips = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Skip)
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken);
        var skipSet = mySkips.ToHashSet();
        if (skipSet.Count == 0)
            return (new MatchRequestListResponse { Items = [], Count = 0 }, null, StatusCodes.Status200OK);

        var decisions = await _context.MatchDecisions.AsNoTracking()
            .Where(d =>
                d.ToUserId == currentUserId &&
                d.Decision == MatchDecisionType.Connect &&
                skipSet.Contains(d.FromUserId) &&
                !connectedIds.Contains(d.FromUserId))
            .OrderByDescending(d => d.UpdatedAt)
            .ToListAsync(cancellationToken);

        var items = await MapRequestDtosAsync(decisions, otherUserIdSelector: d => d.FromUserId, MatchRequestStatus.Rejected, cancellationToken);
        return (new MatchRequestListResponse { Items = items, Count = items.Count }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestCountsDto? Counts, string? Error, int StatusCode)> GetRequestCountsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default)
    {
        var connectedIds = await GetConnectedOtherUserIdsAsync(currentUserId, cancellationToken);
        var connectedSet = connectedIds.ToHashSet();

        var mySkips = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Skip)
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken);
        var skipSet = mySkips.ToHashSet();

        var rejectedByThem = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.ToUserId == currentUserId && d.Decision == MatchDecisionType.Skip)
            .Select(d => d.FromUserId)
            .ToListAsync(cancellationToken);
        var rejectedByThemSet = rejectedByThem.ToHashSet();

        var outgoing = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Connect)
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken);

        var incoming = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.ToUserId == currentUserId && d.Decision == MatchDecisionType.Connect)
            .Select(d => d.FromUserId)
            .ToListAsync(cancellationToken);

        var sentPending = outgoing.Count(id => !connectedSet.Contains(id) && !rejectedByThemSet.Contains(id));
        var incomingPending = incoming.Count(id => !connectedSet.Contains(id) && !skipSet.Contains(id));
        var rejected = incoming.Count(id => !connectedSet.Contains(id) && skipSet.Contains(id));

        return (new MatchRequestCountsDto
        {
            SentPendingCount = sentPending,
            IncomingCount = incomingPending,
            RejectedCount = rejected
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> AcceptRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default)
    {
        var request = await _context.MatchDecisions
            .FirstOrDefaultAsync(d => d.Id == requestId, cancellationToken);
        if (request is null || request.Decision != MatchDecisionType.Connect)
            return (null, "Request not found", StatusCodes.Status404NotFound);

        if (request.ToUserId != currentUserId)
            return (null, "Only the recipient can accept this request", StatusCodes.Status403Forbidden);

        if (await IsBlockedEitherWayAsync(currentUserId, request.FromUserId, cancellationToken))
            return (null, "Request not available", StatusCodes.Status404NotFound);

        var (a, b) = Connection.CanonicalPair(currentUserId, request.FromUserId);
        var existing = await _context.Connections.AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserAId == a && c.UserBId == b, cancellationToken);
        if (existing is not null)
        {
            await UpsertDecisionAsync(currentUserId, request.FromUserId, MatchDecisionType.Connect, cancellationToken);
            return (new MatchRequestActionResponse
            {
                Success = true,
                Status = MatchRequestStatus.Accepted,
                ConnectionId = existing.Id,
                RequestId = request.Id
            }, null, StatusCodes.Status200OK);
        }

        var connectResult = await ConnectAsync(currentUserId, request.FromUserId, cancellationToken);
        if (connectResult.Response is null)
            return (null, connectResult.Error, connectResult.StatusCode);

        return (new MatchRequestActionResponse
        {
            Success = true,
            Status = MatchRequestStatus.Accepted,
            ConnectionId = connectResult.Response.ConnectionId,
            RequestId = request.Id
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> RejectRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default)
    {
        var request = await _context.MatchDecisions.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == requestId, cancellationToken);
        if (request is null || request.Decision != MatchDecisionType.Connect)
            return (null, "Request not found", StatusCodes.Status404NotFound);

        if (request.ToUserId != currentUserId)
            return (null, "Only the recipient can reject this request", StatusCodes.Status403Forbidden);

        if (await IsBlockedEitherWayAsync(currentUserId, request.FromUserId, cancellationToken))
            return (null, "Request not available", StatusCodes.Status404NotFound);

        var (a, b) = Connection.CanonicalPair(currentUserId, request.FromUserId);
        var connected = await _context.Connections.AsNoTracking()
            .AnyAsync(c => c.UserAId == a && c.UserBId == b, cancellationToken);
        if (connected)
            return (null, "Request already accepted", StatusCodes.Status409Conflict);

        // Recipient Skip preserves the sender Connect row for Rejected history.
        await UpsertDecisionAsync(currentUserId, request.FromUserId, MatchDecisionType.Skip, cancellationToken);

        return (new MatchRequestActionResponse
        {
            Success = true,
            Status = MatchRequestStatus.Rejected,
            ConnectionId = null,
            RequestId = request.Id
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> CancelRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default)
    {
        var request = await _context.MatchDecisions
            .FirstOrDefaultAsync(d => d.Id == requestId, cancellationToken);
        if (request is null || request.Decision != MatchDecisionType.Connect)
            return (null, "Request not found", StatusCodes.Status404NotFound);

        if (request.FromUserId != currentUserId)
            return (null, "Only the sender can cancel this request", StatusCodes.Status403Forbidden);

        var (a, b) = Connection.CanonicalPair(request.FromUserId, request.ToUserId);
        var connected = await _context.Connections.AsNoTracking()
            .AnyAsync(c => c.UserAId == a && c.UserBId == b, cancellationToken);
        if (connected)
            return (null, "Cannot cancel an accepted request", StatusCodes.Status409Conflict);

        _context.MatchDecisions.Remove(request);
        await _context.SaveChangesAsync(cancellationToken);

        return (new MatchRequestActionResponse
        {
            Success = true,
            Status = MatchRequestStatus.Cancelled,
            ConnectionId = null,
            RequestId = requestId
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MatchRequestActionResponse? Response, string? Error, int StatusCode)> ReopenRequestAsync(
        Guid currentUserId,
        Guid requestId,
        CancellationToken cancellationToken = default)
    {
        var request = await _context.MatchDecisions.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == requestId, cancellationToken);
        if (request is null || request.Decision != MatchDecisionType.Connect)
            return (null, "Request not found", StatusCodes.Status404NotFound);

        if (request.ToUserId != currentUserId)
            return (null, "Only the recipient can reopen this rejection", StatusCodes.Status403Forbidden);

        if (await IsBlockedEitherWayAsync(currentUserId, request.FromUserId, cancellationToken))
            return (null, "Request not available", StatusCodes.Status404NotFound);

        var mySkip = await _context.MatchDecisions
            .FirstOrDefaultAsync(d =>
                d.FromUserId == currentUserId &&
                d.ToUserId == request.FromUserId &&
                d.Decision == MatchDecisionType.Skip, cancellationToken);
        if (mySkip is null)
            return (null, "Request is not rejected", StatusCodes.Status400BadRequest);

        _context.MatchDecisions.Remove(mySkip);
        await _context.SaveChangesAsync(cancellationToken);

        return (new MatchRequestActionResponse
        {
            Success = true,
            Status = MatchRequestStatus.Pending,
            ConnectionId = null,
            RequestId = request.Id
        }, null, StatusCodes.Status200OK);
    }

    private async Task<List<Guid>> GetConnectedOtherUserIdsAsync(Guid currentUserId, CancellationToken cancellationToken)
    {
        return await _context.Connections.AsNoTracking()
            .Where(c => c.UserAId == currentUserId || c.UserBId == currentUserId)
            .Select(c => c.UserAId == currentUserId ? c.UserBId : c.UserAId)
            .ToListAsync(cancellationToken);
    }

    private async Task<List<MatchRequestDto>> MapRequestDtosAsync(
        List<MatchDecision> decisions,
        Func<MatchDecision, Guid> otherUserIdSelector,
        string status,
        CancellationToken cancellationToken)
    {
        if (decisions.Count == 0) return [];

        var otherIds = decisions.Select(otherUserIdSelector).Distinct().ToList();
        var users = await _context.Users.AsNoTracking()
            .Where(u => otherIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl, u.PreferredSports, u.SkillLevel })
            .ToDictionaryAsync(u => u.Id, cancellationToken);

        var reliability = await _reliabilityService.GetScoresAsync(otherIds, cancellationToken);

        return decisions.Select(d =>
        {
            var otherId = otherUserIdSelector(d);
            users.TryGetValue(otherId, out var u);
            var userDto = new MatchRequestUserDto
            {
                Id = otherId,
                DisplayName = u?.DisplayName ?? "Player",
                AvatarUrl = u?.AvatarUrl,
                PreferredSports = UserMapper.ParsePreferredSports(u?.PreferredSports)
                    .Where(SportCatalog.IsEnabled)
                    .ToList(),
                SkillLevel = u?.SkillLevel,
                ReliabilityScore = reliability.TryGetValue(otherId, out var score) ? score : null
            };
            return new MatchRequestDto
            {
                RequestId = d.Id,
                User = userDto,
                TargetUser = userDto,
                Status = status,
                CreatedAt = d.CreatedAt,
                UpdatedAt = d.UpdatedAt
            };
        }).ToList();
    }

    private async Task<List<Guid>> GetExcludedUserIdsAsync(Guid currentUserId, CancellationToken cancellationToken)
    {
        // Only skips are excluded from the deck. Pending Connect may still surface with IsConnectionPending.
        var skippedOrDecided = await _context.MatchDecisions.AsNoTracking()
            .Where(d => d.FromUserId == currentUserId && d.Decision == MatchDecisionType.Skip)
            .Select(d => d.ToUserId)
            .ToListAsync(cancellationToken);

        var connected = await _context.Connections.AsNoTracking()
            .Where(c => c.UserAId == currentUserId || c.UserBId == currentUserId)
            .Select(c => c.UserAId == currentUserId ? c.UserBId : c.UserAId)
            .ToListAsync(cancellationToken);

        var blocked = await _context.UserBlocks.AsNoTracking()
            .Where(b => b.BlockerUserId == currentUserId || b.BlockedUserId == currentUserId)
            .Select(b => b.BlockerUserId == currentUserId ? b.BlockedUserId : b.BlockerUserId)
            .ToListAsync(cancellationToken);

        return skippedOrDecided
            .Concat(connected)
            .Concat(blocked)
            .Distinct()
            .ToList();
    }

    private async Task<bool> IsBlockedEitherWayAsync(Guid a, Guid b, CancellationToken cancellationToken)
    {
        return await _context.UserBlocks.AsNoTracking()
            .AnyAsync(x =>
                (x.BlockerUserId == a && x.BlockedUserId == b) ||
                (x.BlockerUserId == b && x.BlockedUserId == a), cancellationToken);
    }

    private async Task<MatchDecision> UpsertDecisionAsync(
        Guid fromUserId,
        Guid toUserId,
        MatchDecisionType decision,
        CancellationToken cancellationToken)
    {
        var existing = await _context.MatchDecisions
            .FirstOrDefaultAsync(d => d.FromUserId == fromUserId && d.ToUserId == toUserId, cancellationToken);

        if (existing is null)
        {
            existing = new MatchDecision
            {
                Id = Guid.NewGuid(),
                FromUserId = fromUserId,
                ToUserId = toUserId,
                Decision = decision,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _context.MatchDecisions.Add(existing);
        }
        else
        {
            existing.Decision = decision;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private static bool IsValidCoordinate(double latitude, double longitude) =>
        latitude is >= -90 and <= 90 &&
        longitude is >= -180 and <= 180 &&
        !(latitude == 0 && longitude == 0);

    private static string EncodeCursor(double score, Guid userId)
    {
        var raw = $"{score:F6}|{userId:D}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
    }

    private static void ParseCursor(string? cursor, out double? score, out Guid? userId)
    {
        score = null;
        userId = null;
        if (string.IsNullOrWhiteSpace(cursor)) return;

        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
            var parts = raw.Split('|', 2);
            if (parts.Length != 2) return;
            if (double.TryParse(parts[0], out var s) && Guid.TryParse(parts[1], out var id))
            {
                score = s;
                userId = id;
            }
        }
        catch
        {
            // Invalid cursor ignored — starts from beginning.
        }
    }
}
