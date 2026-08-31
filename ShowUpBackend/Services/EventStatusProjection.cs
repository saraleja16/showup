using System.Text.Json;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Services;

/// <summary>
/// Single shared projection for authoritative event status, UTC timing, result summary, and permissions.
/// Controllers must not recalculate lifecycle independently.
/// </summary>
public static class EventStatusProjection
{
    public sealed record Snapshot(
        string Status,
        DateTime ScheduledStart,
        DateTime ScheduledEnd,
        DateTime ServerNow,
        int ElapsedSeconds,
        int? RemainingSeconds,
        int? SecondsUntilStart,
        EventResultSummaryDto? ResultSummary,
        EventPermissionsDto Permissions);

    public static Snapshot Build(
        Event ev,
        DateTime utcNow,
        EventResult? result,
        int startingSoonMinutes,
        bool isHost,
        bool isActiveParticipant)
    {
        var status = EventLifecycleCalculator.Calculate(ev, utcNow, result, startingSoonMinutes);
        var (elapsed, remaining) = EventLifecycleCalculator.Timing(ev, utcNow, status);
        var start = DateTime.SpecifyKind(ev.ScheduledAt, DateTimeKind.Utc);
        var end = EventLifecycleCalculator.GetScheduledEnd(ev);

        int? secondsUntilStart = null;
        if (status is EventLifecycleStatus.Upcoming or EventLifecycleStatus.StartingSoon)
            secondsUntilStart = Math.Max(0, (int)(start - utcNow).TotalSeconds);

        return new Snapshot(
            Status: status,
            ScheduledStart: start,
            ScheduledEnd: end,
            ServerNow: utcNow,
            ElapsedSeconds: elapsed,
            RemainingSeconds: remaining,
            SecondsUntilStart: secondsUntilStart,
            ResultSummary: MapResultSummary(result),
            Permissions: ResolvePermissions(ev, utcNow, result, isHost, isActiveParticipant));
    }

    public static EventPermissionsDto ResolvePermissions(
        Event ev,
        DateTime utcNow,
        EventResult? result,
        bool isHost,
        bool isActiveParticipant)
    {
        var active = isHost || isActiveParticipant;
        var scored = EventLifecycleCalculator.IsScoredMatch(ev);
        var afterStart = utcNow >= DateTime.SpecifyKind(ev.ScheduledAt, DateTimeKind.Utc);

        var canSubmit = active
            && scored
            && afterStart
            && (result is null || result.Status == EventResultStatus.Disputed);

        var pendingLike = result is not null
            && result.Status is EventResultStatus.PendingConfirmation or EventResultStatus.Disputed;

        var canConfirmOrDispute = active
            && pendingLike
            && result is not null
            && result.SubmittedByUserId != Guid.Empty;

        // Viewer identity is checked by callers via isActiveParticipant/isHost;
        // submitter self-confirm is blocked when viewerUserId is known.
        return new EventPermissionsDto
        {
            CanSubmitResult = canSubmit,
            CanConfirmResult = canConfirmOrDispute,
            CanDisputeResult = canConfirmOrDispute,
            CanManageAttendance = isHost
        };
    }

    public static EventPermissionsDto ResolvePermissionsForViewer(
        Event ev,
        DateTime utcNow,
        EventResult? result,
        Guid? viewerUserId,
        bool isHost,
        bool isActiveParticipant)
    {
        var perms = ResolvePermissions(ev, utcNow, result, isHost, isActiveParticipant);
        if (viewerUserId is null)
        {
            return new EventPermissionsDto
            {
                CanSubmitResult = false,
                CanConfirmResult = false,
                CanDisputeResult = false,
                CanManageAttendance = false
            };
        }

        if (result is not null && result.SubmittedByUserId == viewerUserId.Value)
        {
            perms.CanConfirmResult = false;
            perms.CanDisputeResult = false;
        }

        return perms;
    }

    public static EventResultSummaryDto? MapResultSummary(EventResult? result)
    {
        if (result is null) return null;

        var sets = ParseScoreRows(result.ScoreJson, "sets");
        var games = ParseScoreRows(result.ScoreJson, "games");
        if (games.Count == 0 &&
            string.Equals(result.Sport, "pickleball", StringComparison.OrdinalIgnoreCase) &&
            sets.Count > 0)
        {
            games = sets;
            sets = [];
        }

        return new EventResultSummaryDto
        {
            ResultId = result.Id,
            EventId = result.EventId,
            Status = result.Status,
            Sport = result.Sport,
            Summary = result.Summary,
            ScoreA = result.ScoreA,
            ScoreB = result.ScoreB,
            UnitsWonA = result.UnitsWonA,
            UnitsWonB = result.UnitsWonB,
            Sets = sets.Count > 0 ? sets : null,
            Games = games.Count > 0 ? games : null,
            SideALabel = result.SideALabel,
            SideBLabel = result.SideBLabel,
            SubmittedByUserId = result.SubmittedByUserId,
            SubmittedAt = result.SubmittedAt,
            ConfirmedByUserId = result.ConfirmedByUserId,
            ConfirmedAt = result.ConfirmedAt,
            DisputedByUserId = result.DisputedByUserId
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
}
