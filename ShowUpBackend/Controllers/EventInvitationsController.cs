using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[ApiController]
[Authorize]
public class EventInvitationsController : ControllerBase
{
    private readonly IEventInvitationService _invitationService;

    public EventInvitationsController(IEventInvitationService invitationService)
    {
        _invitationService = invitationService;
    }

    [HttpPost("api/events/{eventId:guid}/invitations")]
    public async Task<IActionResult> Create(
        Guid eventId, [FromBody] CreateEventInvitationRequest request, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (invitation, error, statusCode) = await _invitationService.CreateAsync(eventId, userId.Value, request, cancellationToken);
        if (invitation is null)
            return StatusCode(statusCode, new { message = error });
        return StatusCode(statusCode, invitation);
    }

    [HttpPost("api/events/{eventId:guid}/invitations/{invitationId:guid}/accept")]
    public async Task<IActionResult> Accept(Guid eventId, Guid invitationId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (invitation, error, statusCode) = await _invitationService.AcceptAsync(eventId, invitationId, userId.Value, cancellationToken);
        if (invitation is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(invitation);
    }

    [HttpPost("api/events/{eventId:guid}/invitations/{invitationId:guid}/decline")]
    public async Task<IActionResult> Decline(Guid eventId, Guid invitationId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (invitation, error, statusCode) = await _invitationService.DeclineAsync(eventId, invitationId, userId.Value, cancellationToken);
        if (invitation is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(invitation);
    }

    [HttpGet("api/invitations/pending")]
    public async Task<IActionResult> GetPending(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (invitations, error, statusCode) = await _invitationService.GetPendingForUserAsync(userId.Value, cancellationToken);
        if (invitations is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(invitations);
    }
}
