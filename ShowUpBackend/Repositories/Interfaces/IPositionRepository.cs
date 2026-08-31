using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Repositories.Interfaces;

public interface IPositionRepository
{
    Task BulkInsertAsync(IEnumerable<EventPosition> positions);
    Task<List<EventPosition>> GetByEventAsync(Guid eventId);
    Task<EventPosition?> GetSlotAsync(Guid eventId, string slotId);
    Task<bool> UserHasClaimedSlotAsync(Guid eventId, Guid userId);

    /// <summary>
    /// Atomically sets Status='claimed' only if the current Status is 'open'.
    /// Returns the number of rows updated (0 = race — slot was already taken).
    /// </summary>
    Task<int> ClaimSlotAsync(Guid eventId, string slotId, Guid? claimedByUserId, string? claimedByName);

    /// <summary>
    /// Atomically sets Status='open' and clears claimed fields only if Status is 'claimed'.
    /// Returns the number of rows updated (0 = race — slot was already open).
    /// </summary>
    Task<int> ReleaseSlotAsync(Guid eventId, string slotId);

    /// <summary>Releases all slots claimed by a user (called before account deletion).</summary>
    Task ReleaseAllByUserAsync(Guid userId);
}
