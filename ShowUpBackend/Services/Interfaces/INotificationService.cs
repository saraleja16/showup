using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface INotificationService
{
    Task<bool> SendPushNotificationAsync(string expoPushToken, string title, string body, object? data = null);
    Task<bool> SendPushNotificationToUserAsync(Guid userId, string title, string body, string type = "general", Guid? eventId = null, object? data = null);
    Task<List<NotificationDto>> GetUserNotificationsAsync(Guid userId);
    Task<int> GetUnreadCountAsync(Guid userId);
    Task MarkAsReadAsync(Guid notificationId);
    Task MarkAllAsReadAsync(Guid userId);
}
