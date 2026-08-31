using System.Text.Json;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

/// <summary>
/// Shared UTC lifecycle calculation for My Games / Profile cards and /live.
/// </summary>
public static class EventLifecycleCalculator
{
    public const int StartingSoonMinutes = 15;
    public const int DefaultDurationMinutes = 60;
    public const int SoccerDefaultDurationMinutes = 90;

    public static DateTime GetScheduledEnd(Event ev)
    {
        var duration = ResolveDurationMinutes(ev);
        return ev.ScheduledAt.AddMinutes(duration);
    }

    public static int ResolveDurationMinutes(Event ev)
    {
        var fromDetails = TryReadDurationMinutes(ev.SportDetails);
        if (fromDetails is > 0)
            return fromDetails.Value;

        return string.Equals(ev.Sport, "soccer", StringComparison.OrdinalIgnoreCase)
            ? SoccerDefaultDurationMinutes
            : DefaultDurationMinutes;
    }

    public static bool IsScoredMatch(Event ev)
    {
        if (!SportCatalog.IsEnabled(ev.Sport))
            return false;

        // Soccer has no sessionType — always treated as scored match activity.
        if (string.Equals(ev.Sport, "soccer", StringComparison.OrdinalIgnoreCase))
            return true;

        var session = TryReadString(ev.SportDetails, "sessionType");
        if (string.IsNullOrWhiteSpace(session))
            return true;

        // Non-scored practice-style sessions complete without a result.
        return session.Equals("match", StringComparison.OrdinalIgnoreCase);
    }

    public static string Calculate(
        Event ev,
        DateTime utcNow,
        EventResult? result,
        int? startingSoonMinutes = null)
    {
        var start = DateTime.SpecifyKind(ev.ScheduledAt, DateTimeKind.Utc);
        var end = GetScheduledEnd(ev);
        var soonWindow = startingSoonMinutes is > 0 ? startingSoonMinutes.Value : StartingSoonMinutes;
        var soon = start.AddMinutes(-soonWindow);

        if (utcNow < soon)
            return EventLifecycleStatus.Upcoming;
        if (utcNow < start)
            return EventLifecycleStatus.StartingSoon;
        if (utcNow < end)
            return EventLifecycleStatus.Live;

        // After scheduled end.
        if (result is not null)
        {
            if (result.Status == EventResultStatus.Confirmed)
                return EventLifecycleStatus.Completed;
            return EventLifecycleStatus.ResultPending;
        }

        if (!IsScoredMatch(ev))
            return EventLifecycleStatus.Completed;

        return EventLifecycleStatus.Finished;
    }

    public static (int ElapsedSeconds, int? RemainingSeconds) Timing(
        Event ev,
        DateTime utcNow,
        string status)
    {
        var start = DateTime.SpecifyKind(ev.ScheduledAt, DateTimeKind.Utc);
        var end = GetScheduledEnd(ev);

        if (status is EventLifecycleStatus.Upcoming or EventLifecycleStatus.StartingSoon)
        {
            var remaining = Math.Max(0, (int)(start - utcNow).TotalSeconds);
            return (0, remaining);
        }

        if (status == EventLifecycleStatus.Live)
        {
            var elapsed = Math.Max(0, (int)(utcNow - start).TotalSeconds);
            var remaining = Math.Max(0, (int)(end - utcNow).TotalSeconds);
            return (elapsed, remaining);
        }

        var total = Math.Max(0, (int)(end - start).TotalSeconds);
        return (total, null);
    }

    private static int? TryReadDurationMinutes(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson))
            return null;
        try
        {
            using var doc = JsonDocument.Parse(sportDetailsJson);
            if (doc.RootElement.TryGetProperty("durationMinutes", out var prop) &&
                prop.ValueKind == JsonValueKind.Number &&
                prop.TryGetInt32(out var minutes))
            {
                return minutes;
            }
        }
        catch (JsonException)
        {
            // ignore malformed details
        }

        return null;
    }

    private static string? TryReadString(string? sportDetailsJson, string property)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson))
            return null;
        try
        {
            using var doc = JsonDocument.Parse(sportDetailsJson);
            if (doc.RootElement.TryGetProperty(property, out var prop) &&
                prop.ValueKind == JsonValueKind.String)
            {
                return prop.GetString();
            }
        }
        catch (JsonException)
        {
            // ignore
        }

        return null;
    }
}
