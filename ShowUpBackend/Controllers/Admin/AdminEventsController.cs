using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Filters;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers.Admin;

[ApiController]
[Route("api/admin/events")]
[ServiceFilter(typeof(AdminKeyFilter))]
public class AdminEventsController : ControllerBase
{
    private readonly IAdminEventService _adminEventService;

    public AdminEventsController(IAdminEventService adminEventService)
    {
        _adminEventService = adminEventService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var events = await _adminEventService.GetAllAsync();
        return Ok(events);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AdminUpdateEventRequest request)
    {
        var (updated, error, statusCode) = await _adminEventService.UpdateAsync(id, request);
        if (updated is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        // FK cascade behavior on event delete:
        // - EventParticipants.EventId → Events: CASCADE  → participant rows auto-deleted by DB
        // - Notifications.EventId    → Events: SET NULL  → notifications remain, EventId set to null
        var (success, error, statusCode) = await _adminEventService.DeleteAsync(id);
        if (!success)
            return StatusCode(statusCode, new { message = error });
        return NoContent();
    }
}
