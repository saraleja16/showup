using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[Authorize]
[ApiController]
[Route("api/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly IUserRepository _userRepository;
    private readonly INotificationService _notificationService;

    public NotificationsController(IUserRepository userRepository, INotificationService notificationService)
    {
        _userRepository = userRepository;
        _notificationService = notificationService;
    }

    [HttpPost("save-token")]
    public async Task<IActionResult> SavePushToken([FromBody] SavePushTokenRequest request)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != request.UserId)
            return Forbid();

        var user = await _userRepository.GetUserByIdAsync(request.UserId);
        if (user is null)
            return NotFound(new { message = "User not found" });

        user.ExpoPushToken = request.Token;
        await _userRepository.UpdateUserAsync(user);

        return Ok(new { message = "Push token saved" });
    }

    [HttpGet("user/{userId:guid}")]
    public async Task<IActionResult> GetUserNotifications(Guid userId)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        var notifications = await _notificationService.GetUserNotificationsAsync(userId);
        return Ok(notifications);
    }

    [HttpGet("unread-count/{userId:guid}")]
    public async Task<IActionResult> GetUnreadCount(Guid userId)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        var count = await _notificationService.GetUnreadCountAsync(userId);
        return Ok(new { unreadCount = count });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id)
    {
        await _notificationService.MarkAsReadAsync(id);
        return Ok(new { message = "Notification marked as read" });
    }

    [HttpPost("mark-all-read/{userId:guid}")]
    public async Task<IActionResult> MarkAllAsRead(Guid userId)
    {
        var callerId = User.GetUserId();
        if (callerId is null || callerId.Value != userId)
            return Forbid();

        await _notificationService.MarkAllAsReadAsync(userId);
        return Ok(new { message = "All notifications marked as read" });
    }

    [HttpPost("test")]
    public async Task<IActionResult> SendTestNotification([FromBody] SendTestNotificationRequest request)
    {
        var success = await _notificationService.SendPushNotificationToUserAsync(
            request.UserId, request.Title, request.Body, "test");

        if (!success)
            return BadRequest(new { message = "Failed to send notification." });

        return Ok(new { message = "Test notification sent and saved" });
    }
}
