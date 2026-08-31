using System.Text;
using System.Text.Json;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class NotificationService : INotificationService
{
    private readonly HttpClient _httpClient;
    private readonly IUserRepository _userRepository;
    private readonly INotificationRepository _notificationRepository;
    private readonly ILogger<NotificationService> _logger;
    private const string ExpoPushUrl = "https://exp.host/--/api/v2/push/send";

    public NotificationService(
        HttpClient httpClient,
        IUserRepository userRepository,
        INotificationRepository notificationRepository,
        ILogger<NotificationService> logger)
    {
        _httpClient = httpClient;
        _userRepository = userRepository;
        _notificationRepository = notificationRepository;
        _logger = logger;
    }

    public async Task<bool> SendPushNotificationAsync(string expoPushToken, string title, string body, object? data = null)
    {
        var payload = new
        {
            to = expoPushToken,
            sound = "default",
            title,
            body,
            data = data ?? new { }
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync(ExpoPushUrl, content);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Expo push failed for token {Token}: HTTP {StatusCode}",
                expoPushToken[..Math.Min(8, expoPushToken.Length)] + "...",
                (int)response.StatusCode);
        }
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SendPushNotificationToUserAsync(Guid userId, string title, string body, string type = "general", Guid? eventId = null, object? data = null)
    {
        var saved = new Notification
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = title,
            Body = body,
            Type = type,
            IsRead = false,
            EventId = eventId,
            CreatedAt = DateTime.UtcNow
        };
        await _notificationRepository.CreateAsync(saved);

        var user = await _userRepository.GetUserByIdAsync(userId);
        if (user is null || string.IsNullOrEmpty(user.ExpoPushToken))
            return true;

        var pushed = await SendPushNotificationAsync(user.ExpoPushToken, title, body, data);
        if (!pushed)
            _logger.LogWarning("Push delivery failed for user {UserId} (notification saved to DB)", userId);
        return pushed;
    }

    public async Task<List<NotificationDto>> GetUserNotificationsAsync(Guid userId)
    {
        var notifications = await _notificationRepository.GetByUserIdAsync(userId);
        return notifications.Select(n => new NotificationDto
        {
            Id = n.Id,
            UserId = n.UserId,
            Title = n.Title,
            Body = n.Body,
            Type = n.Type,
            IsRead = n.IsRead,
            EventId = n.EventId,
            CreatedAt = n.CreatedAt
        }).ToList();
    }

    public async Task<int> GetUnreadCountAsync(Guid userId)
    {
        return await _notificationRepository.GetUnreadCountAsync(userId);
    }

    public async Task MarkAsReadAsync(Guid notificationId)
    {
        await _notificationRepository.MarkAsReadAsync(notificationId);
    }

    public async Task MarkAllAsReadAsync(Guid userId)
    {
        await _notificationRepository.MarkAllAsReadAsync(userId);
    }
}
