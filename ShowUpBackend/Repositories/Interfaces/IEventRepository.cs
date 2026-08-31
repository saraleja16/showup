using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Repositories.Interfaces;

public interface IEventRepository
{
    Task<List<Event>> GetAllAsync();
    Task<List<Event>> SearchAsync(EventSearchFilters filters, double? originLatitude, double? originLongitude);
    Task<Event?> GetByIdAsync(Guid id);
    Task<Event> CreateAsync(Event ev);
    Task<bool> ExistsAsync(Guid id);
    Task<EventParticipant?> GetParticipantAsync(Guid eventId, Guid userId);
    Task<EventParticipant> AddParticipantAsync(EventParticipant participant);
    Task<EventParticipant> UpdateParticipantAsync(EventParticipant participant);
    Task<List<EventParticipant>> GetParticipantsByEventAsync(Guid eventId);
    Task SaveParticipantChangesAsync();
    Task<int> GetParticipantCountAsync(Guid eventId);

    /// <summary>Bulk participant counts for a set of event IDs (Registered + Attended only).</summary>
    Task<Dictionary<Guid, int>> GetParticipantCountsByEventAsync(IEnumerable<Guid> eventIds);

    /// <summary>
    /// Returns claimed-slot counts keyed by EventId, but ONLY for events that have
    /// EventPositions rows at all. Absence from the result = no position rows → fall
    /// back to participant count. Value may be 0 when all slots are open.
    /// </summary>
    Task<Dictionary<Guid, int>> GetClaimedPositionCountsByEventAsync(IEnumerable<Guid> eventIds);

    /// <summary>
    /// Returns a map of EventId → participation status string for a single user across
    /// the supplied event IDs. Only events where the user has a participant row are included.
    /// </summary>
    Task<Dictionary<Guid, string>> GetStatusesByUserAsync(Guid userId, IEnumerable<Guid> eventIds);
}
