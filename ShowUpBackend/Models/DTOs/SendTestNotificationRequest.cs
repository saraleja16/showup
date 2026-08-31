namespace ShowUpBackend.Models.DTOs;

public class SendTestNotificationRequest
{
    public Guid UserId { get; set; }
    public string Title { get; set; } = "ShowUp";
    public string Body { get; set; } = "This is a test notification!";
}
