using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;

namespace ShowUpBackend.Repositories;

public class VenueRepository : IVenueRepository
{
    private readonly AppDbContext _context;

    public VenueRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<List<Venue>> GetAllAsync()
    {
        return await _context.Venues.ToListAsync();
    }

    public async Task<List<Venue>> GetActiveAsync(string? sport)
    {
        var query = _context.Venues.AsNoTracking().Where(v => v.IsActive);
        if (!string.IsNullOrWhiteSpace(sport))
        {
            // Sanitise to prevent pattern injection (only letters, digits, spaces, hyphens allowed).
            var safe = new string(sport.Where(c => char.IsLetterOrDigit(c) || c == ' ' || c == '-').ToArray())
                .Trim()
                .ToLowerInvariant();
            if (!string.IsNullOrEmpty(safe))
            {
                // ToLower+Contains is portable across Npgsql and EF InMemory (ILike is not).
                query = query.Where(v => v.Sports.ToLower().Contains(safe));
            }
        }
        return await query.ToListAsync();
    }

    public async Task<List<Venue>> SearchNearbyAsync(
        string? sport,
        double latitude,
        double longitude,
        double radiusKm)
    {
        var venues = await GetActiveAsync(sport);
        var (minLat, maxLat, minLng, maxLng) = ShowUpBackend.Services.Matchmaking.GeoDistance.BoundingBox(
            latitude, longitude, radiusKm);

        return venues
            .Where(v =>
                v.Latitude >= minLat && v.Latitude <= maxLat &&
                v.Longitude >= minLng && v.Longitude <= maxLng)
            .Where(v => ShowUpBackend.Services.Matchmaking.GeoDistance.HaversineKm(
                latitude, longitude, v.Latitude, v.Longitude) <= radiusKm)
            .OrderBy(v => ShowUpBackend.Services.Matchmaking.GeoDistance.HaversineKm(
                latitude, longitude, v.Latitude, v.Longitude))
            .ToList();
    }

    public async Task<Venue?> GetByIdAsync(int id)
    {
        return await _context.Venues.FindAsync(id);
    }

    public async Task<Venue> CreateAsync(Venue venue)
    {
        _context.Venues.Add(venue);
        await _context.SaveChangesAsync();
        return venue;
    }

    public async Task UpdateAsync(Venue venue)
    {
        _context.Venues.Update(venue);
        await _context.SaveChangesAsync();
    }

    public async Task DeleteAsync(int id)
    {
        var venue = await _context.Venues.FindAsync(id);
        if (venue is not null)
        {
            _context.Venues.Remove(venue);
            await _context.SaveChangesAsync();
        }
    }

    public async Task<bool> ExistsAsync(int id)
    {
        return await _context.Venues.AnyAsync(v => v.Id == id);
    }
}
