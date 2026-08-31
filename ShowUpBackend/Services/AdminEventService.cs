using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class AdminEventService : IAdminEventService
{
    private readonly AppDbContext _context;

    public AdminEventService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<List<AdminEventDto>> GetAllAsync()
    {
        var rows = await (
            from e in _context.Events
            join u in _context.Users on e.CreatorId equals u.Id into creators
            from creator in creators.DefaultIfEmpty()
            join v in _context.Venues on e.VenueId equals v.Id into venues
            from venue in venues.DefaultIfEmpty()
            select new
            {
                e.Id, e.Title, e.Description, e.CreatorId, e.Latitude, e.Longitude,
                e.ScheduledAt, e.MaxPlayers, e.Sport, e.SportDetails, e.VenueId, e.CreatedAt,
                CreatorUsername = creator != null ? creator.Username : "unknown",
                VenueName = venue != null ? venue.Name : null,
                ParticipantCount = _context.EventParticipants.Count(ep =>
                    ep.EventId == e.Id &&
                    (ep.Status == ParticipationStatus.Registered || ep.Status == ParticipationStatus.Attended))
            }
        ).ToListAsync();

        return rows.Select(r => new AdminEventDto
        {
            Id = r.Id,
            Title = r.Title,
            Description = r.Description,
            CreatorId = r.CreatorId,
            CreatorUsername = r.CreatorUsername,
            Sport = r.Sport,
            SportDetails = ParseJson(r.SportDetails),
            VenueId = r.VenueId,
            VenueName = r.VenueName,
            Latitude = r.Latitude,
            Longitude = r.Longitude,
            ScheduledAt = r.ScheduledAt,
            MaxPlayers = r.MaxPlayers,
            ParticipantCount = r.ParticipantCount,
            CreatedAt = r.CreatedAt
        }).ToList();
    }

    public async Task<(AdminEventDto? Event, string? Error, int StatusCode)> UpdateAsync(Guid id, AdminUpdateEventRequest request)
    {
        var ev = await _context.Events.FindAsync(id);
        if (ev is null)
            return (null, "Event not found", StatusCodes.Status404NotFound);

        ev.Title = request.Title;
        ev.Description = request.Description;
        ev.ScheduledAt = request.ScheduledAt.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(request.ScheduledAt, DateTimeKind.Utc)
            : request.ScheduledAt.ToUniversalTime();
        ev.MaxPlayers = request.MaxPlayers;
        ev.VenueId = request.VenueId;

        await _context.SaveChangesAsync();

        var updated = await GetByIdWithDetailsAsync(id);
        return (updated, null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> DeleteAsync(Guid id)
    {
        var ev = await _context.Events.FindAsync(id);
        if (ev is null)
            return (false, "Event not found", StatusCodes.Status404NotFound);

        // FK cascade behavior on event delete:
        // - EventParticipants.EventId → Events: CASCADE  → participant rows auto-deleted by DB
        // - Notifications.EventId   → Events: SET NULL   → notifications remain, EventId set to null
        _context.Events.Remove(ev);
        await _context.SaveChangesAsync();
        return (true, null, StatusCodes.Status204NoContent);
    }

    private async Task<AdminEventDto?> GetByIdWithDetailsAsync(Guid id)
    {
        var rows = await (
            from e in _context.Events
            where e.Id == id
            join u in _context.Users on e.CreatorId equals u.Id into creators
            from creator in creators.DefaultIfEmpty()
            join v in _context.Venues on e.VenueId equals v.Id into venues
            from venue in venues.DefaultIfEmpty()
            select new
            {
                e.Id, e.Title, e.Description, e.CreatorId, e.Latitude, e.Longitude,
                e.ScheduledAt, e.MaxPlayers, e.Sport, e.SportDetails, e.VenueId, e.CreatedAt,
                CreatorUsername = creator != null ? creator.Username : "unknown",
                VenueName = venue != null ? venue.Name : null,
                ParticipantCount = _context.EventParticipants.Count(ep =>
                    ep.EventId == e.Id &&
                    (ep.Status == ParticipationStatus.Registered || ep.Status == ParticipationStatus.Attended))
            }
        ).ToListAsync();

        var r = rows.FirstOrDefault();
        if (r is null) return null;

        return new AdminEventDto
        {
            Id = r.Id,
            Title = r.Title,
            Description = r.Description,
            CreatorId = r.CreatorId,
            CreatorUsername = r.CreatorUsername,
            Sport = r.Sport,
            SportDetails = ParseJson(r.SportDetails),
            VenueId = r.VenueId,
            VenueName = r.VenueName,
            Latitude = r.Latitude,
            Longitude = r.Longitude,
            ScheduledAt = r.ScheduledAt,
            MaxPlayers = r.MaxPlayers,
            ParticipantCount = r.ParticipantCount,
            CreatedAt = r.CreatedAt
        };
    }

    private static JsonElement? ParseJson(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch { return null; }
    }
}
