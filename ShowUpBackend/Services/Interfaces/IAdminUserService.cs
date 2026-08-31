using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IAdminUserService
{
    Task<List<AdminUserDto>> GetAllAsync();
    Task<(AdminUserDto? User, string? Error, int StatusCode)> UpdateAsync(Guid id, AdminUpdateUserRequest request);
    Task<(bool Success, string? Error, int StatusCode)> DeleteAsync(Guid id);
}
