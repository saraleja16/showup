namespace ShowUpBackend.Sports;

public interface IHasFormations
{
    /// <summary>
    /// Extracts the formation key from the event's SportDetails JSON.
    /// Each sport owns this extraction so callers don't need to know which field to read.
    /// Returns an empty string if the JSON is missing or malformed.
    /// </summary>
    string ExtractFormat(string? sportDetailsJson);

    /// <summary>
    /// Returns the static position slot templates for the given format key.
    /// Returns an empty list when the format has no fixed formation (e.g. soccer "custom").
    /// </summary>
    IReadOnlyList<PositionSlotTemplate> GetFormationSlots(string format);
}

/// <param name="SlotId">Stable template key, e.g. "a_mid_2".</param>
/// <param name="Team">"a" or "b".</param>
/// <param name="Role">Position role: "GK", "DEF", "MID", or "FWD".</param>
/// <param name="X">Horizontal position 0–100 (0 = left, 100 = right).</param>
/// <param name="Y">Vertical position 0–100 (0 = Team B's goal/top, 100 = Team A's goal/bottom).</param>
public record PositionSlotTemplate(string SlotId, string Team, string Role, float X, float Y);
