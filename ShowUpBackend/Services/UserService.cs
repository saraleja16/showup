using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;

    public UserService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    public Task<List<User>> GetAllUsersAsync()
    {
        return _userRepository.GetAllUsersAsync();
    }

    public Task<User?> GetUserByIdAsync(Guid id)
    {
        return _userRepository.GetUserByIdAsync(id);
    }

    public async Task<User> CreateUserAsync(User user)
    {
        if (user.Id == Guid.Empty)
        {
            user.Id = Guid.NewGuid();
        }

        if (user.CreatedAt == default)
        {
            user.CreatedAt = DateTime.UtcNow;
        }

        return await _userRepository.CreateUserAsync(user);
    }
}
