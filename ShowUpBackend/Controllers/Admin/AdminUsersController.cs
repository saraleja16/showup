using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Filters;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers.Admin;

[ApiController]
[Route("api/admin/users")]
[ServiceFilter(typeof(AdminKeyFilter))]
public class AdminUsersController : ControllerBase
{
    private readonly IAdminUserService _adminUserService;

    public AdminUsersController(IAdminUserService adminUserService)
    {
        _adminUserService = adminUserService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var users = await _adminUserService.GetAllAsync();
        return Ok(users);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AdminUpdateUserRequest request)
    {
        var (updated, error, statusCode) = await _adminUserService.UpdateAsync(id, request);
        if (updated is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        // FK cascade behavior on user delete:
        // - Notifications.UserId     → Users: CASCADE → user's notifications auto-deleted by DB
        // - EventParticipants.UserId → Users: CASCADE → user's event participations auto-deleted by DB
        // - Events.CreatorId: NOT a FK constraint → events remain with orphaned CreatorId (intentional)
        var (success, error, statusCode) = await _adminUserService.DeleteAsync(id);
        if (!success)
            return StatusCode(statusCode, new { message = error });
        return NoContent();
    }
}
