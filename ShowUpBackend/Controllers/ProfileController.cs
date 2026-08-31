using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[Authorize]
[ApiController]
[Route("api/profile")]
public class ProfileController : ControllerBase
{
    private readonly IProfileService _profileService;

    public ProfileController(IProfileService profileService)
    {
        _profileService = profileService;
    }

    [AllowAnonymous]
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetProfile(Guid userId)
    {
        var profile = await _profileService.GetProfileAsync(userId);
        if (profile is null) return NotFound();
        return Ok(profile);
    }

    /// <summary>Activity portfolio: stats + played/hosted/upcoming game cards.</summary>
    [AllowAnonymous]
    [HttpGet("{userId:guid}/portfolio")]
    public async Task<IActionResult> GetPortfolio(Guid userId)
    {
        var portfolio = await _profileService.GetPortfolioAsync(userId);
        if (portfolio is null) return NotFound();
        return Ok(portfolio);
    }

    /// <summary>Paginated portfolio section. type=played|hosted|upcoming</summary>
    [AllowAnonymous]
    [HttpGet("{userId:guid}/games")]
    public async Task<IActionResult> GetGames(
        Guid userId,
        [FromQuery] string type = "upcoming",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var (pageResult, error, statusCode) = await _profileService.GetGamesAsync(userId, type, page, pageSize);
        if (pageResult is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(pageResult);
    }

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> UpdateProfile(Guid userId, [FromBody] UpdateProfileRequest request)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        var (profile, error, statusCode) = await _profileService.UpdateProfileAsync(userId, request);
        if (profile is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(profile);
    }

    [HttpPost("{userId:guid}/avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UpdateAvatar(Guid userId, IFormFile file)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        var (avatarUrl, error, statusCode) = await _profileService.UpdateAvatarAsync(userId, file);
        if (avatarUrl is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(new UpdateAvatarResponse { AvatarUrl = avatarUrl });
    }

    [HttpDelete("{userId:guid}/avatar")]
    public async Task<IActionResult> DeleteAvatar(Guid userId)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        var (success, error, statusCode) = await _profileService.DeleteAvatarAsync(userId);
        if (!success)
            return StatusCode(statusCode, new { message = error });
        return NoContent();
    }

    [HttpPut("{userId:guid}/sports")]
    public async Task<IActionResult> UpdateSports(Guid userId, [FromBody] UpdateSportsRequest request)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        var (sports, error, statusCode) = await _profileService.UpdateSportsAsync(userId, request);
        if (sports is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(new UpdateSportsResponse { Sports = sports });
    }
}
