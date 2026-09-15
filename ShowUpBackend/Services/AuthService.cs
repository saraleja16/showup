using Microsoft.AspNetCore.Identity;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly ITokenService _tokenService;
    private readonly IOtpService _otpService;
    private readonly ILogger<AuthService> _logger;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AuthService(
        IUserRepository userRepository,
        ITokenService tokenService,
        IOtpService otpService,
        ILogger<AuthService> logger)
    {
        _userRepository = userRepository;
        _tokenService = tokenService;
        _otpService = otpService;
        _logger = logger;
    }

    public async Task<(AuthUserResponse? User, string? Error, int StatusCode)> RegisterAsync(RegisterUserRequest request)
    {
        if (request.DateOfBirth == default)
        {
            return (null, "Date of birth is required", StatusCodes.Status400BadRequest);
        }

        if (request.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
        {
            return (null, "Date of birth cannot be in the future", StatusCodes.Status400BadRequest);
        }

        if (await _userRepository.UsernameExistsAsync(request.Username))
        {
            return (null, "Username not available", StatusCodes.Status409Conflict);
        }

        if (await _userRepository.EmailExistsAsync(request.Email))
        {
            return (null, "Email already registered", StatusCodes.Status409Conflict);
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            FirstName = request.FirstName,
            LastName = request.LastName,
            DisplayName = $"{request.FirstName} {request.LastName}".Trim(),
            Username = request.Username,
            Email = request.Email,
            PasswordHash = HashPassword(request.Password),
            DateOfBirth = request.DateOfBirth,
            Sex = request.Sex,
            PreferredSports = UserMapper.SerializePreferredSports(request.PreferredSports),
            IsActive = true,
            IsPrivate = false,
            IsEmailVerified = false,
            CreatedAt = DateTime.UtcNow
        };

        var createdUser = await _userRepository.CreateUserAsync(user);

        try
        {
            await _otpService.SendEmailVerificationAsync(createdUser.Email);
        }
        catch (Exception ex)
        {
            await _userRepository.DeleteAsync(createdUser.Id);
            _logger.LogError(
                ex,
                "Failed to issue verification email to {Email} during registration; rolled back user {UserId}",
                createdUser.Email,
                createdUser.Id);
            return (
                null,
                "Could not send verification email. Please try again shortly.",
                StatusCodes.Status503ServiceUnavailable);
        }

        var response = UserMapper.ToAuthResponse(createdUser);
        response.AccessToken = _tokenService.CreateAccessToken(createdUser);
        return (response, null, StatusCodes.Status201Created);
    }

    public async Task<(AuthUserResponse? User, int StatusCode)> LoginAsync(LoginUserRequest request)
    {
        var user = await _userRepository.GetUserByEmailAsync(request.Email);
        if (user is null)
        {
            return (null, StatusCodes.Status401Unauthorized);
        }

        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
        {
            return (null, StatusCodes.Status401Unauthorized);
        }

        return CreateAuthenticatedResponse(user);
    }

    public async Task<(AuthUserResponse? User, string? Error, int StatusCode)> GoogleLoginAsync(
        string email,
        string? firstName,
        string? lastName,
        string? displayName,
        string? avatarUrl)
    {
        var user = await _userRepository.GetUserByEmailAsync(email);
        if (user is null)
        {
            user = await CreateGoogleUserAsync(email, firstName, lastName, displayName, avatarUrl);
        }
        else if (!user.IsEmailVerified)
        {
            // Google has already proven the user controls this address.
            user.IsEmailVerified = true;
            user.EmailVerifiedAt = DateTime.UtcNow;
            await _userRepository.UpdateUserAsync(user);
        }

        var (authUser, statusCode) = CreateAuthenticatedResponse(user);
        if (authUser is null)
        {
            return (null, "Account is inactive", statusCode);
        }

        return (authUser, null, statusCode);
    }

    public async Task<UsernameAvailabilityResponse> CheckUsernameAvailabilityAsync(string username)
    {
        var exists = await _userRepository.UsernameExistsAsync(username);
        return new UsernameAvailabilityResponse
        {
            Username = username,
            Available = !exists
        };
    }

    private (AuthUserResponse? User, int StatusCode) CreateAuthenticatedResponse(User user)
    {
        if (!user.IsActive)
        {
            return (null, StatusCodes.Status401Unauthorized);
        }

        var response = UserMapper.ToAuthResponse(user);
        response.AccessToken = _tokenService.CreateAccessToken(user);
        return (response, StatusCodes.Status200OK);
    }

    private async Task<User> CreateGoogleUserAsync(
        string email,
        string? firstName,
        string? lastName,
        string? displayName,
        string? avatarUrl)
    {
        var normalizedEmail = email.Trim();
        var normalizedFirstName = NormalizeNamePart(firstName);
        var normalizedLastName = NormalizeNamePart(lastName);
        var normalizedDisplayName = NormalizeDisplayName(displayName, normalizedFirstName, normalizedLastName, normalizedEmail);

        var user = new User
        {
            Id = Guid.NewGuid(),
            FirstName = normalizedFirstName,
            LastName = normalizedLastName,
            DisplayName = normalizedDisplayName,
            Username = await GenerateUniqueUsernameAsync(normalizedEmail),
            Email = normalizedEmail,
            AvatarUrl = string.IsNullOrWhiteSpace(avatarUrl) ? null : avatarUrl.Trim(),
            PasswordHash = HashPassword(Guid.NewGuid().ToString("N")),
            DateOfBirth = new DateOnly(1900, 1, 1),
            Sex = "NotSpecified",
            PreferredSports = "[]",
            IsActive = true,
            IsPrivate = false,
            IsEmailVerified = true,
            EmailVerifiedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };

        return await _userRepository.CreateUserAsync(user);
    }

    private async Task<string> GenerateUniqueUsernameAsync(string email)
    {
        var emailPrefix = email.Split('@', 2)[0];
        var baseUsername = new string(emailPrefix
            .Trim()
            .ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '_')
            .ToArray())
            .Trim('_');

        if (string.IsNullOrWhiteSpace(baseUsername))
        {
            baseUsername = "user";
        }

        var username = baseUsername;
        var suffix = 1;
        while (await _userRepository.UsernameExistsAsync(username))
        {
            username = $"{baseUsername}{suffix}";
            suffix++;
        }

        return username;
    }

    private string HashPassword(string password)
    {
        return _passwordHasher.HashPassword(null!, password);
    }

    private static string NormalizeNamePart(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? "Google" : value.Trim();
    }

    private static string NormalizeDisplayName(string? displayName, string firstName, string lastName, string email)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        var fullName = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(fullName) ? email : fullName;
    }
}
