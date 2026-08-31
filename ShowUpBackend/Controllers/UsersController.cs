using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using ShowUpBackend.Configuration;
using ShowUpBackend.Filters;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[Authorize]
[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IAuthService _authService;
    private readonly IMatchmakingService _matchmakingService;
    private readonly IProfileService _profileService;

    public UsersController(
        IUserService userService,
        IAuthService authService,
        IMatchmakingService matchmakingService,
        IProfileService profileService)
    {
        _userService = userService;
        _authService = authService;
        _matchmakingService = matchmakingService;
        _profileService = profileService;
    }

    [AllowAnonymous]
    [HttpGet("check-username/{username}")]
    [EnableRateLimiting(RateLimitPolicies.AuthAvailability)]
    public async Task<IActionResult> CheckUsername(string username)
    {
        var result = await _authService.CheckUsernameAvailabilityAsync(username);
        return Ok(result);
    }

    /// <summary>Authenticated alias for the caller's profile portfolio.</summary>
    [Authorize]
    [HttpGet("me/portfolio")]
    public async Task<IActionResult> GetMyPortfolio()
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var portfolio = await _profileService.GetPortfolioAsync(userId.Value);
        if (portfolio is null) return NotFound();
        return Ok(portfolio);
    }

    [Authorize]
    [HttpPut("me/location")]
    public async Task<IActionResult> UpdateMyLocation([FromBody] UpdateLocationRequest request, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (success, error, statusCode) = await _matchmakingService.UpdateMyLocationAsync(
            userId.Value, request, cancellationToken);

        if (!success)
            return StatusCode(statusCode, new { message = error });
        return Ok(new { message = "Location updated" });
    }

    [Authorize]
    [HttpPut("me/skill-level")]
    public async Task<IActionResult> UpdateMySkillLevel([FromBody] UpdateSkillLevelRequest request, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (success, error, statusCode) = await _matchmakingService.UpdateMySkillLevelAsync(
            userId.Value, request, cancellationToken);

        if (!success)
            return StatusCode(statusCode, new { message = error });
        return Ok(new { skillLevel = SkillLevelsNormalize(request.SkillLevel) });
    }

    [HttpGet]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = await _userService.GetAllUsersAsync();
        return Ok(users.Select(UserMapper.ToAuthResponse));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetUserById(Guid id)
    {
        var user = await _userService.GetUserByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        return Ok(UserMapper.ToAuthResponse(user));
    }

    [AllowAnonymous]
    [ServiceFilter(typeof(AdminKeyFilter))]
    [HttpPost]
    public async Task<IActionResult> CreateUser([FromBody] User user)
    {
        var createdUser = await _userService.CreateUserAsync(user);
        return CreatedAtAction(nameof(GetUserById), new { id = createdUser.Id }, UserMapper.ToAuthResponse(createdUser));
    }

    private static string SkillLevelsNormalize(string skillLevel)
        => ShowUpBackend.Services.Matchmaking.SkillLevels.Normalize(skillLevel);
}
