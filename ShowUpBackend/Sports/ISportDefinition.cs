namespace ShowUpBackend.Sports;

public interface ISportDefinition
{
    string SportId { get; }

    /// <summary>True if events for this sport must be linked to an active venue that supports it.</summary>
    bool RequiresVenue { get; }

    /// <summary>True if player capacity is derived from SportDetails rather than supplied by the client.</summary>
    bool DerivesCapacity { get; }

    /// <summary>Validates the SportDetails JSON string. Returns null on success, an error message on failure.</summary>
    string? Validate(string? sportDetailsJson);

    /// <summary>Resolves the event capacity from SportDetails. Only called when DerivesCapacity is true.</summary>
    int ResolveCapacity(string? sportDetailsJson);
}
