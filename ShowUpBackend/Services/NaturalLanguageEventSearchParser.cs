using System.Globalization;
using System.Text.RegularExpressions;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Matchmaking;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

/// <summary>
/// Deterministic NL → structured filters. Used when Cursor has no chat-completions route
/// or the remote call fails. Never invents events or coordinates.
/// </summary>
public static class NaturalLanguageEventSearchParser
{
    /// <summary>Default radius (km) when a place is named without an explicit distance.</summary>
    public const double DefaultPlaceRadiusKm = 10;

    private static readonly Regex RadiusRegex = new(
        @"\b(?:with\s*in|within|inside|under|less than)\s*(\d+(?:\.\d+)?)\s*k(?:m|ms|ilometers?)?\b|\b(\d+(?:\.\d+)?)\s*k(?:m|ms|ilometers?)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex NearbyRegex = new(
        @"\b(near\s*me|nearby|close\s*by|around\s*me|in\s*my\s*area|anything\s+nearby)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex LocationRegex = new(
        @"\b(?:around|near|in|at|of)\s+(?!me\b)([a-z][a-z0-9\s'.\-]{1,60})",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] LocationStopTokens =
    [
        "tomorrow", "today", "tonight", "this", "within", "with", "for", "that", "thats", "that's",
        "evening", "morning", "afternoon", "beginner", "intermediate", "advanced",
        "game", "games", "event", "events", "court", "courts", "centre", "center", "centres", "centers",
        "venue", "venues", "sports", "sport", "km", "kms", "away", "please", "find", "show", "me",
        "a", "an", "the", "to", "join", "looking"
    ];

    public static AiEventSearchFilterPayload Parse(string query)
    {
        var raw = new AiEventSearchFilterPayload();
        if (string.IsNullOrWhiteSpace(query)) return raw;

        var q = query.Trim();
        var lower = q.ToLowerInvariant();

        raw.IntentType = DetectIntent(lower);
        raw.Sport = DetectSport(lower);
        raw.SkillLevel = DetectSkill(lower);
        raw.RadiusKm = DetectRadius(lower);
        raw.Date = DetectDate(lower);
        (raw.StartTime, raw.EndTime) = DetectTimeWindow(lower);
        raw.LocationQuery = DetectLocation(lower);

        if (raw.RadiusKm is null && NearbyRegex.IsMatch(lower) && raw.LocationQuery is null)
            raw.RadiusKm = 50;

        // "around Wollongong" / place without explicit km → default place radius
        if (raw.RadiusKm is null && raw.LocationQuery is not null)
            raw.RadiusKm = DefaultPlaceRadiusKm;

        return raw;
    }

    private static string DetectIntent(string lower)
    {
        if (Regex.IsMatch(lower, @"\b(event\s*cent(?:re|er)s?|sports?\s*cent(?:re|er)s?|recreation\s*cent(?:re|er)s?)\b"))
            return AiSearchIntentTypes.EventCentre;

        if (Regex.IsMatch(lower, @"\b(courts?|venues?|stadiums?|fields?|pitches?)\b"))
            return AiSearchIntentTypes.Venue;

        if (Regex.IsMatch(lower, @"\bgames?\b"))
            return AiSearchIntentTypes.Game;

        return AiSearchIntentTypes.Event;
    }

    private static string? DetectSport(string lower)
    {
        if (lower.Contains("pickle ball") || lower.Contains("pickleball")) return "pickleball";
        if (lower.Contains("volley ball") || lower.Contains("volleyball")) return "volleyball";
        if (lower.Contains("football") || lower.Contains("futbol") || lower.Contains("soccer")) return "soccer";
        if (lower.Contains("tennis")) return "tennis";

        foreach (var id in SportCatalog.AllSportIds)
        {
            if (lower.Contains(id, StringComparison.Ordinal))
                return id;
        }

        return null;
    }

    private static string? DetectSkill(string lower)
    {
        if (lower.Contains("beginner")) return SkillLevels.Beginner;
        if (lower.Contains("intermediate")) return SkillLevels.Intermediate;
        if (lower.Contains("advanced")) return SkillLevels.Advanced;
        return null;
    }

    private static double? DetectRadius(string lower)
    {
        var m = RadiusRegex.Match(lower);
        if (!m.Success) return null;
        var g = m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value;
        if (double.TryParse(g, NumberStyles.Float, CultureInfo.InvariantCulture, out var km))
            return km;
        return null;
    }

    private static string? DetectLocation(string lower)
    {
        // Prefer "of <place>" after radius: "within 5 km of Parramatta"
        var ofMatch = Regex.Match(lower, @"\bof\s+([a-z][a-z0-9\s'.\-]{1,60})", RegexOptions.IgnoreCase);
        if (ofMatch.Success)
        {
            var cleaned = CleanLocationCandidate(ofMatch.Groups[1].Value);
            if (!string.IsNullOrWhiteSpace(cleaned))
                return cleaned;
        }

        var matches = LocationRegex.Matches(lower);
        for (var i = matches.Count - 1; i >= 0; i--)
        {
            var cleaned = CleanLocationCandidate(matches[i].Groups[1].Value);
            if (!string.IsNullOrWhiteSpace(cleaned))
                return cleaned;
        }

        return null;
    }

    private static string? CleanLocationCandidate(string raw)
    {
        var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var kept = new List<string>();
        foreach (var part in parts)
        {
            var token = part.Trim().TrimEnd(',', '.', '?', '!');
            if (LocationStopTokens.Contains(token, StringComparer.OrdinalIgnoreCase))
            {
                if (kept.Count > 0) break;
                continue;
            }

            // Drop sport names from location phrase
            if (SportCatalog.IsEnabled(token) ||
                token.Equals("pickleball", StringComparison.OrdinalIgnoreCase) ||
                token.Equals("football", StringComparison.OrdinalIgnoreCase))
            {
                if (kept.Count > 0) break;
                continue;
            }

            if (double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
            {
                if (kept.Count > 0) break;
                continue;
            }

            kept.Add(token);
        }

        if (kept.Count == 0) return null;
        var name = string.Join(' ', kept).Trim();
        if (name.Length < 2) return null;

        // Title-case lightly for geocoder friendliness
        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name.ToLowerInvariant());
    }

    private static string? DetectDate(string lower)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (Regex.IsMatch(lower, @"\btoday\b"))
            return today.ToString("yyyy-MM-dd");
        if (Regex.IsMatch(lower, @"\btomorrow\b"))
            return today.AddDays(1).ToString("yyyy-MM-dd");
        if (Regex.IsMatch(lower, @"\bthis\s+weekend\b"))
        {
            var daysUntilSat = ((int)DayOfWeek.Saturday - (int)DateTime.UtcNow.DayOfWeek + 7) % 7;
            if (DateTime.UtcNow.DayOfWeek == DayOfWeek.Saturday)
                daysUntilSat = 0;
            else if (daysUntilSat == 0)
                daysUntilSat = 7;
            return today.AddDays(daysUntilSat).ToString("yyyy-MM-dd");
        }
        if (Regex.IsMatch(lower, @"\btonight\b"))
            return today.ToString("yyyy-MM-dd");
        return null;
    }

    private static (string? Start, string? End) DetectTimeWindow(string lower)
    {
        if (Regex.IsMatch(lower, @"\b(evening|tonight|after\s*work)\b"))
            return ("17:00", "22:00");
        if (Regex.IsMatch(lower, @"\bmorning\b"))
            return ("06:00", "12:00");
        if (Regex.IsMatch(lower, @"\bafternoon\b"))
            return ("12:00", "17:00");
        return (null, null);
    }
}
