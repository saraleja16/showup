using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;

namespace ShowUpBackend.Repositories;

public class JoinRequestRepository : IJoinRequestRepository
{
    private readonly AppDbContext _context;

    public JoinRequestRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<EventJoinRequest?> GetByIdAsync(Guid id)
        => await _context.EventJoinRequests
            .Include(r => r.Event)
            .Include(r => r.Requester)
            .FirstOrDefaultAsync(r => r.Id == id);

    public async Task<EventJoinRequest> CreateAsync(EventJoinRequest request)
    {
        _context.EventJoinRequests.Add(request);
        await _context.SaveChangesAsync();
        return request;
    }

    public async Task<EventJoinRequest?> GetPendingByRequesterAsync(Guid eventId, Guid requesterId)
        => await _context.EventJoinRequests
            .FirstOrDefaultAsync(r =>
                r.EventId == eventId &&
                r.RequesterId == requesterId &&
                r.Status == "Pending");

    public async Task<List<EventJoinRequest>> GetPendingByEventAsync(Guid eventId)
        => await _context.EventJoinRequests
            .Include(r => r.Requester)
            .Where(r => r.EventId == eventId && r.Status == "Pending")
            .OrderBy(r => r.CreatedAt)
            .ToListAsync();

    public async Task<bool> HasPreviousDeclineAsync(Guid eventId, Guid requesterId)
        => await _context.EventJoinRequests
            .AnyAsync(r =>
                r.EventId == eventId &&
                r.RequesterId == requesterId &&
                r.Status == "Declined");

    public async Task<Dictionary<Guid, int>> GetPendingCountsByEventAsync(IEnumerable<Guid> eventIds)
    {
        var ids = eventIds.ToList();
        return await _context.EventJoinRequests
            .Where(r => ids.Contains(r.EventId) && r.Status == "Pending")
            .GroupBy(r => r.EventId)
            .Select(g => new { EventId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.EventId, x => x.Count);
    }

    public async Task<HashSet<Guid>> GetEventIdsWithPendingByRequesterAsync(
        Guid requesterId, IEnumerable<Guid> eventIds)
    {
        var ids = eventIds.ToList();
        var result = await _context.EventJoinRequests
            .Where(r => r.RequesterId == requesterId &&
                        ids.Contains(r.EventId) &&
                        r.Status == "Pending")
            .Select(r => r.EventId)
            .ToListAsync();
        return result.ToHashSet();
    }

    public async Task<Dictionary<string, int>> GetPendingCountsBySlotAsync(Guid eventId)
        => await _context.EventJoinRequests
            .Where(r => r.EventId == eventId && r.Status == "Pending" && r.SlotId != null)
            .GroupBy(r => r.SlotId!)
            .Select(g => new { SlotId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SlotId, x => x.Count);

    public async Task<Dictionary<string, Guid>> GetPendingSlotIdsByRequesterAsync(Guid eventId, Guid requesterId)
    {
        var result = await _context.EventJoinRequests
            .Where(r => r.EventId == eventId &&
                        r.RequesterId == requesterId &&
                        r.Status == "Pending" &&
                        r.SlotId != null)
            .Select(r => new { r.SlotId, r.Id })
            .ToListAsync();
        return result.ToDictionary(r => r.SlotId!, r => r.Id);
    }
}
