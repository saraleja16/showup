using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Repositories.Interfaces;

public interface IVenueRepository
{
    Task<List<Venue>> GetAllAsync();
    Task<List<Venue>> GetActiveAsync(string? sport);
    Task<List<Venue>> SearchNearbyAsync(string? sport, double latitude, double longitude, double radiusKm);
    Task<Venue?> GetByIdAsync(int id);
    Task<Venue> CreateAsync(Venue venue);
    Task UpdateAsync(Venue venue);
    Task DeleteAsync(int id);
    Task<bool> ExistsAsync(int id);
}
