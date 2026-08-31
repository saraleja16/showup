using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class AdminUserService : IAdminUserService
{
    private readonly IUserRepository _userRepository;
    private readonly IPositionRepository _positionRepository;

    public AdminUserService(IUserRepository userRepository, IPositionRepository positionRepository)
    {
        _userRepository = userRepository;
        _positionRepository = positionRepository;
    }

    public async Task<List<AdminUserDto>> GetAllAsync()
    {
        var users = await _userRepository.GetAllUsersAsync();
        return users.Select(u => new AdminUserDto
        {
            Id = u.Id,
            Username = u.Username,
            Email = u.Email,
            FirstName = u.FirstName,
            LastName = u.LastName,
            CreatedAt = u.CreatedAt
        }).ToList();
    }

    public async Task<(AdminUserDto? User, string? Error, int StatusCode)> UpdateAsync(Guid id, AdminUpdateUserRequest request)
    {
        var user = await _userRepository.GetUserByIdAsync(id);
        if (user is null)
            return (null, "User not found", StatusCodes.Status404NotFound);

        if (user.Username != request.Username && await _userRepository.UsernameExistsAsync(request.Username))
            return (null, "Username is already taken", StatusCodes.Status409Conflict);

        if (user.Email != request.Email && await _userRepository.EmailExistsAsync(request.Email))
            return (null, "Email is already in use", StatusCodes.Status409Conflict);

        user.Username = request.Username;
        user.Email = request.Email;
        user.FirstName = request.FirstName;
        user.LastName = request.LastName;

        await _userRepository.UpdateUserAsync(user);

        return (new AdminUserDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            CreatedAt = user.CreatedAt
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> DeleteAsync(Guid id)
    {
        var user = await _userRepository.GetUserByIdAsync(id);
        if (user is null)
            return (false, "User not found", StatusCodes.Status404NotFound);

        // Release any claimed position slots before deletion.
        // The DB's ON DELETE SET NULL would null out ClaimedByUserId but leave Status as "claimed",
        // making those slots permanently stuck. We reset them to "open" here instead.
        await _positionRepository.ReleaseAllByUserAsync(id);

        // FK cascade behavior on user delete:
        // - Notifications.UserId      → Users: CASCADE → user's notifications auto-deleted by DB
        // - EventParticipants.UserId  → Users: CASCADE → user's event participations auto-deleted by DB
        // - EventPositions.ClaimedByUserId → Users: SET NULL (slots already released above)
        // - Events.CreatorId: NOT a FK constraint → events remain with orphaned CreatorId (intentional)
        await _userRepository.DeleteAsync(id);
        return (true, null, StatusCodes.Status204NoContent);
    }
}
