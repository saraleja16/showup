using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[ApiController]
[Authorize]
[Route("api/chat")]
public class ChatController : ControllerBase
{
    private readonly IChatService _chatService;

    public ChatController(IChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> GetConversations(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (conversations, error, statusCode) = await _chatService.GetConversationsAsync(userId.Value, cancellationToken);
        if (conversations is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(conversations);
    }

    [HttpGet("conversations/{connectionId:guid}/messages")]
    public async Task<IActionResult> GetMessages(
        Guid connectionId,
        [FromQuery] int? pageSize,
        [FromQuery] string? cursor,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (response, error, statusCode) = await _chatService.GetMessagesAsync(
            userId.Value, connectionId, pageSize, cursor, cancellationToken);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("conversations/{connectionId:guid}/messages")]
    public async Task<IActionResult> SendMessage(
        Guid connectionId,
        [FromBody] SendMessageRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (message, error, statusCode) = await _chatService.SendMessageAsync(
            userId.Value, connectionId, request, cancellationToken);
        if (message is null)
            return StatusCode(statusCode, new { message = error });
        return StatusCode(statusCode, message);
    }

    [HttpPost("conversations/{connectionId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid connectionId, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var (success, error, statusCode) = await _chatService.MarkReadAsync(userId.Value, connectionId, cancellationToken);
        if (!success)
            return StatusCode(statusCode, new { message = error });
        return Ok(new { success = true });
    }
}
