using System.Text.Json;
using System.Text.Json.Serialization;

namespace ShowUpBackend.Sports;

public sealed class VolleyballSport : ISportDefinition, IHasFormations
{
    public string SportId => "volleyball";
    public bool RequiresVenue => true;
    public bool DerivesCapacity => true;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] ValidFormats = ["2v2-beach", "4v4", "6v6"];
    private static readonly string[] ValidSessionTypes = ["match", "casual", "training"];
    private static readonly int[] ValidDurations = [60, 90, 120];
    private static readonly string[] ValidSkillLevels = ["Beginner", "Intermediate", "Advanced"];

    private static readonly Dictionary<string, int> FormatCapacity = new(StringComparer.OrdinalIgnoreCase)
    {
        ["2v2-beach"] = 4,
        ["4v4"] = 8,
        ["6v6"] = 12,
    };

    public string? Validate(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson))
            return "sportDetails is required for volleyball";

        VolleyballDetails? details;
        try
        {
            details = JsonSerializer.Deserialize<VolleyballDetails>(sportDetailsJson, _jsonOptions);
        }
        catch
        {
            return "sportDetails must be a valid JSON object";
        }

        if (details is null)
            return "sportDetails is required for volleyball";

        if (string.IsNullOrWhiteSpace(details.Format) ||
            !ValidFormats.Any(f => f.Equals(details.Format, StringComparison.OrdinalIgnoreCase)))
            return $"sportDetails.format is required and must be one of: {string.Join(", ", ValidFormats)}";

        if (string.IsNullOrWhiteSpace(details.SessionType) ||
            !ValidSessionTypes.Any(s => s.Equals(details.SessionType, StringComparison.OrdinalIgnoreCase)))
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
        if (string.IsNullOrWhiteSpace(sportDetailsJson)) return 12;
        try
        {
            var details = JsonSerializer.Deserialize<VolleyballDetails>(sportDetailsJson, _jsonOptions);
            if (details?.Format is null) return 12;
            return FormatCapacity.TryGetValue(details.Format, out var cap) ? cap : 12;
        }
        catch
        {
            return 12;
        }
    }

    // ── Formation templates ──────────────────────────────────────────────────

    private static readonly IReadOnlyList<PositionSlotTemplate> _2v2Beach =
    [
        new("a_1", "a", "PLAYER", 35f, 72f),
        new("a_2", "a", "PLAYER", 65f, 72f),
        new("b_1", "b", "PLAYER", 35f, 28f),
        new("b_2", "b", "PLAYER", 65f, 28f),
    ];

    private static readonly IReadOnlyList<PositionSlotTemplate> _4v4 =
    [
        new("a_front_1", "a", "FRONT", 30f, 62f),
        new("a_front_2", "a", "FRONT", 70f, 62f),
        new("a_back_1",  "a", "BACK",  30f, 84f),
        new("a_back_2",  "a", "BACK",  70f, 84f),
        new("b_front_1", "b", "FRONT", 30f, 38f),
        new("b_front_2", "b", "FRONT", 70f, 38f),
        new("b_back_1",  "b", "BACK",  30f, 16f),
        new("b_back_2",  "b", "BACK",  70f, 16f),
    ];

    private static readonly IReadOnlyList<PositionSlotTemplate> _6v6 =
    [
        new("a_front_1", "a", "FRONT", 25f, 60f),
        new("a_front_2", "a", "FRONT", 50f, 60f),
        new("a_front_3", "a", "FRONT", 75f, 60f),
        new("a_back_1",  "a", "BACK",  25f, 84f),
        new("a_back_2",  "a", "BACK",  50f, 84f),
        new("a_back_3",  "a", "BACK",  75f, 84f),
        new("b_front_1", "b", "FRONT", 25f, 40f),
        new("b_front_2", "b", "FRONT", 50f, 40f),
        new("b_front_3", "b", "FRONT", 75f, 40f),
        new("b_back_1",  "b", "BACK",  25f, 16f),
        new("b_back_2",  "b", "BACK",  50f, 16f),
        new("b_back_3",  "b", "BACK",  75f, 16f),
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
            "2v2-beach" => _2v2Beach,
            "4v4"       => _4v4,
            "6v6"       => _6v6,
            _           => [],
        };

    // ── Private DTO ─────────────────────────────────────────────────────────

    private sealed record VolleyballDetails(
        [property: JsonPropertyName("format")] string? Format,
        [property: JsonPropertyName("sessionType")] string? SessionType,
        [property: JsonPropertyName("durationMinutes")] int? DurationMinutes,
        [property: JsonPropertyName("bringingBall")] bool? BringingBall,
        [property: JsonPropertyName("skillLevel")] string? SkillLevel,
        [property: JsonPropertyName("notes")] string? Notes
    );
}
