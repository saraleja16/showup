using ShowUpBackend.Configuration;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Matchmaking;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

/// <summary>
/// Validates and normalizes AI-produced search filters. Never trusts raw AI output.
/// </summary>
public static class EventSearchFilterValidator
{
    public const int MaxLocationQueryLength = 100;
    public const double MinimumRadiusKm = 1;

    public static EventSearchFilters Validate(
        AiEventSearchFilterPayload? raw,
        MatchmakingOptions matchmakingOptions)
    {
        var result = new EventSearchFilters();
        if (raw is null) return result;

        result.IntentType = NormalizeIntent(raw.IntentType);
        result.Sport = NormalizeSport(raw.Sport);
        result.RadiusKm = NormalizeRadius(raw.RadiusKm, matchmakingOptions);
        result.Date = NormalizeDate(raw.Date);
        result.StartTime = NormalizeTime(raw.StartTime);
        result.EndTime = NormalizeTime(raw.EndTime);
        result.SkillLevel = NormalizeSkill(raw.SkillLevel);
        result.LocationQuery = NormalizeLocationQuery(raw.LocationQuery);

        if (result.StartTime is not null && result.EndTime is not null &&
            result.EndTime < result.StartTime)
        {
            result.StartTime = null;
            result.EndTime = null;
        }

        // Named place without radius → default place radius (not user-location nearby default).
        if (result.LocationQuery is not null && result.RadiusKm is null)
            result.RadiusKm = NormalizeRadius(
                NaturalLanguageEventSearchParser.DefaultPlaceRadiusKm, matchmakingOptions);

        return result;
    }

    public static InterpretedEventFiltersDto ToInterpretedDto(EventSearchFilters filters) => new()
    {
        IntentType = filters.IntentType,
        Sport = filters.Sport,
        RadiusKm = filters.RadiusKm,
        Date = filters.Date?.ToString("yyyy-MM-dd"),
        StartTime = filters.StartTime?.ToString("HH:mm"),
        EndTime = filters.EndTime?.ToString("HH:mm"),
        SkillLevel = filters.SkillLevel,
        LocationQuery = filters.LocationQuery,
        ResolvedLocation = filters.ResolvedLocation
    };

    private static string NormalizeIntent(string? intent)
    {
        if (string.IsNullOrWhiteSpace(intent))
            return AiSearchIntentTypes.Event;

        var t = intent.Trim();
        if (t.Equals("game", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("games", StringComparison.OrdinalIgnoreCase))
            return AiSearchIntentTypes.Game;

        if (t.Equals("venue", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("venues", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("court", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("courts", StringComparison.OrdinalIgnoreCase))
            return AiSearchIntentTypes.Venue;

        if (t.Equals("eventCentre", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("eventCenter", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("event_centre", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("sportsCentre", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("sportsCenter", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("sports centre", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("sports center", StringComparison.OrdinalIgnoreCase))
            return AiSearchIntentTypes.EventCentre;

        if (t.Equals("event", StringComparison.OrdinalIgnoreCase) ||
            t.Equals("events", StringComparison.OrdinalIgnoreCase))
            return AiSearchIntentTypes.Event;

        return AiSearchIntentTypes.Event;
    }

    private static string? NormalizeSport(string? sport)
    {
        if (string.IsNullOrWhiteSpace(sport)) return null;

        var trimmed = sport.Trim();
        if (SportCatalog.IsEnabled(trimmed))
            return SportCatalog.Get(trimmed)!.SportId;

        var aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["tennis"] = "tennis",
            ["soccer"] = "soccer",
            ["football"] = "soccer",
            ["futbol"] = "soccer",
            ["pickleball"] = "pickleball",
            ["pickle ball"] = "pickleball",
            ["volleyball"] = "volleyball",
            ["volley ball"] = "volleyball",
        };

        if (aliases.TryGetValue(trimmed, out var id) && SportCatalog.IsEnabled(id))
            return id;

        return null;
    }

    private static double? NormalizeRadius(double? radiusKm, MatchmakingOptions options)
    {
        if (radiusKm is null || double.IsNaN(radiusKm.Value) || double.IsInfinity(radiusKm.Value))
            return null;

        if (radiusKm.Value < MinimumRadiusKm)
            return null;

        var max = options.AbsoluteMaximumDistanceKm > 0
            ? options.AbsoluteMaximumDistanceKm
            : 100;

        return Math.Clamp(radiusKm.Value, MinimumRadiusKm, max);
    }

    private static DateOnly? NormalizeDate(string? date)
    {
        if (string.IsNullOrWhiteSpace(date)) return null;
        return DateOnly.TryParse(date.Trim(), out var parsed) ? parsed : null;
    }

    private static TimeOnly? NormalizeTime(string? time)
    {
        if (string.IsNullOrWhiteSpace(time)) return null;
        var trimmed = time.Trim();
        if (TimeOnly.TryParse(trimmed, out var parsed))
            return parsed;

        if (TimeSpan.TryParse(trimmed, out var span) && span >= TimeSpan.Zero && span < TimeSpan.FromDays(1))
            return TimeOnly.FromTimeSpan(span);

        return null;
    }

    private static string? NormalizeSkill(string? skill)
    {
        if (string.IsNullOrWhiteSpace(skill)) return null;
        if (!SkillLevels.IsValid(skill)) return null;
        return SkillLevels.Normalize(skill);
    }

    private static string? NormalizeLocationQuery(string? locationQuery)
    {
        if (string.IsNullOrWhiteSpace(locationQuery)) return null;
        var trimmed = locationQuery.Trim();
        if (trimmed.Length > MaxLocationQueryLength)
            trimmed = trimmed[..MaxLocationQueryLength];
        return trimmed;
    }
}
