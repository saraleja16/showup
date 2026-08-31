using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Matchmaking;
using static ShowUpBackend.Models.Entities.ParticipationStatus;

namespace ShowUpBackend.Repositories;

public class EventRepository : IEventRepository
{
    private readonly AppDbContext _context;

    public EventRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<List<Event>> GetAllAsync()
    {
        return await _context.Events.Include(e => e.Venue).ToListAsync();
    }

    public async Task<List<Event>> SearchAsync(
        EventSearchFilters filters,
        double? originLatitude,
        double? originLongitude)
    {
        var query = _context.Events.AsNoTracking().Include(e => e.Venue).AsQueryable();

        if (!string.IsNullOrWhiteSpace(filters.Sport))
        {
            var sport = filters.Sport;
            query = query.Where(e => e.Sport.ToLower() == sport.ToLower());
        }

        if (!string.IsNullOrWhiteSpace(filters.SkillLevel))
        {
            var skill = filters.SkillLevel;
            query = query.Where(e =>
                e.RequiredSkillLevel != null &&
                e.RequiredSkillLevel.ToLower() == skill.ToLower());
        }

        if (!string.IsNullOrWhiteSpace(filters.LocationQuery) && !filters.PreferGeoOverTextLocation)
        {
            var location = filters.LocationQuery.Trim().ToLower();
            query = query.Where(e =>
                (e.Venue != null && (
                    e.Venue.Name.ToLower().Contains(location) ||
                    e.Venue.Address.ToLower().Contains(location))) ||
                e.Title.ToLower().Contains(location) ||
                e.Description.ToLower().Contains(location));
        }

        if (filters.Date is not null)
        {
            var dayStart = filters.Date.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var dayEnd = dayStart.AddDays(1);
            query = query.Where(e => e.ScheduledAt >= dayStart && e.ScheduledAt < dayEnd);
        }

        // Time-of-day filter applied in memory after materialization (portable across providers).
        var events = await query.ToListAsync();

        if (filters.StartTime is not null || filters.EndTime is not null)
        {
            events = events.Where(e =>
            {
                var time = TimeOnly.FromDateTime(DateTime.SpecifyKind(e.ScheduledAt, DateTimeKind.Utc));
                if (filters.StartTime is not null && time < filters.StartTime.Value)
                    return false;
                if (filters.EndTime is not null && time > filters.EndTime.Value)
                    return false;
                return true;
            }).ToList();
        }

        if (filters.RadiusKm is not null &&
            originLatitude is not null &&
            originLongitude is not null)
        {
            var radius = filters.RadiusKm.Value;
            var (minLat, maxLat, minLng, maxLng) = GeoDistance.BoundingBox(
                originLatitude.Value, originLongitude.Value, radius);

            events = events
                .Where(e =>
                    e.Latitude >= minLat && e.Latitude <= maxLat &&
                    e.Longitude >= minLng && e.Longitude <= maxLng)
                .Where(e => GeoDistance.HaversineKm(
                    originLatitude.Value, originLongitude.Value, e.Latitude, e.Longitude) <= radius)
                .ToList();
        }

        return events
            .OrderBy(e => e.ScheduledAt)
            .ToList();
    }

    public async Task<Event?> GetByIdAsync(Guid id)
    {
        return await _context.Events.Include(e => e.Venue).FirstOrDefaultAsync(e => e.Id == id);
    }

    public async Task<Event> CreateAsync(Event ev)
    {
        _context.Events.Add(ev);
        await _context.SaveChangesAsync();
        return ev;
    }

    public async Task<bool> ExistsAsync(Guid id)
    {
        return await _context.Events.AnyAsync(e => e.Id == id);
    }

    public async Task<EventParticipant?> GetParticipantAsync(Guid eventId, Guid userId)
    {
        return await _context.EventParticipants
            .FirstOrDefaultAsync(ep => ep.EventId == eventId && ep.UserId == userId);
    }

    public async Task<EventParticipant> AddParticipantAsync(EventParticipant participant)
    {
        _context.EventParticipants.Add(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    public async Task<EventParticipant> UpdateParticipantAsync(EventParticipant participant)
    {
        await _context.SaveChangesAsync();
        return participant;
    }

    public async Task<List<EventParticipant>> GetParticipantsByEventAsync(Guid eventId)
    {
        return await _context.EventParticipants
            .Where(ep => ep.EventId == eventId)
            .ToListAsync();
    }

    public async Task SaveParticipantChangesAsync()
    {
        await _context.SaveChangesAsync();
    }

    public async Task<int> GetParticipantCountAsync(Guid eventId)
    {
        return await _context.EventParticipants.CountAsync(ep =>
            ep.EventId == eventId &&
            (ep.Status == Registered || ep.Status == Attended));
    }

    public async Task<Dictionary<Guid, int>> GetParticipantCountsByEventAsync(IEnumerable<Guid> eventIds)
    {
        var ids = eventIds.ToList();
        return await _context.EventParticipants
            .Where(ep => ids.Contains(ep.EventId) &&
                         (ep.Status == Registered || ep.Status == Attended))
            .GroupBy(ep => ep.EventId)
            .Select(g => new { EventId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.EventId, x => x.Count);
    }

    public async Task<Dictionary<Guid, int>> GetClaimedPositionCountsByEventAsync(IEnumerable<Guid> eventIds)
    {
        var ids = eventIds.ToList();
        // GROUP BY produces a row for every EventId present in EventPositions —
        // including events with 0 claimed slots. Absence = no position rows at all.
        return await _context.EventPositions
            .Where(ep => ids.Contains(ep.EventId))
            .GroupBy(ep => ep.EventId)
            .Select(g => new { EventId = g.Key, Count = g.Count(p => p.Status == "claimed") })
            .ToDictionaryAsync(x => x.EventId, x => x.Count);
    }

    public async Task<Dictionary<Guid, string>> GetStatusesByUserAsync(Guid userId, IEnumerable<Guid> eventIds)
    {
        var ids = eventIds.ToList();
        return await _context.EventParticipants
            .Where(ep => ep.UserId == userId && ids.Contains(ep.EventId))
            .ToDictionaryAsync(ep => ep.EventId, ep => ep.Status.ToString());
    }
}
