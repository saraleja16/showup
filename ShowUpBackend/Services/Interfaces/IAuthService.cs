using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IAuthService
{
    Task<(AuthUserResponse? User, string? Error, int StatusCode)> RegisterAsync(RegisterUserRequest request);
    Task<(AuthUserResponse? User, int StatusCode)> LoginAsync(LoginUserRequest request);
    Task<(AuthUserResponse? User, string? Error, int StatusCode)> GoogleLoginAsync(
        string email,
        string? firstName,
        string? lastName,
        string? displayName,
        string? avatarUrl);
    Task<UsernameAvailabilityResponse> CheckUsernameAvailabilityAsync(string username);
}
