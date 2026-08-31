using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[Authorize]
[ApiController]
[Route("api/events/{eventId:guid}/requests")]
public class JoinRequestsController : ControllerBase
{
    private readonly IJoinRequestService _joinRequestService;

    public JoinRequestsController(IJoinRequestService joinRequestService)
    {
        _joinRequestService = joinRequestService;
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid eventId, [FromBody] CreateJoinRequestRequest request)
    {
        var (response, error, statusCode) = await _joinRequestService.CreateAsync(eventId, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return StatusCode(statusCode, response);
    }

    [HttpPost("{requestId:guid}/withdraw")]
    public async Task<IActionResult> Withdraw(
        Guid eventId, Guid requestId, [FromBody] WithdrawJoinRequestRequest request)
    {
        var (response, error, statusCode) = await _joinRequestService.WithdrawAsync(eventId, requestId, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{requestId:guid}/accept")]
    public async Task<IActionResult> Accept(
        Guid eventId, Guid requestId, [FromBody] AcceptJoinRequestRequest request)
    {
        var (response, error, statusCode) = await _joinRequestService.AcceptAsync(eventId, requestId, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{requestId:guid}/decline")]
    public async Task<IActionResult> Decline(
        Guid eventId, Guid requestId, [FromBody] DeclineJoinRequestRequest request)
    {
        var (response, error, statusCode) = await _joinRequestService.DeclineAsync(eventId, requestId, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpGet]
    public async Task<IActionResult> GetByEvent(Guid eventId, [FromQuery] Guid callerId)
    {
        var (groups, error, statusCode) = await _joinRequestService.GetByEventAsync(eventId, callerId);
        if (groups is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(groups);
    }
}
