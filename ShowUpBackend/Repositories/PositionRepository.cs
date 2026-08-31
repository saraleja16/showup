using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;

namespace ShowUpBackend.Repositories;

public class PositionRepository : IPositionRepository
{
    private readonly AppDbContext _context;

    public PositionRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task BulkInsertAsync(IEnumerable<EventPosition> positions)
    {
        _context.EventPositions.AddRange(positions);
        await _context.SaveChangesAsync();
    }

    public async Task<List<EventPosition>> GetByEventAsync(Guid eventId)
    {
        return await _context.EventPositions
            .Include(p => p.ClaimedByUser)
            .Where(p => p.EventId == eventId)
            .OrderBy(p => p.SlotId)
            .ToListAsync();
    }

    public async Task<EventPosition?> GetSlotAsync(Guid eventId, string slotId)
    {
        return await _context.EventPositions
            .Include(p => p.ClaimedByUser)
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.SlotId == slotId);
    }

    public async Task<bool> UserHasClaimedSlotAsync(Guid eventId, Guid userId)
    {
        return await _context.EventPositions
            .AnyAsync(p => p.EventId == eventId
                        && p.ClaimedByUserId == userId
                        && p.Status == "claimed");
    }

    public async Task<int> ClaimSlotAsync(Guid eventId, string slotId, Guid? claimedByUserId, string? claimedByName)
    {
        return await _context.EventPositions
            .Where(p => p.EventId == eventId && p.SlotId == slotId && p.Status == "open")
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, "claimed")
                .SetProperty(p => p.ClaimedByUserId, claimedByUserId)
                .SetProperty(p => p.ClaimedByName, claimedByName)
                .SetProperty(p => p.ClaimedAt, DateTimeOffset.UtcNow));
    }

    public async Task<int> ReleaseSlotAsync(Guid eventId, string slotId)
    {
        return await _context.EventPositions
            .Where(p => p.EventId == eventId && p.SlotId == slotId && p.Status == "claimed")
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, "open")
                .SetProperty(p => p.ClaimedByUserId, (Guid?)null)
                .SetProperty(p => p.ClaimedByName, (string?)null)
                .SetProperty(p => p.ClaimedAt, (DateTimeOffset?)null));
    }

    public async Task ReleaseAllByUserAsync(Guid userId)
    {
        await _context.EventPositions
            .Where(p => p.ClaimedByUserId == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, "open")
                .SetProperty(p => p.ClaimedByUserId, (Guid?)null)
                .SetProperty(p => p.ClaimedByName, (string?)null)
                .SetProperty(p => p.ClaimedAt, (DateTimeOffset?)null));
    }
}
