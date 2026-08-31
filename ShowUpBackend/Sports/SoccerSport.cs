using System.Text.Json;
using System.Text.Json.Serialization;

namespace ShowUpBackend.Sports;

public sealed class SoccerSport : ISportDefinition, IHasFormations
{
    public string SportId => "soccer";
    public bool RequiresVenue => true;
    public bool DerivesCapacity => true;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] ValidFormats = ["5-a-side", "7-a-side", "11-a-side", "custom"];
    private static readonly string[] ValidSkillLevels = ["Beginner", "Intermediate", "Advanced"];

    private static readonly Dictionary<string, int> FormatCapacity = new(StringComparer.OrdinalIgnoreCase)
    {
        ["5-a-side"]  = 10,
        ["7-a-side"]  = 14,
        ["11-a-side"] = 22,
    };

    public string? Validate(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson))
            return "sportDetails is required for soccer";

        SoccerDetails? details;
        try
        {
            details = JsonSerializer.Deserialize<SoccerDetails>(sportDetailsJson, _jsonOptions);
        }
        catch
        {
            return "sportDetails must be a valid JSON object";
        }

        if (details is null)
            return "sportDetails is required for soccer";

        if (string.IsNullOrWhiteSpace(details.Format) ||
            !ValidFormats.Any(f => f.Equals(details.Format, StringComparison.OrdinalIgnoreCase)))
            return $"sportDetails.format is required and must be one of: {string.Join(", ", ValidFormats)}";

        var isCustom = details.Format.Equals("custom", StringComparison.OrdinalIgnoreCase);

        if (isCustom)
        {
            if (details.MaxPlayers is null)
                return "sportDetails.maxPlayers is required when format is \"custom\"";

            if (details.MaxPlayers < 4 || details.MaxPlayers > 30)
                return "sportDetails.maxPlayers must be between 4 and 30";
        }

        if (string.IsNullOrWhiteSpace(details.SkillLevel) ||
            !ValidSkillLevels.Any(s => s.Equals(details.SkillLevel, StringComparison.OrdinalIgnoreCase)))
            return $"sportDetails.skillLevel is required and must be one of: {string.Join(", ", ValidSkillLevels)}";

        if (details.BringingBall is null)
            return "sportDetails.bringingBall is required (true or false)";

        if (details.Notes is not null && details.Notes.Length > 500)
            return "sportDetails.notes must not exceed 500 characters";

        return null;
    }

    public int ResolveCapacity(string? sportDetailsJson)
    {
        if (string.IsNullOrWhiteSpace(sportDetailsJson)) return 10;
        try
        {
            var details = JsonSerializer.Deserialize<SoccerDetails>(sportDetailsJson, _jsonOptions);
            if (details?.Format is null) return 10;

            if (FormatCapacity.TryGetValue(details.Format, out var cap)) return cap;

            // custom — maxPlayers was validated to be non-null and in range
            return details.MaxPlayers ?? 10;
        }
        catch
        {
            return 10;
        }
    }

    // ── Formation templates ──────────────────────────────────────────────────

    private static readonly IReadOnlyList<PositionSlotTemplate> _5aSide =
    [
        new("a_gk",    "a", "GK",  50f, 93f),
        new("a_def_1", "a", "DEF", 50f, 78f),
        new("a_mid_1", "a", "MID", 30f, 65f),
        new("a_mid_2", "a", "MID", 70f, 65f),
        new("a_fwd_1", "a", "FWD", 50f, 54f),
        new("b_gk",    "b", "GK",  50f,  7f),
        new("b_def_1", "b", "DEF", 50f, 22f),
        new("b_mid_1", "b", "MID", 30f, 35f),
        new("b_mid_2", "b", "MID", 70f, 35f),
        new("b_fwd_1", "b", "FWD", 50f, 46f),
    ];

    private static readonly IReadOnlyList<PositionSlotTemplate> _7aSide =
    [
        new("a_gk",    "a", "GK",  50f, 93f),
        new("a_def_1", "a", "DEF", 30f, 80f),
        new("a_def_2", "a", "DEF", 70f, 80f),
        new("a_mid_1", "a", "MID", 30f, 67f),
        new("a_mid_2", "a", "MID", 70f, 67f),
        new("a_fwd_1", "a", "FWD", 30f, 54f),
        new("a_fwd_2", "a", "FWD", 70f, 54f),
        new("b_gk",    "b", "GK",  50f,  7f),
        new("b_def_1", "b", "DEF", 30f, 20f),
        new("b_def_2", "b", "DEF", 70f, 20f),
        new("b_mid_1", "b", "MID", 30f, 33f),
        new("b_mid_2", "b", "MID", 70f, 33f),
        new("b_fwd_1", "b", "FWD", 30f, 46f),
        new("b_fwd_2", "b", "FWD", 70f, 46f),
    ];

    private static readonly IReadOnlyList<PositionSlotTemplate> _11aSide =
    [
        new("a_gk",    "a", "GK",  50f, 93f),
        new("a_def_1", "a", "DEF", 18f, 80f),
        new("a_def_2", "a", "DEF", 38f, 80f),
        new("a_def_3", "a", "DEF", 62f, 80f),
        new("a_def_4", "a", "DEF", 82f, 80f),
        new("a_mid_1", "a", "MID", 25f, 68f),
        new("a_mid_2", "a", "MID", 50f, 68f),
        new("a_mid_3", "a", "MID", 75f, 68f),
        new("a_fwd_1", "a", "FWD", 20f, 55f),
        new("a_fwd_2", "a", "FWD", 50f, 55f),
        new("a_fwd_3", "a", "FWD", 80f, 55f),
        new("b_gk",    "b", "GK",  50f,  7f),
        new("b_def_1", "b", "DEF", 18f, 20f),
        new("b_def_2", "b", "DEF", 38f, 20f),
        new("b_def_3", "b", "DEF", 62f, 20f),
        new("b_def_4", "b", "DEF", 82f, 20f),
        new("b_mid_1", "b", "MID", 25f, 32f),
        new("b_mid_2", "b", "MID", 50f, 32f),
        new("b_mid_3", "b", "MID", 75f, 32f),
        new("b_fwd_1", "b", "FWD", 20f, 45f),
        new("b_fwd_2", "b", "FWD", 50f, 45f),
        new("b_fwd_3", "b", "FWD", 80f, 45f),
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
            "5-a-side"  => _5aSide,
            "7-a-side"  => _7aSide,
            "11-a-side" => _11aSide,
            _           => [],   // "custom" or unknown — no position picker
        };

    // ── Private DTO ─────────────────────────────────────────────────────────

    private sealed record SoccerDetails(
        [property: JsonPropertyName("format")]      string? Format,
        [property: JsonPropertyName("maxPlayers")]  int?    MaxPlayers,
        [property: JsonPropertyName("skillLevel")]  string? SkillLevel,
        [property: JsonPropertyName("bringingBall")] bool?  BringingBall,
        [property: JsonPropertyName("notes")]       string? Notes
    );
}
