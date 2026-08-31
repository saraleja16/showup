using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class VenueService : IVenueService
{
    private readonly IVenueRepository _venueRepository;

    public VenueService(IVenueRepository venueRepository)
    {
        _venueRepository = venueRepository;
    }

    public async Task<List<VenueDto>> GetAllAsync()
    {
        var venues = await _venueRepository.GetAllAsync();
        return venues.Select(MapToDto).ToList();
    }

    public async Task<List<PublicVenueDto>> GetActiveAsync(string? sport)
    {
        var venues = await _venueRepository.GetActiveAsync(sport);
        return venues.Select(v => new PublicVenueDto
        {
            Id = v.Id,
            Name = v.Name,
            Address = v.Address,
            Latitude = v.Latitude,
            Longitude = v.Longitude,
            Sports = v.Sports
        }).ToList();
    }

    public async Task<List<PublicVenueDto>> SearchNearbyAsync(
        string? sport,
        double latitude,
        double longitude,
        double radiusKm)
    {
        var venues = await _venueRepository.SearchNearbyAsync(sport, latitude, longitude, radiusKm);
        return venues.Select(v => new PublicVenueDto
        {
            Id = v.Id,
            Name = v.Name,
            Address = v.Address,
            Latitude = v.Latitude,
            Longitude = v.Longitude,
            Sports = v.Sports
        }).ToList();
    }

    public async Task<VenueDto?> GetByIdAsync(int id)
    {
        var venue = await _venueRepository.GetByIdAsync(id);
        return venue is null ? null : MapToDto(venue);
    }

    public async Task<(VenueDto? Venue, string? Error, int StatusCode)> CreateAsync(CreateVenueRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return (null, "Name is required", StatusCodes.Status400BadRequest);

        var venue = new Venue
        {
            Name = request.Name.Trim(),
            Address = request.Address,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            Sports = request.Sports,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        var created = await _venueRepository.CreateAsync(venue);
        return (MapToDto(created), null, StatusCodes.Status201Created);
    }

    public async Task<(VenueDto? Venue, string? Error, int StatusCode)> UpdateAsync(int id, UpdateVenueRequest request)
    {
        var venue = await _venueRepository.GetByIdAsync(id);
        if (venue is null)
            return (null, "Venue not found", StatusCodes.Status404NotFound);

        if (string.IsNullOrWhiteSpace(request.Name))
            return (null, "Name is required", StatusCodes.Status400BadRequest);

        venue.Name = request.Name.Trim();
        venue.Address = request.Address;
        venue.Latitude = request.Latitude;
        venue.Longitude = request.Longitude;
        venue.Sports = request.Sports;
        venue.IsActive = request.IsActive;

        await _venueRepository.UpdateAsync(venue);
        return (MapToDto(venue), null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> DeleteAsync(int id)
    {
        var exists = await _venueRepository.ExistsAsync(id);
        if (!exists)
            return (false, "Venue not found", StatusCodes.Status404NotFound);

        // Events.VenueId → Venues: SET NULL — events remain, VenueId becomes null.
        await _venueRepository.DeleteAsync(id);
        return (true, null, StatusCodes.Status204NoContent);
    }

    private static VenueDto MapToDto(Venue v) => new()
    {
        Id = v.Id,
        Name = v.Name,
        Address = v.Address,
        Latitude = v.Latitude,
        Longitude = v.Longitude,
        Sports = v.Sports,
        IsActive = v.IsActive,
        CreatedAt = v.CreatedAt
    };
}
