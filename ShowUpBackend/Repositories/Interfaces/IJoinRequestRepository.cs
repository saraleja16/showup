using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Repositories.Interfaces;

public interface IJoinRequestRepository
{
    /// <summary>Loads the request with Event and Requester navigations.</summary>
    Task<EventJoinRequest?> GetByIdAsync(Guid id);

    Task<EventJoinRequest> CreateAsync(EventJoinRequest request);

    /// <summary>Returns the single Pending request for a requester on an event, if any.</summary>
    Task<EventJoinRequest?> GetPendingByRequesterAsync(Guid eventId, Guid requesterId);

    /// <summary>
    /// Returns all Pending requests for an event with Requester navigation loaded.
    /// Used by the host list endpoint.
    /// </summary>
    Task<List<EventJoinRequest>> GetPendingByEventAsync(Guid eventId);

    /// <summary>True if the requester has any Declined row on this event (for previouslyDeclined flag).</summary>
    Task<bool> HasPreviousDeclineAsync(Guid eventId, Guid requesterId);

    /// <summary>
    /// Returns total Pending request counts keyed by EventId.
    /// Used by GET /events to populate pendingRequestCount for host events.
    /// </summary>
    Task<Dictionary<Guid, int>> GetPendingCountsByEventAsync(IEnumerable<Guid> eventIds);

    /// <summary>
    /// Returns the set of EventIds (from the supplied list) where the requester has a Pending request.
    /// Used by GET /events to populate myRequestStatus.
    /// </summary>
    Task<HashSet<Guid>> GetEventIdsWithPendingByRequesterAsync(Guid requesterId, IEnumerable<Guid> eventIds);

    /// <summary>
    /// Returns Pending request counts keyed by SlotId for a single event.
    /// Used by GET /events/{id}/positions when callerId is supplied.
    /// </summary>
    Task<Dictionary<string, int>> GetPendingCountsBySlotAsync(Guid eventId);

    /// <summary>
    /// Returns a map of SlotId → RequestId for each slot on which the requester has a Pending request.
    /// Used by GET /events/{id}/positions when callerId is supplied; the RequestId is needed for withdraw.
    /// </summary>
    Task<Dictionary<string, Guid>> GetPendingSlotIdsByRequesterAsync(Guid eventId, Guid requesterId);
}
