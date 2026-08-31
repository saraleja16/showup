using System.Text.Json;
using System.Text.Json.Serialization;

namespace ShowUpBackend.Sports;

public sealed class TennisSport : ISportDefinition, IHasFormations
{
    public string SportId => "tennis";
    public bool RequiresVenue => true;
    public bool DerivesCapacity => true;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] ValidFormats = ["singles", "doubles"];
    private static readonly string[] DefaultSessionTypes = ["match", "hitting", "drills"];
    private static readonly int[] ValidDurations = [60, 90, 120];
    private static readonly string[] ValidSkillLevels = ["Beginner", "Intermediate", "Advanced"];

    private readonly string[] ValidSessionTypes;

    public TennisSport(string[]? sessionTypes = null)
    {
        ValidSessionTypes = sessionTypes ?? DefaultSessionTypes;
    }

    public string? Validate(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson))
            return "sportDetails is required for tennis";

        TennisDetails? details;
        try
        {
            details = JsonSerializer.Deserialize<TennisDetails>(sportDetailsJson, _jsonOptions);
        }
        catch
        {
            return "sportDetails must be a valid JSON object";
        }

        if (details is null)
            return "sportDetails is required for tennis";

        if (string.IsNullOrWhiteSpace(details.Format) || !ValidFormats.Contains(details.Format.ToLower()))
            return $"sportDetails.format is required and must be one of: {string.Join(", ", ValidFormats)}";

        if (string.IsNullOrWhiteSpace(details.SessionType) || !ValidSessionTypes.Contains(details.SessionType.ToLower()))
            return $"sportDetails.sessionType is required and must be one of: {string.Join(", ", ValidSessionTypes)}";

        if (details.DurationMinutes is null || !ValidDurations.Contains(details.DurationMinutes.Value))
            return $"sportDetails.durationMinutes is required and must be one of: {string.Join(", ", ValidDurations)}";

        if (details.BringingBall is null)
            return "sportDetails.bringingBall is required (true or false)";

        if (string.IsNullOrWhiteSpace(details.SkillLevel) ||
            !ValidSkillLevels.Any(s => s.Equals(details.SkillLevel, StringComparison.OrdinalIgnoreCase)))
            return $"sportDetails.skillLevel is required and must be one of: {string.Join(", ", ValidSkillLevels)}";

        if (details.Notes is not null && details.Notes.Length > 500)
            return "sportDetails.notes must not exceed 500 characters";

        return null;
    }

    public int ResolveCapacity(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson)) return 2;
        try
        {
            var details = JsonSerializer.Deserialize<TennisDetails>(sportDetailsJson, _jsonOptions);
            return details?.Format?.ToLower() == "doubles" ? 4 : 2;
        }
        catch
        {
            return 2;
        }
    }

    // ── Formation templates ──────────────────────────────────────────────────

    private static readonly IReadOnlyList<PositionSlotTemplate> _singles =
    [
        new("a_player", "a", "PLAYER", 50f, 80f),
        new("b_player", "b", "PLAYER", 50f, 20f),
    ];

    private static readonly IReadOnlyList<PositionSlotTemplate> _doubles =
    [
        new("a_1", "a", "PLAYER", 30f, 78f),
        new("a_2", "a", "PLAYER", 70f, 78f),
        new("b_1", "b", "PLAYER", 30f, 22f),
        new("b_2", "b", "PLAYER", 70f, 22f),
    ];

    public string ExtractFormat(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(sportDetailsJson);
            return doc.RootElement.GetProperty("format").GetString() ?? string.Empty;
        }
        catch { return string.Empty; }
    }

    public IReadOnlyList<PositionSlotTemplate> GetFormationSlots(string format) =>
        format.ToLowerInvariant() switch
        {
            "singles" => _singles,
            "doubles" => _doubles,
            _         => [],
        };

    // ── Private DTO ─────────────────────────────────────────────────────────

    private sealed record TennisDetails(
        [property: JsonPropertyName("format")] string? Format,
        [property: JsonPropertyName("sessionType")] string? SessionType,
        [property: JsonPropertyName("durationMinutes")] int? DurationMinutes,
        [property: JsonPropertyName("bringingBall")] bool? BringingBall,
        [property: JsonPropertyName("skillLevel")] string? SkillLevel,
        [property: JsonPropertyName("notes")] string? Notes
    );
}
