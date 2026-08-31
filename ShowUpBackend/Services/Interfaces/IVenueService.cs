using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IVenueService
{
    Task<List<VenueDto>> GetAllAsync();
    Task<List<PublicVenueDto>> GetActiveAsync(string? sport);
    Task<List<PublicVenueDto>> SearchNearbyAsync(string? sport, double latitude, double longitude, double radiusKm);
    Task<VenueDto?> GetByIdAsync(int id);
    Task<(VenueDto? Venue, string? Error, int StatusCode)> CreateAsync(CreateVenueRequest request);
    Task<(VenueDto? Venue, string? Error, int StatusCode)> UpdateAsync(int id, UpdateVenueRequest request);
    Task<(bool Success, string? Error, int StatusCode)> DeleteAsync(int id);
}
