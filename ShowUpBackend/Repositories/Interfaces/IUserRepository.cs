using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Repositories.Interfaces;

public interface IUserRepository
{
    Task<List<User>> GetAllUsersAsync();
    Task<User?> GetUserByIdAsync(Guid id);
    Task<User?> GetUserByUsernameAsync(string username);
    Task<User?> GetUserByEmailAsync(string email);

    /// <summary>Case-insensitive email lookup. Pass an already-lowercased address.</summary>
    Task<User?> FindByEmailInsensitiveAsync(string normalizedEmail);
    Task<bool> UsernameExistsAsync(string username);
    Task<bool> EmailExistsAsync(string email);
    Task<User> CreateUserAsync(User user);
    Task UpdateUserAsync(User user);
    Task DeleteAsync(Guid id);
}
