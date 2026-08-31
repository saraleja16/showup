namespace ShowUpBackend.Sports;

/// <summary>
/// Central registry of enabled sports. To add a new sport: create an ISportDefinition implementation
/// and add it to the <see cref="Registry"/>. No other changes are needed.
/// </summary>
public static class SportCatalog
{
    private static readonly Dictionary<string, ISportDefinition> Registry =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["tennis"] = new TennisSport(),
            ["soccer"] = new SoccerSport(),
            ["pickleball"] = new PickleballSport(),
            ["volleyball"] = new VolleyballSport(),
        };

    /// <summary>Returns the sport definition, or null if the sport id is unknown or disabled.</summary>
    public static ISportDefinition? Get(string? sportId)
    {
        if (string.IsNullOrWhiteSpace(sportId)) return null;
        Registry.TryGetValue(sportId, out var def);
        return def;
    }

    public static bool IsEnabled(string? sportId) => Get(sportId) is not null;

    /// <summary>Enabled sport ids (lowercase), sorted.</summary>
    public static IReadOnlyList<string> AllSportIds =>
        Registry.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).ToList();
}
