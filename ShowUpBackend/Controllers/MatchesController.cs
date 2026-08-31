using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[ApiController]
[Authorize]
[Route("api/matches")]
public class MatchesController : ControllerBase
{
    private readonly IMatchmakingService _matchmakingService;

    public MatchesController(IMatchmakingService matchmakingService)
    {
        _matchmakingService = matchmakingService;
    }

    [HttpGet("candidates")]
    public async Task<IActionResult> GetCandidates(
        [FromQuery] double latitude,
        [FromQuery] double longitude,
        [FromQuery] double? radiusKm = null,
        [FromQuery] string? sportId = null,
        [FromQuery] int? pageSize = null,
        [FromQuery] string? cursor = null,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.GetCandidatesAsync(
            userId.Value, latitude, longitude, radiusKm, sportId, pageSize, cursor, cancellationToken);

        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpGet("discovery")]
    public async Task<IActionResult> Discovery(
        [FromQuery] string q,
        [FromQuery] int? pageSize = null,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.SearchUsersAsync(
            userId.Value, q, pageSize, cancellationToken);

        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpGet("connections")]
    public async Task<IActionResult> GetConnections(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (connections, error, statusCode) = await _matchmakingService.GetConnectionsAsync(userId.Value, cancellationToken);
        if (connections is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(connections);
    }

    [HttpGet("requests/sent")]
    public async Task<IActionResult> GetSentRequests(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.GetSentRequestsAsync(userId.Value, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpGet("requests/incoming")]
    public async Task<IActionResult> GetIncomingRequests(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.GetIncomingRequestsAsync(userId.Value, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpGet("requests/rejected")]
    public async Task<IActionResult> GetRejectedRequests(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.GetRejectedRequestsAsync(userId.Value, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpGet("requests/counts")]
    public async Task<IActionResult> GetRequestCounts(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (counts, error, statusCode) = await _matchmakingService.GetRequestCountsAsync(userId.Value, cancellationToken);
        if (counts is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(counts);
    }

    [HttpPost("requests/{requestId:guid}/accept")]
    public async Task<IActionResult> AcceptRequest(Guid requestId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.AcceptRequestAsync(
            userId.Value, requestId, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("requests/{requestId:guid}/reject")]
    public async Task<IActionResult> RejectRequest(Guid requestId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.RejectRequestAsync(
            userId.Value, requestId, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpDelete("requests/{requestId:guid}")]
    public async Task<IActionResult> CancelRequest(Guid requestId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.CancelRequestAsync(
            userId.Value, requestId, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("requests/{requestId:guid}/reopen")]
    public async Task<IActionResult> ReopenRequest(Guid requestId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.ReopenRequestAsync(
            userId.Value, requestId, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpDelete("connections/{connectionId:guid}")]
    public async Task<IActionResult> Unmatch(Guid connectionId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (success, error, statusCode) = await _matchmakingService.UnmatchAsync(userId.Value, connectionId, cancellationToken);
        if (!success)
            return StatusCode(statusCode, new { message = error });
        return Ok(new { success = true });
    }

    [HttpPost("{candidateUserId:guid}/connect")]
    public async Task<IActionResult> Connect(Guid candidateUserId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.ConnectAsync(
            userId.Value, candidateUserId, cancellationToken);

        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{candidateUserId:guid}/skip")]
    public async Task<IActionResult> Skip(Guid candidateUserId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _matchmakingService.SkipAsync(
            userId.Value, candidateUserId, cancellationToken);

        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }
}
