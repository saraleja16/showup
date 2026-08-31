using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

/// <summary>
/// Shared profile portfolio stats + lists.
///
/// Games Played rule:
/// - Event lifecycle is Completed (shared EventLifecycleCalculator).
/// - User has an accepted participant row (not CancelledEarly/CancelledLate).
/// - Attendance is Present (Attended), OR legacy fallback:
///   Registered on a Completed event where no participant has VerificationMethod
///   (pre-attendance / never verified events). Absent/NoShow/Excused never count.
///
/// Games Hosted rule:
/// - Every event with CreatorId == user (Upcoming/StartingSoon/Live/Finished/ResultPending/Completed).
///
/// Upcoming rule:
/// - User is host OR active participant (Registered/Attended),
/// - lifecycle is Upcoming | StartingSoon | Live (not Finished/ResultPending/Completed).
/// </summary>
public class ProfilePortfolioService : IProfilePortfolioService
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    private readonly AppDbContext _db;
    private readonly EventLifecycleOptions _lifecycleOptions;

    public ProfilePortfolioService(AppDbContext db, IOptions<EventLifecycleOptions> lifecycleOptions)
    {
        _db = db;
        _lifecycleOptions = lifecycleOptions.Value;
    }

    public async Task<ProfileStatsDto> GetStatsAsync(Guid userId, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var bundle = await LoadUserEventBundleAsync(userId);
        var classified = Classify(userId, bundle, now);

        return new ProfileStatsDto
        {
            GamesPlayed = classified.Played.Count,
            GamesHosted = classified.Hosted.Count,
            UpcomingCount = classified.Upcoming.Count
        };
    }

    public async Task<ProfilePortfolioResponse?> GetPortfolioAsync(
        Guid userId,
        int playedLimit = DefaultPageSize,
        int hostedLimit = DefaultPageSize,
        int upcomingLimit = DefaultPageSize)
    {
        if (!await _db.Users.AsNoTracking().AnyAsync(u => u.Id == userId))
            return null;

        var now = DateTime.UtcNow;
        var bundle = await LoadUserEventBundleAsync(userId);
        var classified = Classify(userId, bundle, now);

        var playedIds = OrderPlayed(classified.Played).Take(ClampLimit(playedLimit)).Select(e => e.Id).ToList();
        var hostedIds = OrderHosted(classified.Hosted, now).Take(ClampLimit(hostedLimit)).Select(e => e.Id).ToList();
        var upcomingIds = OrderUpcoming(classified.Upcoming).Take(ClampLimit(upcomingLimit)).Select(e => e.Id).ToList();

        var allIds = playedIds.Concat(hostedIds).Concat(upcomingIds).Distinct().ToList();
        var cards = await BuildGameCardsAsync(userId, allIds, bundle, now);

        return new ProfilePortfolioResponse
        {
            Stats = new ProfileStatsDto
            {
                GamesPlayed = classified.Played.Count,
                GamesHosted = classified.Hosted.Count,
                UpcomingCount = classified.Upcoming.Count
            },
            Played = playedIds.Select(id => cards[id]).ToList(),
            Hosted = hostedIds.Select(id => cards[id]).ToList(),
            UpcomingGames = upcomingIds.Select(id => cards[id]).ToList()
        };
    }

    public async Task<(PortfolioGamesPageResponse? Page, string? Error, int StatusCode)> GetGamesAsync(
        Guid userId,
        string type,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        if (!await _db.Users.AsNoTracking().AnyAsync(u => u.Id == userId))
            return (null, "User not found", 404);

        var normalized = (type ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is not (PortfolioGameType.Played or PortfolioGameType.Hosted or PortfolioGameType.Upcoming))
            return (null, "type must be played, hosted, or upcoming", 400);

        page = Math.Max(1, page);
        pageSize = ClampPageSize(pageSize);
        var now = DateTime.UtcNow;
        var bundle = await LoadUserEventBundleAsync(userId);
        var classified = Classify(userId, bundle, now);

        List<Event> source = normalized switch
        {
            PortfolioGameType.Played => OrderPlayed(classified.Played),
            PortfolioGameType.Hosted => OrderHosted(classified.Hosted, now),
            _ => OrderUpcoming(classified.Upcoming)
        };

        var total = source.Count;
        var pageIds = source.Skip((page - 1) * pageSize).Take(pageSize).Select(e => e.Id).ToList();
        var cards = await BuildGameCardsAsync(userId, pageIds, bundle, now);

        return (new PortfolioGamesPageResponse
        {
            Type = normalized,
            Total = total,
            Page = page,
            PageSize = pageSize,
            Items = pageIds.Select(id => cards[id]).ToList()
        }, null, 200);
    }

    private sealed class UserEventBundle
    {
        public List<Event> HostedEvents { get; init; } = [];
        public List<EventParticipant> UserParticipations { get; init; } = [];
        public Dictionary<Guid, Event> ParticipatedEvents { get; init; } = [];
        public Dictionary<Guid, EventResult> Results { get; init; } = [];
        public Dictionary<Guid, List<EventParticipant>> ParticipantsByEvent { get; init; } = [];
        public Dictionary<Guid, bool> EventHasAnyVerification { get; init; } = [];
    }

    private sealed class ClassifiedEvents
    {
        public List<Event> Played { get; init; } = [];
        public List<Event> Hosted { get; init; } = [];
        public List<Event> Upcoming { get; init; } = [];
    }

    private async Task<UserEventBundle> LoadUserEventBundleAsync(Guid userId)
    {
        var hosted = await _db.Events.AsNoTracking()
            .Include(e => e.Venue)
            .Where(e => e.CreatorId == userId)
            .ToListAsync();

        var userParts = await _db.EventParticipants.AsNoTracking()
            .Where(ep => ep.UserId == userId)
            .ToListAsync();

        var participatedIds = userParts.Select(p => p.EventId).Distinct().ToList();
        var hostedIds = hosted.Select(e => e.Id).ToList();
        var allEventIds = hostedIds.Union(participatedIds).ToList();

        var participatedEvents = await _db.Events.AsNoTracking()
            .Include(e => e.Venue)
            .Where(e => participatedIds.Contains(e.Id) && e.CreatorId != userId)
            .ToListAsync();

        var eventsById = hosted.Concat(participatedEvents).GroupBy(e => e.Id).ToDictionary(g => g.Key, g => g.First());

        var results = await _db.EventResults.AsNoTracking()
            .Where(r => allEventIds.Contains(r.EventId))
            .ToDictionaryAsync(r => r.EventId);

        var allParticipants = await _db.EventParticipants.AsNoTracking()
            .Where(ep => allEventIds.Contains(ep.EventId))
            .ToListAsync();

        var byEvent = allParticipants
            .GroupBy(p => p.EventId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var hasVerification = byEvent.ToDictionary(
            kv => kv.Key,
            kv => kv.Value.Any(p => !string.IsNullOrWhiteSpace(p.VerificationMethod)));

        return new UserEventBundle
        {
            HostedEvents = hosted,
            UserParticipations = userParts,
            ParticipatedEvents = eventsById,
            Results = results,
            ParticipantsByEvent = byEvent,
            EventHasAnyVerification = hasVerification
        };
    }

    private ClassifiedEvents Classify(Guid userId, UserEventBundle bundle, DateTime now)
    {
        var played = new List<Event>();
        var upcoming = new List<Event>();
        var seenUpcoming = new HashSet<Guid>();
        var seenPlayed = new HashSet<Guid>();
        var soon = StartingSoonMinutes;

        foreach (var ev in bundle.HostedEvents)
        {
            bundle.Results.TryGetValue(ev.Id, out var result);
            var status = EventLifecycleCalculator.Calculate(ev, now, result, soon);

            if (IsUpcomingLifecycle(status) && seenUpcoming.Add(ev.Id))
                upcoming.Add(ev);

            var part = bundle.UserParticipations.FirstOrDefault(p => p.EventId == ev.Id);
            if (part is not null &&
                QualifiesAsPlayed(ev, part, status, bundle.EventHasAnyVerification.GetValueOrDefault(ev.Id)) &&
                seenPlayed.Add(ev.Id))
            {
                played.Add(ev);
            }
        }

        foreach (var part in bundle.UserParticipations)
        {
            if (!bundle.ParticipatedEvents.TryGetValue(part.EventId, out var ev))
                continue;

            bundle.Results.TryGetValue(ev.Id, out var result);
            var status = EventLifecycleCalculator.Calculate(ev, now, result, soon);

            if (IsActiveAssociation(part) && IsUpcomingLifecycle(status) && seenUpcoming.Add(ev.Id))
                upcoming.Add(ev);

            if (QualifiesAsPlayed(ev, part, status, bundle.EventHasAnyVerification.GetValueOrDefault(ev.Id)) &&
                seenPlayed.Add(ev.Id))
            {
                played.Add(ev);
            }
        }

        return new ClassifiedEvents
        {
            Played = played,
            Hosted = bundle.HostedEvents.ToList(),
            Upcoming = upcoming
        };
    }

    private int StartingSoonMinutes =>
        _lifecycleOptions.StartingSoonMinutes > 0
            ? _lifecycleOptions.StartingSoonMinutes
            : EventLifecycleCalculator.StartingSoonMinutes;

    internal static bool QualifiesAsPlayed(
        Event ev,
        EventParticipant part,
        string lifecycleStatus,
        bool eventHasAnyVerification)
    {
        if (lifecycleStatus != EventLifecycleStatus.Completed)
            return false;

        if (part.Status is ParticipationStatus.CancelledEarly
            or ParticipationStatus.CancelledLate
            or ParticipationStatus.NoShow
            or ParticipationStatus.Excused)
        {
            return false;
        }

        if (part.Status == ParticipationStatus.Attended)
            return true;

        // Legacy fallback: completed event with no verification records yet —
        // treat still-Registered accepted participants as having played.
        if (part.Status == ParticipationStatus.Registered && !eventHasAnyVerification)
            return true;

        return false;
    }

    private static bool IsActiveAssociation(EventParticipant part) =>
        part.Status is ParticipationStatus.Registered or ParticipationStatus.Attended;

    private static bool IsUpcomingLifecycle(string status) =>
        status is EventLifecycleStatus.Upcoming
            or EventLifecycleStatus.StartingSoon
            or EventLifecycleStatus.Live;

    private static List<Event> OrderPlayed(List<Event> events) =>
        events.OrderByDescending(e => e.ScheduledAt).ToList();

    private static List<Event> OrderUpcoming(List<Event> events) =>
        events.OrderBy(e => e.ScheduledAt).ToList();

    private List<Event> OrderHosted(List<Event> events, DateTime now) =>
        events
            .OrderBy(e =>
            {
                var start = DateTime.SpecifyKind(e.ScheduledAt, DateTimeKind.Utc);
                var end = EventLifecycleCalculator.GetScheduledEnd(e);
                if (now >= start && now < end) return 0; // live
                if (now < start && now >= start.AddMinutes(-StartingSoonMinutes)) return 1;
                if (now < start) return 2;
                return 3;
            })
            .ThenBy(e => e.ScheduledAt)
            .ToList();

    private async Task<Dictionary<Guid, PortfolioGameDto>> BuildGameCardsAsync(
        Guid profileUserId,
        List<Guid> eventIds,
        UserEventBundle bundle,
        DateTime now)
    {
        var result = new Dictionary<Guid, PortfolioGameDto>();
        if (eventIds.Count == 0)
            return result;

        var missingEvents = eventIds.Where(id => !bundle.ParticipatedEvents.ContainsKey(id)).ToList();
        if (missingEvents.Count > 0)
        {
            var loaded = await _db.Events.AsNoTracking()
                .Include(e => e.Venue)
                .Where(e => missingEvents.Contains(e.Id))
                .ToListAsync();
            foreach (var e in loaded)
                bundle.ParticipatedEvents[e.Id] = e;
        }

        var participantUserIds = eventIds
            .SelectMany(id => bundle.ParticipantsByEvent.GetValueOrDefault(id) ?? [])
            .Select(p => p.UserId)
            .Distinct()
            .ToList();

        // Ensure host ids are included even if somehow missing from participant rows.
        foreach (var id in eventIds)
        {
            if (bundle.ParticipatedEvents.TryGetValue(id, out var ev))
                participantUserIds.Add(ev.CreatorId);
        }

        participantUserIds = participantUserIds.Distinct().ToList();

        var users = await _db.Users.AsNoTracking()
            .Where(u => participantUserIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl })
            .ToDictionaryAsync(u => u.Id);

        var positionRows = await _db.EventPositions.AsNoTracking()
            .Where(p => eventIds.Contains(p.EventId) && p.ClaimedByUserId != null)
            .Select(p => new { p.EventId, p.Team, UserId = p.ClaimedByUserId!.Value })
            .ToListAsync();

        var positionsByEvent = positionRows
            .GroupBy(p => p.EventId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<PositionClaim>)g
                    .Select(x => new PositionClaim(x.EventId, x.Team, x.UserId))
                    .ToList());

        foreach (var eventId in eventIds)
        {
            if (!bundle.ParticipatedEvents.TryGetValue(eventId, out var ev))
                continue;

            bundle.Results.TryGetValue(eventId, out var eventResult);
            var parts = (bundle.ParticipantsByEvent.GetValueOrDefault(eventId) ?? [])
                .Where(p => p.Status is not (ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate))
                .ToList();
            var isHost = ev.CreatorId == profileUserId;
            var isActiveParticipant = isHost || parts.Any(p => p.UserId == profileUserId);
            var snap = EventStatusProjection.Build(
                ev, now, eventResult, StartingSoonMinutes, isHost, isActiveParticipant);
            snap = snap with
            {
                Permissions = EventStatusProjection.ResolvePermissionsForViewer(
                    ev, now, eventResult, profileUserId, isHost, isActiveParticipant)
            };
            var lifecycle = snap.Status;

            var participantDtos = parts.Select(p =>
            {
                users.TryGetValue(p.UserId, out var u);
                return new PortfolioParticipantDto
                {
                    UserId = p.UserId,
                    DisplayName = u?.DisplayName ?? "Player",
                    AvatarUrl = u?.AvatarUrl,
                    AttendanceStatus = LiveAttendanceStatus.FromParticipation(p.Status),
                    VerificationMethod = p.VerificationMethod,
                    VerificationLabel = VerificationLabel(p.VerificationMethod),
                    IsHost = p.UserId == ev.CreatorId
                };
            }).ToList();

            // Ensure host appears in participant list for display when missing.
            if (participantDtos.All(p => p.UserId != ev.CreatorId) &&
                users.TryGetValue(ev.CreatorId, out var hostUser))
            {
                participantDtos.Insert(0, new PortfolioParticipantDto
                {
                    UserId = ev.CreatorId,
                    DisplayName = hostUser.DisplayName,
                    AvatarUrl = hostUser.AvatarUrl,
                    AttendanceStatus = LiveAttendanceStatus.Pending,
                    IsHost = true
                });
            }

            positionsByEvent.TryGetValue(eventId, out var eventPositions);
            AssignSides(ev, participantDtos, eventPositions);

            var sideA = new PortfolioSideDto
            {
                Side = "A",
                Label = eventResult?.SideALabel,
                Participants = participantDtos.Where(p => p.Side == "A").ToList()
            };
            var sideB = new PortfolioSideDto
            {
                Side = "B",
                Label = eventResult?.SideBLabel,
                Participants = participantDtos.Where(p => p.Side == "B").ToList()
            };

            // 1v1 identity fix: if Side B empty but another real participant exists, place them on B.
            if (sideB.Participants.Count == 0)
            {
                var unassigned = participantDtos.Where(p => p.Side is null or "").ToList();
                var onA = sideA.Participants.Select(p => p.UserId).ToHashSet();
                var opponent = participantDtos.FirstOrDefault(p => !onA.Contains(p.UserId) && !p.IsHost)
                    ?? participantDtos.FirstOrDefault(p => !onA.Contains(p.UserId));
                if (opponent is not null)
                {
                    opponent.Side = "B";
                    sideB.Participants.Add(opponent);
                }
                else if (unassigned.Count > 0)
                {
                    foreach (var u in unassigned.Where(x => x.Side != "A"))
                    {
                        u.Side = "B";
                        sideB.Participants.Add(u);
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(sideA.Label) && sideA.Participants.Count > 0)
                sideA.Label = string.Join(" / ", sideA.Participants.Select(p => p.DisplayName));
            if (string.IsNullOrWhiteSpace(sideB.Label) && sideB.Participants.Count > 0)
                sideB.Label = string.Join(" / ", sideB.Participants.Select(p => p.DisplayName));

            var userSide = participantDtos.FirstOrDefault(p => p.UserId == profileUserId)?.Side;
            var resultDto = MapResult(eventResult, ev.Sport);
            var userPart = parts.FirstOrDefault(p => p.UserId == profileUserId);

            result[eventId] = new PortfolioGameDto
            {
                EventId = ev.Id,
                Title = ev.Title,
                Sport = ev.Sport,
                VenueName = ev.Venue?.Name,
                ScheduledStart = snap.ScheduledStart,
                ScheduledEnd = snap.ScheduledEnd,
                ServerNow = snap.ServerNow,
                EventStatus = lifecycle,
                Status = lifecycle,
                ElapsedSeconds = snap.ElapsedSeconds,
                RemainingSeconds = snap.RemainingSeconds,
                SecondsUntilStart = snap.SecondsUntilStart,
                IsHost = ev.CreatorId == profileUserId,
                ParticipantCount = participantDtos.Count,
                PresentCount = participantDtos.Count(p => p.AttendanceStatus == LiveAttendanceStatus.Present),
                PendingCount = participantDtos.Count(p => p.AttendanceStatus == LiveAttendanceStatus.Pending),
                AbsentCount = participantDtos.Count(p =>
                    p.AttendanceStatus is LiveAttendanceStatus.Absent or LiveAttendanceStatus.Excused),
                Participants = participantDtos,
                SideA = sideA,
                SideB = sideB,
                UserSide = userSide,
                Result = resultDto,
                UserOutcome = ComputeUserOutcome(resultDto, userSide),
                AttendanceVerificationLabel = VerificationLabel(userPart?.VerificationMethod),
                Permissions = snap.Permissions
            };
        }

        return result;
    }

    private sealed record PositionClaim(Guid EventId, string Team, Guid UserId);

    private static void AssignSides(
        Event ev,
        List<PortfolioParticipantDto> participants,
        IReadOnlyList<PositionClaim>? positions)
    {
        // Prefer formation/team claims when present.
        if (positions is { Count: > 0 })
        {
            foreach (var p in participants)
            {
                var claim = positions.FirstOrDefault(x => x.UserId == p.UserId);
                if (claim is null || string.IsNullOrWhiteSpace(claim.Team)) continue;
                p.Side = NormalizeSide(claim.Team);
            }
        }

        var sport = ev.Sport.ToLowerInvariant();
        var isSinglesStyle = sport is "tennis" or "pickleball";

        // 1v1 / small match: host → A, other → B when sides unset.
        if (isSinglesStyle || participants.Count <= 2)
        {
            if (participants.Any(p => string.IsNullOrWhiteSpace(p.Side)))
            {
                var host = participants.FirstOrDefault(p => p.IsHost);
                var others = participants.Where(p => !p.IsHost).ToList();
                if (host is not null && string.IsNullOrWhiteSpace(host.Side))
                    host.Side = "A";
                if (others.Count >= 1 && string.IsNullOrWhiteSpace(others[0].Side))
                    others[0].Side = "B";
                for (var i = 1; i < others.Count; i++)
                {
                    if (string.IsNullOrWhiteSpace(others[i].Side))
                        others[i].Side = i % 2 == 0 ? "B" : "A";
                }
            }
        }
    }

    private static string NormalizeSide(string team)
    {
        var t = team.Trim().ToLowerInvariant();
        if (t is "a" or "home" or "team_a" or "teama" or "side_a" or "sidea")
            return "A";
        if (t is "b" or "away" or "team_b" or "teamb" or "side_b" or "sideb")
            return "B";
        if (t.StartsWith('a')) return "A";
        if (t.StartsWith('b')) return "B";
        return team.ToUpperInvariant()[..1];
    }

    private static PortfolioResultDto? MapResult(EventResult? result, string sport)
    {
        if (result is null) return null;

        var sets = ParseScoreRows(result.ScoreJson, "sets");
        var games = ParseScoreRows(result.ScoreJson, "games");
        if (games.Count == 0 &&
            string.Equals(sport, "pickleball", StringComparison.OrdinalIgnoreCase) &&
            sets.Count > 0)
        {
            games = sets;
            sets = [];
        }

        var sideAWins = result.UnitsWonA;
        var sideBWins = result.UnitsWonB;
        if (sideAWins is null && sets.Count > 0)
        {
            sideAWins = sets.Count(s => s.SideA > s.SideB);
            sideBWins = sets.Count(s => s.SideB > s.SideA);
        }
        if (sideAWins is null && games.Count > 0)
        {
            sideAWins = games.Count(s => s.SideA > s.SideB);
            sideBWins = games.Count(s => s.SideB > s.SideA);
        }

        string? winner = null;
        if (result.ScoreA is not null && result.ScoreB is not null)
        {
            if (result.ScoreA > result.ScoreB) winner = "A";
            else if (result.ScoreB > result.ScoreA) winner = "B";
            else winner = "Draw";
        }
        else if (sideAWins is not null && sideBWins is not null)
        {
            if (sideAWins > sideBWins) winner = "A";
            else if (sideBWins > sideAWins) winner = "B";
            else winner = "Draw";
        }

        return new PortfolioResultDto
        {
            ResultId = result.Id,
            Status = result.Status,
            Sport = result.Sport,
            Summary = result.Summary,
            WinnerSide = winner,
            ScoreA = result.ScoreA,
            ScoreB = result.ScoreB,
            SideAWins = sideAWins,
            SideBWins = sideBWins,
            Sets = sets.Count > 0 ? sets : null,
            Games = games.Count > 0 ? games : null,
            SideALabel = result.SideALabel,
            SideBLabel = result.SideBLabel
        };
    }

    private static List<SideScoreDto> ParseScoreRows(string scoreJson, string property)
    {
        var list = new List<SideScoreDto>();
        if (string.IsNullOrWhiteSpace(scoreJson)) return list;
        try
        {
            using var doc = JsonDocument.Parse(scoreJson);
            if (!doc.RootElement.TryGetProperty(property, out var arr) ||
                arr.ValueKind != JsonValueKind.Array)
            {
                return list;
            }

            foreach (var el in arr.EnumerateArray())
            {
                var a = el.TryGetProperty("sideA", out var pa) ? pa.GetInt32() : 0;
                var b = el.TryGetProperty("sideB", out var pb) ? pb.GetInt32() : 0;
                list.Add(new SideScoreDto { SideA = a, SideB = b });
            }
        }
        catch (JsonException)
        {
            // ignore malformed payloads
        }

        return list;
    }

    private static string? ComputeUserOutcome(PortfolioResultDto? result, string? userSide)
    {
        if (result is null) return null;
        if (result.Status != EventResultStatus.Confirmed)
            return PortfolioUserOutcome.Pending;
        if (string.IsNullOrWhiteSpace(userSide) || result.WinnerSide is null)
            return PortfolioUserOutcome.Pending;
        if (result.WinnerSide == "Draw")
            return PortfolioUserOutcome.Draw;
        if (result.WinnerSide == userSide)
            return PortfolioUserOutcome.Win;
        return PortfolioUserOutcome.Loss;
    }

    private static string? VerificationLabel(string? method) => method switch
    {
        AttendanceVerificationMethod.AutomaticLocation => "Auto Verified",
        AttendanceVerificationMethod.HostManual => "Host Confirmed",
        AttendanceVerificationMethod.ParticipantManual => "Teammate Confirmed",
        _ => null
    };

    private static int ClampPageSize(int pageSize) =>
        Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaxPageSize);

    /// <summary>0 means return no items (stats-only callers); otherwise clamp to MaxPageSize.</summary>
    private static int ClampLimit(int limit) =>
        limit <= 0 ? 0 : Math.Clamp(limit, 1, MaxPageSize);
}
