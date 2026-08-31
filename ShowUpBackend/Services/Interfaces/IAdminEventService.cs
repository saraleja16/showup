using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IAdminEventService
{
    Task<List<AdminEventDto>> GetAllAsync();
    Task<(AdminEventDto? Event, string? Error, int StatusCode)> UpdateAsync(Guid id, AdminUpdateEventRequest request);
    Task<(bool Success, string? Error, int StatusCode)> DeleteAsync(Guid id);
}
