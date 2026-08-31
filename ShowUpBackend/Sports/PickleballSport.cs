namespace ShowUpBackend.Sports;

public sealed class PickleballSport : ISportDefinition, IHasFormations
{
    private readonly TennisSport _tennis = new(["match", "casual", "training"]);

    public string SportId => "pickleball";
    public bool RequiresVenue => _tennis.RequiresVenue;
    public bool DerivesCapacity => _tennis.DerivesCapacity;

    public string? Validate(string? sportDetailsJson)
    {
        var error = _tennis.Validate(sportDetailsJson);
        return error?.Replace("tennis", SportId, StringComparison.OrdinalIgnoreCase);
    }

    public int ResolveCapacity(string? sportDetailsJson) => _tennis.ResolveCapacity(sportDetailsJson);

    // Formations are identical to tennis (singles/doubles, same coordinates).
    public string ExtractFormat(string? sportDetailsJson) => _tennis.ExtractFormat(sportDetailsJson);
    public IReadOnlyList<PositionSlotTemplate> GetFormationSlots(string format) => _tennis.GetFormationSlots(format);
}
